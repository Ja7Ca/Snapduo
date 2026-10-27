import { Suspense } from "react";
import { PageFallback } from "@/components/site/page-fallback";
import { SharedPhoto } from "./shared-photo";

export default function SharedPhotoPage() {
	return (
		<Suspense fallback={<PageFallback />}>
			<SharedPhoto />
		</Suspense>
	);
}
