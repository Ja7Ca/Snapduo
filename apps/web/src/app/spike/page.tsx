import type { Metadata } from "next";
import { Spike } from "./spike";

// Phase 0 test page. Remove (or hide behind a flag) after Phase 1.
export const metadata: Metadata = {
	title: "Snapduo · spike",
	robots: { index: false, follow: false },
};

export default function SpikePage() {
	return <Spike />;
}
