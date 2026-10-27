import { DurableObject } from "cloudflare:workers";
import {
	CloseCode,
	PING_MESSAGE,
	PONG_MESSAGE,
	PROTOCOL_VERSION,
	ROOM_CAPACITY,
	SHARES_PER_SEAT,
	SOCKET_MAX_INTENTS,
	SOCKET_MAX_MESSAGES,
	SOCKET_WINDOW_MS,
	STALE_MS,
	applyIntent,
	createRoom,
	disconnect,
	isExpired,
	join,
	leave,
	nextAlarm,
	tick,
	toSnapshot,
	type ClientMessage,
	type ErrorCode,
	type RoomStatusResponse,
	type SeatId,
	type ServerMessage,
	type ServerRoom,
} from "@snapduo/protocol";

interface Attachment {
	/** null until the socket sends "join". */
	seat: SeatId | null;
	connectedAt: number;
}

const MAX_MESSAGE_BYTES = 64 * 1024;
/** A socket that never says "join" is closed after this. */
const JOIN_TIMEOUT_MS = 30_000;

/**
 * One RoomObject = one photobooth room.
 *
 * The rules live in @snapduo/protocol (room-core); this class stores the
 * room, keeps sockets attached to seats and sends snapshots.
 *
 * Uses the WebSocket Hibernation API, so an idle room costs nothing while
 * the two browsers talk peer-to-peer. Memory is wiped when the object
 * hibernates: everything that matters is in storage or in the sockets'
 * attachments.
 */
export class RoomObject extends DurableObject<Env> {
	private room: ServerRoom | null = null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// Keep-alive pings are answered without waking the object; the
		// timestamp of the last one tells us if a socket went silent.
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_MESSAGE, PONG_MESSAGE));
		void ctx.blockConcurrencyWhile(async () => {
			this.room = (await ctx.storage.get<ServerRoom>("room")) ?? null;
		});
	}

	/* ---------- RPC from the Worker ---------- */

	/** Returns false if the id is already taken. */
	async create(): Promise<boolean> {
		if (this.room) return false;
		this.room = createRoom(Date.now());
		await this.save();
		return true;
	}

	/** Does this token hold a seat here (present or briefly away)? */
	async hasSeat(token: string): Promise<boolean> {
		return typeof token === "string" && !!this.room?.seats.some((s) => s.token === token);
	}

	/**
	 * May the holder of this seat token make another share link? Counts
	 * per seat, so one person can't fill the storage with uploads.
	 */
	async claimShare(token: string): Promise<"ok" | "unauthorized" | "limit"> {
		const room = this.room;
		const seat = room && typeof token === "string" ? room.seats.find((s) => s.token === token) : undefined;
		if (!seat) return "unauthorized";
		const key = `shares:${seat.peerId}`;
		const used = (await this.ctx.storage.get<number>(key)) ?? 0;
		if (used >= SHARES_PER_SEAT) return "limit";
		await this.ctx.storage.put(key, used + 1);
		return "ok";
	}

	async status(): Promise<RoomStatusResponse["status"]> {
		if (!this.room) return "not_found";
		const room = await this.advance();
		return room && room.seats.length >= ROOM_CAPACITY ? "full" : "open";
	}

	/* ---------- WebSocket ---------- */

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected WebSocket", { status: 426 });
		}

		const { 0: client, 1: server } = new WebSocketPair();
		const protocol = Number(new URL(request.url).searchParams.get("v"));

		// Errors are sent over the socket (then closed) because a browser
		// can't read the HTTP status of a rejected WebSocket handshake.
		if (protocol !== PROTOCOL_VERSION) {
			server.accept();
			this.reject(server, "protocol_mismatch", CloseCode.ProtocolMismatch,
				`Server speaks protocol v${PROTOCOL_VERSION}, client sent v${protocol || "?"}. Refresh the page.`);
			return new Response(null, { status: 101, webSocket: client });
		}
		if (!this.room) {
			server.accept();
			this.reject(server, "not_found", CloseCode.NotFound, "This room doesn't exist (or expired).");
			return new Response(null, { status: 101, webSocket: client });
		}

		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({ seat: null, connectedAt: Date.now() } satisfies Attachment);
		// Make sure sockets that never join get cleaned up.
		await this.scheduleAlarm(Date.now() + JOIN_TIMEOUT_MS);
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
		if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return;
		let msg: ClientMessage;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}
		if (!msg || typeof msg !== "object") return;
		if (this.flooding(ws, msg.type === "intent")) {
			// A real client never gets close: this is a script. Each intent
			// costs a storage write and a broadcast, so cut it off.
			this.reject(ws, "bad_request", CloseCode.BadRequest, "Too many messages.");
			return;
		}

		const room = await this.advance();
		if (!room) {
			this.reject(ws, "not_found", CloseCode.NotFound, "This room doesn't exist (or expired).");
			return;
		}
		const now = Date.now();
		const seat = this.attachment(ws).seat;

		if (msg.type === "time") {
			this.send(ws, { type: "time", t0: Number(msg.t0) || 0, serverNow: now });
			return;
		}

		if (msg.type === "join") {
			if (seat) return; // already in
			const result = join(room, msg, now, newId);
			if (!result.ok) {
				this.reject(ws, "room_full", CloseCode.RoomFull, "This room already has 2 people.");
				return;
			}
			// Same seat open in another tab (or a socket we haven't noticed is
			// dead yet): the newest one wins.
			for (const other of this.socketsOf(result.seat.seat)) {
				if (other === ws) continue;
				other.serializeAttachment({ ...this.attachment(other), seat: null } satisfies Attachment);
				this.reject(other, "replaced", CloseCode.Replaced, "This room was opened in another tab.");
			}
			ws.serializeAttachment({ seat: result.seat.seat, connectedAt: now } satisfies Attachment);
			this.room = result.room;
			await this.save();
			this.send(ws, {
				type: "welcome",
				protocol: PROTOCOL_VERSION,
				selfId: result.seat.peerId,
				seat: result.seat.seat,
				token: result.seat.token,
				serverNow: now,
				room: toSnapshot(result.room),
			});
			this.broadcastRoom(ws);
			return;
		}

		if (!seat) return; // must join first

		switch (msg.type) {
			case "intent": {
				const next = msg.intent && typeof msg.intent === "object" ? applyIntent(room, seat, msg.intent, now, newId) : null;
				if (!next) {
					// Out of date or lost a race: resend the truth to this one.
					this.send(ws, { type: "room", serverNow: now, room: toSnapshot(room) });
					return;
				}
				this.room = next;
				await this.save();
				this.broadcastRoom();
				return;
			}

			case "signal": {
				const self = room.seats.find((s) => s.seat === seat);
				if (!self || typeof msg.key !== "string") return;
				for (const other of this.openSockets()) {
					const otherSeat = this.attachment(other).seat;
					if (otherSeat && otherSeat !== seat) {
						this.send(other, { type: "signal", from: self.peerId, key: msg.key, data: msg.data });
					}
				}
				return;
			}

			case "leave": {
				ws.serializeAttachment({ ...this.attachment(ws), seat: null } satisfies Attachment);
				this.room = leave(room, seat, now);
				await this.save();
				this.broadcastRoom();
				ws.close(CloseCode.Left, "left");
				return;
			}
		}
		// "ping" is handled by the auto-response and never reaches here.
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		await this.lost(ws);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		await this.lost(ws);
	}

	async alarm(): Promise<void> {
		const before = this.room;
		let room = await this.advance(false);
		if (!room) return;
		const now = Date.now();

		for (const ws of this.ctx.getWebSockets()) {
			const { seat, connectedAt } = this.attachment(ws);
			if (!seat) {
				if (now - connectedAt > JOIN_TIMEOUT_MS) ws.close(CloseCode.BadRequest, "no join");
				continue;
			}
			const lastPing = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? connectedAt;
			if (now - Math.max(lastPing, connectedAt) > STALE_MS) {
				// Phone went to sleep or lost signal without closing the socket.
				ws.serializeAttachment({ seat: null, connectedAt } satisfies Attachment);
				ws.close(CloseCode.Stale, "stale");
				if (this.socketsOf(seat).length === 0) room = disconnect(room, seat, now);
			}
		}

		if (isExpired(room, now)) {
			for (const ws of this.ctx.getWebSockets()) ws.close(CloseCode.NotFound, "expired");
			this.room = null;
			await this.ctx.storage.deleteAll();
			return;
		}

		const changed = room !== before;
		this.room = room;
		await this.save();
		if (changed) this.broadcastRoom();
	}

	/* ---------- helpers ---------- */

	/** Message counts per socket for the current window (memory only; a reset on hibernation is fine). */
	private traffic = new WeakMap<WebSocket, { since: number; messages: number; intents: number }>();

	private flooding(ws: WebSocket, intent: boolean): boolean {
		const now = Date.now();
		let t = this.traffic.get(ws);
		if (!t || now - t.since > SOCKET_WINDOW_MS) {
			t = { since: now, messages: 0, intents: 0 };
			this.traffic.set(ws, t);
		}
		t.messages++;
		if (intent) t.intents++;
		return t.messages > SOCKET_MAX_MESSAGES || t.intents > SOCKET_MAX_INTENTS;
	}

	/**
	 * Applies time-based changes (capture finished, seat released) before
	 * handling anything, so a late alarm never shows stale state.
	 */
	private async advance(persist = true): Promise<ServerRoom | null> {
		if (!this.room) return null;
		const next = tick(this.room, Date.now());
		if (next !== this.room) {
			this.room = next;
			if (persist) {
				await this.save();
				this.broadcastRoom();
			}
		}
		return this.room;
	}

	private async lost(ws: WebSocket): Promise<void> {
		const { seat } = this.attachment(ws);
		if (!seat || !this.room) return;
		ws.serializeAttachment({ ...this.attachment(ws), seat: null } satisfies Attachment);
		// Another tab already took this seat over: nothing changes.
		if (this.socketsOf(seat).some((other) => other !== ws)) return;
		const room = await this.advance();
		if (!room) return;
		this.room = disconnect(room, seat, Date.now());
		await this.save();
		this.broadcastRoom();
	}

	private async save(): Promise<void> {
		if (!this.room) return;
		await this.ctx.storage.put("room", this.room);
		await this.scheduleAlarm(nextAlarm(this.room, Date.now()));
	}

	/** Only ever moves the alarm earlier, or sets it if none. */
	private async scheduleAlarm(at: number): Promise<void> {
		const current = await this.ctx.storage.getAlarm();
		if (current === null || at < current || current < Date.now()) {
			await this.ctx.storage.setAlarm(at);
		}
	}

	private attachment(ws: WebSocket): Attachment {
		return (ws.deserializeAttachment() as Attachment | null) ?? { seat: null, connectedAt: 0 };
	}

	private openSockets(): WebSocket[] {
		return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN);
	}

	private socketsOf(seat: SeatId): WebSocket[] {
		return this.openSockets().filter((ws) => this.attachment(ws).seat === seat);
	}

	private broadcastRoom(except?: WebSocket): void {
		if (!this.room) return;
		const msg: ServerMessage = { type: "room", serverNow: Date.now(), room: toSnapshot(this.room) };
		for (const ws of this.openSockets()) {
			if (ws !== except && this.attachment(ws).seat) this.send(ws, msg);
		}
	}

	private send(ws: WebSocket, msg: ServerMessage): void {
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			// Socket already closing; nothing to do.
		}
	}

	private reject(ws: WebSocket, code: ErrorCode, closeCode: number, message: string): void {
		this.send(ws, { type: "error", code, message });
		try {
			ws.close(closeCode, code);
		} catch {
			// Already closed.
		}
	}
}

function newId(): string {
	return crypto.randomUUID();
}
