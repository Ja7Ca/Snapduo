import type { Metadata } from "next";
import { PageNotFoundScreen } from "@/components/site/message-screen";

// Static (not-found can't read the language): "404 · Snapduo" via the layout's title template.
export const metadata: Metadata = { title: "404", robots: { index: false, follow: false } };

/** Unknown pages (and notFound() calls) under any language. */
export default function NotFound() {
	return <PageNotFoundScreen />;
}
