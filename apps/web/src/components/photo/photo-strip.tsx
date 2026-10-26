import { useId } from "react";
import { filterCss, type FilterId } from "@/features/frames/filters";
import { splitSlot, type FrameSpec } from "@/features/frames/frames";
import type { Shot } from "@/features/room/room-state";
import { cn } from "@/lib/utils";

interface PhotoStripProps {
	frame: FrameSpec;
	shots?: (Shot | null)[];
	filter?: FilterId;
	/** Date shown in the stamp; omit for thumbnails. */
	date?: Date;
	/** BCP-47 language for the date stamp, e.g. "id" → "25 Okt 2026". */
	dateLocale?: string;
	/** Highlight one slot (booth panel selection / capture in progress). */
	highlightSlot?: number | null;
	className?: string;
	/** Accessible name. Pass "" when a parent already labels it (decorative). */
	title?: string;
}

/**
 * Draws a frame from its spec as SVG, at canvas resolution, scaled by CSS.
 * The final download (Phase 3) uses the same geometry on a canvas.
 */
export function PhotoStrip({ frame, shots, filter = "normal", date, dateLocale = "en-GB", highlightSlot = null, className, title }: PhotoStripProps) {
	const id = useId().replace(/:/g, "");
	const { w, h } = frame.canvas;
	const { paper, ink, sprockets } = frame.theme;
	const css = filterCss(filter);
	const hole = frame.layout === "classic-strip" ? 9 : 12;
	const holeStep = hole * 4;

	return (
		<svg
			viewBox={`0 0 ${w} ${h}`}
			{...(title === "" ? { "aria-hidden": true } : { role: "img", "aria-label": title ?? frame.name })}
			className={cn("block h-auto w-full", className)}
		>
			<rect width={w} height={h} fill={paper} />

			{sprockets &&
				[hole * 1.6, w - hole * 1.6].map((x) =>
					Array.from({ length: Math.floor((h - holeStep) / holeStep) }, (_, i) => (
						<rect
							key={`${x}-${i}`}
							x={x - hole / 2}
							y={holeStep / 2 + i * holeStep}
							width={hole}
							height={hole * 1.4}
							rx={hole / 3}
							fill={ink}
							opacity={0.85}
						/>
					)),
				)}

			{frame.slots.map((slot, i) => {
				const shot = shots?.[i] ?? null;
				const halves = splitSlot(slot, frame.splitGutter);
				return (
					<g key={i}>
						{halves.map((half, side) => {
							const clip = `${id}-c${i}-${side}`;
							const src = shot ? (side === 0 ? shot.left : shot.right) : null;
							return (
								<g key={side}>
									<clipPath id={clip}>
										<rect x={half.x} y={half.y} width={half.w} height={half.h} rx={6} />
									</clipPath>
									{src ? (
										<image
											href={src}
											x={half.x}
											y={half.y}
											width={half.w}
											height={half.h}
											preserveAspectRatio="xMidYMid slice"
											clipPath={`url(#${clip})`}
											style={{ filter: css }}
										/>
									) : (
										<rect x={half.x} y={half.y} width={half.w} height={half.h} rx={6} fill={ink} opacity={0.1} />
									)}
								</g>
							);
						})}
						{highlightSlot === i && (
							<rect
								x={slot.x - 6}
								y={slot.y - 6}
								width={slot.w + 12}
								height={slot.h + 12}
								rx={10}
								fill="none"
								stroke="var(--primary)"
								strokeWidth={Math.max(6, w / 120)}
							/>
						)}
					</g>
				);
			})}

			<text
				x={frame.stamp.x + frame.stamp.w / 2}
				y={frame.stamp.y + frame.stamp.h * (date ? 0.42 : 0.55)}
				textAnchor="middle"
				dominantBaseline="middle"
				fill={ink}
				fontFamily="var(--font-display), sans-serif"
				fontWeight={800}
				fontSize={Math.round(frame.stamp.h * 0.26)}
			>
				Snapduo
			</text>
			{date && (
				<text
					x={frame.stamp.x + frame.stamp.w / 2}
					y={frame.stamp.y + frame.stamp.h * 0.7}
					textAnchor="middle"
					dominantBaseline="middle"
					fill={ink}
					opacity={0.75}
					fontFamily="var(--font-mono), monospace"
					fontSize={Math.round(frame.stamp.h * 0.13)}
				>
					{date.toLocaleDateString(dateLocale, { day: "2-digit", month: "short", year: "numeric" })}
				</text>
			)}
		</svg>
	);
}
