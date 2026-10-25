import type { Dictionary } from "@/i18n/config";
import type { FrameSpec } from "./frames";

/** Translated frame name; falls back to the spec's English name. */
export function frameName(t: Dictionary, frame: FrameSpec): string {
	return (t.frames as Record<string, string>)[frame.id] ?? frame.name;
}
