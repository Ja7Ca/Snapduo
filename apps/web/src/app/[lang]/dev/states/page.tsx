import type { Metadata } from "next";
import { NO_INDEX } from "@/i18n/seo";
import { notFound } from "next/navigation";
import { DevStates } from "./dev-states";

export const metadata: Metadata = { title: "Room states", robots: NO_INDEX };

/** Visual QA page. 404 in production unless SNAPDUO_DEV_STATES=1 at build time. */
export default function DevStatesPage() {
	if (process.env.NODE_ENV === "production" && process.env.SNAPDUO_DEV_STATES !== "1") notFound();
	return <DevStates />;
}
