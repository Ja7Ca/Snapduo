import type { ErrorKind } from "@snapduo/protocol";
import { SIGNAL_URL } from "./signal-client";

/**
 * Sends a browser error to the Worker (POST /errors), which writes it to
 * Workers Logs. Production builds only; at most a few per page, each
 * distinct message once. The Worker scrubs room/share ids again, but we
 * never send more than the path and a short browser name to begin with.
 */
const MAX_PER_PAGE = 10;
const sent = new Set<string>();

/** Noise we can't act on: extensions, cross-origin "Script error.", benign browser warnings. */
const IGNORE = [
	/^Script error\.?$/i,
	/ResizeObserver loop/i,
	/chrome-extension:|moz-extension:|safari-extension:|safari-web-extension:/i,
	/AbortError/i,
];

export function shortBrowser(ua: string): string {
	const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : "other";
	const patterns: [RegExp, string | null][] = [
		[/SamsungBrowser\/(\d+)/, "SamsungBrowser"],
		[/Edg\/(\d+)/, "Edge"],
		[/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
		[/CriOS\/(\d+)/, "CriOS"],
		[/Chrome\/(\d+)/, "Chrome"],
		[/Version\/(\d+)[^ ]* .*Safari\//, "Safari"],
	];
	let name = "unknown";
	for (const [re, label] of patterns) {
		const m = ua.match(re);
		if (m) {
			name = `${label} ${m[1]}`;
			break;
		}
	}
	return `${name} on ${os}`;
}

export function reportError(kind: ErrorKind, error: unknown): void {
	if (process.env.NODE_ENV !== "production" || typeof window === "undefined") return;
	const err = error instanceof Error ? error : null;
	const message = err ? `${err.name}: ${err.message}` : String(error);
	const stack = err?.stack ?? "";
	if (IGNORE.some((re) => re.test(message) || re.test(stack))) return;
	const key = `${kind}:${message}`;
	if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
	sent.add(key);

	const body = JSON.stringify({
		kind,
		message,
		stack: stack || undefined,
		path: window.location.pathname,
		browser: shortBrowser(navigator.userAgent),
		release: process.env.NEXT_PUBLIC_RELEASE,
	});
	const url = `${SIGNAL_URL}/errors`;
	try {
		// text/plain keeps it a "simple" request: no CORS preflight, and
		// sendBeacon still delivers it if the page is closing.
		if (navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain" }))) return;
		void fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
	} catch {
		// Reporting must never cause an error of its own.
	}
}
