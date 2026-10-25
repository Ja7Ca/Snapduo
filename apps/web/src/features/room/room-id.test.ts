import { describe, expect, it } from "vitest";
import { newRoomId, parseRoomInput } from "./room-id";

describe("room ids", () => {
	it("generates valid, distinct ids", () => {
		const ids = new Set(Array.from({ length: 500 }, newRoomId));
		expect(ids.size).toBe(500);
		for (const id of ids) expect(parseRoomInput(id)).toBe(id);
	});

	it("reads a code or a full link", () => {
		expect(parseRoomInput("  k7m2pq9xa4bc ")).toBe("k7m2pq9xa4bc");
		expect(parseRoomInput("https://snapduo.ja7ca.web.id/r/k7m2pq9xa4bc")).toBe("k7m2pq9xa4bc");
		expect(parseRoomInput("snapduo.ja7ca.web.id/r/k7m2pq9xa4bc?x=1")).toBe("k7m2pq9xa4bc");
	});

	it("rejects junk", () => {
		expect(parseRoomInput("")).toBeNull();
		expect(parseRoomInput("abc")).toBeNull();
		expect(parseRoomInput("https://example.com/hello world")).toBeNull();
	});
});
