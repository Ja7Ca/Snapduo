import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { LOCALES, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/server";

/*
 * Social preview images (WhatsApp, X, Facebook…), one per language:
 * /og/id.png and /og/en.png. Kept outside [lang] so the URL has no
 * language prefix and is never redirected by the proxy: link crawlers
 * often give up on redirected images.
 */

const SIZE = { width: 1200, height: 630 };
const INK = "#1f1a17";
const ORANGE = "#ff6b2c";
const PAPER = "#ffffff";

// Read once at build time (Satori needs woff/ttf, not woff2).
const fonts = Promise.all([
	readFile(join(process.cwd(), "assets/og/bricolage-grotesque-latin-800-normal.woff")),
	readFile(join(process.cwd(), "assets/og/dm-sans-latin-500-normal.woff")),
]);

export function generateStaticParams() {
	return LOCALES.map((locale) => ({ image: `${locale}.png` }));
}

function Person({ bg }: { bg: string }) {
	return (
		<div style={{ display: "flex", flex: 1, background: bg, alignItems: "flex-end", justifyContent: "center", overflow: "hidden" }}>
			<div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: -18 }}>
				<div style={{ width: 34, height: 34, borderRadius: 34, background: "#b9b0a5" }} />
				<div style={{ width: 70, height: 40, borderRadius: "40px 40px 0 0", background: "#b9b0a5", marginTop: 4 }} />
			</div>
		</div>
	);
}

function Strip() {
	const rows = [
		["#e9e3da", "#dfe6e4"],
		["#ece0d6", "#e4e1ea"],
		["#e8e6dc", "#dde3ea"],
	];
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 10,
				width: 230,
				padding: "18px 22px 14px",
				background: PAPER,
				border: `4px solid ${INK}`,
				borderRadius: 10,
				boxShadow: `10px 10px 0 ${INK}`,
				transform: "rotate(6deg)",
			}}
		>
			{rows.map(([a, b], i) => (
				<div key={i} style={{ display: "flex", gap: 5, height: 108 }}>
					<Person bg={a} />
					<Person bg={b} />
				</div>
			))}
			<div style={{ display: "flex", justifyContent: "center", fontFamily: "Bricolage", fontSize: 20, color: INK, marginTop: 4 }}>
				Snapduo
			</div>
		</div>
	);
}

export async function GET(_request: Request, { params }: RouteContext<"/og/[image]">) {
	const { image } = await params;
	const locale = image.replace(/\.png$/, "");
	if (!image.endsWith(".png") || !isLocale(locale)) return new Response("Not found", { status: 404 });

	const t = getDictionary(locale);
	const [display, body] = await fonts;
	const host = (process.env.NEXT_PUBLIC_SITE_URL || "https://snapduo.ja7ca.web.id").replace(/^https?:\/\//, "");

	return new ImageResponse(
		(
			<div style={{ display: "flex", width: "100%", height: "100%", background: PAPER, padding: "64px 72px", fontFamily: "DM Sans" }}>
				<div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between", paddingRight: 40 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
						<svg width="56" height="56" viewBox="0 0 32 32">
							<rect x="3" y="7" width="15" height="20" rx="3" fill={ORANGE} stroke={INK} strokeWidth="2.2" />
							<rect x="14" y="4" width="15" height="20" rx="3" fill={PAPER} stroke={INK} strokeWidth="2.2" />
							<circle cx="21.5" cy="12" r="3" fill={INK} />
						</svg>
						<div style={{ fontFamily: "Bricolage", fontSize: 40, color: INK }}>Snapduo</div>
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
						<div style={{ fontFamily: "Bricolage", fontSize: 76, lineHeight: 1.02, color: INK, letterSpacing: -2 }}>
							{t.landing.headline}
						</div>
						<div style={{ fontSize: 30, lineHeight: 1.35, color: "#6b625a", maxWidth: 640 }}>{t.landing.subtitle}</div>
					</div>
					<div style={{ display: "flex", alignItems: "center", gap: 14 }}>
						<div
							style={{
								display: "flex",
								background: ORANGE,
								color: INK,
								border: `3px solid ${INK}`,
								boxShadow: `5px 5px 0 ${INK}`,
								borderRadius: 999,
								padding: "12px 28px",
								fontSize: 26,
							}}
						>
							{t.common.createRoom}
						</div>
						<div style={{ fontSize: 24, color: "#6b625a" }}>{host}</div>
					</div>
				</div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 320 }}>
					<Strip />
				</div>
			</div>
		),
		{
			...SIZE,
			fonts: [
				{ name: "Bricolage", data: display, weight: 800, style: "normal" },
				{ name: "DM Sans", data: body, weight: 500, style: "normal" },
			],
			headers: { "Cache-Control": "public, max-age=86400, immutable" },
		},
	);
}
