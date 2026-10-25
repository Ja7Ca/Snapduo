import { ROOM_ID_PATTERN } from "@snapduo/protocol";

/** No 0/o/1/l: easy to read aloud or type from a screenshot. */
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** 12 chars from 32 symbols = 60 bits: not guessable. */
export function newRoomId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(12));
	return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Accepts a full link (".../r/abc123") or just the code. */
export function parseRoomInput(input: string): string | null {
	const trimmed = input.trim();
	const fromLink = trimmed.match(/\/r\/([A-Za-z0-9_-]+)/)?.[1];
	const candidate = fromLink ?? trimmed;
	return ROOM_ID_PATTERN.test(candidate) ? candidate : null;
}

/** sessionStorage key marking "I created this room" (host). */
export function createdKey(roomId: string): string {
	return `snapduo:created:${roomId}`;
}
