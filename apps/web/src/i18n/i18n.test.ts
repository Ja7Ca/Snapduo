import { describe, expect, it } from "vitest";
import { fmt, localePath, matchAcceptLanguage, type Dictionary } from "./config";
import { en } from "./dictionaries/en";
import { id } from "./dictionaries/id";
import { decideRoute } from "./routing";

/** Flattens a dictionary to "a.b.0.c" → value. */
function flatten(obj: unknown, prefix = ""): Record<string, string> {
	if (typeof obj === "string") return { [prefix]: obj };
	return Object.entries(obj as object).reduce<Record<string, string>>(
		(acc, [k, v]) => ({ ...acc, ...flatten(v, prefix ? `${prefix}.${k}` : k) }),
		{},
	);
}
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

describe("dictionaries", () => {
	const flatEn = flatten(en);
	const flatId = flatten(id satisfies Dictionary);

	it("Indonesian has exactly the same keys as English (nothing missing or extra)", () => {
		expect(Object.keys(flatId).sort()).toEqual(Object.keys(flatEn).sort());
	});

	it("no empty strings", () => {
		for (const [k, v] of [...Object.entries(flatEn), ...Object.entries(flatId)]) expect(v.trim(), k).not.toBe("");
	});

	it("every translation keeps the same {placeholders}", () => {
		for (const key of Object.keys(flatEn)) expect(placeholders(flatId[key]), key).toBe(placeholders(flatEn[key]));
	});

	it("SEO titles and descriptions fit search result limits", () => {
		for (const d of [en, id]) {
			expect(d.meta.title.length).toBeLessThanOrEqual(60);
			expect(d.meta.description.length).toBeGreaterThanOrEqual(120);
			expect(d.meta.description.length).toBeLessThanOrEqual(240);
		}
	});
});

describe("helpers", () => {
	it("fmt fills placeholders and leaves unknown ones visible", () => {
		expect(fmt("{name} picked {frame}", { name: "Alex", frame: "Grid" })).toBe("Alex picked Grid");
		expect(fmt("Photo {n} of {total}", { n: 2 })).toBe("Photo 2 of {total}");
	});

	it("localePath: Indonesian has no prefix", () => {
		expect(localePath("id", "/")).toBe("/");
		expect(localePath("id", "/about")).toBe("/about");
		expect(localePath("en", "/")).toBe("/en");
		expect(localePath("en", "/about")).toBe("/en/about");
	});

	it("matchAcceptLanguage", () => {
		expect(matchAcceptLanguage(null)).toBe("id");
		expect(matchAcceptLanguage("id-ID,id;q=0.9,en;q=0.8")).toBe("id");
		expect(matchAcceptLanguage("en-US,en;q=0.9,id;q=0.8")).toBe("en");
		expect(matchAcceptLanguage("en;q=0.5,id;q=0.9")).toBe("id");
		expect(matchAcceptLanguage("ms-MY")).toBe("id");
		expect(matchAcceptLanguage("ja-JP,ja;q=0.9")).toBe("en");
		expect(matchAcceptLanguage("en;q=0")).toBe("en");
	});
});

describe("decideRoute", () => {
	it("serves Indonesian at unprefixed URLs and remembers it on marketing pages", () => {
		expect(decideRoute("/", undefined, "en-US")).toEqual({ kind: "rewrite", pathname: "/id", locale: "id", rememberLocale: true });
		expect(decideRoute("/about", undefined, null)).toEqual({ kind: "rewrite", pathname: "/id/about", locale: "id", rememberLocale: true });
		expect(decideRoute("/spike", undefined, null)).toMatchObject({ pathname: "/id/spike", rememberLocale: false });
	});

	it("never redirects the home page by browser language (Googlebot must see Indonesian)", () => {
		expect(decideRoute("/", "en", "en-US").kind).toBe("rewrite");
		expect(decideRoute("/", "en", "en-US")).toMatchObject({ locale: "id" });
	});

	it("passes /en through and remembers English", () => {
		expect(decideRoute("/en", undefined, null)).toEqual({ kind: "pass", locale: "en", rememberLocale: true });
		expect(decideRoute("/en/about", undefined, null)).toEqual({ kind: "pass", locale: "en", rememberLocale: true });
		expect(decideRoute("/en/spike", undefined, null)).toMatchObject({ kind: "pass", rememberLocale: false });
	});

	it("redirects /id/... to the canonical URL", () => {
		expect(decideRoute("/id", undefined, null)).toEqual({ kind: "redirect", pathname: "/" });
		expect(decideRoute("/id/about", undefined, null)).toEqual({ kind: "redirect", pathname: "/about" });
	});

	it("share links follow the cookie, then the browser", () => {
		expect(decideRoute("/r/k7m2pq9xa4bc", "en", "id-ID")).toMatchObject({ pathname: "/en/r/k7m2pq9xa4bc", locale: "en" });
		expect(decideRoute("/r/k7m2pq9xa4bc", undefined, "en-GB")).toMatchObject({ pathname: "/en/r/k7m2pq9xa4bc" });
		expect(decideRoute("/r/k7m2pq9xa4bc", undefined, "id-ID")).toMatchObject({ pathname: "/id/r/k7m2pq9xa4bc" });
		expect(decideRoute("/p/abc", "junk", null)).toMatchObject({ pathname: "/id/p/abc", rememberLocale: false });
	});

	it("doesn't treat look-alike paths as share links", () => {
		expect(decideRoute("/rooms", undefined, "en")).toMatchObject({ pathname: "/id/rooms", locale: "id" });
	});
});
