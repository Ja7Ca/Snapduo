"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PhotoStrip } from "@/components/photo/photo-strip";
import { PhotoGoneScreen } from "@/components/site/message-screen";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { Button } from "@/components/ui/button";
import { getFrame } from "@/features/frames/frames";
import { frameName } from "@/features/frames/frame-name";
import { mockShots } from "@/features/mock/mock-photos";
import { useI18n } from "@/i18n/client";

/**
 * Phase 1 mock of a shared strip. Phase 4 loads it from R2 via the Worker.
 * Open /p/expired to see the "deleted" state.
 */
export function SharedPhoto() {
	const { id } = useParams<{ id: string }>();
	const [date] = useState(() => new Date());
	const { t, fmt, path, locale } = useI18n();
	if (id === "expired") return <PhotoGoneScreen />;

	const frame = getFrame("classic-white");
	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader />
			<main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-8 px-5 py-8 text-center">
				<div>
					<h1 className="text-[34px] leading-[1.08] font-extrabold sm:text-[40px]">{t.shared.title}</h1>
					<p className="mt-2 text-muted-foreground">
						{t.shared.expiresIn} <span className="font-mono">23h 59m</span>.
					</p>
				</div>
				<div className="w-48 -rotate-2 overflow-hidden rounded-md outline-playful sm:w-56">
					<PhotoStrip frame={frame} shots={mockShots(4)} date={date} dateLocale={locale} title={fmt(t.common.photoStrip, { frame: frameName(t, frame) })} />
				</div>
				<div className="flex flex-col items-center gap-3 sm:flex-row">
					<Button variant="playful" onClick={() => toast(fmt(t.common.later, { what: t.result.downloadWhat }), { description: t.common.laterBody })}>
						<Download aria-hidden="true" />
						{t.common.download}
					</Button>
					<Button variant="secondary-playful" asChild>
						<Link href={path("/")}>{t.shared.makeYourOwn}</Link>
					</Button>
				</div>
			</main>
			<SiteFooter />
		</div>
	);
}
