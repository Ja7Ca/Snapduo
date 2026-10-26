/**
 * ALLOWED_ORIGINS is a comma-separated list. An entry may contain one "*"
 * standing for a single DNS label, e.g.
 * "https://snapduo-git-*-ja7ca.vercel.app" for Vercel branch previews.
 */
export function originAllowed(origin: string | null, list: string): boolean {
	if (!origin) return false;
	return list
		.split(",")
		.map((o) => o.trim())
		.filter(Boolean)
		.some((pattern) => {
			if (!pattern.includes("*")) return pattern === origin;
			const [head, tail] = pattern.split("*", 2).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
			return new RegExp(`^${head}[a-z0-9-]+${tail}$`).test(origin);
		});
}
