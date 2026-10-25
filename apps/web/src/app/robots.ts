import type { MetadataRoute } from "next";
import { disallowedPaths } from "@/lib/seo-paths";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: { userAgent: "*", allow: "/", disallow: disallowedPaths() },
		sitemap: `${SITE_URL}/sitemap.xml`,
		host: SITE_URL,
	};
}
