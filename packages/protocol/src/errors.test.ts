import { describe, expect, it } from "vitest";
import { sanitizeReport, scrubPath } from "./errors";

describe("error reports", () => {
	it("keeps the path but hides room and share ids, query and hash", () => {
		expect(scrubPath("/en/r/k7m2pq9xa4bc?debug=1#x")).toBe("/en/r/:room");
		expect(scrubPath("/p/abcdefghjkmnpqrs")).toBe("/p/:share");
		expect(scrubPath("/about")).toBe("/about");
	});

	it("scrubs ids and tokens hidden in messages and stacks", () => {
		const r = sanitizeReport({
			kind: "error",
			message: "fetch https://signal.example/rooms/k7m2pq9xa4bc/ws failed (token 3f2a1b4c-1111-4222-8333-444455556666)",
			stack: "at https://snapduo.ja7ca.web.id/p/abcdefghjkmnpqrs:1:2",
			path: "/r/k7m2pq9xa4bc",
		})!;
		expect(r.message).toBe("fetch https://signal.example/rooms/:room/ws failed (token :uuid)");
		expect(r.stack).toBe("at https://snapduo.ja7ca.web.id/p/:share:1:2");
		expect(r.path).toBe("/r/:room");
	});

	it("rejects junk and trims oversized fields", () => {
		expect(sanitizeReport(null)).toBeNull();
		expect(sanitizeReport({ kind: "hack", message: "x", path: "/" })).toBeNull();
		expect(sanitizeReport({ kind: "error", path: "/" })).toBeNull();
		const r = sanitizeReport({ kind: "react", message: "m".repeat(5000), path: "/", extra: "dropped" })!;
		expect(r.message).toHaveLength(500);
		expect(r).not.toHaveProperty("extra");
	});
});
