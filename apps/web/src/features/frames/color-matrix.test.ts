import { describe, expect, it } from "vitest";
import { applyFilter, filterPixel } from "./color-matrix";
import { FILTERS, filterCss, filterOps } from "./filters";

const close = (a: number[], b: number[], tol = 1) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

describe("color matrix filters", () => {
	it("normal leaves pixels alone", () => {
		const data = new Uint8ClampedArray([10, 20, 30, 255]);
		applyFilter(data, filterOps("normal"));
		expect([...data]).toEqual([10, 20, 30, 255]);
	});

	it("grayscale(1) gives equal channels using Rec. 709 weights", () => {
		const [r, g, b] = filterPixel([["grayscale", 1]], [255, 0, 0]);
		expect(close([r, g, b], [54, 54, 54])).toBe(true);
	});

	it("matches the spec's sepia(1) on white", () => {
		// Row sums of the sepia matrix: 1.351, 1.203, 0.937 → clamped.
		expect(close(filterPixel([["sepia", 1]], [255, 255, 255]), [255, 255, 239])).toBe(true);
	});

	it("contrast pivots around mid grey, brightness scales", () => {
		expect(close(filterPixel([["contrast", 2]], [128, 64, 192]), [128, 0, 255])).toBe(true);
		expect(close(filterPixel([["brightness", 0.5]], [200, 100, 50]), [100, 50, 25])).toBe(true);
	});

	it("clamps between steps like a browser chain does", () => {
		// brightness(2) clips 200 → 255 before contrast(0.5) pulls it in.
		expect(filterPixel([["brightness", 2], ["contrast", 0.5]], [200, 200, 200])[0]).toBeCloseTo(191.25, 0);
	});

	it("keeps alpha and builds the CSS preview from the same ops", () => {
		const data = new Uint8ClampedArray([100, 150, 200, 77]);
		applyFilter(data, filterOps("bw"));
		expect(data[3]).toBe(77);
		expect(filterCss("bw")).toBe("grayscale(1) contrast(1.08)");
		expect(filterCss("normal")).toBe("none");
		expect(FILTERS.map((f) => f.id)).toEqual(["normal", "bw", "warm", "vintage"]);
	});
});
