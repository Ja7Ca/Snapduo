"use client";

import { Camera, CameraOff, Mic, MicOff, SwitchCamera } from "lucide-react";
import { useId } from "react";
import { TilePlaceholder, VideoTile } from "@/components/booth/video-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAudioLevel, type LocalMedia } from "@/features/media/use-local-media";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

interface PrejoinViewProps {
	media: Pick<LocalMedia, "status" | "stream" | "micBlocked" | "micOn" | "canSwitchCamera" | "request" | "toggleMic" | "switchCamera">;
	name: string;
	onNameChange: (name: string) => void;
	onEnter: () => void;
	/** Set when the friend is already in the room. */
	friendName?: string | null;
	/** Image shown if the camera is "ready" but has no stream (design previews). */
	fallbackSrc?: string;
}

function MicMeter({ stream, on }: { stream: MediaStream | null; on: boolean }) {
	const level = useAudioLevel(stream, on);
	return (
		<span className="flex h-4 items-end gap-0.5" aria-hidden="true">
			{[0.15, 0.35, 0.6, 0.85].map((t) => (
				<span
					key={t}
					className={cn("w-1 rounded-full transition-colors", level > t ? "bg-success" : "bg-border")}
					style={{ height: `${40 + t * 60}%` }}
				/>
			))}
		</span>
	);
}

function Notice({ title, children, tone = "info" }: { title: string; children: React.ReactNode; tone?: "info" | "error" }) {
	return (
		<div
			role={tone === "error" ? "alert" : "status"}
			className={cn(
				"rounded-2xl border p-4 text-sm",
				tone === "error" ? "border-destructive/40 bg-destructive/5" : "border-border bg-secondary",
			)}
		>
			<p className="font-semibold">{title}</p>
			<div className="mt-1 text-muted-foreground">{children}</div>
		</div>
	);
}

export function PrejoinView({ media, name, onNameChange, onEnter, friendName, fallbackSrc }: PrejoinViewProps) {
	const nameId = useId();
	const { t, fmt } = useI18n();
	const { status } = media;
	const ready = status === "ready";

	const placeholder = (() => {
		switch (status) {
			case "idle":
				return <TilePlaceholder label={t.prejoin.previewHere} />;
			case "requesting":
				return <TilePlaceholder label={t.prejoin.waitingPermission} />;
			case "blocked":
			case "busy":
			case "missing":
			case "error":
				return (
					<div className="flex size-full items-center justify-center text-white/60">
						<CameraOff className="size-10" aria-hidden="true" />
					</div>
				);
			default:
				return <TilePlaceholder src={fallbackSrc} />;
		}
	})();

	return (
		<div className="mx-auto flex w-full max-w-md flex-col gap-5">
			<div>
				<h1 className="text-[28px] leading-tight font-bold">{t.prejoin.title}</h1>
				<p className="mt-1 text-muted-foreground">
					{friendName ? fmt(t.prejoin.friendWaiting, { name: friendName }) : t.prejoin.subtitle}
				</p>
			</div>

			<VideoTile
				name={name.trim() || t.common.you}
				stream={ready ? media.stream : null}
				placeholder={placeholder}
				mirrored
				muted
				micOff={ready && !media.micOn}
				className="aspect-[3/4] w-full sm:aspect-[4/3]"
			/>

			{ready && (
				<div className="flex items-center justify-center gap-3">
					<Button
						variant={media.micOn ? "neutral" : "inverted"}
						size="icon"
						onClick={media.toggleMic}
						disabled={media.micBlocked}
						aria-label={media.micOn ? t.media.mute : t.media.unmute}
						aria-pressed={!media.micOn}
					>
						{media.micOn ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
					</Button>
					<span className="flex w-10 justify-center">
						<MicMeter stream={media.stream} on={media.micOn} />
					</span>
					{media.canSwitchCamera && (
						<Button variant="neutral" size="icon" onClick={media.switchCamera} aria-label={t.media.switchCamera}>
							<SwitchCamera aria-hidden="true" />
						</Button>
					)}
				</div>
			)}

			{status === "idle" && (
				<Notice title={t.prejoin.askTitle}>{t.prejoin.askBody}</Notice>
			)}
			{status === "blocked" && (
				<Notice tone="error" title={t.prejoin.blockedTitle}>
					<ol className="mt-1 list-decimal space-y-0.5 pl-5">
						{t.prejoin.blockedSteps.map((step) => (
							<li key={step}>{step}</li>
						))}
					</ol>
				</Notice>
			)}
			{status === "busy" && (
				<Notice tone="error" title={t.prejoin.busyTitle}>
					{t.prejoin.busyBody}
				</Notice>
			)}
			{status === "missing" && (
				<Notice tone="error" title={t.prejoin.missingTitle}>{t.prejoin.missingBody}</Notice>
			)}
			{status === "error" && (
				<Notice tone="error" title={t.prejoin.errorTitle}>
					{t.prejoin.errorBody}
				</Notice>
			)}
			{ready && media.micBlocked && (
				<Notice title={t.prejoin.micOffTitle}>{t.prejoin.micOffBody}</Notice>
			)}

			{ready ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						onEnter();
					}}
				>
					<div className="flex flex-col gap-1.5">
						<label htmlFor={nameId} className="text-sm font-medium">
							{t.prejoin.nameLabel} <span className="font-normal text-muted-foreground">{t.prejoin.optional}</span>
						</label>
						<Input
							id={nameId}
							value={name}
							onChange={(e) => onNameChange(e.target.value.slice(0, 24))}
							placeholder={t.prejoin.namePlaceholder}
							autoComplete="nickname"
							maxLength={24}
						/>
					</div>
					<Button type="submit" className="w-full">
						{media.micBlocked ? t.prejoin.enterNoMic : t.prejoin.enter}
					</Button>
				</form>
			) : (
				<Button className="w-full" onClick={media.request} disabled={status === "requesting"}>
					<Camera aria-hidden="true" />
					{status === "idle" || status === "requesting" ? t.prejoin.allow : t.prejoin.tryAgain}
				</Button>
			)}

			<p className="text-center text-xs text-muted-foreground">
				{t.prejoin.privacy}
			</p>
		</div>
	);
}
