import type { SignalData } from "@snapduo/protocol";

export interface PeerOptions {
	iceServers: RTCIceServer[];
	forceRelay: boolean;
	polite: boolean;
	localStream: MediaStream;
	sendSignal: (data: SignalData) => void;
	onRemoteStream: (stream: MediaStream) => void;
	onStateChange: (state: RTCPeerConnectionState) => void;
	/** Called for each local ICE candidate found (host / srflx / relay). */
	onLocalCandidate?: (type: string) => void;
	log: (line: string) => void;
}

/** Preview only needs to be good enough to pose; photos come from the local camera. */
const PREVIEW_MAX_BITRATE = 500_000;

/**
 * One RTCPeerConnection using the "perfect negotiation" pattern
 * (https://w3c.github.io/webrtc-pc/#perfect-negotiation-example).
 *
 * On top of that, the first offer comes from one side only: the impolite
 * peer adds its tracks right away and offers; the polite peer adds its
 * tracks when that offer arrives and answers. Without this both sides
 * offered at once, and in Chrome the polite side's rollback sometimes left
 * it without ICE candidates, so the call never connected.
 */
export class Peer {
	readonly pc: RTCPeerConnection;
	private makingOffer = false;
	private ignoreOffer = false;
	private settingRemoteAnswerPending = false;
	/** Signals are processed strictly in order. */
	private queue: Promise<void> = Promise.resolve();
	/** Polite side: tracks are added when the first offer arrives. */
	private tracksAdded = false;

	constructor(private opts: PeerOptions) {
		this.pc = new RTCPeerConnection({
			iceServers: opts.iceServers,
			iceTransportPolicy: opts.forceRelay ? "relay" : "all",
		});

		if (!opts.polite) this.addTracks();

		this.pc.onnegotiationneeded = async () => {
			try {
				this.makingOffer = true;
				await this.pc.setLocalDescription();
				this.sendDescription();
			} catch (err) {
				opts.log(`negotiation error: ${String(err)}`);
			} finally {
				this.makingOffer = false;
			}
		};

		this.pc.onicecandidate = ({ candidate }) => {
			if (candidate?.type) opts.onLocalCandidate?.(candidate.type);
			opts.sendSignal({ kind: "candidate", candidate: candidate ? candidate.toJSON() : null });
		};

		this.pc.ontrack = ({ streams }) => {
			if (streams[0]) opts.onRemoteStream(streams[0]);
		};

		this.pc.onconnectionstatechange = () => {
			const state = this.pc.connectionState;
			opts.onStateChange(state);
			opts.log(`connection: ${state}`);
			if (state === "connected") void this.capPreviewBitrate();
		};

		this.pc.oniceconnectionstatechange = () => {
			opts.log(`ice: ${this.pc.iceConnectionState}`);
			// Network changed (e.g. Wi-Fi → mobile data): try new paths. Only
			// the offering side restarts, so both don't offer at once.
			if (this.pc.iceConnectionState === "failed" && !opts.polite) {
				opts.log("ice failed → restartIce()");
				this.pc.restartIce();
			}
		};
	}

	handleSignal(data: SignalData): void {
		this.queue = this.queue.then(() => this.process(data)).catch((err) => {
			this.opts.log(`signal error: ${String(err)}`);
		});
	}

	private addTracks(): void {
		if (this.tracksAdded) return;
		this.tracksAdded = true;
		for (const track of this.opts.localStream.getTracks()) {
			this.pc.addTrack(track, this.opts.localStream);
		}
	}

	/** Camera switched: swap tracks in place, no renegotiation needed. */
	async replaceStream(stream: MediaStream): Promise<void> {
		this.opts.localStream = stream; // used if our tracks aren't added yet
		for (const sender of this.pc.getSenders()) {
			const kind = sender.track?.kind;
			const next = kind ? stream.getTracks().find((t) => t.kind === kind) : undefined;
			if (next && next !== sender.track) await sender.replaceTrack(next).catch(() => {});
		}
	}

	close(): void {
		this.pc.onnegotiationneeded = null;
		this.pc.onicecandidate = null;
		this.pc.ontrack = null;
		this.pc.onconnectionstatechange = null;
		this.pc.oniceconnectionstatechange = null;
		this.pc.close();
	}

	private async process(data: SignalData): Promise<void> {
		if (data.kind === "description") {
			const description = data.description as RTCSessionDescriptionInit;
			const readyForOffer =
				!this.makingOffer &&
				(this.pc.signalingState === "stable" || this.settingRemoteAnswerPending);
			const offerCollision = description.type === "offer" && !readyForOffer;

			this.ignoreOffer = !this.opts.polite && offerCollision;
			if (this.ignoreOffer) {
				this.opts.log("offer collision → ignored (impolite)");
				return;
			}

			this.settingRemoteAnswerPending = description.type === "answer";
			await this.pc.setRemoteDescription(description);
			this.settingRemoteAnswerPending = false;

			if (description.type === "offer") {
				// Our tracks go into the existing transceivers, so the answer
				// carries them without another round of negotiation.
				this.addTracks();
				await this.pc.setLocalDescription();
				this.sendDescription();
			}
			return;
		}

		try {
			await this.pc.addIceCandidate((data.candidate ?? undefined) as RTCIceCandidateInit | undefined);
		} catch (err) {
			if (!this.ignoreOffer) throw err;
		}
	}

	private sendDescription(): void {
		const desc = this.pc.localDescription;
		if (!desc) return;
		this.opts.sendSignal({ kind: "description", description: { type: desc.type, sdp: desc.sdp } });
	}

	private async capPreviewBitrate(): Promise<void> {
		for (const sender of this.pc.getSenders()) {
			if (sender.track?.kind !== "video") continue;
			const params = sender.getParameters();
			if (!params.encodings?.length) continue;
			params.encodings[0].maxBitrate = PREVIEW_MAX_BITRATE;
			try {
				await sender.setParameters(params);
				this.opts.log(`video bitrate capped at ${PREVIEW_MAX_BITRATE / 1000} kbps`);
			} catch (err) {
				this.opts.log(`bitrate cap failed: ${String(err)}`);
			}
		}
	}
}

export interface ConnectionStats {
	localCandidate: string;
	remoteCandidate: string;
	protocol: string;
	rttMs: number | null;
	sendKbps: number | null;
	recvKbps: number | null;
}

const previousByPc = new WeakMap<RTCPeerConnection, { at: number; sent: number; received: number }>();

/** Reads which path the connection actually uses (host / srflx / relay). */
export async function readStats(pc: RTCPeerConnection): Promise<ConnectionStats | null> {
	const previous = previousByPc.get(pc);
	const report = await pc.getStats();
	let pair: RTCIceCandidatePairStats | undefined;
	let sent = 0;
	let received = 0;

	report.forEach((s) => {
		if (s.type === "transport" && s.selectedCandidatePairId) {
			pair = report.get(s.selectedCandidatePairId);
		}
		if (s.type === "outbound-rtp" && s.kind === "video") sent += s.bytesSent ?? 0;
		if (s.type === "inbound-rtp" && s.kind === "video") received += s.bytesReceived ?? 0;
	});
	// Firefox has no transport stats; fall back to the nominated pair.
	if (!pair) {
		report.forEach((s) => {
			if (s.type === "candidate-pair" && s.nominated && s.state === "succeeded") pair = s;
		});
	}
	if (!pair) return null;

	const local = report.get(pair.localCandidateId);
	const remote = report.get(pair.remoteCandidateId);
	const now = performance.now();
	let sendKbps: number | null = null;
	let recvKbps: number | null = null;
	if (previous) {
		const seconds = (now - previous.at) / 1000;
		sendKbps = Math.round(((sent - previous.sent) * 8) / 1000 / seconds);
		recvKbps = Math.round(((received - previous.received) * 8) / 1000 / seconds);
	}
	previousByPc.set(pc, { at: now, sent, received });

	return {
		localCandidate: local?.candidateType ?? "?",
		remoteCandidate: remote?.candidateType ?? "?",
		protocol: local?.relayProtocol ? `${local.protocol}/${local.relayProtocol}` : (local?.protocol ?? "?"),
		rttMs: pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null,
		sendKbps,
		recvKbps,
	};
}
