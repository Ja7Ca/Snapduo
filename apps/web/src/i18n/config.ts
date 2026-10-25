import type { en } from "./dictionaries/en";

/** Indonesian is the default and has no URL prefix; English lives under /en. */
export const LOCALES = ["id", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "id";
export const LOCALE_COOKIE = "snapduo-lang";

export const LOCALE_NAMES: Record<Locale, string> = { id: "Bahasa Indonesia", en: "English" };
/** BCP-47 tags for <html lang>, hreflang and Open Graph. */
export const LOCALE_TAGS: Record<Locale, { lang: string; og: string }> = {
	id: { lang: "id", og: "id_ID" },
	en: { lang: "en", og: "en_US" },
};

type Widen<T> = T extends string
	? string
	: T extends readonly (infer U)[]
		? Widen<U>[]
		: T extends object
			? { [K in keyof T]: Widen<T[K]> }
			: T;

/** Every language must provide exactly the keys of the English dictionary. */
export type Dictionary = Widen<typeof en>;

export function isLocale(value: unknown): value is Locale {
	return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Public path for a page in a language: Indonesian has no prefix.
 * localePath("en", "/about") → "/en/about", localePath("id", "/") → "/".
 */
export function localePath(locale: Locale, path: string): string {
	const clean = path.startsWith("/") ? path : `/${path}`;
	if (locale === DEFAULT_LOCALE) return clean;
	return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/** Fills {placeholders}. Unknown keys are left as-is so mistakes are visible. */
export function fmt(template: string, vars: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/**
 * Picks a supported language from an Accept-Language header,
 * e.g. "en-US,en;q=0.9,id;q=0.8" → "en".
 * No header → Indonesian (the default). A browser in some other language
 * (Japanese, Dutch…) gets English, which they're more likely to read.
 */
export function matchAcceptLanguage(header: string | null | undefined): Locale {
	if (!header?.trim()) return DEFAULT_LOCALE;
	const ranked = header
		.split(",")
		.map((part, index) => {
			const [tag, ...params] = part.trim().split(";");
			const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
			return { base: tag.toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1, index };
		})
		.filter((entry) => entry.base && entry.q > 0)
		.sort((a, b) => b.q - a.q || a.index - b.index);
	for (const { base } of ranked) {
		// Malay ("ms") is close enough that Indonesian is the better default.
		const candidate = base === "in" || base === "ms" ? "id" : base;
		if (isLocale(candidate)) return candidate;
	}
	return "en";
}
