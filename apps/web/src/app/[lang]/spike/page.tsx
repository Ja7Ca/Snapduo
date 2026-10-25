import type { Metadata } from "next";
import { NO_INDEX } from "@/i18n/seo";
import { Spike } from "./spike";

// Phase 0 test page. Remove (or hide behind a flag) after Phase 1.
export const metadata: Metadata = {
	title: "Snapduo · spike",
	robots: NO_INDEX,
};

export default function SpikePage() {
	return <Spike />;
}
