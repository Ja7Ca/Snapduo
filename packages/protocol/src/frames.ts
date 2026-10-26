/**
 * The only frame facts the server needs: which ids exist and how many
 * photos each takes. Geometry and looks live in apps/web
 * (features/frames/frames.ts), which has a test keeping the two in sync.
 */
export const FRAME_SHOTS: Readonly<Record<string, number>> = {
	"classic-white": 4,
	"classic-ink": 4,
	"duo-cream": 2,
	"duo-tangerine": 2,
	"grid-white": 4,
};

export const DEFAULT_FRAME_ID = "classic-white";

export function isFrameId(id: string): boolean {
	return Object.hasOwn(FRAME_SHOTS, id);
}

export function shotCount(frameId: string): number {
	return FRAME_SHOTS[frameId] ?? FRAME_SHOTS[DEFAULT_FRAME_ID];
}
