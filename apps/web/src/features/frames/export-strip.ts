import type { Shot } from "@/features/room/room-state";
import { applyFilter } from "./color-matrix";
import { filterOps, type FilterId } from "./filters";
import { coverCrop, splitSlot, type FrameSpec, type Rect } from "./frames";

/**
 * The downloadable / printable strip. Draws exactly what PhotoStrip shows
 * (same geometry, same filter, same stamp) onto a canvas at print size
 * (300 dpi), so what you see on the result screen is what you get.
 */

interface StripOptions {
	frame: FrameSpec;
	shots: (Shot | null)[];
	filter: FilterId;
	date: Date;
	dateLocale: string;
}

/** Corner radius of each photo, as in PhotoStrip. */
const PHOTO_RADIUS = 6;

export async function renderStrip({ frame, shots, filter, date, dateLocale }: StripOptions): Promise<HTMLCanvasElement> {
	const { w, h } = frame.canvas;
	const { paper, ink, sprockets } = frame.theme;
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas not available");

	ctx.fillStyle = paper;
	ctx.fillRect(0, 0, w, h);

	if (sprockets) {
		const hole = frame.layout === "classic-strip" ? 9 : 12;
		const step = hole * 4;
		ctx.fillStyle = ink;
		ctx.globalAlpha = 0.85;
		for (const x of [hole * 1.6, w - hole * 1.6]) {
			for (let i = 0; i < Math.floor((h - step) / step); i++) {
				roundRect(ctx, { x: x - hole / 2, y: step / 2 + i * step, w: hole, h: hole * 1.4 }, hole / 3);
				ctx.fill();
			}
		}
		ctx.globalAlpha = 1;
	}

	const ops = filterOps(filter);
	const images = await Promise.all(
		shots.map((shot) => (shot ? Promise.all([loadImage(shot.left), loadImage(shot.right)]) : null)),
	);
	frame.slots.forEach((slot, i) => {
		splitSlot(slot, frame.splitGutter).forEach((half, side) => {
			const img = images[i]?.[side] ?? null;
			ctx.save();
			roundRect(ctx, half, PHOTO_RADIUS);
			ctx.clip();
			if (img) {
				ctx.drawImage(filtered(img, half, ops), half.x, half.y, half.w, half.h);
			} else {
				ctx.fillStyle = ink;
				ctx.globalAlpha = 0.1;
				ctx.fillRect(half.x, half.y, half.w, half.h);
			}
			ctx.restore();
		});
	});

	// Stamp, with the site's fonts (wait for them, or the canvas falls back).
	const display = cssFont("--font-display", "sans-serif");
	const mono = cssFont("--font-mono", "monospace");
	const titleSize = Math.round(frame.stamp.h * 0.26);
	const dateSize = Math.round(frame.stamp.h * 0.13);
	await Promise.all([
		document.fonts.load(`800 ${titleSize}px ${display}`),
		document.fonts.load(`${dateSize}px ${mono}`),
	]).catch(() => {});
	const cx = frame.stamp.x + frame.stamp.w / 2;
	ctx.fillStyle = ink;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.font = `800 ${titleSize}px ${display}`;
	ctx.fillText("Snapduo", cx, frame.stamp.y + frame.stamp.h * 0.42);
	ctx.globalAlpha = 0.75;
	ctx.font = `${dateSize}px ${mono}`;
	ctx.fillText(
		date.toLocaleDateString(dateLocale, { day: "2-digit", month: "short", year: "numeric" }),
		cx,
		frame.stamp.y + frame.stamp.h * 0.7,
	);
	ctx.globalAlpha = 1;
	return canvas;
}

/** One photo, cropped like `object-fit: cover` (centred, as the preview), filtered. */
function filtered(img: HTMLImageElement, target: Rect, ops: ReturnType<typeof filterOps>): HTMLCanvasElement {
	const tw = Math.max(1, Math.round(target.w));
	const th = Math.max(1, Math.round(target.h));
	const off = document.createElement("canvas");
	off.width = tw;
	off.height = th;
	const ctx = off.getContext("2d")!;
	const crop = coverCrop({ w: img.naturalWidth, h: img.naturalHeight }, { w: tw, h: th }, 0.5);
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, tw, th);
	if (ops.length) {
		const data = ctx.getImageData(0, 0, tw, th);
		applyFilter(data.data, ops);
		ctx.putImageData(data, 0, 0);
	}
	return off;
}

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
	ctx.beginPath();
	ctx.roundRect(r.x, r.y, r.w, r.h, radius);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
	const img = new Image();
	img.src = src;
	await img.decode();
	return img;
}

/** next/font exposes each family as a CSS variable. */
function cssFont(variable: string, fallback: string): string {
	const value = getComputedStyle(document.body).getPropertyValue(variable).trim();
	return value ? `${value}, ${fallback}` : fallback;
}

export function stripToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encoding failed"))), "image/jpeg", 0.92),
	);
}

export function stripFileName(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `snapduo-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.jpg`;
}

/**
 * Phones: the share sheet ("Save to Photos" on iPhone, where a plain
 * download only opens a preview). Elsewhere: a normal download.
 */
export async function saveStrip(blob: Blob, fileName: string): Promise<void> {
	const file = new File([blob], fileName, { type: "image/jpeg" });
	const touch = window.matchMedia("(pointer: coarse)").matches;
	if (touch && navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file], title: "Snapduo" });
			return;
		} catch (err) {
			if ((err as DOMException)?.name === "AbortError") return; // closed the sheet
			// Share failed for another reason: fall through to a download.
		}
	}
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Prints only the strip, at its real size (2×6 in, 4×6 in…). See globals.css. */
export async function printStrip(blob: Blob, frame: FrameSpec): Promise<void> {
	document.getElementById("print-strip")?.remove();
	const url = URL.createObjectURL(blob);
	const img = document.createElement("img");
	img.id = "print-strip";
	img.alt = "";
	img.src = url;
	img.style.width = `${frame.print.widthIn}in`;
	img.style.height = `${frame.print.heightIn}in`;
	document.body.append(img);
	await img.decode().catch(() => {});
	const cleanup = () => {
		img.remove();
		URL.revokeObjectURL(url);
		window.removeEventListener("afterprint", cleanup);
	};
	window.addEventListener("afterprint", cleanup);
	window.print();
}
