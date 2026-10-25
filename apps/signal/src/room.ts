import { DurableObject } from "cloudflare:workers";
import {
	CloseCode,
	PING_MESSAGE,
	PONG_MESSAGE,
	PROTOCOL_VERSION,
	ROOM_CAPACITY,
	type ClientMessage,
	type ServerMessage,
} from "@snapduo/protocol";

interface Attachment {
	peerId: string;
}

/**
 * One RoomObject = one photobooth room.
 *
 * Phase 0 (spike): relays signaling messages between at most two sockets.
 * No slots, tokens or reconnect grace period yet — that's Phase 2.
 *
 * Uses the WebSocket Hibernation API so an idle room costs nothing while
 * the two browsers are talking peer-to-peer.
 */
export class RoomObject extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// Keep-alive pings are answered without waking the object.
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_MESSAGE, PONG_MESSAGE));
	}

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
			this.reject(server, {
				type: "error",
				code: "protocol_mismatch",
				message: `Server speaks protocol v${PROTOCOL_VERSION}, client sent v${protocol || "?"}. Refresh the page.`,
			}, CloseCode.ProtocolMismatch);
			return new Response(null, { status: 101, webSocket: client });
		}

		const others = this.openSockets();
		if (others.length >= ROOM_CAPACITY) {
			server.accept();
			this.reject(server, {
				type: "error",
				code: "room_full",
				message: "This room already has 2 people.",
			}, CloseCode.RoomFull);
			return new Response(null, { status: 101, webSocket: client });
		}

		const peerId = crypto.randomUUID();
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({ peerId } satisfies Attachment);

		this.send(server, {
			type: "welcome",
			protocol: PROTOCOL_VERSION,
			selfId: peerId,
			peers: others.map((ws) => this.peerIdOf(ws)),
		});
		this.broadcast(server, { type: "peer-joined", peerId });

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
		if (typeof raw !== "string" || raw.length > 64 * 1024) return;

		let msg: ClientMessage;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}

		if (msg.type === "signal") {
			this.broadcast(ws, { type: "signal", from: this.peerIdOf(ws), data: msg.data });
		}
		// "ping" is handled by the auto-response and never reaches here.
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		// With compat date >= 2026-04-07 the runtime replies to the close
		// frame itself, so we only need to tell the other peer.
		this.broadcast(ws, { type: "peer-left", peerId: this.peerIdOf(ws) });
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		this.broadcast(ws, { type: "peer-left", peerId: this.peerIdOf(ws) });
	}

	private openSockets(): WebSocket[] {
		return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN);
	}

	private peerIdOf(ws: WebSocket): string {
		return (ws.deserializeAttachment() as Attachment | null)?.peerId ?? "unknown";
	}

	private send(ws: WebSocket, msg: ServerMessage): void {
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			// Socket already closing; nothing to do.
		}
	}

	private broadcast(from: WebSocket, msg: ServerMessage): void {
		for (const ws of this.openSockets()) {
			if (ws !== from) this.send(ws, msg);
		}
	}

	private reject(ws: WebSocket, msg: ServerMessage, code: number): void {
		this.send(ws, msg);
		ws.close(code, msg.type === "error" ? msg.code : "");
	}
}
