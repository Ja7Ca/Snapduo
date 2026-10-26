import { describe, expect, it } from "vitest";
import {
	canCapture,
	canFinish,
	currentCaptureSlot,
	filledCount,
	initialRoomState,
	roomReducer,
	shutterAction,
	type RoomAction,
	type RoomState,
	type Shot,
} from "./room-state";

const shot = (n: number): Shot => ({ left: `left-${n}`, right: `right-${n}` });
const run = (s: RoomState, ...actions: RoomAction[]) => actions.reduce(roomReducer, s);

const inBooth = () =>
	run(
		initialRoomState("room123456"),
		{ type: "ENTER_BOOTH", name: "Jarot", micOn: true, isCreator: true, friend: null },
		{ type: "FRIEND_JOINED", name: "Alex", micOn: true },
	);

/** Runs a full capture of whatever the shutter would take right now. */
function takeAll(s: RoomState): RoomState {
	s = roomReducer(s, { type: "START_CAPTURE", by: "self" });
	let n = 0;
	while (s.capture) {
		while (s.capture && s.capture.countdown > 0) s = roomReducer(s, { type: "TICK" });
		s = roomReducer(s, { type: "SHOT_TAKEN", shot: shot(n++) });
	}
	return s;
}

describe("joining", () => {
	it("waits alone, then moves to the booth when the friend arrives", () => {
		let s = run(initialRoomState("r"), { type: "ENTER_BOOTH", name: "A", micOn: true, isCreator: true, friend: null });
		expect(s.phase).toBe("waiting");
		s = roomReducer(s, { type: "FRIEND_JOINED", name: "B", micOn: false });
		expect(s.phase).toBe("booth");
		expect(s.friend?.micOn).toBe(false);
	});

	it("goes straight to the booth if the friend is already there", () => {
		const s = run(initialRoomState("r"), {
			type: "ENTER_BOOTH",
			name: "B",
			micOn: true,
			isCreator: false,
			friend: { name: "A", micOn: true, present: true, awaySince: null, weakConnection: false },
		});
		expect(s.phase).toBe("booth");
	});
});

describe("capturing", () => {
	it("fills every empty slot in order, one countdown each", () => {
		let s = roomReducer(inBooth(), { type: "START_CAPTURE", by: "self" });
		expect(s.phase).toBe("capturing");
		expect(s.capture?.queue).toEqual([0, 1, 2, 3]);
		expect(s.capture?.countdown).toBe(3);

		s = run(s, { type: "TICK" }, { type: "TICK" }, { type: "TICK" }, { type: "TICK" });
		expect(s.capture?.countdown).toBe(0); // never negative

		s = roomReducer(s, { type: "SHOT_TAKEN", shot: shot(0) });
		expect(currentCaptureSlot(s)).toBe(1);
		expect(s.capture?.countdown).toBe(3); // countdown resets per photo

		s = takeAll(roomReducer(s, { type: "START_CAPTURE", by: "self" })); // no-op: already capturing
		expect(s.phase).toBe("booth");
		expect(filledCount(s)).toBe(4);
	});

	it("uses the chosen timer", () => {
		const s = run(inBooth(), { type: "SET_TIMER", timer: 10 }, { type: "START_CAPTURE", by: "friend" });
		expect(s.capture?.countdown).toBe(10);
		expect(s.capture?.startedBy).toBe("friend");
	});

	it("cannot start without the friend, or while reconnecting", () => {
		const away = roomReducer(inBooth(), { type: "FRIEND_AWAY", at: 0 });
		expect(canCapture(away)).toBe(false);
		expect(roomReducer(away, { type: "START_CAPTURE", by: "self" }).phase).toBe("booth");

		const reconnecting = roomReducer(inBooth(), { type: "RECONNECTING", value: true });
		expect(canCapture(reconnecting)).toBe(false);
	});

	it("stops the capture but keeps finished photos if the friend drops", () => {
		let s = roomReducer(inBooth(), { type: "START_CAPTURE", by: "self" });
		s = roomReducer(s, { type: "SHOT_TAKEN", shot: shot(0) });
		s = roomReducer(s, { type: "FRIEND_AWAY", at: 1000 });
		expect(s.phase).toBe("booth");
		expect(s.capture).toBeNull();
		expect(filledCount(s)).toBe(1);
		expect(s.friend?.awaySince).toBe(1000);
	});

	it("takes only the remaining slots on the next press", () => {
		let s = roomReducer(inBooth(), { type: "START_CAPTURE", by: "self" });
		s = roomReducer(s, { type: "SHOT_TAKEN", shot: shot(0) });
		s = run(s, { type: "FRIEND_AWAY", at: 0 }, { type: "FRIEND_BACK" });
		expect(shutterAction(s)).toEqual({ kind: "rest" });
		s = roomReducer(s, { type: "START_CAPTURE", by: "self" });
		expect(s.capture?.queue).toEqual([1, 2, 3]);
	});
});

describe("retake", () => {
	it("retakes only the selected slot", () => {
		let s = takeAll(inBooth());
		const before = s.shots.slice();
		s = roomReducer(s, { type: "SELECT_SLOT", slot: 2 });
		expect(shutterAction(s)).toEqual({ kind: "retake", slot: 2 });
		s = roomReducer(s, { type: "START_CAPTURE", by: "self" });
		expect(s.capture?.queue).toEqual([2]);
		expect(s.selectedSlot).toBeNull();
		s = roomReducer(s, { type: "SHOT_TAKEN", shot: shot(99) });
		expect(s.phase).toBe("booth");
		expect(s.shots[2]).toEqual(shot(99));
		expect(s.shots.filter((x, i) => i !== 2)).toEqual(before.filter((x, i) => i !== 2));
	});

	it("can't select an empty slot; selecting again clears it", () => {
		let s = inBooth();
		expect(roomReducer(s, { type: "SELECT_SLOT", slot: 1 }).selectedSlot).toBeNull();
		s = takeAll(s);
		s = roomReducer(s, { type: "SELECT_SLOT", slot: 1 });
		expect(s.selectedSlot).toBe(1);
		expect(roomReducer(s, { type: "SELECT_SLOT", slot: 1 }).selectedSlot).toBeNull();
	});

	it("shutter is disabled when everything is taken and nothing is selected", () => {
		const s = takeAll(inBooth());
		expect(canCapture(s)).toBe(false);
		expect(shutterAction(s)).toEqual({ kind: "done" });
	});
});

describe("frames", () => {
	it("switching to a frame with the same number of photos keeps them", () => {
		let s = takeAll(inBooth());
		s = roomReducer(s, { type: "SELECT_FRAME", frameId: "grid-white", by: "self" });
		expect(s.frameId).toBe("grid-white");
		expect(filledCount(s)).toBe(4);
		expect(s.pendingFrameId).toBeNull();
	});

	it("asks before switching to a frame with a different count, then clears photos", () => {
		let s = takeAll(inBooth());
		s = roomReducer(s, { type: "SELECT_FRAME", frameId: "duo-cream", by: "self" });
		expect(s.frameId).toBe("classic-white");
		expect(s.pendingFrameId).toBe("duo-cream");

		const cancelled = roomReducer(s, { type: "CANCEL_FRAME_CHANGE" });
		expect(cancelled.frameId).toBe("classic-white");
		expect(filledCount(cancelled)).toBe(4);

		s = roomReducer(s, { type: "CONFIRM_FRAME_CHANGE" });
		expect(s.frameId).toBe("duo-cream");
		expect(s.shots).toEqual([null, null]);
	});

	it("doesn't ask when no photos were taken yet", () => {
		const s = roomReducer(inBooth(), { type: "SELECT_FRAME", frameId: "duo-cream", by: "self" });
		expect(s.frameId).toBe("duo-cream");
		expect(s.shots).toHaveLength(2);
	});

	it("applies the friend's change directly (they confirmed on their side)", () => {
		const s = roomReducer(takeAll(inBooth()), { type: "SELECT_FRAME", frameId: "duo-cream", by: "friend" });
		expect(s.frameId).toBe("duo-cream");
		expect(s.frameChangedBy).toBe("friend");
		expect(s.pendingFrameId).toBeNull();
	});

	it("can't change frame mid-capture", () => {
		const s = roomReducer(roomReducer(inBooth(), { type: "START_CAPTURE", by: "self" }), {
			type: "SELECT_FRAME",
			frameId: "grid-white",
			by: "self",
		});
		expect(s.frameId).toBe("classic-white");
	});
});

describe("finishing", () => {
	it("Done only works with every slot filled", () => {
		const half = roomReducer(inBooth(), { type: "START_CAPTURE", by: "self" });
		expect(canFinish(half)).toBe(false);

		let s = takeAll(inBooth());
		expect(canFinish(s)).toBe(true);
		s = roomReducer(s, { type: "FINISH", by: "friend" });
		expect(s.phase).toBe("result");
		expect(s.finishedBy).toBe("friend");
	});

	it("back to booth keeps photos; start over clears them", () => {
		const result = roomReducer(takeAll(inBooth()), { type: "FINISH", by: "self" });
		const back = roomReducer(result, { type: "BACK_TO_BOOTH" });
		expect(back.phase).toBe("booth");
		expect(filledCount(back)).toBe(4);

		const over = roomReducer(result, { type: "START_OVER" });
		expect(over.phase).toBe("booth");
		expect(filledCount(over)).toBe(0);
	});

	it("stays on the result screen if the friend leaves for good", () => {
		const s = roomReducer(roomReducer(takeAll(inBooth()), { type: "FINISH", by: "self" }), { type: "FRIEND_GONE" });
		expect(s.phase).toBe("result");
		expect(s.friend).toBeNull();
		expect(filledCount(s)).toBe(4);
	});

	it("goes back to waiting (photos kept) if the friend leaves from the booth", () => {
		const s = roomReducer(takeAll(inBooth()), { type: "FRIEND_GONE" });
		expect(s.phase).toBe("waiting");
		expect(filledCount(s)).toBe(4);
	});
});
