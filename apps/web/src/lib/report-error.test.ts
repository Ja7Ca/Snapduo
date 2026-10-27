import { describe, expect, it } from "vitest";
import { shortBrowser } from "./report-error";

describe("shortBrowser", () => {
	it("names common phone and desktop browsers without the full user agent", () => {
		expect(shortBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1")).toBe("Safari 18 on iOS");
		expect(shortBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")).toBe("Chrome 130 on Android");
		expect(shortBrowser("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36")).toBe("SamsungBrowser 26 on Android");
		expect(shortBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0")).toBe("Firefox 132 on Windows");
		expect(shortBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1")).toBe("CriOS 130 on iOS");
	});
});
