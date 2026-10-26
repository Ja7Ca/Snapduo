import { Link2, Sparkles, Users } from "lucide-react";
import { PhotoStrip } from "@/components/photo/photo-strip";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { Button } from "@/components/ui/button";
import { getFrame } from "@/features/frames/frames";
import { mockPortrait, mockShots } from "@/features/mock/mock-photos";
import { LOCALE_TAGS, localePath, type Dictionary, type Locale } from "@/i18n/config";
import { getDictionary, resolveLocale } from "@/i18n/server";
import { GITHUB_URL, SITE_URL } from "@/lib/site";
import { CreateRoomButton, JoinRoomDialog } from "./landing-actions";

const STEP_ICONS = [Users, Link2, Sparkles];

function BoothMockup({ t }: { t: Dictionary }) {
	const strip = getFrame("classic-white");
	return (
		<div className="relative mx-auto w-full max-w-[420px] pr-14 sm:pr-20" aria-hidden="true">
			<div className="rounded-[28px] bg-card p-3 outline-playful">
				<div className="mb-3 flex gap-1.5">
					{["3s", "5s", "10s"].map((s, i) => (
						<span
							key={s}
							className={
								i === 0
									? "rounded-full bg-ink px-3 py-1 text-xs font-medium text-background"
									: "rounded-full bg-secondary px-3 py-1 text-xs font-medium"
							}
						>
							{s}
						</span>
					))}
				</div>
				<div className="grid grid-cols-2 gap-2">
					{[mockPortrait(4), mockPortrait(9)].map((src, i) => (
						<div key={i} className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-video">
							{/* eslint-disable-next-line @next/next/no-img-element -- inline SVG placeholder */}
							<img src={src} alt="" className="size-full object-cover" />
							<span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
								{i === 0 ? t.common.you : t.landing.mockFriend}
							</span>
						</div>
					))}
				</div>
				<div className="mt-3 flex justify-center">
					<span className="size-12 rounded-full border-2 border-ink bg-background p-1">
						<span className="block size-full rounded-full bg-primary" />
					</span>
				</div>
			</div>
			<div className="absolute top-10 -right-1 w-24 rotate-6 overflow-hidden rounded-md outline-playful sm:w-28">
				<PhotoStrip frame={strip} shots={mockShots(4)} title={t.landing.exampleStrip} />
			</div>
		</div>
	);
}

/** schema.org data so search engines know this is a free web app. */
function StructuredData({ locale, t }: { locale: Locale; t: Dictionary }) {
	const url = `${SITE_URL}${localePath(locale, "/")}`;
	const data = {
		"@context": "https://schema.org",
		"@type": "WebApplication",
		name: "Snapduo",
		url,
		description: t.meta.description,
		inLanguage: LOCALE_TAGS[locale].lang,
		applicationCategory: "MultimediaApplication",
		applicationSubCategory: t.meta.appCategory,
		operatingSystem: "Any (web browser)",
		browserRequirements: "Requires a camera and a modern browser with WebRTC",
		isAccessibleForFree: true,
		offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
		image: `${SITE_URL}/og/${locale}.png`,
		sameAs: [GITHUB_URL],
	};
	return (
		<script
			type="application/ld+json"
			// JSON.stringify output is safe here: no user input, and "<" is escaped.
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
		/>
	);
}

export default async function LandingPage({ params }: PageProps<"/[lang]">) {
	const locale = await resolveLocale(params);
	const t = getDictionary(locale);

	return (
		<div className="flex min-h-dvh flex-col">
			<StructuredData locale={locale} t={t} />
			<SiteHeader
				suggestLanguage
				action={
					<JoinRoomDialog
						trigger={
							<Button variant="link" size="inline" className="text-base">
								{t.common.joinRoom}
							</Button>
						}
					/>
				}
			/>

			<main className="mx-auto w-full max-w-6xl flex-1 px-5 lg:px-8">
				<section className="grid items-center gap-12 py-8 lg:grid-cols-2 lg:gap-16 lg:py-16">
					<div className="flex flex-col items-start gap-6">
						<h1 className="max-w-[12ch] text-[44px] leading-[1.02] font-extrabold sm:text-6xl lg:text-[68px]">
							{t.landing.headline}
						</h1>
						<p className="max-w-[42ch] text-lg text-muted-foreground">{t.landing.subtitle}</p>
						<div className="flex flex-col items-start gap-3">
							<CreateRoomButton />
							<JoinRoomDialog
								trigger={
									<Button variant="link" size="inline">
										{t.landing.haveLink}
									</Button>
								}
							/>
						</div>
					</div>
					<BoothMockup t={t} />
				</section>

				<section aria-labelledby="how-title" className="pb-8">
					<h2 id="how-title" className="sr-only">
						{t.landing.howItWorks}
					</h2>
					<ol className="grid gap-3 sm:grid-cols-3">
						{t.landing.steps.map(({ title, body }, i) => {
							const Icon = STEP_ICONS[i];
							return (
								<li key={title} className="flex items-center gap-4 rounded-2xl p-4 outline-playful">
									<span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary">
										<Icon className="size-5" aria-hidden="true" />
									</span>
									<div>
										<h3 className="text-lg font-bold">{title}</h3>
										<p className="text-sm text-muted-foreground">{body}</p>
									</div>
								</li>
							);
						})}
					</ol>
				</section>
			</main>

			<SiteFooter languageSwitch />
		</div>
	);
}
