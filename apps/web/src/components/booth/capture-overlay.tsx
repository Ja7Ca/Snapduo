"use client";

import { cn } from "@/lib/utils";

/** Big countdown number shown over both tiles. */
export function CountdownOverlay({ value, caption }: { value: number; caption: string }) {
	return (
		<div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3" aria-live="assertive">
			<p className="rounded-full bg-black/60 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm">{caption}</p>
			{value > 0 && (
				<span
					key={value}
					className="font-display text-[clamp(7rem,22vw,11rem)] leading-none font-extrabold text-white animate-in zoom-in-50 fade-in duration-300 [-webkit-text-stroke:3px_#1f1a17] [paint-order:stroke_fill]"
				>
					{value}
				</span>
			)}
		</div>
	);
}

/** Camera flash at the moment a photo is taken. */
export function FlashOverlay({ active }: { active: boolean }) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"pointer-events-none fixed inset-0 z-50 bg-[radial-gradient(circle,#fff_40%,var(--flash))] transition-opacity",
				active ? "opacity-90 duration-0" : "opacity-0 duration-500",
			)}
		/>
	);
}

/** Circular countdown for "Waiting for Alex to come back". */
export function AwayRing({ secondsLeft, total }: { secondsLeft: number; total: number }) {
	const r = 34;
	const c = 2 * Math.PI * r;
	const progress = Math.max(0, secondsLeft) / total;
	const mm = Math.floor(secondsLeft / 60);
	const ss = String(Math.max(0, secondsLeft) % 60).padStart(2, "0");
	return (
		<div className="relative size-20">
			<svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden="true">
				<circle cx="40" cy="40" r={r} fill="none" stroke="rgb(255 255 255 / 0.2)" strokeWidth="5" />
				<circle
					cx="40"
					cy="40"
					r={r}
					fill="none"
					stroke="var(--primary)"
					strokeWidth="5"
					strokeLinecap="round"
					strokeDasharray={c}
					strokeDashoffset={c * (1 - progress)}
					className="transition-[stroke-dashoffset] duration-1000 ease-linear"
				/>
			</svg>
			<span className="absolute inset-0 flex items-center justify-center font-mono text-sm text-white">
				{mm}:{ss}
			</span>
		</div>
	);
}
