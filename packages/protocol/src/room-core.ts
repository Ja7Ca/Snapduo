/**
 * The room's rules, as pure functions. The Durable Object only stores the
 * result and sends snapshots; every decision is made here so it can be
 * unit-tested without a Worker runtime.
 *
 * Nothing in here reads the clock or makes random ids: `now` and `newId`
 * are passed in.
 */
import { DEFAULT_FRAME_ID, isFrameId, shotCount } from "./frames";
import {
	ROOM_CAPACITY,
	TIMERS,
	type CaptureInfo,
	type Intent,
	type RoomPhase,
	type RoomSnapshot,
	type SeatId,
	type SeatSnapshot,
	type TimerSeconds,
} from "./messages";
import { CAPTURE_LEAD_MS, GRACE_MS, HEALTH_CHECK_MS, ROOM_TTL_MS, captureEndsAt, shutterAt } from "./timing";

export interface ServerSeat extends SeatSnapshot {
	/** Secret that gives this seat back after a reload. Never broadcast. */
	token: string;
}

export interface ServerRoom {
	createdAt: number;
	lastActiveAt: number;
	version: number;
	frameId: string;
	frameChangedBy: string | null;
	timer: TimerSeconds;
	slots: (string | null)[];
	phase: RoomPhase;
	capture: CaptureInfo | null;
	finishedBy: string | null;
	seats: ServerSeat[];
}

export const MAX_NAME_LENGTH = 40;

export function createRoom(now: number): ServerRoom {
	return {
		createdAt: now,
		lastActiveAt: now,
		version: 1,
		frameId: DEFAULT_FRAME_ID,
		frameChangedBy: null,
		timer: 3,
		slots: emptySlots(DEFAULT_FRAME_ID),
		phase: "booth",
		capture: null,
		finishedBy: null,
		seats: [],
	};
}

function emptySlots(frameId: string): null[] {
	return Array.from({ length: shotCount(frameId) }, () => null);
}

export function cleanName(name: unknown): string {
	if (typeof name !== "string") return "";
	// Strip control characters; the UI shows "You" / "Friend" when empty.
	return name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_NAME_LENGTH);
}

/** Bumps version + activity. Every accepted change goes through here. */
function touch(room: ServerRoom, now: number, patch: Partial<ServerRoom>): ServerRoom {
	return { ...room, ...patch, version: room.version + 1, lastActiveAt: now };
}

function updateSeat(room: ServerRoom, seat: SeatId, patch: Partial<ServerSeat>): ServerSeat[] {
	return room.seats.map((s) => (s.seat === seat ? { ...s, ...patch } : s));
}

export const seatOf = (room: ServerRoom, seat: SeatId) => room.seats.find((s) => s.seat === seat);
export const bothPresent = (room: ServerRoom) =>
	room.seats.length === ROOM_CAPACITY && room.seats.every((s) => s.present);

/* ---------- joining and leaving ---------- */

export interface JoinRequest {
	token?: string;
	name: unknown;
	micOn: unknown;
}

export type JoinResult =
	| { ok: true; room: ServerRoom; seat: ServerSeat; resumed: boolean }
	| { ok: false; code: "room_full" };

export function join(room: ServerRoom, req: JoinRequest, now: number, newId: () => string): JoinResult {
	const name = cleanName(req.name);
	const micOn = req.micOn === true;
	const held = req.token ? room.seats.find((s) => s.token === req.token) : undefined;

	if (held) {
		const seat: ServerSeat = { ...held, name, micOn, present: true, awayUntil: null, epoch: held.epoch + 1 };
		const next = touch(room, now, { seats: room.seats.map((s) => (s.seat === held.seat ? seat : s)) });
		return { ok: true, room: next, seat, resumed: true };
	}

	if (room.seats.length >= ROOM_CAPACITY) return { ok: false, code: "room_full" };

	// The first seat is the creator's ("A"); a freed seat is reused.
	const id: SeatId = seatOf(room, "A") ? "B" : "A";
	const seat: ServerSeat = {
		seat: id,
		peerId: newId(),
		token: newId(),
		name,
		micOn,
		present: true,
		awayUntil: null,
		epoch: 1,
	};
	const seats = [...room.seats, seat].sort((a, b) => a.seat.localeCompare(b.seat));
	return { ok: true, room: touch(room, now, { seats }), seat, resumed: false };
}

/** Connection lost: hold the seat for GRACE_MS. */
export function disconnect(room: ServerRoom, seat: SeatId, now: number): ServerRoom {
	const s = seatOf(room, seat);
	if (!s || !s.present) return room;
	const away = touch(room, now, { seats: updateSeat(room, seat, { present: false, awayUntil: now + GRACE_MS }) });
	return abortCapture(away, now);
}

/** Pressed Leave: free the seat right away. */
export function leave(room: ServerRoom, seat: SeatId, now: number): ServerRoom {
	if (!seatOf(room, seat)) return room;
	const next = touch(room, now, { seats: room.seats.filter((s) => s.seat !== seat) });
	return abortCapture(next, now);
}

/**
 * A capture needs both people. Photos whose shutter already fired count;
 * the rest of the queue is dropped.
 */
function abortCapture(room: ServerRoom, now: number): ServerRoom {
	const c = room.capture;
	if (!c) return room;
	const slots = [...room.slots];
	c.queue.forEach((slot, i) => {
		if (now >= shutterAt(c, i)) slots[slot] = c.id;
	});
	return { ...room, slots, capture: null, phase: "booth" };
}

/* ---------- time-based changes ---------- */

/**
 * Applies everything that's due at `now`: finishing a capture, releasing
 * seats whose grace period ran out. Returns the same object if nothing
 * changed.
 */
export function tick(room: ServerRoom, now: number): ServerRoom {
	let next = room;
	const c = next.capture;
	if (c && now >= captureEndsAt(c)) {
		const slots = [...next.slots];
		for (const slot of c.queue) slots[slot] = c.id;
		next = touch(next, now, { slots, capture: null, phase: "booth" });
	}
	const expired = next.seats.filter((s) => !s.present && s.awayUntil !== null && now >= s.awayUntil);
	if (expired.length) {
		next = touch(next, now, { seats: next.seats.filter((s) => !expired.includes(s)) });
	}
	return next;
}

/** When the Durable Object should wake up next. */
export function nextAlarm(room: ServerRoom, now: number): number {
	const times = [room.lastActiveAt + ROOM_TTL_MS];
	if (room.capture) times.push(captureEndsAt(room.capture));
	for (const s of room.seats) {
		if (s.awayUntil !== null) times.push(s.awayUntil);
		// Someone connected: check for silent sockets now and then.
		if (s.present) times.push(now + HEALTH_CHECK_MS);
	}
	return Math.max(now + 1, Math.min(...times));
}

/** Nobody here and nothing happened for a day: delete the room. */
export function isExpired(room: ServerRoom, now: number): boolean {
	return !room.seats.some((s) => s.present) && now - room.lastActiveAt >= ROOM_TTL_MS;
}

/* ---------- what people ask for ---------- */

/**
 * Applies one request from a seat. Returns null when it isn't allowed right
 * now (the client is out of date or two people pressed at once); the
 * caller just resends the current snapshot.
 */
export function applyIntent(
	room: ServerRoom,
	seat: SeatId,
	intent: Intent,
	now: number,
	newId: () => string,
): ServerRoom | null {
	const me = seatOf(room, seat);
	if (!me || !me.present) return null;

	switch (intent.type) {
		case "select-frame": {
			if (room.phase !== "booth" || !isFrameId(intent.frameId) || intent.frameId === room.frameId) return null;
			const keep = shotCount(intent.frameId) === shotCount(room.frameId);
			return touch(room, now, {
				frameId: intent.frameId,
				frameChangedBy: me.peerId,
				slots: keep ? room.slots : emptySlots(intent.frameId),
			});
		}

		case "set-timer":
			if (room.phase === "capturing" || !TIMERS.includes(intent.timer) || intent.timer === room.timer) return null;
			return touch(room, now, { timer: intent.timer });

		case "start-capture": {
			if (room.phase !== "booth" || !bothPresent(room)) return null;
			let queue: number[];
			if (intent.slot === null) {
				queue = room.slots.flatMap((s, i) => (s ? [] : [i]));
			} else {
				const ok = Number.isInteger(intent.slot) && intent.slot >= 0 && intent.slot < room.slots.length;
				// Retake only a photo that exists.
				queue = ok && room.slots[intent.slot] ? [intent.slot] : [];
			}
			if (!queue.length) return null;
			return touch(room, now, {
				phase: "capturing",
				capture: { id: newId(), queue, startAt: now + CAPTURE_LEAD_MS, timer: room.timer, startedBy: me.peerId },
			});
		}

		case "finish":
			if (room.phase !== "booth" || room.slots.some((s) => !s)) return null;
			return touch(room, now, { phase: "result", finishedBy: me.peerId });

		case "back-to-booth":
			if (room.phase !== "result") return null;
			return touch(room, now, { phase: "booth", finishedBy: null });

		case "start-over":
			if (room.phase !== "result") return null;
			return touch(room, now, { phase: "booth", finishedBy: null, slots: emptySlots(room.frameId) });

		case "release-friend": {
			const other = room.seats.find((s) => s.seat !== seat);
			if (seat !== "A" || !other || other.present) return null;
			return touch(room, now, { seats: room.seats.filter((s) => s !== other) });
		}

		case "mic":
			if (typeof intent.on !== "boolean" || intent.on === me.micOn) return null;
			return touch(room, now, { seats: updateSeat(room, seat, { micOn: intent.on }) });
	}
	return null;
}

/** What clients get: everything except the seat tokens. */
export function toSnapshot(room: ServerRoom): RoomSnapshot {
	return {
		version: room.version,
		frameId: room.frameId,
		frameChangedBy: room.frameChangedBy,
		timer: room.timer,
		slots: room.slots,
		phase: room.phase,
		capture: room.capture,
		finishedBy: room.finishedBy,
		seats: room.seats.map(({ token: _token, ...seat }) => seat),
	};
}
