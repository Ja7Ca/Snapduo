import type { Metadata } from "next";
import { NO_INDEX } from "@/i18n/seo";
import { getDictionary, resolveLocale } from "@/i18n/server";
import { Suspense } from "react";
import { PageFallback } from "@/components/site/page-fallback";
import { SharedPhoto } from "./shared-photo";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
	const t = getDictionary(await resolveLocale(params));
	return { title: t.meta.sharedTitle, robots: NO_INDEX };
}

export default function SharedPhotoPage() {
	return (
		<Suspense fallback={<PageFallback />}>
			<SharedPhoto />
		</Suspense>
	);
}
