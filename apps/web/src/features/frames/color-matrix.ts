import type { FilterOp } from "./filters";

/**
 * CSS filter functions as pixel maths, following the Filter Effects spec
 * (https://drafts.fxtf.org/filter-effects/#ShorthandEquivalents).
 *
 * Each op is applied in turn and clamped to 0..255 in between, the way a
 * browser chains filter primitives, so the download matches the preview.
 */

/** Row-major 3×4: [r', g', b'] = M · [r, g, b, 1] (values 0..1). */
type Affine = readonly number[];

function opMatrix([name, a]: FilterOp): Affine {
	switch (name) {
		case "grayscale": {
			const s = 1 - Math.min(1, a);
			return [
				0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s, 0,
				0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s, 0,
				0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s, 0,
			];
		}
		case "sepia": {
			const s = 1 - Math.min(1, a);
			return [
				0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s, 0,
				0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s, 0,
				0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s, 0,
			];
		}
		case "saturate":
			return [
				0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a, 0,
				0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a, 0,
				0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a, 0,
			];
		case "contrast": {
			const o = (1 - a) / 2;
			return [a, 0, 0, o, 0, a, 0, o, 0, 0, a, o];
		}
		case "brightness":
			return [a, 0, 0, 0, 0, a, 0, 0, 0, 0, a, 0];
	}
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** One RGB triple (0..255) through all ops. Exported for tests. */
export function filterPixel(ops: readonly FilterOp[], rgb: [number, number, number]): [number, number, number] {
	let [r, g, b] = rgb;
	for (const op of ops) {
		const m = opMatrix(op);
		const nr = m[0] * r + m[1] * g + m[2] * b + m[3] * 255;
		const ng = m[4] * r + m[5] * g + m[6] * b + m[7] * 255;
		const nb = m[8] * r + m[9] * g + m[10] * b + m[11] * 255;
		[r, g, b] = [clamp(nr), clamp(ng), clamp(nb)];
	}
	return [r, g, b];
}

/** Applies the ops to RGBA pixel data in place (alpha untouched). */
export function applyFilter(data: Uint8ClampedArray, ops: readonly FilterOp[]): void {
	if (!ops.length) return;
	const matrices = ops.map(opMatrix);
	for (let i = 0; i < data.length; i += 4) {
		let r = data[i];
		let g = data[i + 1];
		let b = data[i + 2];
		for (const m of matrices) {
			const nr = m[0] * r + m[1] * g + m[2] * b + m[3] * 255;
			const ng = m[4] * r + m[5] * g + m[6] * b + m[7] * 255;
			const nb = m[8] * r + m[9] * g + m[10] * b + m[11] * 255;
			r = clamp(nr);
			g = clamp(ng);
			b = clamp(nb);
		}
		data[i] = r;
		data[i + 1] = g;
		data[i + 2] = b;
	}
}
