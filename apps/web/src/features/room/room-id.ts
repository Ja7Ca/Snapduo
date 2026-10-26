import { ROOM_ID_PATTERN } from "@snapduo/protocol";

/** Accepts a full link (".../r/abc123") or just the code. */
export function parseRoomInput(input: string): string | null {
	const trimmed = input.trim();
	const fromLink = trimmed.match(/\/r\/([A-Za-z0-9_-]+)/)?.[1];
	const candidate = fromLink ?? trimmed;
	return ROOM_ID_PATTERN.test(candidate) ? candidate : null;
}
