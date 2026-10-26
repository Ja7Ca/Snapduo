/**
 * Photo filters as CSS filter strings, so the same value works on an
 * <img>/<svg> preview now and on canvas `ctx.filter` in Phase 3.
 * (Safari only supports ctx.filter from 18; Phase 3 must check that.)
 */
export const FILTERS = [
	{ id: "normal", name: "Normal", css: "none" },
	{ id: "bw", name: "B&W", css: "grayscale(1) contrast(1.08)" },
	{ id: "warm", name: "Warm", css: "sepia(0.22) saturate(1.25) brightness(1.03)" },
	{ id: "vintage", name: "Vintage", css: "sepia(0.45) contrast(0.92) brightness(1.06) saturate(0.85)" },
] as const;

export type FilterId = (typeof FILTERS)[number]["id"];

export function filterCss(id: FilterId): string {
	return FILTERS.find((f) => f.id === id)?.css ?? "none";
}
