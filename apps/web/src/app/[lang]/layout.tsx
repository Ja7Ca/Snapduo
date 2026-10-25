import type { Metadata } from "next";
import { ThemeSync } from "@/components/site/theme";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/i18n/client";
import { LOCALES, LOCALE_TAGS, localePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/seo";
import { getDictionary, resolveLocale } from "@/i18n/server";
import { SITE_URL } from "@/lib/site";
import { THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/theme";
import { fontDisplay, fontMono, fontSans } from "../fonts";
import "../globals.css";

export function generateStaticParams() {
	return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
	const locale = await resolveLocale(params);
	const t = getDictionary(locale);
	return {
		metadataBase: new URL(SITE_URL),
		title: { default: t.meta.title, template: `%s · ${t.meta.shortTitle}` },
		description: t.meta.description,
		keywords: t.meta.keywords,
		applicationName: "Snapduo",
		alternates: alternatesFor(locale, "/"),
		openGraph: {
			type: "website",
			siteName: "Snapduo",
			locale: LOCALE_TAGS[locale].og,
			alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => LOCALE_TAGS[l].og),
			title: t.meta.title,
			description: t.meta.description,
			url: localePath(locale, "/"),
			images: [{ url: `/og/${locale}.png`, width: 1200, height: 630, alt: t.meta.ogAlt }],
		},
		twitter: {
			card: "summary_large_image",
			title: t.meta.title,
			description: t.meta.description,
			images: [`/og/${locale}.png`],
		},
		formatDetection: { telephone: false },
	};
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
	const locale = await resolveLocale(params);
	return (
		<html
			lang={LOCALE_TAGS[locale].lang}
			data-theme="light"
			data-theme-pref="light"
			style={{ colorScheme: "light" }}
			className={`${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`}
			// The theme script may change data-theme before React hydrates.
			suppressHydrationWarning
		>
			<head>
				{/* Browser UI colour; the script below updates it for dark. */}
				<meta name="theme-color" content={THEME_COLORS.light} />
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
			</head>
			<body className="min-h-dvh">
				<I18nProvider locale={locale} dict={getDictionary(locale)}>
					{children}
					<ThemeSync />
					<Toaster position="top-center" />
				</I18nProvider>
			</body>
		</html>
	);
}
