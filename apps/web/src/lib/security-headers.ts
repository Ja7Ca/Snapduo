/**
 * Security headers for every page (wired in next.config.ts).
 *
 * The Content-Security-Policy only allows what the app really uses: our
 * own scripts and styles, images from our pages, the camera's object URLs
 * and the Worker (share images), and network calls to the Worker (HTTP
 * and WebSocket). WebRTC media isn't governed by CSP.
 *
 * Scripts keep 'unsafe-inline': Next.js and our theme script are inline,
 * and the stricter alternative (nonces) would force every page to render
 * per request, losing static prerendering. Acceptable here: there is no
 * login, and no user input is ever rendered as HTML.
 */
export function securityHeaders(signalUrl: string, production: boolean): { key: string; value: string }[] {
	const signal = new URL(signalUrl);
	const signalHttp = signal.origin;
	const signalWs = signalHttp.replace(/^http/, "ws");
	const csp = [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline'",
		`img-src 'self' data: blob: ${signalHttp}`,
		"font-src 'self' data:",
		`connect-src 'self' ${signalHttp} ${signalWs}`,
		"media-src 'self' blob:",
		"worker-src 'self' blob:",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
		// Only when the Worker is on https (so a local http setup keeps working).
		...(signal.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
	].join("; ");

	return [
		// Camera and mic for this site only; nothing else.
		{
			key: "Permissions-Policy",
			value: "camera=(self), microphone=(self), display-capture=(), geolocation=(), payment=(), usb=(), bluetooth=()",
		},
		// Other sites only learn our origin, never a room path.
		{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
		{ key: "X-Content-Type-Options", value: "nosniff" },
		// Old browsers' version of frame-ancestors 'none'.
		{ key: "X-Frame-Options", value: "DENY" },
		{ key: "Strict-Transport-Security", value: "max-age=63072000" },
		// Dev mode needs eval for React's tooling: CSP in production builds only.
		...(production ? [{ key: "Content-Security-Policy", value: csp }] : []),
	];
}
