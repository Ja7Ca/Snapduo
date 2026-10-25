import { notFound } from "next/navigation";
import { isLocale, type Dictionary, type Locale } from "./config";
import { en } from "./dictionaries/en";
import { id } from "./dictionaries/id";

const DICTIONARIES: Record<Locale, Dictionary> = { id, en };

export function getDictionary(locale: Locale): Dictionary {
	return DICTIONARIES[locale];
}

/** Narrows the [lang] param; unknown languages are a 404. */
export async function resolveLocale(params: Promise<{ lang: string }>): Promise<Locale> {
	const { lang } = await params;
	if (!isLocale(lang)) notFound();
	return lang;
}
