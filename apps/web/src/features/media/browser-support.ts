/**
 * Can this browser run a booth?
 *
 * Room links are mostly opened from chat and social apps. Several of them
 * (Instagram, Facebook, LINE, TikTok…) open links in their own built-in
 * browser, which on iPhone often can't use the camera at all, and people
 * only see "camera failed" with no idea why. We spot those up front and
 * ask them to open the link in Safari or Chrome instead.
 */

export type BrowserProblem =
	/** A social/chat app's built-in browser. */
	| { kind: "in-app"; app: string; platform: "ios" | "android" | "other" }
	/** No camera API or no WebRTC (very old browser, or not https). */
	| { kind: "unsupported" };

/** User-agent markers of built-in browsers that block or break the camera. */
const IN_APP: [RegExp, string][] = [
	[/Instagram/i, "Instagram"],
	[/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i, "Facebook"],
	[/\bLine\//i, "LINE"],
	[/musical_ly|BytedanceWebview|TikTok/i, "TikTok"],
	[/Snapchat/i, "Snapchat"],
	[/Twitter|TwitterAndroid/i, "X"],
	[/LinkedInApp/i, "LinkedIn"],
	[/MicroMessenger/i, "WeChat"],
	[/Threads/i, "Threads"],
];

export interface BrowserFacts {
	userAgent: string;
	hasGetUserMedia: boolean;
	hasPeerConnection: boolean;
	secure: boolean;
}

export function platformOf(userAgent: string): "ios" | "android" | "other" {
	if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
	if (/Android/i.test(userAgent)) return "android";
	return "other";
}

/** Pure, so it can be tested with real user agents. */
export function browserProblem(f: BrowserFacts): BrowserProblem | null {
	const app = IN_APP.find(([re]) => re.test(f.userAgent))?.[1];
	if (app) return { kind: "in-app", app, platform: platformOf(f.userAgent) };
	if (!f.secure || !f.hasGetUserMedia || !f.hasPeerConnection) return { kind: "unsupported" };
	return null;
}

export function currentBrowserFacts(): BrowserFacts {
	return {
		userAgent: navigator.userAgent,
		hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
		hasPeerConnection: typeof window.RTCPeerConnection === "function",
		secure: window.isSecureContext,
	};
}

/**
 * Android only: an intent link that opens this page in Chrome (or asks
 * which browser). iPhone has no equivalent; there we show steps instead.
 */
export function androidChromeIntent(url: string): string {
	const u = new URL(url);
	return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
