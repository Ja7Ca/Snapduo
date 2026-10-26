/**
 * Photo filters as a list of colour operations. The same list becomes a
 * CSS filter string for the on-screen preview and a per-pixel transform
 * for the downloaded strip (color-matrix.ts). Canvas `ctx.filter` isn't
 * used: Safari only supports it from 18, and doing the maths ourselves
 * gives the same result in every browser.
 */
export type FilterOp =
	| readonly ["grayscale", number]
	| readonly ["sepia", number]
	| readonly ["saturate", number]
	| readonly ["contrast", number]
	| readonly ["brightness", number];

export const FILTERS = [
	{ id: "normal", name: "Normal", ops: [] },
	{ id: "bw", name: "B&W", ops: [["grayscale", 1], ["contrast", 1.08]] },
	{ id: "warm", name: "Warm", ops: [["sepia", 0.22], ["saturate", 1.25], ["brightness", 1.03]] },
	{ id: "vintage", name: "Vintage", ops: [["sepia", 0.45], ["contrast", 0.92], ["brightness", 1.06], ["saturate", 0.85]] },
] as const satisfies readonly { id: string; name: string; ops: readonly FilterOp[] }[];

export type FilterId = (typeof FILTERS)[number]["id"];

export function filterOps(id: FilterId): readonly FilterOp[] {
	return FILTERS.find((f) => f.id === id)?.ops ?? [];
}

/** "grayscale(1) contrast(1.08)", or "none". */
export function filterCss(id: FilterId): string {
	const ops = filterOps(id);
	return ops.length ? ops.map(([name, amount]) => `${name}(${amount})`).join(" ") : "none";
}
