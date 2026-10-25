import type { Metadata } from "next";
import { LOCALES, LOCALE_TAGS, localePath, type Locale } from "./config";

/** Canonical + hreflang links for a page that exists in every language. */
export function alternatesFor(locale: Locale, path: string): Metadata["alternates"] {
	return {
		canonical: localePath(locale, path),
		languages: {
			...Object.fromEntries(LOCALES.map((l) => [LOCALE_TAGS[l].lang, localePath(l, path)])),
			"x-default": localePath("id", path),
		},
	};
}

/** For pages that must never appear in search results (rooms, shared photos, tools). */
export const NO_INDEX: Metadata["robots"] = { index: false, follow: false };
