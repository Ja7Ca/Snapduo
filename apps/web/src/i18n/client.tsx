"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { LOCALE_COOKIE, fmt, localePath, type Dictionary, type Locale } from "./config";

interface I18n {
	locale: Locale;
	t: Dictionary;
	fmt: typeof fmt;
	/** Public URL of a page in the current language. */
	path: (p: string) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dictionary; children: ReactNode }) {
	const value = useMemo<I18n>(() => ({ locale, t: dict, fmt, path: (p) => localePath(locale, p) }), [locale, dict]);
	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
	const ctx = useContext(I18nContext);
	if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
	return ctx;
}

/** Remembers the language for share links (read by proxy.ts). */
export function rememberLocale(locale: Locale) {
	document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
