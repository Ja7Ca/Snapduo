import { describe, expect, it } from "vitest";
import { THEME_COLORS, THEME_INIT_SCRIPT, THEME_STORAGE_KEY, parsePref, resolveTheme } from "./theme";

/** Runs the <head> script against a tiny fake DOM. */
function runInitScript(opts: { stored?: string | null; systemDark?: boolean; storageThrows?: boolean }) {
	const attrs: Record<string, string> = {};
	const meta: Record<string, string> = {};
	const root = { setAttribute: (k: string, v: string) => (attrs[k] = v), style: { colorScheme: "" } };
	const env = {
		localStorage: {
			getItem: (k: string) => {
				if (opts.storageThrows) throw new Error("blocked");
				return k === THEME_STORAGE_KEY ? (opts.stored ?? null) : null;
			},
		},
		window: { matchMedia: () => ({ matches: !!opts.systemDark }) },
		document: {
			documentElement: root,
			querySelector: () => ({ setAttribute: (k: string, v: string) => (meta[k] = v) }),
		},
	};
	new Function("localStorage", "window", "document", THEME_INIT_SCRIPT)(env.localStorage, env.window, env.document);
	return { theme: attrs["data-theme"], pref: attrs["data-theme-pref"], scheme: root.style.colorScheme, meta: meta.content };
}

describe("theme logic", () => {
	it("defaults to light for missing or junk values", () => {
		expect(parsePref(null)).toBe("light");
		expect(parsePref("purple")).toBe("light");
		expect(parsePref("system")).toBe("system");
	});

	it("resolves system against the OS setting", () => {
		expect(resolveTheme("system", true)).toBe("dark");
		expect(resolveTheme("system", false)).toBe("light");
		expect(resolveTheme("light", true)).toBe("light");
		expect(resolveTheme("dark", false)).toBe("dark");
	});
});

describe("THEME_INIT_SCRIPT (runs before paint)", () => {
	it("first visit is light even when the OS is dark", () => {
		expect(runInitScript({ stored: null, systemDark: true })).toEqual({
			theme: "light",
			pref: "light",
			scheme: "light",
			meta: THEME_COLORS.light,
		});
	});

	it("applies a saved dark choice", () => {
		expect(runInitScript({ stored: "dark" })).toMatchObject({ theme: "dark", pref: "dark", meta: THEME_COLORS.dark });
	});

	it("system follows the OS", () => {
		expect(runInitScript({ stored: "system", systemDark: true })).toMatchObject({ theme: "dark", pref: "system" });
		expect(runInitScript({ stored: "system", systemDark: false })).toMatchObject({ theme: "light", pref: "system" });
	});

	it("ignores junk and survives blocked storage", () => {
		expect(runInitScript({ stored: "neon" })).toMatchObject({ theme: "light", pref: "light" });
		expect(runInitScript({ storageThrows: true, systemDark: true })).toMatchObject({ theme: "light", pref: "light" });
	});

	it("agrees with resolveTheme for every combination", () => {
		for (const stored of ["light", "dark", "system"] as const) {
			for (const systemDark of [true, false]) {
				expect(runInitScript({ stored, systemDark }).theme).toBe(resolveTheme(stored, systemDark));
			}
		}
	});
});
