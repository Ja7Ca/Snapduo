/**
 * Error reports from browsers (POST /errors on the Worker), written to
 * Workers Logs so failures on other people's phones become visible.
 *
 * Nothing personal goes in: no IP, no names, no query strings, and room
 * and share ids (which work like passwords: whoever has one can join or
 * view) are replaced with placeholders.
 */
export const MAX_ERROR_REPORT_BYTES = 8 * 1024;

export type ErrorKind = "error" | "unhandledrejection" | "react";

export interface ErrorReport {
	kind: ErrorKind;
	message: string;
	stack?: string;
	/** Path only, ids scrubbed, e.g. "/en/r/:room". */
	path: string;
	/** Short browser description, e.g. "Mobile Safari 18". */
	browser?: string;
	/** Web build id, to tie a report to a deploy. */
	release?: string;
}

const KINDS: readonly ErrorKind[] = ["error", "unhandledrejection", "react"];

/** "/en/r/k7m2pq9xa4bc?x=1#y" → "/en/r/:room" */
export function scrubPath(path: string): string {
	const clean = (path.split(/[?#]/)[0] || "/").slice(0, 200);
	return clean
		.replace(/\/r\/[^/]+/, "/r/:room")
		.replace(/\/p\/[^/]+/, "/p/:share");
}

/** Room/share ids and long tokens inside free text (messages, stacks). */
function scrubText(text: string): string {
	return text
		.replace(/\/r\/[A-Za-z0-9_-]{8,64}/g, "/r/:room")
		.replace(/\/p\/[a-z2-9]{16}/g, "/p/:share")
		.replace(/\/shares\/[a-z2-9]{16}/g, "/shares/:share")
		.replace(/\/rooms\/[A-Za-z0-9_-]{8,64}/g, "/rooms/:room")
		.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":uuid");
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** Validates and cleans an untrusted report; null if it isn't one. */
export function sanitizeReport(raw: unknown): ErrorReport | null {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	const kind = KINDS.find((k) => k === r.kind);
	const message = str(r.message, 500);
	const path = str(r.path, 300);
	if (!kind || !message || path === undefined) return null;
	const stack = str(r.stack, 3000);
	return {
		kind,
		message: scrubText(message),
		...(stack ? { stack: scrubText(stack) } : {}),
		path: scrubPath(path),
		...(str(r.browser, 80) ? { browser: str(r.browser, 80) } : {}),
		...(str(r.release, 40) ? { release: str(r.release, 40) } : {}),
	};
}
