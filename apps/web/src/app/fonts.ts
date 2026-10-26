import localFont from "next/font/local";

/*
 * Self-hosted from Fontsource (npm), so builds don't depend on Google Fonts
 * and visitors' browsers never call Google.
 */

export const fontDisplay = localFont({
	src: "../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
	weight: "200 800",
	variable: "--font-display",
	display: "swap",
});

export const fontSans = localFont({
	src: "../../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
	weight: "100 1000",
	variable: "--font-sans",
	display: "swap",
});

export const fontMono = localFont({
	src: [
		{ path: "../../node_modules/@fontsource/space-mono/files/space-mono-latin-400-normal.woff2", weight: "400" },
		{ path: "../../node_modules/@fontsource/space-mono/files/space-mono-latin-700-normal.woff2", weight: "700" },
	],
	variable: "--font-mono",
	display: "swap",
});
