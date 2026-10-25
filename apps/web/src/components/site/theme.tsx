"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/i18n/client";
import { THEME_STORAGE_KEY, applyTheme, parsePref, type ResolvedTheme, type ThemePref } from "@/lib/theme";

const CHANGE_EVENT = "snapduo-theme-change";

function subscribe(onChange: () => void) {
	window.addEventListener(CHANGE_EVENT, onChange);
	return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** <html> attributes are the source of truth (set before paint). */
const readPref = () => parsePref(document.documentElement.getAttribute("data-theme-pref"));
const readResolved = (): ResolvedTheme =>
	document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

export function useTheme() {
	const pref = useSyncExternalStore(subscribe, readPref, () => "light" as ThemePref);
	const resolved = useSyncExternalStore(subscribe, readResolved, () => "light" as ResolvedTheme);

	const setPref = useCallback((next: ThemePref) => {
		try {
			localStorage.setItem(THEME_STORAGE_KEY, next);
		} catch {
			// Storage blocked: the choice lasts for this page only.
		}
		applyTheme(next);
		window.dispatchEvent(new Event(CHANGE_EVENT));
	}, []);

	return { pref, resolved, setPref };
}

/**
 * Mounted once in the root layout. Keeps "system" in step with the OS and
 * syncs a choice made in another tab.
 */
export function ThemeSync() {
	useEffect(() => {
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onSystem = () => {
			if (readPref() === "system") {
				applyTheme("system");
				window.dispatchEvent(new Event(CHANGE_EVENT));
			}
		};
		const onStorage = (e: StorageEvent) => {
			if (e.key !== THEME_STORAGE_KEY) return;
			applyTheme(parsePref(e.newValue));
			window.dispatchEvent(new Event(CHANGE_EVENT));
		};
		media.addEventListener("change", onSystem);
		window.addEventListener("storage", onStorage);
		return () => {
			media.removeEventListener("change", onSystem);
			window.removeEventListener("storage", onStorage);
		};
	}, []);
	return null;
}

const OPTIONS = [
	{ value: "light", icon: Sun },
	{ value: "dark", icon: Moon },
	{ value: "system", icon: Monitor },
] as const;

export function ThemeSwitcher() {
	const { pref, setPref } = useTheme();
	const { t } = useI18n();
	return (
		<ToggleGroup
			type="single"
			value={pref}
			onValueChange={(v) => v && setPref(v as ThemePref)}
			aria-label={t.theme.label}
			spacing={1}
		>
			{OPTIONS.map(({ value, icon: Icon }) => {
				const label = t.theme[value];
				return (
				<ToggleGroupItem key={value} value={value} size="sm" aria-label={label} title={label} className="px-2.5">
					<Icon aria-hidden="true" />
					<span className="hidden sm:inline">{label}</span>
				</ToggleGroupItem>
				);
			})}
		</ToggleGroup>
	);
}
