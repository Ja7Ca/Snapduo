"use client";

import { PhotoStrip } from "@/components/photo/photo-strip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FRAMES } from "@/features/frames/frames";
import { frameName } from "@/features/frames/frame-name";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

interface FramePickerProps {
	value: string;
	onChange: (frameId: string) => void;
	disabled?: boolean;
	className?: string;
}

/** Horizontal row of frame thumbnails. The frame decides how many photos. */
export function FramePicker({ value, onChange, disabled, className }: FramePickerProps) {
	const { t, fmt } = useI18n();
	return (
		<ToggleGroup
			type="single"
			value={value}
			onValueChange={(v) => v && onChange(v)}
			disabled={disabled}
			aria-label={t.booth.frame}
			className={cn("flex w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none]", className)}
		>
			{FRAMES.map((frame) => (
				<ToggleGroupItem
					key={frame.id}
					value={frame.id}
					aria-label={fmt(t.booth.frameOption, { name: frameName(t, frame), count: frame.shots })}
					className="group h-auto min-w-0 shrink-0 flex-col gap-1.5 rounded-2xl border-2 border-transparent bg-transparent px-2 py-2 hover:bg-secondary data-[state=on]:border-ink data-[state=on]:bg-transparent data-[state=on]:text-foreground"
				>
					<span className="flex size-16 items-center justify-center">
						<span
							className="block overflow-hidden rounded-[3px] shadow-[0_0_0_1px_var(--border)]"
							style={
								frame.canvas.w > frame.canvas.h
									? { width: 64, height: (64 * frame.canvas.h) / frame.canvas.w }
									: { height: 64, width: (64 * frame.canvas.w) / frame.canvas.h }
							}
						>
							<PhotoStrip frame={frame} className="size-full" title="" />
						</span>
					</span>
					<span className="text-xs font-medium">{frameName(t, frame)}</span>
					<span className="text-[11px] text-muted-foreground">{fmt(t.booth.photosCount, { count: frame.shots })}</span>
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
