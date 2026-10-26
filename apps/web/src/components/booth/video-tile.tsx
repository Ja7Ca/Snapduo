"use client";

import { MicOff, WifiLow } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

interface VideoTileProps {
	name: string;
	/** Live stream; without it the placeholder is shown. */
	stream?: MediaStream | null;
	/** Shown when there's no stream (mock silhouette, empty seat…). */
	placeholder?: ReactNode;
	/** Mirror like a selfie camera (own preview only). */
	mirrored?: boolean;
	/** Own preview must be muted to avoid echo. */
	muted?: boolean;
	micOff?: boolean;
	weakConnection?: boolean;
	speaking?: boolean;
	dimmed?: boolean;
	className?: string;
	/** Overlay content (countdown, away notice). */
	children?: ReactNode;
}

export function VideoTile({
	name,
	stream,
	placeholder,
	mirrored,
	muted,
	micOff,
	weakConnection,
	speaking,
	dimmed,
	className,
	children,
}: VideoTileProps) {
	const ref = useRef<HTMLVideoElement>(null);
	const { t } = useI18n();

	useEffect(() => {
		if (ref.current && ref.current.srcObject !== (stream ?? null)) {
			ref.current.srcObject = stream ?? null;
		}
	}, [stream]);

	return (
		<figure
			className={cn(
				"relative isolate overflow-hidden rounded-[20px] bg-video ring-2 ring-transparent transition-shadow",
				speaking && "ring-primary",
				className,
			)}
		>
			{stream ? (
				<video
					ref={ref}
					autoPlay
					playsInline
					muted={muted}
					className={cn("size-full object-cover", mirrored && "-scale-x-100")}
				/>
			) : (
				<div className="size-full">{placeholder}</div>
			)}

			{dimmed && <div className="absolute inset-0 bg-video/70" aria-hidden="true" />}

			{(micOff || weakConnection) && (
				<div className="absolute top-3 right-3 flex gap-1.5">
					{weakConnection && (
						<Badge variant="overlay">
							<WifiLow aria-hidden="true" />
							{t.media.weak}
						</Badge>
					)}
					{micOff && (
						<Badge variant="overlay">
							<MicOff aria-hidden="true" />
							{t.media.muted}
						</Badge>
					)}
				</div>
			)}

			<figcaption className="absolute bottom-3 left-3 max-w-[70%] truncate rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm">
				{name}
			</figcaption>

			{children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
		</figure>
	);
}

/** Silhouette placeholder for mocks and when a camera is off. */
export function TilePlaceholder({ src, label }: { src?: string; label?: string }) {
	if (src) {
		// eslint-disable-next-line @next/next/no-img-element -- inline SVG data URL, nothing to optimise
		return <img src={src} alt="" className="size-full object-cover" />;
	}
	return (
		<div className="flex size-full items-center justify-center p-6 text-center text-sm text-white/70">{label}</div>
	);
}
