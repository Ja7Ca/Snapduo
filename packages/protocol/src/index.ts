/**
 * Shared message contract between apps/web and apps/signal.
 * Bump PROTOCOL_VERSION on any breaking change, and deploy the signal
 * Worker before the web app so old clients get a clear error.
 */
export const PROTOCOL_VERSION = 1;

/** Messages the client sends to the signaling server. Filled in during Phase 0. */
export type ClientMessage = { type: "hello"; protocol: number };

/** Messages the signaling server sends to the client. Filled in during Phase 0. */
export type ServerMessage =
	| { type: "welcome"; protocol: number }
	| { type: "error"; code: "protocol_mismatch" | "room_full" | "not_found"; message: string };
