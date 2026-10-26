import { CAPTURE_LEAD_MS, GRACE_MS, shutterAt, type RoomSnapshot, type SeatSnapshot } from "@snapduo/protocol";
import { describe, expect, it } from "vitest";
import { ClockSync } from "./clock";
import { INITIAL_UI, MISSING_SHOT, liveRoomState, photoKey, routeAction, toShot, type LiveInput, type PhotoRecord } from "./live-view";

const seat = (s: Partial<SeatSnapshot> & Pick<SeatSnapshot, "seat" | "peerId">): SeatSnapshot => ({
	name: s.seat === "A" ? "Ana" : "Bo",
	micOn: true,
	present: true,
	awayUntil: null,
	epoch: 1,
	...s,
});

function room(patch: Partial<RoomSnapshot> = {}): RoomSnapshot {
	return {
		version: 3,
		frameId: "classic-white",
		frameChangedBy: null,
		timer: 3,
		slots: [null, null, null, null],
		phase: "booth",
		capture: null,
		finishedBy: null,
		seats: [seat({ seat: "A", peerId: "pa" }), seat({ seat: "B", peerId: "pb" })],
		...patch,
	};
}

const rec = (n: number, sharp = true): PhotoRecord => ({ mine: `mine${n}`, theirs: `theirs${n}`, sharp, gaveUp: false });

function input(patch: Partial<LiveInput> = {}): LiveInput {
	return {
		roomId: "room",
		room: room(),
		selfId: "pa",
		photos: new Map(),
		ui: INITIAL_UI,
		now: 0,
		offset: 0,
		selfName: "Ana",
		micOn: true,
		reconnecting: false,
		audioBlocked: false,
		weakConnection: false,
		friendFallbackName: "Friend",
		...patch,
	};
}

describe("liveRoomState", () => {
	it("is waiting alone, in the booth with a friend, and knows who created the room", () => {
		const alone = liveRoomState(input({ room: room({ seats: [seat({ seat: "A", peerId: "pa" })] }) }));
		expect(alone.phase).toBe("waiting");
		expect(alone.isCreator).toBe(true);
		const guest = liveRoomState(input({ selfId: "pb" }));
		expect(guest.phase).toBe("booth");
		expect(guest.isCreator).toBe(false);
		expect(guest.friend?.name).toBe("Ana");
	});

	it("uses a fallback name for a friend who didn't type one", () => {
		const r = room({ seats: [seat({ seat: "A", peerId: "pa" }), seat({ seat: "B", peerId: "pb", name: "" })] });
		expect(liveRoomState(input({ room: r })).friend?.name).toBe("Friend");
	});

	it("turns the server's away deadline into a local countdown start", () => {
		const offset = 5_000; // server clock 5 s ahead
		const r = room({ seats: [seat({ seat: "A", peerId: "pa" }), seat({ seat: "B", peerId: "pb", present: false, awayUntil: 200_000 })] });
		const v = liveRoomState(input({ room: r, offset }));
		// Local deadline = 195 000; the view counts down from awaySince + GRACE.
		expect(v.friend!.awaySince! + GRACE_MS).toBe(195_000);
		expect(v.friend!.present).toBe(false);
	});

	it("shows this browser's photo for a slot, or a grey placeholder if it doesn't have it", () => {
		const r = room({ slots: ["c1", "c1", null, null] });
		const v = liveRoomState(input({ room: r, photos: new Map([[photoKey("c1", 0), rec(0)]]) }));
		expect(v.shots).toEqual([{ left: "mine0", right: "theirs0", lowQuality: false, pending: false }, MISSING_SHOT, null, null]);
	});

	it("follows a capture on the shared clock, showing each photo once its shutter fired", () => {
		const c = { id: "c2", queue: [0, 1, 2, 3], startAt: 10_000, timer: 3 as const, startedBy: "pb" };
		const r = room({ phase: "capturing", capture: c });
		const offset = 1_000;
		const at = (server: number) => server - offset;

		const start = liveRoomState(input({ room: r, offset, now: at(10_000) }));
		expect(start.capture).toMatchObject({ index: 0, countdown: 3, startedBy: "friend" });

		const photos = new Map([[photoKey("c2", 0), rec(9)]]);
		const afterFirst = liveRoomState(input({ room: r, offset, photos, now: at(shutterAt(c, 0) + 10) }));
		expect(afterFirst.capture?.countdown).toBe(0);
		expect(afterFirst.shots[0]).toMatchObject({ left: "mine9", right: "theirs9" });
		expect(afterFirst.shots[1]).toBeNull();
	});

	it("only keeps a retake selection on a filled slot in the booth", () => {
		const r = room({ slots: ["c1", null, null, null] });
		expect(liveRoomState(input({ room: r, ui: { selectedSlot: 0, pendingFrameId: null } })).selectedSlot).toBe(0);
		expect(liveRoomState(input({ room: r, ui: { selectedSlot: 1, pendingFrameId: null } })).selectedSlot).toBeNull();
	});

	it("maps who did what to self / friend", () => {
		const v = liveRoomState(input({ room: room({ frameChangedBy: "pb", finishedBy: "pa" }) }));
		expect(v.frameChangedBy).toBe("friend");
		expect(v.finishedBy).toBe("self");
	});
});

describe("photo halves", () => {
	it("puts the creator on the left on both phones", () => {
		const r = room({ slots: ["c1", null, null, null] });
		const photos = new Map([[photoKey("c1", 0), rec(1)]]);
		expect(liveRoomState(input({ room: r, photos, selfId: "pa" })).shots[0]).toMatchObject({ left: "mine1", right: "theirs1" });
		// Same slot seen by the friend (seat B): their own photo goes right.
		expect(liveRoomState(input({ room: r, photos, selfId: "pb" })).shots[0]).toMatchObject({ left: "theirs1", right: "mine1" });
	});

	it("is pending while the sharp photo travels, low quality once we gave up", () => {
		expect(toShot({ ...rec(1, false) }, true)).toMatchObject({ pending: true, lowQuality: false });
		expect(toShot({ ...rec(1, false), gaveUp: true }, true)).toMatchObject({ pending: false, lowQuality: true });
		expect(toShot(rec(1), true)).toMatchObject({ pending: false, lowQuality: false });
	});
});

describe("routeAction", () => {
	const booth = liveRoomState(input());
	const withPhotos = liveRoomState(input({ room: room({ slots: ["c1", "c1", "c1", "c1"] }) }));

	it("asks before a frame change that would lose photos, and only then", () => {
		expect(routeAction({ type: "SELECT_FRAME", frameId: "duo-cream", by: "self" }, booth, INITIAL_UI).intent).toEqual({
			type: "select-frame",
			frameId: "duo-cream",
		});
		const ask = routeAction({ type: "SELECT_FRAME", frameId: "duo-cream", by: "self" }, withPhotos, INITIAL_UI);
		expect(ask.intent).toBeUndefined();
		expect(ask.ui?.pendingFrameId).toBe("duo-cream");
		// Same photo count: no question.
		expect(routeAction({ type: "SELECT_FRAME", frameId: "grid-white", by: "self" }, withPhotos, INITIAL_UI).intent).toBeDefined();

		const confirm = routeAction({ type: "CONFIRM_FRAME_CHANGE" }, withPhotos, { selectedSlot: null, pendingFrameId: "duo-cream" });
		expect(confirm.intent).toEqual({ type: "select-frame", frameId: "duo-cream" });
		expect(confirm.ui?.pendingFrameId).toBeNull();
	});

	it("starts a retake for the selected slot, or fills the empty ones", () => {
		expect(routeAction({ type: "START_CAPTURE", by: "self" }, booth, INITIAL_UI).intent).toEqual({ type: "start-capture", slot: null });
		const selected = liveRoomState(input({ room: room({ slots: ["c1", "c1", "c1", "c1"] }), ui: { selectedSlot: 2, pendingFrameId: null } }));
		const r = routeAction({ type: "START_CAPTURE", by: "self" }, selected, INITIAL_UI);
		expect(r.intent).toEqual({ type: "start-capture", slot: 2 });
		expect(r.ui?.selectedSlot).toBeNull();
	});

	it("toggles slot selection locally, only on taken photos", () => {
		expect(routeAction({ type: "SELECT_SLOT", slot: 1 }, withPhotos, INITIAL_UI).ui?.selectedSlot).toBe(1);
		expect(routeAction({ type: "SELECT_SLOT", slot: 1 }, booth, INITIAL_UI).ui).toBeUndefined();
	});

	it("maps the remaining buttons to server requests", () => {
		expect(routeAction({ type: "FINISH", by: "self" }, withPhotos, INITIAL_UI).intent).toEqual({ type: "finish" });
		expect(routeAction({ type: "START_OVER" }, withPhotos, INITIAL_UI).intent).toEqual({ type: "start-over" });
		expect(routeAction({ type: "FRIEND_GONE" }, withPhotos, INITIAL_UI).intent).toEqual({ type: "release-friend" });
		expect(routeAction({ type: "AUDIO_BLOCKED", value: false }, withPhotos, INITIAL_UI).resumeAudio).toBe(true);
	});

	it("ignores server-side events dispatched by mistake", () => {
		expect(routeAction({ type: "FRIEND_JOINED", name: "x", micOn: true }, booth, INITIAL_UI)).toEqual({});
	});
});

describe("ClockSync", () => {
	it("keeps the shortest round trip and converts between clocks", () => {
		const c = new ClockSync();
		c.add(1000, 6100, 1200); // rtt 200 → offset 5000
		c.add(2000, 7020, 2040); // rtt 40 → offset 5000
		expect(c.offset).toBe(5000);
		expect(c.rtt).toBe(40);
		c.add(3000, 9000, 3600); // slow sample ignored
		expect(c.offset).toBe(5000);
		expect(c.toLocal(10_000 + CAPTURE_LEAD_MS)).toBe(5_000 + CAPTURE_LEAD_MS);
	});
});
