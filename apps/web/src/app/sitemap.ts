import type { MetadataRoute } from "next";
import { LOCALES, LOCALE_TAGS, localePath } from "@/i18n/config";
import { PUBLIC_PATHS } from "@/lib/seo-paths";
import { SITE_URL } from "@/lib/site";

/** Public pages, each listed in every language with hreflang alternates. */
export default function sitemap(): MetadataRoute.Sitemap {
	return PUBLIC_PATHS.flatMap(({ path, priority }) =>
		LOCALES.map((locale) => ({
			url: `${SITE_URL}${localePath(locale, path)}`,
			changeFrequency: "monthly" as const,
			priority: locale === "id" ? priority : priority * 0.9,
			alternates: {
				languages: Object.fromEntries(LOCALES.map((l) => [LOCALE_TAGS[l].lang, `${SITE_URL}${localePath(l, path)}`])),
			},
		})),
	);
}
