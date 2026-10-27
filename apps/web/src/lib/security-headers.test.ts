import { describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers";

const get = (h: { key: string; value: string }[], key: string) => h.find((x) => x.key === key)?.value;

describe("security headers", () => {
	const prod = securityHeaders("https://snapduo-signal.example.workers.dev", true);
	const csp = get(prod, "Content-Security-Policy")!;

	it("lets the app reach only its own Worker, over HTTP and WebSocket", () => {
		expect(csp).toContain("connect-src 'self' https://snapduo-signal.example.workers.dev wss://snapduo-signal.example.workers.dev");
		expect(csp).toContain("img-src 'self' data: blob: https://snapduo-signal.example.workers.dev");
		expect(csp).toContain("upgrade-insecure-requests");
	});

	it("can't be framed, and the camera is for this site only", () => {
		expect(csp).toContain("frame-ancestors 'none'");
		expect(get(prod, "X-Frame-Options")).toBe("DENY");
		expect(get(prod, "Permissions-Policy")).toContain("camera=(self)");
		expect(get(prod, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
	});

	it("leaves the CSP out in dev, and doesn't upgrade a local http Worker", () => {
		expect(get(securityHeaders("http://localhost:8787", false), "Content-Security-Policy")).toBeUndefined();
		const local = get(securityHeaders("http://localhost:8787", true), "Content-Security-Policy")!;
		expect(local).toContain("ws://localhost:8787");
		expect(local).not.toContain("upgrade-insecure-requests");
	});
});
