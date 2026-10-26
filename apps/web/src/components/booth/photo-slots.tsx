"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import type { FrameSpec } from "@/features/frames/frames";
import type { Shot } from "@/features/room/room-state";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

interface PhotoSlotsProps {
	frame: FrameSpec;
	shots: (Shot | null)[];
	selected: number | null;
	/** Slot being captured right now. */
	active: number | null;
	onSelect: (slot: number | null) => void;
	disabled?: boolean;
	orientation?: "vertical" | "horizontal";
	className?: string;
}

/**
 * "Your photos": one button per slot. Taken photos can be selected for a
 * retake; empty ones are shown as numbered placeholders.
 */
export function PhotoSlots({ frame, shots, selected, active, onSelect, disabled, orientation = "vertical", className }: PhotoSlotsProps) {
	const ratio = frame.slots[0].w / frame.slots[0].h;
	const { t, fmt } = useI18n();

	return (
		<ol
			style={orientation === "horizontal" ? { gridTemplateColumns: `repeat(${shots.length}, minmax(0, 1fr))` } : undefined}
			className={cn(
				"flex gap-2",
				orientation === "vertical" ? "flex-col" : "grid",
				className,
			)}
		>
			{shots.map((shot, i) => {
				const isSelected = selected === i;
				const isActive = active === i;
				return (
					<li key={i}>
						<button
							type="button"
							disabled={disabled || !shot}
							aria-pressed={shot ? isSelected : undefined}
							aria-label={fmt(shot ? (isSelected ? t.booth.slotSelected : t.booth.slotTaken) : t.booth.slotEmpty, { n: i + 1 })}
							onClick={() => onSelect(isSelected ? null : i)}
							style={{ aspectRatio: ratio }}
							className={cn(
								"group relative block w-full overflow-hidden rounded-xl border-2 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
								shot ? "cursor-pointer border-transparent" : "border-dashed border-border bg-secondary",
								isSelected && "border-primary",
								isActive && "border-ink",
								disabled && shot && "cursor-default",
							)}
						>
							{shot ? (
								<span className="flex size-full gap-0.5 bg-ink/10">
									{/* eslint-disable-next-line @next/next/no-img-element -- local object/data URLs */}
									<img src={shot.left} alt="" className="h-full w-1/2 object-cover" />
									{/* eslint-disable-next-line @next/next/no-img-element -- local object/data URLs */}
									<img src={shot.right} alt="" className="h-full w-1/2 object-cover" />
								</span>
							) : (
								<span className="flex size-full items-center justify-center font-display text-lg font-bold text-muted-foreground">
									{i + 1}
								</span>
							)}

							{shot && (
								<span className="absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-xs font-semibold text-white">
									{i + 1}
								</span>
							)}
							{shot?.lowQuality && !isSelected && (
								<span
									className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-warning-soft text-warning-text"
									title={t.booth.lowQualityHint}
								>
									<AlertTriangle className="size-3.5" aria-hidden="true" />
									<span className="sr-only">{t.booth.lowQuality}</span>
								</span>
							)}
							{isSelected && (
								<span className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 rounded-full bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
									<RotateCcw className="size-3" aria-hidden="true" />
									{t.booth.retake}
								</span>
							)}
						</button>
					</li>
				);
			})}
		</ol>
	);
}
