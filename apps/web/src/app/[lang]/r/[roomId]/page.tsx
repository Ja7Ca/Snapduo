import { Suspense } from "react";
import { PageFallback } from "@/components/site/page-fallback";
import { RoomScreen } from "@/features/room/room-screen";

// The room id is only known at request time, so useParams needs a Suspense
// boundary under Cache Components.
export default function RoomPage() {
	return (
		<Suspense fallback={<PageFallback />}>
			<RoomScreen />
		</Suspense>
	);
}
