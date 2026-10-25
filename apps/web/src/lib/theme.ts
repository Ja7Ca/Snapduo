/**
 * Theme handling.
 *
 * - The user's choice ("light" | "dark" | "system") is stored in localStorage
 *   and mirrored on <html data-theme-pref>.
 * - The resolved theme ("light" | "dark") goes on <html data-theme>; CSS only
 *   looks at this one, so the dark palette is written once.
 * - THEME_INIT_SCRIPT runs in <head> before the first paint, so a saved dark
 *   choice never flashes white (see Next's "preventing flash" guide).
 */

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "snapduo-theme";
export const DEFAULT_THEME: ThemePref = "light";
export const THEME_COLORS: Record<ResolvedTheme, string> = { light: "#ffffff", dark: "#15120f" };

export function parsePref(value: unknown): ThemePref {
	return value === "dark" || value === "system" || value === "light" ? value : DEFAULT_THEME;
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
	if (pref === "system") return systemDark ? "dark" : "light";
	return pref;
}

/**
 * Plain ES5 so it runs as-is in <head>. Keep in sync with parsePref /
 * resolveTheme (theme.test.ts executes this string to check that).
 */
export const THEME_INIT_SCRIPT = `(function(){var p="${DEFAULT_THEME}";try{var s=localStorage.getItem("${THEME_STORAGE_KEY}");if(s==="light"||s==="dark"||s==="system")p=s}catch(e){}var d=p==="dark"||(p==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var t=d?"dark":"light";var r=document.documentElement;r.setAttribute("data-theme",t);r.setAttribute("data-theme-pref",p);r.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?"${THEME_COLORS.dark}":"${THEME_COLORS.light}")})()`;

/** Applies a theme at runtime (after the user picks one, or the OS changes). */
export function applyTheme(pref: ThemePref): ResolvedTheme {
	const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
	const resolved = resolveTheme(pref, systemDark);
	const root = document.documentElement;
	root.setAttribute("data-theme", resolved);
	root.setAttribute("data-theme-pref", pref);
	root.style.colorScheme = resolved;
	document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[resolved]);
	return resolved;
}
