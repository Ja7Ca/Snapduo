import { SELF, env } from "cloudflare:test";
import {
	PER_DAY,
	PER_MINUTE,
	PROTOCOL_VERSION,
	SOCKET_MAX_MESSAGES,
	type CreateRoomResponse,
	type IceServersResponse,
	type ServerMessage,
} from "@snapduo/protocol";
import { describe, expect, it } from "vitest";
import { quotaKey } from "../src/limits";

const ORIGIN = "http://localhost:3000";
const BASE = "https://signal.test";

const createRoom = (ip: string) =>
	SELF.fetch(`${BASE}/rooms`, { method: "POST", headers: { Origin: ORIGIN, "CF-Connecting-IP": ip } });

async function seat(ip: string): Promise<{ roomId: string; token: string; ws: WebSocket }> {
	const { roomId } = (await (await createRoom(ip)).json()) as CreateRoomResponse;
	const up = await SELF.fetch(`${BASE}/rooms/${roomId}/ws?v=${PROTOCOL_VERSION}`, {
		headers: { Upgrade: "websocket", Origin: ORIGIN, "CF-Connecting-IP": ip },
	});
	const ws = up.webSocket!;
	ws.accept();
	const token = await new Promise<string>((resolve) => {
		ws.addEventListener("message", (e) => {
			const msg = JSON.parse(e.data as string) as ServerMessage;
			if (msg.type === "welcome") resolve(msg.token);
		});
		ws.send(JSON.stringify({ type: "join", name: "Ana", micOn: true }));
	});
	return { roomId, token, ws };
}

describe("per-minute limits", () => {
	it(`creating rooms: ${PER_MINUTE.rooms} a minute per IP, then 429 with Retry-After`, async () => {
		const ip = "203.0.113.10";
		for (let i = 0; i < PER_MINUTE.rooms; i++) expect((await createRoom(ip)).status).toBe(201);
		const res = await createRoom(ip);
		expect(res.status).toBe(429);
		expect(res.headers.get("Retry-After")).toBe("60");
		expect(await res.json()).toEqual({ error: "rate_limited" });
		// Someone else is unaffected.
		expect((await createRoom("203.0.113.11")).status).toBe(201);
	});
});

describe("daily quota", () => {
	it("counts exactly per IP per day and resets with a new key", async () => {
		const key = quotaKey("198.51.100.7", Date.UTC(2026, 9, 27, 12));
		expect(key).toBe("198.51.100.7:2026-10-27");
		const stub = env.QUOTA.getByName(key);
		for (let i = 0; i < PER_DAY.shares; i++) expect(await stub.take("shares")).toBe(true);
		expect(await stub.take("shares")).toBe(false);
		// Other kinds and other days have their own count.
		expect(await stub.take("rooms")).toBe(true);
		expect(await env.QUOTA.getByName(quotaKey("198.51.100.7", Date.UTC(2026, 9, 28, 1))).take("shares")).toBe(true);
	});
});

describe("TURN credentials", () => {
	const turn = (headers: Record<string, string>) =>
		SELF.fetch(`${BASE}/turn-credentials`, { headers: { Origin: ORIGIN, "CF-Connecting-IP": "192.0.2.50", ...headers } });

	it("are only for someone sitting in the room", async () => {
		const { roomId, token } = await seat("192.0.2.51");
		expect((await turn({})).status).toBe(401);
		expect((await turn({ "X-Room-Id": roomId, Authorization: "Bearer nope" })).status).toBe(401);
		const ok = await turn({ "X-Room-Id": roomId, Authorization: `Bearer ${token}` });
		expect(ok.status).toBe(200);
		expect(((await ok.json()) as IceServersResponse).iceServers.length).toBeGreaterThan(0);
	});
});

describe("socket flooding", () => {
	it("closes a socket that sends far more than a real client", async () => {
		const { ws } = await seat("192.0.2.60");
		const closed = new Promise<number>((resolve) => ws.addEventListener("close", (e) => resolve(e.code)));
		for (let i = 0; i <= SOCKET_MAX_MESSAGES; i++) ws.send(JSON.stringify({ type: "time", t0: i }));
		expect(await closed).toBe(4002);
	});

	it("leaves a normal amount of traffic alone", async () => {
		const { ws } = await seat("192.0.2.61");
		let closed = false;
		ws.addEventListener("close", () => (closed = true));
		for (let i = 0; i < 50; i++) ws.send(JSON.stringify({ type: "time", t0: i }));
		await new Promise((r) => setTimeout(r, 200));
		expect(closed).toBe(false);
	});
});

describe("error reports", () => {
	const send = (body: string, origin = ORIGIN) =>
		SELF.fetch(`${BASE}/errors`, {
			method: "POST",
			headers: { Origin: origin, "Content-Type": "text/plain", "CF-Connecting-IP": "192.0.2.70" },
			body,
		});

	it("logs a clean report from our site, without room ids", async () => {
		const logged: string[] = [];
		const original = console.error;
		console.error = (line: string) => logged.push(line);
		try {
			const res = await send(JSON.stringify({ kind: "error", message: "boom in /r/k7m2pq9xa4bc", path: "/en/r/k7m2pq9xa4bc?debug=1" }));
			expect(res.status).toBe(204);
		} finally {
			console.error = original;
		}
		const entry = JSON.parse(logged.find((l) => l.includes("client_error"))!);
		expect(entry).toMatchObject({ event: "client_error", kind: "error", message: "boom in /r/:room", path: "/en/r/:room" });
	});

	it("refuses other sites, junk and huge bodies", async () => {
		expect((await send("{}", "https://evil.com")).status).toBe(403);
		expect((await send("not json")).status).toBe(400);
		expect((await send(JSON.stringify({ kind: "error", message: "x".repeat(9000), path: "/" }))).status).toBe(413);
	});
});
