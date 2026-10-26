import {
	CloseCode,
	isPolite,
	shutterAt,
	signalKey,
	type ErrorCode,
	type Intent,
	type RoomSnapshot,
	type SeatId,
	type ServerMessage,
	type SignalData,
} from "@snapduo/protocol";
import { Peer, readStats, type ConnectionStats } from "@/lib/peer";
import { SignalSocket, fetchIceServers } from "@/lib/signal-client";
import { ClockSync } from "./clock";
import { FrameGrabber } from "./frame-grabber";
import { MISSING_PHOTO_URL, photoKey, type PhotoRecord } from "./live-view";
import { PhotoChannel } from "./photo-channel";
import { deletePhotos, loadPhotos, savePhoto } from "./photo-store";

export type SessionStatus = "idle" | "connecting" | "open" | "reconnecting" | "failed";
export type SessionFailure = ErrorCode | "left";

export interface SessionState {
	status: SessionStatus;
	failure: SessionFailure | null;
	selfId: string | null;
	seat: SeatId | null;
	room: RoomSnapshot | null;
	/** Clock offset (server − local), for countdowns. */
	offset: number;
	photos: ReadonlyMap<string, PhotoRecord>;
	remoteStream: MediaStream | null;
	peerState: RTCPeerConnectionState | "none";
	weakConnection: boolean;
	audioBlocked: boolean;
	/** True for a moment after each shutter. */
	flash: boolean;
	debug: { rttMs: number | null; stats: ConnectionStats | null; turn: boolean | null };
}

const INITIAL: SessionState = {
	status: "idle",
	failure: null,
	selfId: null,
	seat: null,
	room: null,
	offset: 0,
	photos: new Map(),
	remoteStream: null,
	peerState: "none",
	weakConnection: false,
	audioBlocked: false,
	flash: false,
	debug: { rttMs: null, stats: null, turn: null },
};

/** Closing with these means: stop, don't retry. */
const FATAL: Record<number, SessionFailure> = {
	[CloseCode.ProtocolMismatch]: "protocol_mismatch",
	[CloseCode.RoomFull]: "room_full",
	[CloseCode.Replaced]: "replaced",
	[CloseCode.NotFound]: "not_found",
	[CloseCode.Left]: "left",
};

const RETRY_DELAYS_MS = [300, 1000, 2000, 4000];
const RETRY_MAX_MS = 5000;
const STATS_EVERY_MS = 3000;
const WEAK_RTT_MS = 600;
/** How long to wait for the friend's sharp photo before using the video frame. */
export const SHARP_PHOTO_WAIT_MS = 15_000;

interface SeatMemory {
	token: string;
	name: string;
}

const seatKey = (roomId: string) => `snapduo:seat:${roomId}`;

export function rememberedSeat(roomId: string): SeatMemory | null {
	try {
		const raw = sessionStorage.getItem(seatKey(roomId));
		return raw ? (JSON.parse(raw) as SeatMemory) : null;
	} catch {
		return null;
	}
}

/**
 * Everything live about one room, outside React: the signaling socket,
 * reconnects, the peer connection, the synced capture and the photos.
 * React reads it through subscribe()/getState() (useSyncExternalStore).
 *
 * Kept out of React on purpose: signals and shutter timers must be
 * handled the moment they happen, not on the next render.
 */
export class RoomSession {
	private state: SessionState = INITIAL;
	private listeners = new Set<() => void>();
	private socket: SignalSocket;
	private clock = new ClockSync();
	private grabber: FrameGrabber | null = null;
	private audio: HTMLAudioElement | null = null;
	private peer: Peer | null = null;
	private peerKey: string | null = null;
	/**
	 * Signals for the current pair that arrived before our peer connection
	 * existed (e.g. TURN credentials still loading). Dropping them would
	 * lose the friend's offer and stall both sides.
	 */
	private earlySignals: { key: string; data: SignalData }[] = [];
	private photoChannel: PhotoChannel | null = null;
	/** Our own photo files, kept to send (or resend) to the friend. */
	private mine = new Map<string, Blob>();
	/** Their photo files we hold (video frame or sharp), to re-save with ours. */
	private theirs = new Map<string, Blob>();
	private iceServers: RTCIceServer[] | null = null;
	private localStream: MediaStream | null = null;
	private profile = { name: "", micOn: true };
	private retries = 0;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private statsTimer: ReturnType<typeof setInterval> | null = null;
	private shutterTimers: ReturnType<typeof setTimeout>[] = [];
	private scheduledCapture: string | null = null;
	private photosLoaded = false;
	private attached = false;
	private wanted = false;

	constructor(
		readonly roomId: string,
		private options: { forceRelay?: boolean; debug?: boolean } = {},
	) {
		this.socket = new SignalSocket(roomId, {
			onOpen: () => this.onOpen(),
			onMessage: (msg) => this.onMessage(msg),
			onClose: (code) => this.onClose(code),
		});
	}

	/* ---------- React plumbing ---------- */

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getState = (): SessionState => this.state;

	private set(patch: Partial<SessionState>): void {
		this.state = { ...this.state, ...patch };
		for (const l of this.listeners) l();
	}

	/** Mount: browser-only setup. Safe to call again after detach(). */
	attach(): void {
		if (this.attached) return;
		this.attached = true;
		this.grabber = new FrameGrabber();
		this.grabber.setLocal(this.localStream);
		this.audio = new Audio();
		this.audio.autoplay = true;
		window.addEventListener("online", this.retryNow);
		document.addEventListener("visibilitychange", this.onVisible);
		if (!this.photosLoaded) void this.loadPhotos();
		// Fetch TURN credentials while the person sets up their camera.
		if (!this.iceServers) void this.loadIceServers();
		if (this.wanted) this.socket.connect();
	}

	/** Unmount: close everything (the server holds the seat for a while). */
	detach(): void {
		if (!this.attached) return;
		this.attached = false;
		window.removeEventListener("online", this.retryNow);
		document.removeEventListener("visibilitychange", this.onVisible);
		this.socket.close();
		this.clearRetry();
		this.closePeer();
		this.clearShutters();
		this.grabber?.dispose();
		this.grabber = null;
		if (this.audio) this.audio.srcObject = null;
		this.audio = null;
	}

	/* ---------- what the page calls ---------- */

	setLocalStream(stream: MediaStream | null): void {
		this.localStream = stream;
		this.grabber?.setLocal(stream);
		if (stream && this.peer) void this.peer.replaceStream(stream);
		else this.syncPeer();
	}

	/** Enter the booth: connect and take (or get back) a seat. */
	enter(name: string, micOn: boolean): void {
		this.profile = { name, micOn };
		this.wanted = true;
		this.set({ status: "connecting", failure: null });
		if (this.attached) this.socket.connect();
	}

	/** Leave for good: the seat is freed right away. */
	leave(): void {
		this.wanted = false;
		this.socket.send({ type: "leave" });
		this.socket.close();
		this.clearRetry();
		this.closePeer();
		this.clearShutters();
		try {
			sessionStorage.removeItem(seatKey(this.roomId));
		} catch {
			// Ignore.
		}
		this.set({ status: "failed", failure: "left" });
	}

	/** "Use it here" after another tab took over. */
	takeOver(): void {
		this.wanted = true;
		this.set({ status: "connecting", failure: null });
		this.socket.connect();
	}

	send(intent: Intent): void {
		this.socket.send({ type: "intent", intent });
	}

	setMic(on: boolean): void {
		this.profile.micOn = on;
		this.send({ type: "mic", on });
	}

	resumeAudio(): void {
		void this.audio
			?.play()
			.then(() => this.set({ audioBlocked: false }))
			.catch(() => {});
	}

	/* ---------- socket ---------- */

	private onOpen(): void {
		this.retries = 0;
		const token = rememberedSeat(this.roomId)?.token;
		this.clock.reset();
		this.joinSentAt = Date.now();
		this.socket.send({ type: "join", token, name: this.profile.name, micOn: this.profile.micOn });
	}

	private joinSentAt = 0;

	private onMessage(msg: ServerMessage): void {
		switch (msg.type) {
			case "welcome": {
				this.clock.add(this.joinSentAt, msg.serverNow, Date.now());
				try {
					sessionStorage.setItem(seatKey(this.roomId), JSON.stringify({ token: msg.token, name: this.profile.name }));
				} catch {
					// A reload will join as a newcomer.
				}
				this.set({ status: "open", failure: null, selfId: msg.selfId, seat: msg.seat });
				this.applyRoom(msg.room);
				// A few more samples for a better clock estimate.
				for (const delay of [200, 600, 1200]) {
					setTimeout(() => this.socket.send({ type: "time", t0: Date.now() }), delay);
				}
				return;
			}
			case "room":
				this.applyRoom(msg.room);
				return;
			case "time":
				this.clock.add(msg.t0, msg.serverNow, Date.now());
				this.set({ offset: this.clock.offset, debug: { ...this.state.debug, rttMs: this.clock.rtt } });
				return;
			case "signal": {
				if (this.peer && msg.key === this.peerKey) {
					this.peer.handleSignal(msg.data);
				} else if (this.state.room && msg.key === signalKey(this.state.room.seats)) {
					// For the current pair, but our side isn't ready yet: keep it.
					if (this.earlySignals.length < 500) this.earlySignals.push({ key: msg.key, data: msg.data });
				}
				return;
			}
			case "error":
				// The close that follows decides what happens next.
				return;
		}
	}

	private onClose(code: number): void {
		if (this.options.debug) console.info(`[socket] closed with ${code}`);
		this.closePeer();
		const fatal = FATAL[code];
		if (fatal || !this.wanted) {
			this.wanted = false;
			this.clearShutters();
			this.set({ status: "failed", failure: fatal ?? "left" });
			return;
		}
		this.set({ status: "reconnecting" });
		const delay = RETRY_DELAYS_MS[this.retries] ?? RETRY_MAX_MS;
		this.retries++;
		this.clearRetry();
		this.retryTimer = setTimeout(() => this.socket.connect(), delay);
	}

	/** Back online or back in the tab: don't wait for the backoff. */
	private retryNow = (): void => {
		if (!this.wanted || this.state.status !== "reconnecting") return;
		this.clearRetry();
		this.socket.connect();
	};

	private onVisible = (): void => {
		if (document.visibilityState === "visible") this.retryNow();
	};

	private clearRetry(): void {
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.retryTimer = null;
	}

	/* ---------- room updates ---------- */

	private applyRoom(room: RoomSnapshot): void {
		// Ignore anything older than what we have.
		if (this.state.room && room.version < this.state.room.version && this.state.status === "open") return;
		this.set({ room, offset: this.clock.offset });
		this.syncPeer();
		this.syncCapture();
		this.prunePhotos();
	}

	/* ---------- peer connection ---------- */

	private async loadIceServers(): Promise<void> {
		try {
			const res = await fetchIceServers();
			this.iceServers = res.iceServers;
			this.set({ debug: { ...this.state.debug, turn: res.turn } });
		} catch {
			// STUN only: works on most networks, not behind strict NATs.
			this.iceServers = [{ urls: "stun:stun.cloudflare.com:3478" }];
			this.set({ debug: { ...this.state.debug, turn: false } });
		}
		this.syncPeer();
	}

	private dlog(line: string): void {
		if (this.options.debug) console.info(`[session] ${line}`);
	}

	/**
	 * One peer connection per pair of seat epochs. If either side
	 * reconnects, both drop the old one and start fresh, so nobody keeps
	 * talking to a connection the other side threw away.
	 */
	private syncPeer(): void {
		const { room, selfId } = this.state;
		const friend = room?.seats.find((s) => s.peerId !== selfId);
		const ready =
			this.state.status === "open" && room && selfId && friend?.present && this.localStream && this.iceServers;
		const key = ready ? signalKey(room.seats) : null;
		if (key === this.peerKey) return;
		this.dlog(`syncPeer ${this.peerKey} → ${key} (status ${this.state.status}, stream ${!!this.localStream}, ice ${!!this.iceServers})`);

		this.closePeer();
		if (!key || !friend || !selfId || !this.localStream || !this.iceServers) return;

		this.peerKey = key;
		this.peer = new Peer({
			iceServers: this.iceServers,
			forceRelay: !!this.options.forceRelay,
			polite: isPolite(selfId, friend.peerId),
			localStream: this.localStream,
			sendSignal: (data) => this.socket.send({ type: "signal", key, data }),
			onRemoteStream: (stream) => this.setRemote(stream),
			onStateChange: (peerState) => {
				this.set({ peerState, weakConnection: peerState === "disconnected" });
			},
			onChannel: (channel) => {
				this.photoChannel = new PhotoChannel(channel, {
					have: () => [...this.state.photos].filter(([, r]) => r.sharp).map(([k]) => k),
					onPeerHave: (keys) => this.sendMissing(keys),
					onPhoto: (photoKey, blob) => this.receiveSharp(photoKey, blob),
					log: (line) => this.dlog(`photos: ${line}`),
				});
			},
			log: (line) => {
				if (this.options.debug) console.info(`[peer ${key}] ${line}`);
			},
		});
		this.set({ peerState: this.peer.pc.connectionState });
		const early = this.earlySignals.filter((sig) => sig.key === key);
		this.earlySignals = [];
		for (const sig of early) this.peer.handleSignal(sig.data);
		this.statsTimer = setInterval(() => void this.pollStats(), STATS_EVERY_MS);
	}

	private setRemote(stream: MediaStream): void {
		this.set({ remoteStream: stream });
		this.grabber?.setRemote(stream);
		if (this.audio && this.audio.srcObject !== stream) {
			this.audio.srcObject = stream;
			void this.audio
				.play()
				.then(() => this.set({ audioBlocked: false }))
				.catch(() => this.set({ audioBlocked: stream.getAudioTracks().length > 0 }));
		}
	}

	private async pollStats(): Promise<void> {
		const pc = this.peer?.pc;
		if (!pc || pc.connectionState !== "connected") return;
		const stats = await readStats(pc).catch(() => null);
		const weak = (stats?.rttMs ?? 0) > WEAK_RTT_MS;
		this.set({ weakConnection: weak, debug: { ...this.state.debug, stats } });
	}

	private closePeer(): void {
		if (this.statsTimer) clearInterval(this.statsTimer);
		this.statsTimer = null;
		this.peer?.close();
		this.peer = null;
		this.photoChannel = null;
		this.peerKey = null;
		this.grabber?.setRemote(null);
		if (this.audio) this.audio.srcObject = null;
		if (this.state.remoteStream || this.state.peerState !== "none") {
			this.set({ remoteStream: null, peerState: "none", weakConnection: false, audioBlocked: false });
		}
	}

	/* ---------- capture ---------- */

	/** Sets a timer for each shutter of the current capture, on the shared clock. */
	private syncCapture(): void {
		const c = this.state.room?.phase === "capturing" ? this.state.room.capture : null;
		if ((c?.id ?? null) === this.scheduledCapture) return;
		this.clearShutters();
		if (!c) return;
		this.scheduledCapture = c.id;
		c.queue.forEach((slot, i) => {
			const at = this.clock.toLocal(shutterAt(c, i));
			const wait = at - Date.now();
			// Joined mid-capture: shots already behind us are skipped.
			if (wait < -500) return;
			this.shutterTimers.push(setTimeout(() => void this.shoot(c.id, slot), Math.max(0, wait)));
		});
	}

	private clearShutters(): void {
		for (const t of this.shutterTimers) clearTimeout(t);
		this.shutterTimers = [];
		this.scheduledCapture = null;
	}

	private async shoot(captureId: string, slot: number): Promise<void> {
		if (!this.grabber) return;
		this.set({ flash: true });
		setTimeout(() => this.set({ flash: false }), 150);
		const { self, friend } = await this.grabber.grab();
		if (!self) return; // camera not running: the slot shows as missing
		const key = photoKey(captureId, slot);
		this.mine.set(key, self);
		// Their sharp photo may have beaten our own shutter by a few ms: keep it.
		const sharp = this.state.photos.get(key)?.sharp ? (this.theirs.get(key) ?? null) : null;
		const theirs = sharp ?? friend;
		if (theirs) this.theirs.set(key, theirs);
		this.putRecord(key, { mine: self, theirs, sharp: !!sharp, gaveUp: false });
		void savePhoto(this.roomId, key, { mine: self, theirs, sharp: !!sharp });
		// Our sharp photo goes to the friend; theirs comes to us the same way.
		this.photoChannel?.send(key, self);
		setTimeout(() => this.giveUpWaiting(key), SHARP_PHOTO_WAIT_MS);
	}

	/* ---------- photos ---------- */

	/** Replaces a record (and frees the old object URLs). */
	private putRecord(key: string, p: { mine: Blob | null; theirs: Blob | null; sharp: boolean; gaveUp: boolean }): void {
		const photos = new Map(this.state.photos);
		const old = photos.get(key);
		if (old) revoke(old);
		photos.set(key, {
			mine: p.mine ? URL.createObjectURL(p.mine) : MISSING_PHOTO_URL,
			// No friend frame (their video hadn't started): grey until the sharp one arrives.
			theirs: p.theirs ? URL.createObjectURL(p.theirs) : MISSING_PHOTO_URL,
			sharp: p.sharp,
			gaveUp: p.gaveUp,
		});
		this.set({ photos });
	}

	/** The friend's own camera photo arrived. */
	private receiveSharp(key: string, blob: Blob): void {
		if (!this.isCurrent(key)) return;
		const mine = this.mine.get(key) ?? null;
		this.theirs.set(key, blob);
		this.putRecord(key, { mine, theirs: blob, sharp: true, gaveUp: false });
		void savePhoto(this.roomId, key, { mine, theirs: blob, sharp: true });
	}

	private giveUpWaiting(key: string): void {
		const rec = this.state.photos.get(key);
		if (!rec || rec.sharp || rec.gaveUp) return;
		const photos = new Map(this.state.photos);
		photos.set(key, { ...rec, gaveUp: true });
		this.set({ photos });
	}

	/** The friend told us what they have: send them the rest of ours. */
	private sendMissing(theirKeys: string[]): void {
		const have = new Set(theirKeys);
		for (const [key, blob] of this.mine) {
			if (!have.has(key) && this.isCurrent(key)) this.photoChannel?.send(key, blob);
		}
	}

	/** Is this photo still used by a slot (or the capture in progress)? */
	private isCurrent(key: string): boolean {
		const room = this.state.room;
		if (!room) return false;
		if (room.slots.some((id, slot) => id && photoKey(id, slot) === key)) return true;
		return !!room.capture?.queue.some((slot) => photoKey(room.capture!.id, slot) === key);
	}

	private async loadPhotos(): Promise<void> {
		const stored = await loadPhotos(this.roomId);
		this.photosLoaded = true;
		for (const p of stored) {
			if (this.state.photos.has(p.key)) continue;
			if (p.mine) this.mine.set(p.key, p.mine);
			if (p.theirs) this.theirs.set(p.key, p.theirs);
			// After a reload we don't wait again; a sharp photo can still arrive.
			this.putRecord(p.key, { mine: p.mine, theirs: p.theirs, sharp: p.sharp, gaveUp: !p.sharp });
		}
		this.prunePhotos();
	}

	/** Forget photos no slot points to any more (retaken, frame changed, started over). */
	private prunePhotos(): void {
		const room = this.state.room;
		if (!room || !this.photosLoaded || this.state.status !== "open") return;
		const keep = new Set<string>();
		room.slots.forEach((id, slot) => id && keep.add(photoKey(id, slot)));
		room.capture?.queue.forEach((slot) => keep.add(photoKey(room.capture!.id, slot)));
		const drop = [...this.state.photos.keys()].filter((k) => !keep.has(k));
		if (!drop.length) return;
		const photos = new Map(this.state.photos);
		for (const k of drop) {
			revoke(photos.get(k)!);
			photos.delete(k);
			this.mine.delete(k);
			this.theirs.delete(k);
		}
		this.set({ photos });
		void deletePhotos(this.roomId, drop);
	}
}

function revoke(rec: PhotoRecord): void {
	if (rec.mine.startsWith("blob:")) URL.revokeObjectURL(rec.mine);
	if (rec.theirs.startsWith("blob:")) URL.revokeObjectURL(rec.theirs);
}
