import {
	PING_INTERVAL_MS,
	PING_MESSAGE,
	PROTOCOL_VERSION,
	type ClientMessage,
	type CreateRoomResponse,
	type IceServersResponse,
	type RoomStatusResponse,
	type ServerMessage,
} from "@snapduo/protocol";

// Trailing slashes would produce "//turn-credentials" (404).
export const SIGNAL_URL = (process.env.NEXT_PUBLIC_SIGNAL_URL || "http://localhost:8787").replace(/\/+$/, "");

/**
 * NEXT_PUBLIC_* is baked in at build time. If it was missing, a deployed site
 * silently calls localhost and fails with a vague "Load failed". Say so instead.
 */
export function signalConfigError(): string | null {
	const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
	if (!process.env.NEXT_PUBLIC_SIGNAL_URL && !local) {
		return "NEXT_PUBLIC_SIGNAL_URL is not set for this deployment. Add it in Vercel and redeploy.";
	}
	if (window.location.protocol === "https:" && SIGNAL_URL.startsWith("http:")) {
		return `NEXT_PUBLIC_SIGNAL_URL must use https:// on a secure page (got ${SIGNAL_URL}).`;
	}
	return null;
}

export async function fetchIceServers(): Promise<IceServersResponse> {
	const res = await fetch(`${SIGNAL_URL}/turn-credentials`, { cache: "no-store" });
	if (!res.ok) throw new Error(`TURN credentials failed: ${res.status}`);
	return res.json();
}

export async function createRoomRequest(): Promise<string> {
	const configError = signalConfigError();
	if (configError) throw new Error(configError);
	const res = await fetch(`${SIGNAL_URL}/rooms`, { method: "POST", cache: "no-store" });
	if (!res.ok) throw new Error(`Create room failed: ${res.status}`);
	return ((await res.json()) as CreateRoomResponse).roomId;
}

/** null when the server can't be reached (the socket will retry anyway). */
export async function fetchRoomStatus(roomId: string): Promise<RoomStatusResponse["status"] | null> {
	try {
		const res = await fetch(`${SIGNAL_URL}/rooms/${roomId}`, { cache: "no-store" });
		if (!res.ok) return null;
		return ((await res.json()) as RoomStatusResponse).status;
	} catch {
		return null;
	}
}

/** Nothing heard (not even a pong) for this long = the socket is dead. */
const SILENCE_LIMIT_MS = PING_INTERVAL_MS * 2 + 5_000;

interface SocketHandlers {
	onOpen: () => void;
	onMessage: (msg: ServerMessage) => void;
	onClose: (code: number) => void;
}

/**
 * One WebSocket to a room. Pings to keep it (and the server's view of it)
 * alive, and closes itself when the line goes silent: phones often lose
 * a connection without the socket ever reporting it.
 *
 * It doesn't reconnect by itself; RoomSession decides when to.
 */
export class SignalSocket {
	private ws: WebSocket | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private lastHeard = 0;

	constructor(
		private roomId: string,
		private handlers: SocketHandlers,
	) {}

	connect(): void {
		this.close();
		const wsUrl = SIGNAL_URL.replace(/^http/, "ws");
		const ws = new WebSocket(`${wsUrl}/rooms/${this.roomId}/ws?v=${PROTOCOL_VERSION}`);
		this.ws = ws;
		this.lastHeard = Date.now();

		ws.onopen = () => {
			this.lastHeard = Date.now();
			this.timer = setInterval(() => {
				if (Date.now() - this.lastHeard > SILENCE_LIMIT_MS) {
					// Dead line: closing triggers onclose → reconnect.
					this.drop(ws, 4999);
					return;
				}
				this.sendRaw(PING_MESSAGE);
			}, PING_INTERVAL_MS);
			this.handlers.onOpen();
		};
		ws.onmessage = (event) => {
			this.lastHeard = Date.now();
			let msg: ServerMessage;
			try {
				msg = JSON.parse(event.data);
			} catch {
				return;
			}
			if (msg.type !== "pong") this.handlers.onMessage(msg);
		};
		ws.onclose = (event) => {
			if (this.ws !== ws) return; // an older socket
			this.stopTimer();
			this.ws = null;
			this.handlers.onClose(event.code);
		};
	}

	get open(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	send(msg: ClientMessage): boolean {
		return this.sendRaw(JSON.stringify(msg));
	}

	/** Closes without reporting it (we chose to). */
	close(): void {
		const ws = this.ws;
		this.ws = null;
		this.stopTimer();
		if (ws) {
			ws.onclose = null;
			ws.onmessage = null;
			try {
				ws.close(1000, "bye");
			} catch {
				// Not open yet.
			}
		}
	}

	private drop(ws: WebSocket, code: number): void {
		try {
			ws.close();
		} catch {
			// Ignore.
		}
		// Some browsers wait for the close handshake on a dead line; report now.
		if (this.ws === ws) {
			ws.onclose = null;
			this.ws = null;
			this.stopTimer();
			this.handlers.onClose(code);
		}
	}

	private sendRaw(data: string): boolean {
		if (this.ws?.readyState !== WebSocket.OPEN) return false;
		this.ws.send(data);
		return true;
	}

	private stopTimer(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}
}
