import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Clock, Video } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { Button } from "@/components/ui/button";
import { LOCALE_TAGS, localePath } from "@/i18n/config";
import { alternatesFor } from "@/i18n/seo";
import { getDictionary, resolveLocale } from "@/i18n/server";
import { GITHUB_URL } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[lang]/about">): Promise<Metadata> {
	const locale = await resolveLocale(params);
	const t = getDictionary(locale);
	return {
		title: t.meta.aboutTitle,
		description: t.meta.aboutDescription,
		alternates: alternatesFor(locale, "/about"),
		openGraph: {
			title: `${t.meta.aboutTitle} · Snapduo`,
			description: t.meta.aboutDescription,
			url: localePath(locale, "/about"),
			locale: LOCALE_TAGS[locale].og,
			images: [{ url: `/og/${locale}.png`, width: 1200, height: 630, alt: t.meta.ogAlt }],
		},
	};
}

const ICONS = [Video, Camera, Clock];

export default async function AboutPage({ params }: PageProps<"/[lang]/about">) {
	const locale = await resolveLocale(params);
	const t = getDictionary(locale);
	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader
				suggestLanguage
				action={
					<Button variant="link" size="inline" asChild>
						<Link href={localePath(locale, "/")}>{t.common.backHome}</Link>
					</Button>
				}
			/>
			<main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 lg:py-14">
				<h1 className="text-[44px] leading-[1.02] font-extrabold sm:text-6xl">{t.about.title}</h1>
				<p className="mt-4 max-w-[52ch] text-lg text-muted-foreground">{t.about.intro}</p>

				<ul className="mt-10 grid gap-4">
					{t.about.points.map(({ title, body }, i) => {
						const Icon = ICONS[i];
						return (
							<li key={title} className="flex gap-4 rounded-2xl p-5 outline-playful">
								<span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary">
									<Icon className="size-5" aria-hidden="true" />
								</span>
								<div>
									<h2 className="text-xl font-bold">{title}</h2>
									<p className="mt-1 max-w-[60ch] text-muted-foreground">{body}</p>
								</div>
							</li>
						);
					})}
				</ul>

				<section className="mt-12 rounded-2xl bg-secondary p-6" aria-labelledby="dev-title">
					<h2 id="dev-title" className="text-xl font-bold">
						{t.about.devTitle}
					</h2>
					<p className="mt-2 max-w-[60ch] text-muted-foreground">{t.about.devBody}</p>
					<Button variant="secondary-playful" size="sm" className="mt-4" asChild>
						<a href={GITHUB_URL} rel="noreferrer" target="_blank">
							{t.about.github}
						</a>
					</Button>
				</section>
			</main>
			<SiteFooter languageSwitch />
		</div>
	);
}
