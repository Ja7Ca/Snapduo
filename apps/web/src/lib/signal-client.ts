import {
	PING_MESSAGE,
	PROTOCOL_VERSION,
	type ClientMessage,
	type IceServersResponse,
	type ServerMessage,
} from "@snapduo/protocol";

const SIGNAL_URL = process.env.NEXT_PUBLIC_SIGNAL_URL ?? "http://localhost:8787";

export async function fetchIceServers(): Promise<IceServersResponse> {
	const res = await fetch(`${SIGNAL_URL}/turn-credentials`, { cache: "no-store" });
	if (!res.ok) throw new Error(`TURN credentials failed: ${res.status}`);
	return res.json();
}

type Listener = (msg: ServerMessage) => void;

/**
 * Thin WebSocket wrapper for the signaling server.
 * Phase 0: no automatic reconnect yet (that's Phase 2).
 */
export class SignalClient {
	private ws: WebSocket | null = null;
	private keepAlive: ReturnType<typeof setInterval> | null = null;

	constructor(
		private roomId: string,
		private onMessage: Listener,
		private onClose: (code: number, reason: string) => void,
	) {}

	connect(): void {
		const wsUrl = SIGNAL_URL.replace(/^http/, "ws");
		const ws = new WebSocket(`${wsUrl}/rooms/${this.roomId}/ws?v=${PROTOCOL_VERSION}`);
		this.ws = ws;

		ws.onmessage = (event) => {
			try {
				this.onMessage(JSON.parse(event.data));
			} catch {
				// Ignore malformed messages.
			}
		};
		ws.onopen = () => {
			// Some proxies drop idle sockets after ~60s.
			this.keepAlive = setInterval(() => this.sendRaw(PING_MESSAGE), 25_000);
		};
		ws.onclose = (event) => {
			this.stopKeepAlive();
			this.onClose(event.code, event.reason);
		};
	}

	send(msg: ClientMessage): void {
		this.sendRaw(JSON.stringify(msg));
	}

	close(): void {
		this.stopKeepAlive();
		this.ws?.close(1000, "bye");
		this.ws = null;
	}

	private sendRaw(data: string): void {
		if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
	}

	private stopKeepAlive(): void {
		if (this.keepAlive) clearInterval(this.keepAlive);
		this.keepAlive = null;
	}
}
