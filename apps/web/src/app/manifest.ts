import type { MetadataRoute } from "next";
import { id } from "@/i18n/dictionaries/id";
import { THEME_COLORS } from "@/lib/theme";

/** Lets Android/Chrome install Snapduo like an app. Indonesian is the default market. */
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Snapduo",
		short_name: "Snapduo",
		description: id.meta.description,
		lang: "id",
		start_url: "/",
		scope: "/",
		display: "standalone",
		orientation: "portrait",
		background_color: THEME_COLORS.light,
		theme_color: THEME_COLORS.light,
		categories: ["photo", "entertainment", "social"],
		icons: [
			{ src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
			{ src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
			{ src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
		],
	};
}
