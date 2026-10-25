"use client";

import { Languages, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { rememberLocale, useI18n } from "@/i18n/client";
import { LOCALES, LOCALE_NAMES, isLocale, localePath, type Locale } from "@/i18n/config";
import { en } from "@/i18n/dictionaries/en";
import { cn } from "@/lib/utils";

/** "/en/about" → "/about"; "/" → "/". */
function basePath(pathname: string): string {
	const first = pathname.split("/")[1];
	if (!isLocale(first)) return pathname || "/";
	return pathname.slice(first.length + 1) || "/";
}

/** ID / EN links to the same page in the other language. */
export function LanguageSwitcher({ className }: { className?: string }) {
	const { locale, t } = useI18n();
	const pathname = usePathname();
	const base = basePath(pathname);

	return (
		<nav aria-label={t.language.label} className={cn("flex items-center gap-1", className)}>
			<Languages className="mr-1 size-4" aria-hidden="true" />
			{LOCALES.map((l) => (
				<Link
					key={l}
					href={localePath(l, base)}
					hrefLang={l}
					lang={l}
					aria-current={l === locale ? "page" : undefined}
					title={LOCALE_NAMES[l]}
					onClick={() => rememberLocale(l)}
					// Switching language changes the root layout (full page load), so
					// prefetching is wasted work.
					prefetch={false}
					className={cn(
						"rounded-full px-2.5 py-1 text-xs font-semibold uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
						l === locale ? "bg-ink text-background" : "bg-secondary text-secondary-foreground hover:bg-border",
					)}
				>
					{l}
				</Link>
			))}
		</nav>
	);
}

const DISMISS_KEY = "snapduo-lang-hint-dismissed";
const noopSubscribe = () => () => {};

/**
 * On Indonesian pages, offers English to visitors whose browser isn't set to
 * Indonesian. A suggestion, never an automatic redirect (that would hide the
 * Indonesian page from search engines).
 */
export function LanguageSuggestion() {
	const { locale } = useI18n();
	// Written for people who don't read Indonesian, so always in English.
	const copy = en.language;
	const pathname = usePathname();
	const [dismissed, setDismissed] = useState(false);
	const shouldOffer = useSyncExternalStore(
		noopSubscribe,
		() => {
			try {
				if (localStorage.getItem(DISMISS_KEY)) return false;
			} catch {
				// Storage blocked: still fine to offer.
			}
			const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
			return !langs.some((l) => /^(id|in|ms)\b/i.test(l));
		},
		() => false,
	);

	if (locale !== "id" || dismissed || !shouldOffer) return null;
	const target: Locale = "en";

	const dismiss = () => {
		setDismissed(true);
		rememberLocale("id");
		try {
			localStorage.setItem(DISMISS_KEY, "1");
		} catch {
			// Ignore: it just shows again next visit.
		}
	};

	return (
		<aside lang="en" aria-label="Language" className="border-b border-border bg-secondary">
			<div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-2 text-sm lg:px-8">
				<p className="min-w-0 flex-1">{copy.suggest}</p>
				<Button variant="secondary" size="sm" asChild>
					<Link
						href={localePath(target, basePath(pathname))}
						hrefLang={target}
						prefetch={false}
						onClick={() => rememberLocale(target)}
					>
						{copy.switchTo}
					</Link>
				</Button>
				<Button variant="ghost" size="icon-sm" onClick={dismiss} aria-label={copy.dismiss} title={copy.dismiss}>
					<X aria-hidden="true" />
				</Button>
			</div>
		</aside>
	);
}
