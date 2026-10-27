import type { Metadata } from "next";
import { NO_INDEX } from "@/i18n/seo";
import { getDictionary, resolveLocale } from "@/i18n/server";

/*
 * Metadata lives here, not in the page: at this level params only hold the
 * language (known at build time). In the page they'd also hold the
 * share id, which only exists per request, and Next.js would treat the
 * metadata as blocking the prerender.
 */
export async function generateMetadata({ params }: LayoutProps<"/[lang]/p">): Promise<Metadata> {
	const t = getDictionary(await resolveLocale(params));
	return { title: t.meta.sharedTitle, robots: NO_INDEX };
}

export default function Layout({ children }: LayoutProps<"/[lang]/p">) {
	return children;
}
