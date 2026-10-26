/**
 * Share links: a finished strip kept for 24 hours at /p/<id>.
 *
 * Each link is its own Durable Object (ShareObject in apps/signal): it
 * holds the file, checks the delete token and deletes everything with an
 * alarm at exactly 24 hours. Where the bytes live is behind a small
 * interface, so big files (video) can move to R2 later while the 24-hour
 * rule stays with the Durable Object.
 */

export const SHARE_TTL_MS = 24 * 60 * 60 * 1000;

/** Upload cap (abuse guard, not a storage limit: files are stored in chunks). */
export const MAX_SHARE_BYTES = 5 * 1024 * 1024;

/** Durable Object values are capped at 2 MB; files are split into these. */
export const SHARE_CHUNK_BYTES = 1024 * 1024;

/** Links one person can make in one room. */
export const SHARES_PER_SEAT = 5;

/** 16 chars from 32 symbols = 80 bits. */
export const SHARE_ID_LENGTH = 16;
export const SHARE_ID_PATTERN = /^[a-z2-9]{16}$/;

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function shareIdFromBytes(bytes: Uint8Array): string {
	return Array.from(bytes.slice(0, SHARE_ID_LENGTH), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** JPEG files start with FF D8 FF. */
export function isJpeg(bytes: Uint8Array): boolean {
	return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Response of POST /shares */
export interface CreateShareResponse {
	id: string;
	/** Keep it to delete the link early. Never shown in the link itself. */
	deleteToken: string;
	expiresAt: number;
}

/** Response of GET /shares/:id */
export interface ShareInfo {
	id: string;
	createdAt: number;
	expiresAt: number;
	contentType: string;
	bytes: number;
}

export type ShareError = "unauthorized" | "too_large" | "not_jpeg" | "limit" | "not_found";

/** "23j 59m" / "23h 59m": remaining time, rounded up to the minute. */
export function remainingParts(expiresAt: number, now: number): { h: number; m: number } {
	const minutes = Math.max(0, Math.ceil((expiresAt - now) / 60_000));
	return { h: Math.floor(minutes / 60), m: minutes % 60 };
}
