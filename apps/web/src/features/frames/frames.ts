/**
 * Photo frames as data. Capture (Phase 3) and the UI previews both read
 * from here, so a frame looks the same in the picker, the booth panel and
 * the final composite.
 *
 * Every shot holds BOTH friends side by side: each slot is split into a
 * left half (the room creator) and a right half (the friend).
 * Canvas sizes are print sizes at 300 dpi.
 */

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type FrameLayout = "classic-strip" | "duo" | "grid";

export interface FrameTheme {
	/** Paper colour around the photos. */
	paper: string;
	/** Outline, date stamp and sprocket colour. */
	ink: string;
	sprockets: boolean;
}

export interface FrameSpec {
	id: string;
	name: string;
	layout: FrameLayout;
	shots: number;
	canvas: { w: number; h: number };
	print: { widthIn: number; heightIn: number };
	/** One rect per shot, in canvas pixels. */
	slots: Rect[];
	/** Gap between the two people inside a slot. */
	splitGutter: number;
	/** Where the "Snapduo · date" stamp is drawn. */
	stamp: Rect;
	theme: FrameTheme;
}

const DPI = 300;

/** Slots stacked vertically, with room for the stamp at the bottom. */
function stack(canvasW: number, canvasH: number, count: number, opts: { side: number; top: number; gap: number; stampH: number }): { slots: Rect[]; stamp: Rect } {
	const w = canvasW - opts.side * 2;
	const h = (canvasH - opts.top - opts.stampH - opts.gap * (count - 1)) / count;
	const slots = Array.from({ length: count }, (_, i) => ({
		x: opts.side,
		y: opts.top + i * (h + opts.gap),
		w,
		h: Math.floor(h),
	}));
	const stampY = opts.top + count * h + (count - 1) * opts.gap;
	return { slots, stamp: { x: opts.side, y: Math.round(stampY), w, h: canvasH - Math.round(stampY) } };
}

/** 2×2 grid with the stamp along the bottom. */
function grid(canvasW: number, canvasH: number, opts: { pad: number; gap: number; stampH: number }): { slots: Rect[]; stamp: Rect } {
	const w = (canvasW - opts.pad * 2 - opts.gap) / 2;
	const h = (canvasH - opts.pad - opts.stampH - opts.gap) / 2;
	const slots: Rect[] = [];
	for (let row = 0; row < 2; row++) {
		for (let col = 0; col < 2; col++) {
			slots.push({
				x: Math.round(opts.pad + col * (w + opts.gap)),
				y: Math.round(opts.pad + row * (h + opts.gap)),
				w: Math.floor(w),
				h: Math.floor(h),
			});
		}
	}
	const stampY = opts.pad + 2 * h + opts.gap;
	return { slots, stamp: { x: opts.pad, y: Math.round(stampY), w: canvasW - opts.pad * 2, h: canvasH - Math.round(stampY) } };
}

const classic = stack(600, 1800, 4, { side: 56, top: 56, gap: 24, stampH: 170 });
const duo = stack(1200, 1800, 2, { side: 72, top: 72, gap: 40, stampH: 200 });
const quad = grid(1800, 1200, { pad: 64, gap: 32, stampH: 150 });

const WHITE: FrameTheme = { paper: "#ffffff", ink: "#1f1a17", sprockets: true };
const INK: FrameTheme = { paper: "#1f1a17", ink: "#f5efe6", sprockets: true };
const TANGERINE: FrameTheme = { paper: "#ff6b2c", ink: "#1f1a17", sprockets: false };
const CREAM: FrameTheme = { paper: "#f5efe6", ink: "#1f1a17", sprockets: false };

function frame(id: string, name: string, layout: FrameLayout, theme: FrameTheme): FrameSpec {
	const geometry = { "classic-strip": classic, duo, grid: quad }[layout];
	const canvas = { "classic-strip": { w: 600, h: 1800 }, duo: { w: 1200, h: 1800 }, grid: { w: 1800, h: 1200 } }[layout];
	return {
		id,
		name,
		layout,
		shots: geometry.slots.length,
		canvas,
		print: { widthIn: canvas.w / DPI, heightIn: canvas.h / DPI },
		slots: geometry.slots,
		splitGutter: layout === "classic-strip" ? 8 : 12,
		stamp: geometry.stamp,
		theme,
	};
}

export const FRAMES: readonly FrameSpec[] = [
	frame("classic-white", "Classic strip", "classic-strip", WHITE),
	frame("classic-ink", "Night strip", "classic-strip", INK),
	frame("duo-cream", "Duo", "duo", CREAM),
	frame("duo-tangerine", "Tangerine", "duo", TANGERINE),
	frame("grid-white", "Grid", "grid", WHITE),
];

export const DEFAULT_FRAME_ID = "classic-white";

export function getFrame(id: string): FrameSpec {
	return FRAMES.find((f) => f.id === id) ?? FRAMES[0];
}

/** Can photos be kept when switching from one frame to the other? */
export function isSameShotCount(a: string, b: string): boolean {
	return getFrame(a).shots === getFrame(b).shots;
}

/** Splits a slot into [creator, friend] halves. */
export function splitSlot(slot: Rect, gutter: number): [Rect, Rect] {
	const half = (slot.w - gutter) / 2;
	return [
		{ x: slot.x, y: slot.y, w: Math.floor(half), h: slot.h },
		{ x: slot.x + Math.ceil(half + gutter), y: slot.y, w: Math.floor(half), h: slot.h },
	];
}

/**
 * Which part of a source image to draw so it fills `target` without
 * stretching (CSS object-fit: cover). `focusY` < 0.5 keeps more of the top,
 * where faces usually are.
 */
export function coverCrop(
	source: { w: number; h: number },
	target: { w: number; h: number },
	focusY = 0.42,
): Rect {
	const sourceRatio = source.w / source.h;
	const targetRatio = target.w / target.h;
	if (sourceRatio > targetRatio) {
		// Source is wider: crop the sides, keep centred.
		const w = source.h * targetRatio;
		return { x: (source.w - w) / 2, y: 0, w, h: source.h };
	}
	// Source is taller: crop top/bottom around focusY.
	const h = source.w / targetRatio;
	const maxY = source.h - h;
	return { x: 0, y: Math.min(maxY, Math.max(0, source.h * focusY - h / 2)), w: source.w, h };
}

/** "2×6 in" / "2×6 inci": pass the unit word for the current language. */
export function printLabel(frame: FrameSpec, unit = "in"): string {
	return `${frame.print.widthIn}×${frame.print.heightIn} ${unit}`;
}
