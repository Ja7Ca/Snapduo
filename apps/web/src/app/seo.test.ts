import { describe, expect, it } from "vitest";
import { decideRoute } from "@/i18n/routing";
import manifest from "./manifest";
import { disallowedPaths } from "@/lib/seo-paths";
import robots from "./robots";
import sitemap from "./sitemap";

describe("sitemap", () => {
	const entries = sitemap();

	it("lists landing and about in both languages on the canonical domain", () => {
		expect(entries.map((e) => e.url)).toEqual([
			"https://snapduo.ja7ca.web.id/",
			"https://snapduo.ja7ca.web.id/en",
			"https://snapduo.ja7ca.web.id/about",
			"https://snapduo.ja7ca.web.id/en/about",
		]);
	});

	it("each entry links its other language (hreflang)", () => {
		for (const e of entries) {
			expect(Object.keys(e.alternates?.languages ?? {}).sort()).toEqual(["en", "id"]);
		}
	});

	it("every listed URL is served directly (no redirect) by the proxy", () => {
		for (const e of entries) {
			const path = new URL(e.url).pathname;
			expect(decideRoute(path, undefined, null).kind).not.toBe("redirect");
		}
	});
});

describe("robots", () => {
	it("blocks rooms, shared photos and tools in both languages, allows the rest", () => {
		expect(disallowedPaths().sort()).toEqual(
			["/r/", "/p/", "/spike", "/dev/", "/en/r/", "/en/p/", "/en/spike", "/en/dev/"].sort(),
		);
		const r = robots();
		expect(r.sitemap).toBe("https://snapduo.ja7ca.web.id/sitemap.xml");
	});

	it("doesn't block any page in the sitemap", () => {
		const blocked = disallowedPaths();
		for (const e of sitemap()) {
			const path = new URL(e.url).pathname;
			expect(blocked.some((b) => path.startsWith(b))).toBe(false);
		}
	});
});

describe("manifest", () => {
	it("has installable icons including a maskable one", () => {
		const m = manifest();
		expect(m.icons?.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
		expect(m.icons?.some((i) => i.sizes === "192x192")).toBe(true);
		expect(m.start_url).toBe("/");
	});
});
