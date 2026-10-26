import type { CaptureInfo } from "./messages";

/** A friend who drops keeps their seat this long. */
export const GRACE_MS = 120_000;

/** An idle room (nobody connected) is deleted after this. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Delay between "start" and the first countdown, so the message reaches
 * both phones before the numbers start. Covers ~400 ms each way.
 */
export const CAPTURE_LEAD_MS = 800;

/** After each photo: flash, then a breath before the next countdown. */
export const SHOT_GAP_MS = 1500;

/**
 * Clients ping this often; the server drops sockets silent for STALE_MS
 * (2½ missed pings). With a check every HEALTH_CHECK_MS, a friend whose
 * network died silently shows as "away" within ~25–35 s. Each check wakes
 * the Durable Object: ~360 wake-ups per hour per busy room, far inside
 * the free tier.
 */
export const PING_INTERVAL_MS = 10_000;
export const STALE_MS = 25_000;

/** How often the server checks for silent sockets while someone is here. */
export const HEALTH_CHECK_MS = 10_000;

/** Server time of the shutter for the i-th photo of a capture. */
export function shutterAt(c: Pick<CaptureInfo, "startAt" | "timer">, i: number): number {
	return c.startAt + c.timer * 1000 * (i + 1) + SHOT_GAP_MS * i;
}

/** Server time the capture is over (last flash shown). */
export function captureEndsAt(c: Pick<CaptureInfo, "startAt" | "timer" | "queue">): number {
	return shutterAt(c, c.queue.length - 1) + 600;
}

export interface CaptureProgress {
	/** Position in the queue being counted down (or just shot). */
	index: number;
	/** Seconds shown on screen; 0 = shutter / flash. */
	countdown: number;
	/** How many photos of this capture have been taken. */
	taken: number;
	/** Countdown hasn't started yet (message still in flight). */
	before: boolean;
}

/** Where a capture is at `now` (server time). Pure, so both phones agree. */
export function captureProgress(c: CaptureInfo, now: number): CaptureProgress {
	if (now < c.startAt) return { index: 0, countdown: c.timer, taken: 0, before: true };
	const last = c.queue.length - 1;
	let taken = 0;
	while (taken <= last && now >= shutterAt(c, taken)) taken++;
	if (taken > last) return { index: last, countdown: 0, taken, before: false };
	// Still in the gap after the previous shot: keep showing the flash.
	const sincePrevShot = taken > 0 ? now - shutterAt(c, taken - 1) : Infinity;
	if (sincePrevShot < SHOT_GAP_MS) return { index: taken - 1, countdown: 0, taken, before: false };
	const countdown = Math.ceil((shutterAt(c, taken) - now) / 1000);
	return { index: taken, countdown: Math.min(c.timer, Math.max(1, countdown)), taken, before: false };
}
