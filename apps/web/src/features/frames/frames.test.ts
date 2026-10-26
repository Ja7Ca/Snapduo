import { DEFAULT_FRAME_ID as SERVER_DEFAULT, FRAME_SHOTS } from "@snapduo/protocol";
import { describe, expect, it } from "vitest";
import { DEFAULT_FRAME_ID, FRAMES, coverCrop, getFrame, isSameShotCount, splitSlot, type Rect } from "./frames";

const inside = (r: Rect, canvas: { w: number; h: number }) =>
	r.x >= 0 && r.y >= 0 && r.x + r.w <= canvas.w && r.y + r.h <= canvas.h;

const overlaps = (a: Rect, b: Rect) =>
	a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("frame specs", () => {
	it.each(FRAMES.map((f) => [f.id, f] as const))("%s: slots and stamp fit the canvas without overlapping", (_, frame) => {
		expect(frame.slots).toHaveLength(frame.shots);
		for (const slot of frame.slots) expect(inside(slot, frame.canvas)).toBe(true);
		expect(inside(frame.stamp, frame.canvas)).toBe(true);

		const all = [...frame.slots, frame.stamp];
		for (let i = 0; i < all.length; i++) {
			for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i], all[j])).toBe(false);
		}
	});

	it.each(FRAMES.map((f) => [f.id, f] as const))("%s: each person's half is portrait-ish (0.6–0.9 w/h)", (_, frame) => {
		for (const slot of frame.slots) {
			for (const half of splitSlot(slot, frame.splitGutter)) {
				const ratio = half.w / half.h;
				expect(ratio).toBeGreaterThanOrEqual(0.6);
				expect(ratio).toBeLessThanOrEqual(0.9);
			}
		}
	});

	it("print sizes are standard photobooth papers", () => {
		expect(getFrame("classic-white").print).toEqual({ widthIn: 2, heightIn: 6 });
		expect(getFrame("duo-cream").print).toEqual({ widthIn: 4, heightIn: 6 });
		expect(getFrame("grid-white").print).toEqual({ widthIn: 6, heightIn: 4 });
	});

	it("unknown id falls back to the first frame", () => {
		expect(getFrame("nope").id).toBe(FRAMES[0].id);
	});

	it("ids are unique", () => {
		expect(new Set(FRAMES.map((f) => f.id)).size).toBe(FRAMES.length);
	});

	it("knows when photos can be kept across a frame change", () => {
		expect(isSameShotCount("classic-white", "classic-ink")).toBe(true);
		expect(isSameShotCount("classic-white", "grid-white")).toBe(true);
		expect(isSameShotCount("classic-white", "duo-cream")).toBe(false);
	});
});

describe("splitSlot", () => {
	it("splits into two equal halves separated by the gutter", () => {
		const [left, right] = splitSlot({ x: 10, y: 20, w: 208, h: 100 }, 8);
		expect(left).toEqual({ x: 10, y: 20, w: 100, h: 100 });
		expect(right).toEqual({ x: 118, y: 20, w: 100, h: 100 });
		expect(right.x + right.w).toBe(10 + 208);
	});
});

describe("coverCrop", () => {
	it("crops the sides of a landscape camera frame for a portrait half", () => {
		const crop = coverCrop({ w: 1280, h: 720 }, { w: 300, h: 400 });
		expect(crop.h).toBe(720);
		expect(crop.w).toBeCloseTo(540);
		expect(crop.x).toBeCloseTo((1280 - 540) / 2);
		expect(crop.y).toBe(0);
	});

	it("crops top/bottom of a tall phone frame, biased towards the top", () => {
		const crop = coverCrop({ w: 720, h: 1280 }, { w: 300, h: 300 });
		expect(crop.w).toBe(720);
		expect(crop.h).toBeCloseTo(720);
		// Centered would be 280; focus 0.42 moves it up.
		expect(crop.y).toBeLessThan(280);
		expect(crop.y).toBeGreaterThanOrEqual(0);
	});

	it("never crops outside the source", () => {
		for (const focusY of [0, 0.2, 0.5, 0.9, 1]) {
			const crop = coverCrop({ w: 480, h: 1200 }, { w: 400, h: 300 }, focusY);
			expect(crop.y).toBeGreaterThanOrEqual(0);
			expect(crop.y + crop.h).toBeLessThanOrEqual(1200 + 1e-9);
		}
	});

	it("keeps the aspect ratio of the target", () => {
		const target = { w: 274, h: 368 };
		const crop = coverCrop({ w: 640, h: 480 }, target);
		expect(crop.w / crop.h).toBeCloseTo(target.w / target.h);
	});
});

describe("frames vs the server", () => {
	it("lists the same frames with the same photo counts as @snapduo/protocol", () => {
		expect(Object.fromEntries(FRAMES.map((f) => [f.id, f.shots]))).toEqual(FRAME_SHOTS);
		expect(DEFAULT_FRAME_ID).toBe(SERVER_DEFAULT);
	});
});
