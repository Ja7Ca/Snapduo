/**
 * Shared message contract between apps/web and apps/signal.
 *
 * Bump PROTOCOL_VERSION on any breaking change, and deploy the signal
 * Worker before the web app so old clients get a clear error.
 */
export const PROTOCOL_VERSION = 1;

/** Max people in one room. */
export const ROOM_CAPACITY = 2;

/** Room ids are random and long enough that they can't be guessed. */
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Close codes the signaling server uses (4000–4999 is the app range). */
export const CloseCode = {
	ProtocolMismatch: 4000,
	RoomFull: 4001,
	BadRequest: 4002,
} as const;

export type ErrorCode = "protocol_mismatch" | "room_full" | "bad_request";

/*
 * Minimal copies of the WebRTC init types. The Worker runtime has no DOM
 * lib, so we can't reference RTCSessionDescriptionInit there.
 */
export interface SessionDescription {
	type: "offer" | "answer" | "pranswer" | "rollback";
	sdp?: string;
}

export interface IceCandidate {
	candidate?: string;
	sdpMid?: string | null;
	sdpMLineIndex?: number | null;
	usernameFragment?: string | null;
}

/** Payload relayed as-is between the two peers. */
export type SignalData =
	| { kind: "description"; description: SessionDescription }
	| { kind: "candidate"; candidate: IceCandidate | null };

/** Client → server */
export type ClientMessage =
	| { type: "signal"; data: SignalData }
	| { type: "ping" };

/** Server → client */
export type ServerMessage =
	| { type: "welcome"; protocol: number; selfId: string; peers: string[] }
	| { type: "peer-joined"; peerId: string }
	| { type: "peer-left"; peerId: string }
	| { type: "signal"; from: string; data: SignalData }
	| { type: "pong" }
	| { type: "error"; code: ErrorCode; message: string };

/** Response of GET /turn-credentials */
export interface IceServersResponse {
	iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
	/** false when the Worker has no TURN key configured (STUN only). */
	turn: boolean;
}

/**
 * Perfect negotiation needs exactly one "polite" peer. Deriving it from the
 * two ids keeps the roles stable even when someone reconnects.
 */
export function isPolite(selfId: string, peerId: string): boolean {
	return selfId > peerId;
}

export const PING_MESSAGE = JSON.stringify({ type: "ping" } satisfies ClientMessage);
export const PONG_MESSAGE = JSON.stringify({ type: "pong" } satisfies ServerMessage);
