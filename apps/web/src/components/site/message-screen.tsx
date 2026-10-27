"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PhotoStrip } from "@/components/photo/photo-strip";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { Button } from "@/components/ui/button";
import { getFrame } from "@/features/frames/frames";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Two filled seats: the booth is taken. */
function FullBooth() {
	return (
		<div className="flex gap-2 rounded-2xl bg-background p-3 outline-playful" aria-hidden="true">
			{[0, 1].map((i) => (
				<div key={i} className="flex h-28 w-20 items-end justify-center overflow-hidden rounded-xl bg-secondary">
					<svg viewBox="0 0 80 100" className="w-16 text-muted-foreground/50">
						<circle cx="40" cy="38" r="18" fill="currentColor" />
						<path d="M8 100c2-26 16-38 32-38s30 12 32 38z" fill="currentColor" />
					</svg>
				</div>
			))}
		</div>
	);
}

/** Empty strip: the room or photo is gone. */
function EmptyStrip() {
	const { t } = useI18n();
	return (
		<div className="w-24 rotate-3 overflow-hidden rounded-md outline-playful">
			<PhotoStrip frame={getFrame("classic-white")} title={t.messages.emptyStrip} />
		</div>
	);
}

const ART = { full: FullBooth, empty: EmptyStrip } as const;

interface MessageScreenProps {
	art: keyof typeof ART;
	title: string;
	children: ReactNode;
	cta: string;
	/** Run this instead of going home. */
	onCta?: () => void;
	className?: string;
}

/** Playful full-screen message: room full, room not found, photo deleted. */
export function MessageScreen({ art, title, children, cta, onCta, className }: MessageScreenProps) {
	const Art = ART[art];
	const { path } = useI18n();
	return (
		<div className={cn("flex min-h-dvh flex-col", className)}>
			<SiteHeader />
			<main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-5 py-12 text-center">
				<Art />
				<div>
					<h1 className="text-[34px] leading-[1.08] font-extrabold sm:text-[40px]">{title}</h1>
					<div className="mt-3 text-muted-foreground">{children}</div>
				</div>
				{onCta ? (
					<Button variant="playful" onClick={onCta}>
						{cta}
					</Button>
				) : (
					<Button variant="playful" asChild>
						<Link href={path("/")}>{cta}</Link>
					</Button>
				)}
			</main>
			<SiteFooter />
		</div>
	);
}

export function RoomFullScreen() {
	const { t } = useI18n();
	return (
		<MessageScreen art="full" title={t.messages.roomFullTitle} cta={t.messages.roomFullCta}>
			{t.messages.roomFullBody}
		</MessageScreen>
	);
}

export function RoomNotFoundScreen() {
	const { t } = useI18n();
	return (
		<MessageScreen art="empty" title={t.messages.notFoundTitle} cta={t.messages.notFoundCta}>
			{t.messages.notFoundBody}
		</MessageScreen>
	);
}

export function PhotoGoneScreen() {
	const { t } = useI18n();
	return (
		<MessageScreen art="empty" title={t.messages.goneTitle} cta={t.messages.goneCta}>
			{t.messages.goneBody}
		</MessageScreen>
	);
}

export function OtherTabScreen({ onUseHere }: { onUseHere: () => void }) {
	const { t } = useI18n();
	return (
		<MessageScreen art="full" title={t.messages.otherTabTitle} cta={t.messages.otherTabCta} onCta={onUseHere}>
			{t.messages.otherTabBody}
		</MessageScreen>
	);
}

export function UpdateScreen() {
	const { t } = useI18n();
	return (
		<MessageScreen art="empty" title={t.messages.updateTitle} cta={t.messages.updateCta} onCta={() => window.location.reload()}>
			{t.messages.updateBody}
		</MessageScreen>
	);
}

export function PageNotFoundScreen() {
	const { t } = useI18n();
	return (
		<MessageScreen art="empty" title={t.messages.pageNotFoundTitle} cta={t.messages.pageNotFoundCta}>
			{t.messages.pageNotFoundBody}
		</MessageScreen>
	);
}

export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
	const { t } = useI18n();
	return (
		<MessageScreen art="empty" title={t.messages.errorTitle} cta={t.messages.errorCta} onCta={onRetry}>
			{t.messages.errorBody}
		</MessageScreen>
	);
}
