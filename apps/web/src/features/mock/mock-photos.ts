import type { Shot } from "@/features/room/room-state";

/**
 * Phase 1 placeholder photos: simple silhouettes as SVG data URLs.
 * No real faces anywhere in the mock UI.
 */

const BACKDROPS = ["#e9e3da", "#dfe6e4", "#ece0d6", "#e4e1ea", "#e8e6dc", "#dde3ea"];

function silhouette(seed: number, side: "left" | "right"): string {
	const bg = BACKDROPS[seed % BACKDROPS.length];
	const tilt = ((seed * 37) % 17) - 8; // -8..8 degrees
	const shift = ((seed * 53) % 30) - 15;
	const cx = (side === "left" ? 150 : 150) + shift;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">
<rect width="300" height="400" fill="${bg}"/>
<g transform="rotate(${tilt} ${cx} 260)" fill="#b9b0a5">
<circle cx="${cx}" cy="168" r="62"/>
<path d="M${cx - 120} 400 C ${cx - 112} 290, ${cx - 60} 256, ${cx} 256 S ${cx + 112} 290, ${cx + 120} 400 Z"/>
</g></svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function mockShot(n: number, lowQuality = false): Shot {
	return { left: silhouette(n * 2, "left"), right: silhouette(n * 2 + 1, "right"), lowQuality };
}

export function mockShots(count: number): Shot[] {
	return Array.from({ length: count }, (_, i) => mockShot(i));
}

/** Large placeholder for a video tile with no camera. */
export function mockPortrait(seed: number): string {
	return silhouette(seed, "left");
}
