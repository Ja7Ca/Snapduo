import { describe, expect, it } from "vitest";
import { CHUNK_BYTES, MAX_PHOTO_BYTES, PhotoChannel, type ChannelLike } from "./photo-channel";

/** Two in-memory channel ends that deliver to each other asynchronously. */
function pair(): [FakeChannel, FakeChannel] {
	const a = new FakeChannel();
	const b = new FakeChannel();
	a.other = b;
	b.other = a;
	return [a, b];
}

class FakeChannel implements ChannelLike {
	readyState = "connecting";
	bufferedAmount = 0;
	bufferedAmountLowThreshold = 0;
	binaryType = "blob";
	other: FakeChannel | null = null;
	sent: (string | ArrayBuffer)[] = [];
	private listeners: Record<string, ((e: { data: unknown }) => void)[]> = {};

	addEventListener(type: string, fn: (e: { data: unknown }) => void): void {
		(this.listeners[type] ??= []).push(fn);
	}
	emit(type: string, data?: unknown): void {
		for (const fn of this.listeners[type] ?? []) fn({ data });
	}
	send(data: string | ArrayBuffer): void {
		if (this.readyState !== "open") throw new Error("closed");
		this.sent.push(data);
		const target = this.other!;
		queueMicrotask(() => target.readyState === "open" && target.emit("message", data));
	}
	open(): void {
		this.readyState = "open";
		this.emit("open");
	}
	close(): void {
		this.readyState = "closed";
		this.emit("close");
	}
}

const tick = () => new Promise((r) => setTimeout(r, 10));
const blobOf = (size: number, fill = 7) => new Blob([new Uint8Array(size).fill(fill)], { type: "image/jpeg" });

function side(channel: FakeChannel, have: string[] = []) {
	const received = new Map<string, Blob>();
	const asked: string[][] = [];
	const pc = new PhotoChannel(channel, {
		have: () => [...have, ...received.keys()],
		onPeerHave: (keys) => asked.push(keys),
		onPhoto: (key, blob) => received.set(key, blob),
	});
	return { pc, received, asked };
}

describe("PhotoChannel", () => {
	it("tells the other side what it already has when the channel opens", async () => {
		const [ca, cb] = pair();
		const a = side(ca, ["c1:0"]);
		const b = side(cb);
		ca.open();
		cb.open();
		await tick();
		expect(b.asked).toEqual([["c1:0"]]);
		expect(a.asked).toEqual([[]]);
	});

	it("sends a photo in chunks and rebuilds it byte for byte", async () => {
		const [ca, cb] = pair();
		const a = side(ca);
		const b = side(cb);
		ca.open();
		cb.open();
		const size = CHUNK_BYTES * 2 + 123;
		a.pc.send("c1:0", blobOf(size, 42));
		await tick();
		const got = b.received.get("c1:0")!;
		expect(got.size).toBe(size);
		expect(new Uint8Array(await got.arrayBuffer()).every((v) => v === 42)).toBe(true);
		// begin + 3 chunks + end
		expect(ca.sent.filter((d) => d instanceof ArrayBuffer)).toHaveLength(3);
	});

	it("waits for the channel to open before sending", async () => {
		const [ca, cb] = pair();
		const a = side(ca);
		const b = side(cb);
		a.pc.send("c1:1", blobOf(100));
		await tick();
		expect(b.received.size).toBe(0);
		cb.open();
		ca.open();
		await tick();
		expect(b.received.has("c1:1")).toBe(true);
	});

	it("drops a photo cut off by a closed channel, so it can be resent later", async () => {
		const [ca, cb] = pair();
		const b = side(cb);
		ca.open();
		cb.open();
		// Simulate: begin + one chunk arrive, then the line dies.
		cb.emit("message", JSON.stringify({ t: "begin", key: "c2:0", size: CHUNK_BYTES * 2 }));
		cb.emit("message", new ArrayBuffer(CHUNK_BYTES));
		cb.close();
		cb.emit("message", JSON.stringify({ t: "end", key: "c2:0" }));
		expect(b.received.size).toBe(0);
	});

	it("refuses oversized or mismatched transfers", async () => {
		const [, cb] = pair();
		const b = side(cb);
		cb.open();
		cb.emit("message", JSON.stringify({ t: "begin", key: "big", size: MAX_PHOTO_BYTES + 1 }));
		cb.emit("message", new ArrayBuffer(10));
		cb.emit("message", JSON.stringify({ t: "end", key: "big" }));
		cb.emit("message", JSON.stringify({ t: "begin", key: "short", size: 100 }));
		cb.emit("message", new ArrayBuffer(50));
		cb.emit("message", JSON.stringify({ t: "end", key: "short" }));
		expect(b.received.size).toBe(0);
	});
});
