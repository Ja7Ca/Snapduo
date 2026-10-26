import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@/i18n/config";
import { decideRoute } from "@/i18n/routing";

/** Applies the URL rules from i18n/routing.ts (see there for the why). */
export function proxy(request: NextRequest) {
	const decision = decideRoute(
		request.nextUrl.pathname,
		request.cookies.get(LOCALE_COOKIE)?.value,
		request.headers.get("accept-language"),
	);

	if (decision.kind === "redirect") {
		const url = request.nextUrl.clone();
		url.pathname = decision.pathname;
		return NextResponse.redirect(url, 308);
	}

	let response: NextResponse;
	if (decision.kind === "rewrite") {
		const url = request.nextUrl.clone();
		url.pathname = decision.pathname;
		response = NextResponse.rewrite(url);
	} else {
		response = NextResponse.next();
	}

	if (decision.rememberLocale && request.cookies.get(LOCALE_COOKIE)?.value !== decision.locale) {
		response.cookies.set(LOCALE_COOKIE, decision.locale, {
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
			sameSite: "lax",
		});
	}
	return response;
}

export const config = {
	// Everything except Next internals and files with an extension
	// (icons, robots.txt, sitemap.xml, manifest, images).
	matcher: ["/((?!_next/|api/|.*\\.[\\w]+$).*)"],
};
