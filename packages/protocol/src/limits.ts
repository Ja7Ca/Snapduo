/**
 * Abuse limits, in one place.
 *
 * Per-minute limits use Cloudflare's Rate Limiting binding (configured in
 * apps/signal/wrangler.jsonc, keep the numbers there in sync). They are
 * per IP and per Cloudflare location, approximate by design: enough to
 * stop a script hammering one endpoint. Daily quotas are exact (a
 * Durable Object per IP per day) and protect what costs the most: rooms
 * (requests) and share uploads (storage).
 */
export const PER_MINUTE = {
	rooms: 10,
	shares: 5,
	turn: 20,
	sockets: 30,
	reads: 120,
	errors: 20,
} as const;

export const PER_DAY = {
	rooms: 60,
	shares: 30,
} as const;

export type QuotaKind = keyof typeof PER_DAY;

/**
 * Per socket, in a sliding 10-second window. A real client sends a few
 * dozen messages while connecting (ICE candidates) and a handful after.
 */
export const SOCKET_WINDOW_MS = 10_000;
export const SOCKET_MAX_MESSAGES = 200;
export const SOCKET_MAX_INTENTS = 40;

/** Body of any 429 from the Worker. */
export interface RateLimitedResponse {
	error: "rate_limited";
}
