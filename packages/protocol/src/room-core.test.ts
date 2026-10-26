import { describe, expect, it } from "vitest";
import { signalKey } from "./messages";
import {
	applyIntent,
	cleanName,
	createRoom,
	disconnect,
	isExpired,
	join,
	leave,
	nextAlarm,
	tick,
	toSnapshot,
	type ServerRoom,
} from "./room-core";
import {
	CAPTURE_LEAD_MS,
	GRACE_MS,
	HEALTH_CHECK_MS,
	ROOM_TTL_MS,
	SHOT_GAP_MS,
	captureEndsAt,
	captureProgress,
	shutterAt,
} from "./timing";

let n = 0;
const newId = () => `id${++n}`;

function joined(room: ServerRoom, name: string, token?: string) {
	const r = join(room, { name, micOn: true, token }, 0, newId);
	if (!r.ok) throw new Error(r.code);
	return r;
}

/** Room with both people in the booth. */
function full() {
	const a = joined(createRoom(0), "Ana");
	const b = joined(a.room, "Bo");
	return { room: b.room, a: a.seat, b: b.seat };
}

function must(room: ServerRoom | null): ServerRoom {
	if (!room) throw new Error("intent rejected");
	return room;
}

/** Runs a full capture to the end. */
function shootAll(room: ServerRoom, now = 1000): ServerRoom {
	const started = must(applyIntent(room, "A", { type: "start-capture", slot: null }, now, newId));
	return tick(started, captureEndsAt(started.capture!));
}

describe("join", () => {
	it("gives the first person seat A, the second B, refuses a third", () => {
		const { room, a, b } = full();
		expect([a.seat, b.seat]).toEqual(["A", "B"]);
		expect(join(room, { name: "Cy", micOn: true }, 0, newId)).toEqual({ ok: false, code: "room_full" });
	});

	it("gives the same seat and peer id back with the token, with a new epoch", () => {
		const { room, a } = full();
		const away = disconnect(room, "A", 10);
		// Room is "full" (seat held), but the token still gets in.
		const back = join(away, { name: "Ana", micOn: false, token: a.token }, 20, newId);
		expect(back.ok && back.resumed).toBe(true);
		if (!back.ok) return;
		expect(back.seat.peerId).toBe(a.peerId);
		expect(back.seat.epoch).toBe(a.epoch + 1);
		expect(back.seat.present).toBe(true);
		expect(back.seat.awayUntil).toBeNull();
		expect(back.seat.micOn).toBe(false);
	});

	it("an unknown token is just a newcomer", () => {
		const a = joined(createRoom(0), "Ana");
		const r = join(a.room, { name: "Bo", micOn: true, token: "forged" }, 0, newId);
		expect(r.ok && r.seat.seat).toBe("B");
	});

	it("reuses seat A after the creator leaves for good", () => {
		const { room } = full();
		const r = join(leave(room, "A", 5), { name: "Cy", micOn: true }, 6, newId);
		expect(r.ok && r.seat.seat).toBe("A");
	});

	it("cleans names", () => {
		expect(cleanName("  Ana\u0000 ")).toBe("Ana");
		expect(cleanName("x".repeat(100))).toHaveLength(40);
		expect(cleanName(42)).toBe("");
	});
});

describe("grace period", () => {
	it("holds the seat for GRACE_MS, then releases it", () => {
		const { room } = full();
		const away = disconnect(room, "B", 1000);
		expect(away.seats[1]).toMatchObject({ present: false, awayUntil: 1000 + GRACE_MS });
		expect(tick(away, 1000 + GRACE_MS - 1)).toBe(away);
		expect(tick(away, 1000 + GRACE_MS).seats.map((s) => s.seat)).toEqual(["A"]);
	});

	it("disconnecting twice doesn't push the deadline back", () => {
		const { room } = full();
		const once = disconnect(room, "B", 1000);
		expect(disconnect(once, "B", 5000)).toBe(once);
	});

	it("the creator can free an away friend's seat early, the friend can't do it to the creator", () => {
		const { room } = full();
		const away = disconnect(room, "B", 0);
		expect(must(applyIntent(away, "A", { type: "release-friend" }, 1, newId)).seats).toHaveLength(1);
		expect(applyIntent(room, "A", { type: "release-friend" }, 1, newId)).toBeNull(); // friend is here
		expect(applyIntent(disconnect(room, "A", 0), "B", { type: "release-friend" }, 1, newId)).toBeNull();
	});
});

describe("intents", () => {
	it("ignores people who aren't here", () => {
		const { room } = full();
		const away = disconnect(room, "B", 0);
		expect(applyIntent(away, "B", { type: "set-timer", timer: 5 }, 1, newId)).toBeNull();
	});

	it("changing frame keeps photos only when the photo count matches", () => {
		const { room } = full();
		const shot = shootAll(room);
		expect(shot.slots.every(Boolean)).toBe(true);
		const sameCount = must(applyIntent(shot, "B", { type: "select-frame", frameId: "grid-white" }, 1, newId));
		expect(sameCount.slots).toEqual(shot.slots);
		expect(sameCount.frameChangedBy).toBe(shot.seats[1].peerId);
		const fewer = must(applyIntent(shot, "A", { type: "select-frame", frameId: "duo-cream" }, 1, newId));
		expect(fewer.slots).toEqual([null, null]);
	});

	it("rejects unknown frames and timers", () => {
		const { room } = full();
		expect(applyIntent(room, "A", { type: "select-frame", frameId: "nope" }, 1, newId)).toBeNull();
		expect(applyIntent(room, "A", { type: "set-timer", timer: 7 as 3 }, 1, newId)).toBeNull();
	});

	it("needs both people to start, and only one capture at a time", () => {
		const a = joined(createRoom(0), "Ana");
		expect(applyIntent(a.room, "A", { type: "start-capture", slot: null }, 1, newId)).toBeNull();

		const { room } = full();
		const started = must(applyIntent(room, "A", { type: "start-capture", slot: null }, 100, newId));
		expect(started.capture).toMatchObject({ queue: [0, 1, 2, 3], startAt: 100 + CAPTURE_LEAD_MS, timer: 3 });
		// The friend pressed at the same moment: second request loses.
		expect(applyIntent(started, "B", { type: "start-capture", slot: null }, 101, newId)).toBeNull();
		// Settings are locked while shooting.
		expect(applyIntent(started, "B", { type: "set-timer", timer: 10 }, 101, newId)).toBeNull();
		expect(applyIntent(started, "B", { type: "select-frame", frameId: "duo-cream" }, 101, newId)).toBeNull();
	});

	it("fills slots only when the capture ends", () => {
		const { room } = full();
		const started = must(applyIntent(room, "A", { type: "start-capture", slot: null }, 0, newId));
		const end = captureEndsAt(started.capture!);
		expect(tick(started, end - 1)).toBe(started);
		const done = tick(started, end);
		expect(done.phase).toBe("booth");
		expect(done.capture).toBeNull();
		expect(done.slots).toEqual([started.capture!.id, started.capture!.id, started.capture!.id, started.capture!.id]);
	});

	it("retakes one existing photo with a new capture id", () => {
		const shot = shootAll(full().room);
		expect(applyIntent(full().room, "A", { type: "start-capture", slot: 1 }, 1, newId)).toBeNull(); // empty slot
		const retake = must(applyIntent(shot, "B", { type: "start-capture", slot: 2 }, 5000, newId));
		const done = tick(retake, captureEndsAt(retake.capture!));
		expect(done.slots[2]).toBe(retake.capture!.id);
		expect(done.slots[0]).toBe(shot.slots[0]);
	});

	it("a drop mid-capture keeps the photos already taken", () => {
		const { room } = full();
		const started = must(applyIntent(room, "A", { type: "start-capture", slot: null }, 0, newId));
		const c = started.capture!;
		const afterSecond = shutterAt(c, 1) + 10;
		const dropped = disconnect(started, "B", afterSecond);
		expect(dropped.phase).toBe("booth");
		expect(dropped.slots).toEqual([c.id, c.id, null, null]);
	});

	it("finish needs every photo; result → booth keeps them, start over clears them", () => {
		const { room } = full();
		expect(applyIntent(room, "A", { type: "finish" }, 1, newId)).toBeNull();
		const result = must(applyIntent(shootAll(room), "B", { type: "finish" }, 1, newId));
		expect(result.phase).toBe("result");
		expect(result.finishedBy).toBe(result.seats[1].peerId);
		expect(must(applyIntent(result, "A", { type: "back-to-booth" }, 2, newId)).slots.every(Boolean)).toBe(true);
		expect(must(applyIntent(result, "A", { type: "start-over" }, 2, newId)).slots.every((s) => s === null)).toBe(true);
	});

	it("mic state is per seat", () => {
		const { room } = full();
		const muted = must(applyIntent(room, "B", { type: "mic", on: false }, 1, newId));
		expect(muted.seats.map((s) => s.micOn)).toEqual([true, false]);
		expect(applyIntent(muted, "B", { type: "mic", on: false }, 2, newId)).toBeNull();
	});

	it("every accepted change bumps the version", () => {
		const { room } = full();
		const next = must(applyIntent(room, "A", { type: "set-timer", timer: 5 }, 1, newId));
		expect(next.version).toBe(room.version + 1);
	});
});

describe("alarms and cleanup", () => {
	it("wakes for the earliest of capture end, grace end, health check", () => {
		const { room } = full();
		const started = must(applyIntent(room, "A", { type: "start-capture", slot: null }, 0, newId));
		expect(nextAlarm(started, 0)).toBe(Math.min(captureEndsAt(started.capture!), HEALTH_CHECK_MS));
		const empty = createRoom(0);
		expect(nextAlarm(empty, 0)).toBe(ROOM_TTL_MS);
	});

	it("expires a room only when nobody is here and it's been idle a day", () => {
		const { room } = full();
		expect(isExpired(room, ROOM_TTL_MS * 2)).toBe(false);
		const gone = leave(leave(room, "A", 0), "B", 0);
		expect(isExpired(gone, ROOM_TTL_MS - 1)).toBe(false);
		expect(isExpired(gone, ROOM_TTL_MS)).toBe(true);
	});

	it("snapshots never include seat tokens", () => {
		const { room } = full();
		expect(JSON.stringify(toSnapshot(room))).not.toContain("token");
	});

	it("signal key changes when either side reconnects", () => {
		const { room, a } = full();
		const before = signalKey(room.seats);
		const r = join(disconnect(room, "A", 0), { name: "Ana", micOn: true, token: a.token }, 1, newId);
		expect(r.ok && signalKey(r.room.seats)).not.toBe(before);
	});
});

describe("captureProgress", () => {
	const c = { id: "c", queue: [0, 1], startAt: 1000, timer: 3 as const, startedBy: "p" };

	it("counts down 3-2-1, flashes, then counts down the next photo", () => {
		expect(captureProgress(c, 500)).toMatchObject({ before: true, countdown: 3, taken: 0 });
		expect(captureProgress(c, 1000)).toMatchObject({ index: 0, countdown: 3, taken: 0 });
		expect(captureProgress(c, 3500)).toMatchObject({ index: 0, countdown: 1 });
		expect(captureProgress(c, shutterAt(c, 0))).toMatchObject({ index: 0, countdown: 0, taken: 1 });
		expect(captureProgress(c, shutterAt(c, 0) + SHOT_GAP_MS)).toMatchObject({ index: 1, countdown: 3, taken: 1 });
		expect(captureProgress(c, shutterAt(c, 1))).toMatchObject({ index: 1, countdown: 0, taken: 2 });
	});
});
