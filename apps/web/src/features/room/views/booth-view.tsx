"use client";

import { Mic, MicOff, SwitchCamera, UserPlus } from "lucide-react";
import type { Dispatch } from "react";
import { AwayRing, CountdownOverlay } from "@/components/booth/capture-overlay";
import { FramePicker } from "@/components/booth/frame-picker";
import { InviteCard } from "@/components/booth/invite-card";
import { PhotoSlots } from "@/components/booth/photo-slots";
import { ShutterButton } from "@/components/booth/shutter-button";
import { StatusBanner } from "@/components/booth/status-banner";
import { TilePlaceholder, VideoTile } from "@/components/booth/video-tile";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getFrame } from "@/features/frames/frames";
import {
	FRIEND_GRACE_MS,
	allFilled,
	canCapture,
	canFinish,
	currentCaptureSlot,
	filledCount,
	shutterAction,
	type RoomAction,
	type RoomState,
	type TimerSeconds,
} from "@/features/room/room-state";
import { frameName } from "@/features/frames/frame-name";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { RoomHeader } from "./room-header";

export interface BoothViewProps {
	state: RoomState;
	dispatch: Dispatch<RoomAction>;
	selfStream: MediaStream | null;
	selfPlaceholder?: string;
	friendPlaceholder?: string;
	/** Friend's live video (audio plays elsewhere, so the tile stays muted). */
	friendStream?: MediaStream | null;
	micOn: boolean;
	micBlocked: boolean;
	canSwitchCamera: boolean;
	onToggleMic: () => void;
	onSwitchCamera: () => void;
	onLeave: () => void;
	roomUrl: string;
	/** Current time, for the friend-away countdown. */
	now: number;
	selfSpeaking?: boolean;
}

const TIMERS: TimerSeconds[] = [3, 5, 10];

export function BoothView(props: BoothViewProps) {
	const { state, dispatch, now } = props;
	const { t, fmt } = useI18n();
	const frame = getFrame(state.frameId);
	const capturing = state.phase === "capturing";
	const waiting = state.phase === "waiting";
	const friend = state.friend;
	const away = friend && !friend.present;
	const secondsLeft = away && friend.awaySince ? Math.ceil((FRIEND_GRACE_MS - (now - friend.awaySince)) / 1000) : 0;
	const activeSlot = currentCaptureSlot(state);
	const pending = state.pendingFrameId ? getFrame(state.pendingFrameId) : null;
	const done = canFinish(state);

	const captureCaption = state.capture
		? activeSlot !== null && state.shots[activeSlot]
			? fmt(t.booth.captureRetake, { n: activeSlot + 1 })
			: fmt(t.booth.captureOf, { n: state.capture.index + 1, total: state.capture.queue.length })
		: "";

	const action = shutterAction(state);
	const shutterText =
		action.kind === "retake"
			? fmt(t.booth.shutterRetake, { n: action.slot + 1 })
			: action.kind === "done"
				? t.booth.shutterDone
				: action.kind === "rest"
					? t.booth.shutterRest
					: t.booth.shutterStart;

	const doneButton = (
		<Button
			onClick={() => dispatch({ type: "FINISH", by: "self" })}
			disabled={!done}
			size="sm"
			className="lg:h-13 lg:w-full lg:text-base"
		>
			{t.booth.done}
		</Button>
	);

	return (
		<div className="flex min-h-dvh flex-col">
			<RoomHeader
				roomId={state.roomId}
				onLeave={props.onLeave}
				trailing={done ? <span className="lg:hidden">{doneButton}</span> : null}
			/>

			<main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-[minmax(0,1fr)] gap-6 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-6">
				<section className="flex min-w-0 flex-col gap-4" aria-labelledby="booth-title">
					<h1 id="booth-title" className="sr-only">
						{waiting ? t.booth.titleWaiting : t.booth.title}
					</h1>
					{state.reconnecting && <StatusBanner kind="reconnecting">{t.booth.reconnecting}</StatusBanner>}
					{state.audioBlocked && (
						<StatusBanner
							kind="audio"
							action={
								<Button size="sm" onClick={() => dispatch({ type: "AUDIO_BLOCKED", value: false })}>
									{t.booth.tapToHear}
								</Button>
							}
						>
							{t.booth.audioBlocked}
						</StatusBanner>
					)}

					<div className="flex flex-col gap-3">
						<FramePicker
							value={state.frameId}
							onChange={(frameId) => dispatch({ type: "SELECT_FRAME", frameId, by: "self" })}
							disabled={capturing}
						/>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<ToggleGroup
								type="single"
								value={String(state.timer)}
								onValueChange={(v) => v && dispatch({ type: "SET_TIMER", timer: Number(v) as TimerSeconds })}
								disabled={capturing}
								aria-label={t.booth.countdown}
							>
								{TIMERS.map((sec) => (
									<ToggleGroupItem key={sec} value={String(sec)} size="sm" aria-label={fmt(t.booth.secondsOption, { n: sec })}>
										{sec}s
									</ToggleGroupItem>
								))}
							</ToggleGroup>
							{state.frameChangedBy === "friend" && friend && (
								<p className="text-sm text-muted-foreground">
									{fmt(t.booth.friendPicked, { name: friend.name, frame: frameName(t, frame) })}
								</p>
							)}
						</div>
					</div>

					<div className="relative mx-auto grid w-full max-w-[min(100%,calc((100dvh-440px)*1.5))] min-[1024px]:max-w-[min(100%,calc((100dvh-400px)*1.5))] grid-cols-2 gap-2 sm:gap-3">
						<VideoTile
							name={state.selfName ? fmt(t.common.youSuffix, { name: state.selfName }) : t.common.you}
							stream={props.selfStream}
							placeholder={<TilePlaceholder src={props.selfPlaceholder} label={t.media.cameraOff} />}
							mirrored
							muted
							micOff={!props.micOn}
							speaking={props.selfSpeaking}
							className="aspect-[3/4]"
						/>

						{waiting || !friend ? (
							<div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-border p-4 text-center">
								<UserPlus className="size-7 text-muted-foreground" aria-hidden="true" />
								<p className="font-medium">{t.booth.waitingFriend}</p>
								<p className="hidden text-sm text-muted-foreground sm:block">{t.booth.boothOpens}</p>
							</div>
						) : (
							<VideoTile
								name={friend.name}
								stream={friend.present ? props.friendStream : null}
								muted
								placeholder={
									<TilePlaceholder
										src={props.friendPlaceholder}
										label={friend.present ? t.booth.connectingVideo : undefined}
									/>
								}
								micOff={!friend.micOn}
								weakConnection={friend.weakConnection && friend.present}
								dimmed={!friend.present}
								className="aspect-[3/4]"
							>
								{away && (
									<div className="flex flex-col items-center gap-2.5 px-3 pt-3 pb-12 text-center text-white">
										<AwayRing secondsLeft={Math.max(0, secondsLeft)} total={FRIEND_GRACE_MS / 1000} />
										<p className="text-sm font-medium">{fmt(t.booth.awayTitle, { name: friend.name })}</p>
										{state.isCreator && (
											<Button
												variant="link"
												size="inline"
												className="text-white"
												onClick={() => dispatch({ type: "FRIEND_GONE" })}
											>
												{t.booth.letSomeoneElse}
											</Button>
										)}
									</div>
								)}
							</VideoTile>
						)}

						{capturing && state.capture && (
							<CountdownOverlay value={state.capture.countdown} caption={captureCaption} />
						)}
					</div>

					{!friend?.present && !waiting && friend && (
						<p className="text-center text-sm text-muted-foreground">{t.booth.bothNeeded}</p>
					)}

					<div className="lg:hidden">
						<PhotoSlots
							frame={frame}
							shots={state.shots}
							selected={state.selectedSlot}
							active={activeSlot}
							onSelect={(slot) => dispatch({ type: "SELECT_SLOT", slot })}
							disabled={capturing}
							orientation="horizontal"
						/>
					</div>

					<div className="mt-auto flex items-center justify-center gap-6 pt-2">
						<Button
							variant={props.micOn ? "neutral" : "inverted"}
							size="icon"
							onClick={props.onToggleMic}
							disabled={props.micBlocked}
							aria-label={props.micOn ? t.media.mute : t.media.unmute}
							aria-pressed={!props.micOn}
						>
							{props.micOn ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
						</Button>
						<div className="flex flex-col items-center gap-1.5">
							<ShutterButton
								label={shutterText}
								disabled={!canCapture(state)}
								onClick={() => dispatch({ type: "START_CAPTURE", by: "self" })}
							/>
							<span className="text-xs font-medium text-muted-foreground" aria-hidden="true">
								{capturing ? t.booth.smile : shutterText}
							</span>
						</div>
						<Button
							variant="neutral"
							size="icon"
							onClick={props.onSwitchCamera}
							disabled={!props.canSwitchCamera || capturing}
							aria-label={t.media.switchCamera}
						>
							<SwitchCamera aria-hidden="true" />
						</Button>
					</div>

					{waiting && <InviteCard url={props.roomUrl} className="lg:hidden" />}
				</section>

				<aside className="hidden flex-col gap-4 lg:flex" aria-label={t.booth.yourPhotos}>
					{waiting && <InviteCard url={props.roomUrl} />}
					<div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
						<div className="flex items-baseline justify-between">
							<h2 className="text-lg font-bold">{t.booth.yourPhotos}</h2>
							<span className="text-sm text-muted-foreground">
								{fmt(t.booth.countOf, { n: filledCount(state), total: frame.shots })}
							</span>
						</div>
						<PhotoSlots
							frame={frame}
							shots={state.shots}
							selected={state.selectedSlot}
							active={activeSlot}
							onSelect={(slot) => dispatch({ type: "SELECT_SLOT", slot })}
							disabled={capturing}
							className={cn(frame.shots > 2 && "grid grid-cols-2")}
						/>
						<p className="text-xs text-muted-foreground">
							{allFilled(state) ? t.booth.tapToRetake : fmt(t.booth.takeAll, { count: frame.shots })}
						</p>
						{doneButton}
					</div>
				</aside>
			</main>

			<Dialog open={!!pending} onOpenChange={(open) => !open && dispatch({ type: "CANCEL_FRAME_CHANGE" })}>
				<DialogContent showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>{t.booth.changeFrameTitle}</DialogTitle>
						<DialogDescription>
							{pending && fmt(t.booth.changeFrameBody, { name: frameName(t, pending), count: pending.shots })}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2">
						<DialogClose asChild>
							<Button variant="secondary">{t.booth.keepCurrent}</Button>
						</DialogClose>
						<Button onClick={() => dispatch({ type: "CONFIRM_FRAME_CHANGE" })}>{t.booth.changeFrame}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
