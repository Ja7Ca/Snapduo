"use client";

import { Check, Copy, Download, Link2, Printer } from "lucide-react";
import { useState, type Dispatch } from "react";
import { toast } from "sonner";
import { TilePlaceholder, VideoTile } from "@/components/booth/video-tile";
import { FilterRow } from "@/components/photo/filter-row";
import { PhotoStrip } from "@/components/photo/photo-strip";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import type { FilterId } from "@/features/frames/filters";
import { getFrame, printLabel } from "@/features/frames/frames";
import { printStrip, renderStrip, saveStrip, stripFileName, stripToBlob } from "@/features/frames/export-strip";
import type { RoomAction, RoomState } from "@/features/room/room-state";
import { frameName } from "@/features/frames/frame-name";
import { useI18n } from "@/i18n/client";
import { SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

interface ResultViewProps {
	state: RoomState;
	dispatch: Dispatch<RoomAction>;
	onLeave: () => void;
	friendPlaceholder?: string;
	friendStream?: MediaStream | null;
	/** /dev/states mock: buttons only show a "comes later" note. */
	preview?: boolean;
	/** For screenshots of the "after sharing" state. */
	initialShared?: boolean;
}

export function ResultView({
	state,
	dispatch,
	onLeave,
	friendPlaceholder,
	friendStream,
	preview,
	initialShared = false,
}: ResultViewProps) {
	const frame = getFrame(state.frameId);
	const { t, fmt, locale } = useI18n();
	const [filter, setFilter] = useState<FilterId>("normal");
	const [shared, setShared] = useState(initialShared);
	const [copied, setCopied] = useState(false);
	const [date] = useState(() => new Date());
	const shareUrl = `${SITE_URL.replace(/^https?:\/\//, "")}/p/${state.roomId}`;
	const firstShot = state.shots.find(Boolean);
	const landscape = frame.canvas.w > frame.canvas.h;

	const notWired = (what: string) => toast(fmt(t.common.later, { what }), { description: t.common.laterBody });
	const [busy, setBusy] = useState<"download" | "print" | null>(null);
	// Download/print wait for the friend's sharp photos (or the time-out).
	const waiting = !preview && state.shots.some((s) => s?.pending);

	const exportStrip = async (kind: "download" | "print") => {
		if (preview) return notWired(kind === "download" ? t.result.downloadWhat : t.result.printWhat);
		setBusy(kind);
		try {
			const blob = await stripToBlob(await renderStrip({ frame, shots: state.shots, filter, date, dateLocale: locale }));
			if (kind === "download") await saveStrip(blob, stripFileName(date));
			else await printStrip(blob, frame);
		} catch (err) {
			console.error(err);
			toast.error(t.result.exportFailed);
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader
				action={
					<div className="flex items-center gap-2">
						{state.friend?.present && (
							<span
								className="relative size-10 overflow-hidden rounded-full bg-video ring-2 ring-border sm:hidden"
								title={fmt(t.result.stillHere, { name: state.friend.name })}
							>
								<TilePlaceholder src={friendPlaceholder} />
								<span className="sr-only">{fmt(t.result.stillHere, { name: state.friend.name })}</span>
							</span>
						)}
						<Button variant="ghost" size="sm" onClick={onLeave}>
							{t.common.leave}
						</Button>
					</div>
				}
			/>

			<main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-[minmax(0,1fr)] items-start gap-10 px-5 pb-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:px-8">
				<div className="flex justify-center lg:sticky lg:top-8">
					<div
						className={cn(
							"-rotate-2 overflow-hidden rounded-md outline-playful",
							landscape ? "w-full max-w-lg" : frame.layout === "classic-strip" ? "w-44 sm:w-52" : "w-full max-w-xs",
						)}
					>
						<PhotoStrip
							frame={frame}
							shots={state.shots}
							filter={filter}
							date={date}
							dateLocale={locale}
							title={fmt(t.common.photoStrip, { frame: frameName(t, frame) })}
						/>
					</div>
				</div>

				<div className="flex flex-col gap-8">
					<div>
						{state.finishedBy === "friend" && state.friend && (
							<p className="mb-2 text-sm text-muted-foreground">{fmt(t.result.finishedBy, { name: state.friend.name })}</p>
						)}
						<h1 className="text-[40px] leading-[1.05] font-extrabold sm:text-5xl">{t.result.title}</h1>
						<p className="mt-3 text-muted-foreground">
							{fmt(t.result.subtitle, { frame: frameName(t, frame), size: printLabel(frame, t.common.inch) })}
						</p>
					</div>

					<div className="flex flex-col gap-2">
						<h2 className="font-sans text-sm font-medium">{t.result.filter}</h2>
						<FilterRow value={filter} onChange={setFilter} previewSrc={firstShot?.left} />
						<p className="text-xs text-muted-foreground">{t.result.filterNote}</p>
					</div>

					{waiting && state.friend && (
						<p role="status" className="-mb-4 animate-pulse text-sm text-muted-foreground">
							{fmt(t.result.waitingSharp, { name: state.friend.name })}
						</p>
					)}
					<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
						<Button
							variant="playful"
							onClick={() => void exportStrip("download")}
							disabled={waiting || busy !== null}
							aria-busy={busy === "download"}
						>
							<Download aria-hidden="true" />
							{busy === "download" ? t.result.preparing : t.common.download}
						</Button>
						<Button
							variant="secondary-playful"
							onClick={() => void exportStrip("print")}
							disabled={waiting || busy !== null}
							aria-busy={busy === "print"}
						>
							<Printer aria-hidden="true" />
							{busy === "print" ? t.result.preparing : t.result.print}
						</Button>
						{!shared && (
							// Share links (R2, 24 h) come in Phase 4.
							<Button variant="secondary-playful" onClick={() => (preview ? setShared(true) : notWired(t.result.shareWhat))}>
								<Link2 aria-hidden="true" />
								{t.result.share}
							</Button>
						)}
					</div>

					{shared && (
						<section className="rounded-2xl p-5 outline-playful" aria-labelledby="share-title">
							<h2 id="share-title" className="text-lg font-bold">
								{t.result.shareTitle}
							</h2>
							<p className="mt-1 text-sm text-muted-foreground">{t.result.shareBody}</p>
							<div className="mt-4 flex items-center gap-2 rounded-[14px] border border-border bg-secondary py-1.5 pr-1.5 pl-4">
								<span className="min-w-0 flex-1 truncate font-mono text-sm">{shareUrl}</span>
								<Button
									variant="secondary"
									size="sm"
									onClick={() => {
										setCopied(true);
										toast.success(t.common.linkCopied);
										setTimeout(() => setCopied(false), 2000);
									}}
								>
									{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
									{copied ? t.common.copied : t.common.copy}
								</Button>
							</div>
							<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
								<span className="text-muted-foreground">
									{t.result.deletedIn} <span className="font-mono">23h 59m</span>
								</span>
								<Dialog>
									<DialogTrigger asChild>
										<Button variant="destructive-link" size="inline">
											{t.result.deleteNow}
										</Button>
									</DialogTrigger>
									<DialogContent showCloseButton={false}>
										<DialogHeader>
											<DialogTitle>{t.result.deleteTitle}</DialogTitle>
											<DialogDescription>
												{t.result.deleteBody}
											</DialogDescription>
										</DialogHeader>
										<DialogFooter className="gap-2">
											<DialogClose asChild>
												<Button variant="secondary">{t.result.keepIt}</Button>
											</DialogClose>
											<DialogClose asChild>
												<Button
													variant="destructive"
													onClick={() => {
														setShared(false);
														toast(t.result.deleted);
													}}
												>
													{t.result.deleteNow}
												</Button>
											</DialogClose>
										</DialogFooter>
									</DialogContent>
								</Dialog>
							</div>
						</section>
					)}

					<div className="flex flex-wrap gap-x-6 gap-y-2">
						<Button variant="link" size="inline" onClick={() => dispatch({ type: "BACK_TO_BOOTH" })}>
							{t.result.backToBooth}
						</Button>
						<Button variant="link" size="inline" onClick={() => dispatch({ type: "START_OVER" })}>
							{t.result.startOver}
						</Button>
					</div>
				</div>
			</main>

			<SiteFooter />

			{state.friend?.present && (
				<VideoTile
					name={state.friend.name}
					stream={friendStream}
					muted
					placeholder={<TilePlaceholder src={friendPlaceholder} />}
					micOff={!state.friend.micOn}
					className="fixed right-4 bottom-4 z-20 hidden aspect-[3/4] w-32 shadow-sheet sm:block [&_figcaption]:bottom-1.5 [&_figcaption]:left-1.5 [&_figcaption]:px-2 [&_figcaption]:text-xs"
				/>
			)}
		</div>
	);
}
