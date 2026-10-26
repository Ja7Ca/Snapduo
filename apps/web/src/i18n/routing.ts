import { DEFAULT_LOCALE, isLocale, matchAcceptLanguage, type Locale } from "./config";

/**
 * URL rules (pure, unit-tested; proxy.ts applies them):
 *
 * - "/", "/about"            → Indonesian, served from /id/... (no prefix in the URL)
 * - "/en", "/en/about"       → English
 * - "/id/..."                → 301 to the unprefixed URL (one canonical URL per page)
 * - "/r/<room>", "/p/<id>"   → language-neutral share links: the visitor's last
 *                              choice (cookie), else their browser language
 *
 * Visiting a page in a language remembers it (cookie), so a room created from
 * the English site opens in English.
 */
export type RouteDecision =
	| { kind: "rewrite"; pathname: string; locale: Locale; rememberLocale: boolean }
	| { kind: "redirect"; pathname: string }
	| { kind: "pass"; locale: Locale; rememberLocale: boolean };

const SHARE_LINK = /^\/(r|p)(\/|$)/;
const MARKETING = new Set(["/", "/about"]);

export function decideRoute(pathname: string, cookieLocale: string | undefined, acceptLanguage: string | null): RouteDecision {
	// Explicit default prefix: redirect to the canonical unprefixed URL.
	if (pathname === `/${DEFAULT_LOCALE}` || pathname.startsWith(`/${DEFAULT_LOCALE}/`)) {
		return { kind: "redirect", pathname: pathname.slice(DEFAULT_LOCALE.length + 1) || "/" };
	}

	const prefix = pathname.split("/")[1];
	if (isLocale(prefix)) {
		const rest = pathname.slice(prefix.length + 1) || "/";
		return { kind: "pass", locale: prefix, rememberLocale: MARKETING.has(rest) };
	}

	if (SHARE_LINK.test(pathname)) {
		const locale = isLocale(cookieLocale) ? cookieLocale : matchAcceptLanguage(acceptLanguage);
		return { kind: "rewrite", pathname: `/${locale}${pathname}`, locale, rememberLocale: false };
	}

	return {
		kind: "rewrite",
		pathname: pathname === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`,
		locale: DEFAULT_LOCALE,
		rememberLocale: MARKETING.has(pathname),
	};
}
