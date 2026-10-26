import { describe, expect, it } from "vitest";
import { SHARE_ID_PATTERN, isJpeg, remainingParts, shareIdFromBytes } from "./shares";

describe("shares", () => {
	it("makes 16-char ids that match the pattern", () => {
		const id = shareIdFromBytes(new Uint8Array(16).map((_, i) => i * 17));
		expect(id).toHaveLength(16);
		expect(SHARE_ID_PATTERN.test(id)).toBe(true);
	});

	it("recognises JPEG files by their first bytes", () => {
		expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
		expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
		expect(isJpeg(new Uint8Array([0xff, 0xd8]))).toBe(false);
	});

	it("rounds the remaining time up to the minute and never goes negative", () => {
		expect(remainingParts(24 * 3600_000, 0)).toEqual({ h: 24, m: 0 });
		expect(remainingParts(61_000, 0)).toEqual({ h: 0, m: 2 });
		expect(remainingParts(0, 5000)).toEqual({ h: 0, m: 0 });
	});
});
