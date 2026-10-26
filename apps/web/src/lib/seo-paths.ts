import { LOCALES, localePath } from "@/i18n/config";

/** Public pages that belong in search results (each exists in every language). */
export const PUBLIC_PATHS = [
	{ path: "/", priority: 1 },
	{ path: "/about", priority: 0.6 },
] as const;

/** App screens that must stay out of search results, in every language. */
export function disallowedPaths(): string[] {
	const appPaths = ["/r/", "/p/", "/dev/"];
	return [...new Set(LOCALES.flatMap((l) => appPaths.map((p) => localePath(l, p))))];
}
