"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Two offset photo frames: "duo". Same drawing as app/icon.svg. */
export function LogoMark({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
			<rect x="3" y="7" width="15" height="20" rx="3" fill="var(--primary)" stroke="var(--ink)" strokeWidth="2" />
			<rect x="14" y="4" width="15" height="20" rx="3" fill="var(--background)" stroke="var(--ink)" strokeWidth="2" />
			<circle cx="21.5" cy="12" r="3" fill="var(--ink)" />
		</svg>
	);
}

export function Logo({ className }: { className?: string }) {
	const { path } = useI18n();
	return (
		<Link
			href={path("/")}
			className={cn(
				"inline-flex items-center gap-2 rounded-full font-display text-xl font-extrabold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
				className,
			)}
		>
			<LogoMark />
			Snapduo
		</Link>
	);
}
