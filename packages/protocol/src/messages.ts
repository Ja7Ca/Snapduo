/**
 * Message contract between apps/web and apps/signal.
 *
 * Bump PROTOCOL_VERSION on any breaking change, and deploy the signal
 * Worker before the web app so old clients get a clear error.
 */
export const PROTOCOL_VERSION = 2;

/** Max people in one room. */
export const ROOM_CAPACITY = 2;

/** Room ids are random and long enough that they can't be guessed. */
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Close codes the signaling server uses (4000–4999 is the app range). */
export const CloseCode = {
	ProtocolMismatch: 4000,
	RoomFull: 4001,
	BadRequest: 4002,
	/** The same seat was opened in another tab; this one gives way. */
	Replaced: 4003,
	NotFound: 4004,
	/** No ping for too long; the client should reconnect. */
	Stale: 4005,
	/** You pressed Leave. */
	Left: 4006,
} as const;

export type ErrorCode = "protocol_mismatch" | "room_full" | "bad_request" | "replaced" | "not_found";

export type SeatId = "A" | "B";
export type TimerSeconds = 3 | 5 | 10;
export const TIMERS: readonly TimerSeconds[] = [3, 5, 10];

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

/* ---------- room snapshot (what both clients see) ---------- */

export interface SeatSnapshot {
	seat: SeatId;
	/** Stable for the life of the seat, also across reconnects. */
	peerId: string;
	name: string;
	micOn: boolean;
	/** false while their connection is gone but the seat is held. */
	present: boolean;
	/** Server time when the held seat is released. */
	awayUntil: number | null;
	/**
	 * Goes up every time this seat (re)connects. Both clients rebuild the
	 * peer connection when either epoch changes, so a reloaded page never
	 * talks to a stale RTCPeerConnection.
	 */
	epoch: number;
}

export interface CaptureInfo {
	id: string;
	/** Slot indexes to fill, in order. */
	queue: number[];
	/** Server time the first countdown starts. */
	startAt: number;
	timer: TimerSeconds;
	startedBy: string;
}

export type RoomPhase = "booth" | "capturing" | "result";

export interface RoomSnapshot {
	/** Goes up on every change. */
	version: number;
	frameId: string;
	frameChangedBy: string | null;
	timer: TimerSeconds;
	/** Per slot: id of the capture that filled it, or null. */
	slots: (string | null)[];
	phase: RoomPhase;
	capture: CaptureInfo | null;
	finishedBy: string | null;
	seats: SeatSnapshot[];
}

/* ---------- client → server ---------- */

export type Intent =
	| { type: "select-frame"; frameId: string }
	| { type: "set-timer"; timer: TimerSeconds }
	/** slot = null fills every empty slot; a number retakes that one. */
	| { type: "start-capture"; slot: number | null }
	| { type: "finish" }
	| { type: "back-to-booth" }
	| { type: "start-over" }
	/** Creator only: free the seat of a friend who's away. */
	| { type: "release-friend" }
	| { type: "mic"; on: boolean };

export type ClientMessage =
	| { type: "join"; token?: string; name: string; micOn: boolean }
	| { type: "intent"; intent: Intent }
	/** key = both seats' epochs; signals for an older pair are dropped. */
	| { type: "signal"; key: string; data: SignalData }
	| { type: "time"; t0: number }
	| { type: "leave" }
	| { type: "ping" };

/* ---------- server → client ---------- */

export type ServerMessage =
	| {
			type: "welcome";
			protocol: number;
			selfId: string;
			seat: SeatId;
			/** Keep it to get the same seat back after a reload. */
			token: string;
			serverNow: number;
			room: RoomSnapshot;
	  }
	| { type: "room"; serverNow: number; room: RoomSnapshot }
	| { type: "signal"; from: string; key: string; data: SignalData }
	| { type: "time"; t0: number; serverNow: number }
	| { type: "pong" }
	| { type: "error"; code: ErrorCode; message: string };

/* ---------- HTTP ---------- */

/** Response of GET /turn-credentials */
export interface IceServersResponse {
	iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
	/** false when the Worker has no TURN key configured (STUN only). */
	turn: boolean;
}

/** Response of POST /rooms */
export interface CreateRoomResponse {
	roomId: string;
}

/** Response of GET /rooms/:id */
export interface RoomStatusResponse {
	status: "open" | "full" | "not_found";
}

/**
 * Perfect negotiation needs exactly one "polite" peer. Deriving it from the
 * two ids keeps the roles stable even when someone reconnects.
 */
export function isPolite(selfId: string, peerId: string): boolean {
	return selfId > peerId;
}

/** Pair key for signals: changes when either side reconnects. */
export function signalKey(seats: readonly Pick<SeatSnapshot, "seat" | "epoch">[]): string {
	const a = seats.find((s) => s.seat === "A")?.epoch ?? 0;
	const b = seats.find((s) => s.seat === "B")?.epoch ?? 0;
	return `${a}:${b}`;
}

export const PING_MESSAGE = JSON.stringify({ type: "ping" } satisfies ClientMessage);
export const PONG_MESSAGE = JSON.stringify({ type: "pong" } satisfies ServerMessage);

/** No 0/o/1/l: easy to read aloud or type from a screenshot. */
const ROOM_ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export const ROOM_ID_LENGTH = 12;

/**
 * 12 chars from 32 symbols = 60 bits: not guessable. Takes the random bytes
 * as input so it works in the Worker, the browser and tests alike.
 */
export function roomIdFromBytes(bytes: Uint8Array): string {
	return Array.from(bytes.slice(0, ROOM_ID_LENGTH), (b) => ROOM_ID_ALPHABET[b % ROOM_ID_ALPHABET.length]).join("");
}
