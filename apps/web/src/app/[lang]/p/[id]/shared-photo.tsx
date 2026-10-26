"use client";

import { SHARE_ID_PATTERN, remainingParts, type ShareInfo } from "@snapduo/protocol";
import { Download } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageFallback } from "@/components/site/page-fallback";
import { PhotoGoneScreen } from "@/components/site/message-screen";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { Button } from "@/components/ui/button";
import { saveStrip, stripFileName } from "@/features/frames/export-strip";
import { useI18n } from "@/i18n/client";
import { fetchShareInfo, shareImageUrl } from "@/lib/signal-client";

type Load = { kind: "loading" } | { kind: "gone" } | { kind: "error" } | { kind: "ok"; info: ShareInfo };

/**
 * A shared strip (/p/<id>), kept 24 hours by the server. The photo is only
 * loaded here, never in link previews, so it isn't copied to chat apps'
 * servers where it would outlive the 24 hours.
 */
export function SharedPhoto() {
	const { id } = useParams<{ id: string }>();
	const valid = SHARE_ID_PATTERN.test(id);
	const { t, fmt, path } = useI18n();
	const [load, setLoad] = useState<Load>({ kind: "loading" });
	const [attempt, setAttempt] = useState(0);
	const [now, setNow] = useState(() => Date.now());
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!valid) return;
		let cancelled = false;
		fetchShareInfo(id)
			.then((info) => {
				if (cancelled) return;
				setNow(Date.now());
				setLoad(info && info !== "gone" ? { kind: "ok", info } : { kind: "gone" });
			})
			.catch(() => !cancelled && setLoad({ kind: "error" }));
		return () => {
			cancelled = true;
		};
	}, [id, valid, attempt]);

	// Countdown; switch to "deleted" the moment it expires.
	const expiresAt = load.kind === "ok" ? load.info.expiresAt : null;
	useEffect(() => {
		if (expiresAt === null) return;
		const timer = setInterval(() => {
			const t = Date.now();
			setNow(t);
			if (t >= expiresAt) setLoad({ kind: "gone" });
		}, 30_000);
		return () => clearInterval(timer);
	}, [expiresAt]);

	const download = useCallback(async (info: ShareInfo) => {
		setSaving(true);
		try {
			const res = await fetch(shareImageUrl(info.id));
			if (!res.ok) throw new Error(String(res.status));
			await saveStrip(await res.blob(), stripFileName(new Date(info.createdAt)));
		} catch {
			toast.error(t.shared.downloadFailed);
		} finally {
			setSaving(false);
		}
	}, [t]);

	if (!valid || load.kind === "gone") return <PhotoGoneScreen />;
	if (load.kind === "loading") return <PageFallback />;

	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader />
			<main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-6 px-5 py-6 text-center sm:gap-8 sm:py-8">
				{load.kind === "error" ? (
					<div role="alert" className="flex flex-col items-center gap-4 py-16">
						<h1 className="text-2xl font-bold">{t.shared.loadFailed}</h1>
						<Button variant="secondary-playful" onClick={() => {
							setLoad({ kind: "loading" });
							setAttempt((n) => n + 1);
						}}>
							{t.shared.retry}
						</Button>
					</div>
				) : (
					<>
						<div>
							<h1 className="text-[34px] leading-[1.08] font-extrabold sm:text-[40px]">{t.shared.title}</h1>
							<p className="mt-2 text-muted-foreground">
								{t.shared.expiresIn}{" "}
								<span className="font-mono">{fmt(t.result.remaining, remainingParts(load.info.expiresAt, now))}</span>.
							</p>
						</div>
						<div className="-rotate-2 overflow-hidden rounded-md outline-playful">
							{/* eslint-disable-next-line @next/next/no-img-element -- served by the Worker, already sized for print */}
							<img
								src={shareImageUrl(load.info.id)}
								alt={t.shared.title}
								className="block h-auto max-h-[52dvh] w-auto max-w-[min(100%,28rem)] sm:max-h-[70vh]"
							/>
						</div>
						<div className="flex flex-col items-center gap-3 sm:flex-row">
							<Button variant="playful" onClick={() => void download(load.info)} disabled={saving} aria-busy={saving}>
								<Download aria-hidden="true" />
								{saving ? t.result.preparing : t.common.download}
							</Button>
							<Button variant="secondary-playful" asChild>
								<Link href={path("/")}>{t.shared.makeYourOwn}</Link>
							</Button>
						</div>
					</>
				)}
			</main>
			<SiteFooter />
		</div>
	);
}
