import type { Metadata } from "next";
import { NO_INDEX } from "@/i18n/seo";
import { getDictionary, resolveLocale } from "@/i18n/server";
import { Suspense } from "react";
import { PageFallback } from "@/components/site/page-fallback";
import { RoomScreen } from "@/features/room/room-screen";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
	const t = getDictionary(await resolveLocale(params));
	return { title: t.meta.roomTitle, robots: NO_INDEX };
}

// The room id is only known at request time, so useParams needs a Suspense
// boundary under Cache Components.
export default function RoomPage() {
	return (
		<Suspense fallback={<PageFallback />}>
			<RoomScreen />
		</Suspense>
	);
}
