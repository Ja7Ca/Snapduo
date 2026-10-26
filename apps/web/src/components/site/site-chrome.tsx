"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { LanguageSuggestion, LanguageSwitcher } from "@/components/site/language";
import { ThemeSwitcher } from "@/components/site/theme";
import { useI18n } from "@/i18n/client";

/** Header for playful screens: logo left, one action right. */
export function SiteHeader({ action, suggestLanguage = false }: { action?: ReactNode; suggestLanguage?: boolean }) {
	return (
		<>
			{suggestLanguage && <LanguageSuggestion />}
			<header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 lg:px-8">
				<Logo />
				{action}
			</header>
		</>
	);
}

/**
 * The language switcher only appears on pages that exist at a localized URL
 * (landing, about). Room and share links pick the language automatically.
 */
export function SiteFooter({ languageSwitch = false }: { languageSwitch?: boolean }) {
	const { t, path } = useI18n();
	return (
		<footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground lg:px-8">
			<p>{t.common.footer}</p>
			<div className="flex flex-wrap items-center gap-4">
				{languageSwitch && <LanguageSwitcher />}
				<ThemeSwitcher />
				<Link href={path("/about")} className="underline underline-offset-4 hover:text-foreground">
					{t.common.about}
				</Link>
			</div>
		</footer>
	);
}
