import { describe, expect, it } from "vitest";
import { androidChromeIntent, browserProblem, type BrowserFacts } from "./browser-support";

const ok = { hasGetUserMedia: true, hasPeerConnection: true, secure: true };
const facts = (userAgent: string, extra: Partial<BrowserFacts> = {}): BrowserFacts => ({ userAgent, ...ok, ...extra });

const UA = {
	iosSafari:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
	androidChrome:
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
	iosInstagram:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0 (iPhone15,2; iOS 18_1; en_US)",
	androidFacebook:
		"Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]",
	iosLine:
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.10.0",
	androidTikTok:
		"Mozilla/5.0 (Linux; Android 13; 2201117TY) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Mobile Safari/537.36 musical_ly_2023709030 BytedanceWebview/d8a21c6",
	// WhatsApp opens links in the real browser: must not be flagged.
	desktopChrome:
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

describe("browserProblem", () => {
	it("lets normal Safari and Chrome through", () => {
		expect(browserProblem(facts(UA.iosSafari))).toBeNull();
		expect(browserProblem(facts(UA.androidChrome))).toBeNull();
		expect(browserProblem(facts(UA.desktopChrome))).toBeNull();
	});

	it("spots social apps' built-in browsers, with the platform", () => {
		expect(browserProblem(facts(UA.iosInstagram))).toEqual({ kind: "in-app", app: "Instagram", platform: "ios" });
		expect(browserProblem(facts(UA.androidFacebook))).toEqual({ kind: "in-app", app: "Facebook", platform: "android" });
		expect(browserProblem(facts(UA.iosLine))).toEqual({ kind: "in-app", app: "LINE", platform: "ios" });
		expect(browserProblem(facts(UA.androidTikTok))).toMatchObject({ kind: "in-app", app: "TikTok" });
	});

	it("flags browsers without camera access, WebRTC or https", () => {
		expect(browserProblem(facts(UA.desktopChrome, { hasPeerConnection: false }))).toEqual({ kind: "unsupported" });
		expect(browserProblem(facts(UA.desktopChrome, { hasGetUserMedia: false }))).toEqual({ kind: "unsupported" });
		expect(browserProblem(facts(UA.desktopChrome, { secure: false }))).toEqual({ kind: "unsupported" });
	});
});

describe("androidChromeIntent", () => {
	it("opens the same page in Chrome, falling back to the plain link", () => {
		const intent = androidChromeIntent("https://snapduo.ja7ca.web.id/r/k7m2pq9xa4bc?debug=1");
		expect(intent).toBe(
			"intent://snapduo.ja7ca.web.id/r/k7m2pq9xa4bc?debug=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fsnapduo.ja7ca.web.id%2Fr%2Fk7m2pq9xa4bc%3Fdebug%3D1;end",
		);
	});
});
