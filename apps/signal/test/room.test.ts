import { SELF, env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import {
	CloseCode,
	PROTOCOL_VERSION,
	type ClientMessage,
	type CreateRoomResponse,
	type RoomStatusResponse,
	type ServerMessage,
	type ServerRoom,
} from "@snapduo/protocol";
import { describe, expect, it } from "vitest";
import { originAllowed } from "../src/origins";
import type { RoomObject } from "../src/room";

const ORIGIN = "http://localhost:3000";
const BASE = "https://signal.test";

/** Each request from its own address, so per-IP limits don't leak between tests. */
let ipCounter = 0;
const fakeIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

type Msg<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;

/** A test client: collects messages and lets a test wait for one type. */
async function connect(roomId: string, version = PROTOCOL_VERSION) {
	const res = await SELF.fetch(`${BASE}/rooms/${roomId}/ws?v=${version}`, {
		headers: { Upgrade: "websocket", Origin: ORIGIN, "CF-Connecting-IP": fakeIp() },
	});
	const ws = res.webSocket;
	if (!ws) throw new Error(`no websocket (${res.status})`);
	ws.accept();

	const inbox: ServerMessage[] = [];
	let wake: (() => void) | null = null;
	let closed: { code: number } | null = null;
	ws.addEventListener("message", (e) => {
		inbox.push(JSON.parse(e.data as string));
		wake?.();
	});
	ws.addEventListener("close", (e) => {
		closed = { code: e.code };
		wake?.();
	});

	const client = {
		ws,
		send: (msg: ClientMessage) => ws.send(JSON.stringify(msg)),
		async next<T extends ServerMessage["type"]>(type: T, timeoutMs = 2000): Promise<Msg<T>> {
			const deadline = Date.now() + timeoutMs;
			for (;;) {
				const i = inbox.findIndex((m) => m.type === type);
				if (i >= 0) return inbox.splice(i, 1)[0] as Msg<T>;
				if (Date.now() > deadline) throw new Error(`timed out waiting for "${type}"`);
				await new Promise<void>((r) => {
					wake = r;
					setTimeout(r, 50);
				});
			}
		},
		async closedWith(timeoutMs = 2000): Promise<number> {
			const deadline = Date.now() + timeoutMs;
			while (!closed && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
			if (!closed) throw new Error("socket did not close");
			return (closed as { code: number }).code;
		},
		/** Drop everything received so far. */
		clear: () => inbox.splice(0),
	};
	return client;
}

async function createRoom(): Promise<string> {
	const res = await SELF.fetch(`${BASE}/rooms`, { method: "POST", headers: { Origin: ORIGIN, "CF-Connecting-IP": fakeIp() } });
	expect(res.status).toBe(201);
	return ((await res.json()) as CreateRoomResponse).roomId;
}

async function joinAs(roomId: string, name: string, token?: string) {
	const c = await connect(roomId);
	c.send({ type: "join", name, micOn: true, token });
	const welcome = await c.next("welcome");
	return { ...c, welcome };
}

async function status(roomId: string) {
	const res = await SELF.fetch(`${BASE}/rooms/${roomId}`, { headers: { Origin: ORIGIN, "CF-Connecting-IP": fakeIp() } });
	return ((await res.json()) as RoomStatusResponse).status;
}

describe("origins", () => {
	const list = "http://localhost:3000, https://snapduo-git-*-ja7ca.vercel.app";
	it("matches exact entries and one-label wildcards only", () => {
		expect(originAllowed("http://localhost:3000", list)).toBe(true);
		expect(originAllowed("https://snapduo-git-feat-phase2-room-ja7ca.vercel.app", list)).toBe(true);
		expect(originAllowed("https://snapduo-git-x.evil.com-ja7ca.vercel.app", list)).toBe(false);
		expect(originAllowed("https://evil.com/snapduo-git-x-ja7ca.vercel.app", list)).toBe(false);
		expect(originAllowed(null, list)).toBe(false);
	});

	it("refuses unknown origins for rooms and TURN", async () => {
		const res = await SELF.fetch(`${BASE}/rooms`, { method: "POST", headers: { Origin: "https://evil.com", "CF-Connecting-IP": fakeIp() } });
		expect(res.status).toBe(403);
	});
});

describe("rooms over HTTP", () => {
	it("creates a room with a readable id; unknown ids are not found", async () => {
		const id = await createRoom();
		expect(id).toMatch(/^[a-z2-9]{12}$/);
		expect(await status(id)).toBe("open");
		expect(await status("doesnotexist1")).toBe("not_found");
	});
});

describe("joining", () => {
	it("refuses a room that was never created", async () => {
		const c = await connect("neverCreated1");
		expect((await c.next("error")).code).toBe("not_found");
		expect(await c.closedWith()).toBe(CloseCode.NotFound);
	});

	it("refuses an old client with a clear error", async () => {
		const c = await connect(await createRoom(), 1);
		expect((await c.next("error")).code).toBe("protocol_mismatch");
	});

	it("seats two people and turns the third away", async () => {
		const id = await createRoom();
		const a = await joinAs(id, "Ana");
		expect(a.welcome.seat).toBe("A");
		expect(a.welcome.room.seats).toHaveLength(1);

		const b = await joinAs(id, "Bo");
		expect(b.welcome.seat).toBe("B");
		// Ana hears about Bo.
		const update = await a.next("room");
		expect(update.room.seats.map((s) => s.name)).toEqual(["Ana", "Bo"]);
		expect(JSON.stringify(update)).not.toContain(b.welcome.token);
		expect(await status(id)).toBe("full");

		const c = await connect(id);
		c.send({ type: "join", name: "Cy", micOn: true });
		expect((await c.next("error")).code).toBe("room_full");
	});
});

describe("in the room", () => {
	async function pair() {
		const id = await createRoom();
		const a = await joinAs(id, "Ana");
		const b = await joinAs(id, "Bo");
		await a.next("room");
		return { id, a, b };
	}

	it("applies a change and tells both", async () => {
		const { a, b } = await pair();
		a.send({ type: "intent", intent: { type: "set-timer", timer: 5 } });
		expect((await a.next("room")).room.timer).toBe(5);
		expect((await b.next("room")).room.timer).toBe(5);
	});

	it("answers a refused change with the current state, to that client only", async () => {
		const { a, b } = await pair();
		a.send({ type: "intent", intent: { type: "finish" } }); // no photos yet
		expect((await a.next("room")).room.phase).toBe("booth");
		await expect(b.next("room", 300)).rejects.toThrow();
	});

	it("starts a capture for both with a shared start time", async () => {
		const { a, b } = await pair();
		const before = Date.now();
		b.send({ type: "intent", intent: { type: "start-capture", slot: null } });
		const [ra, rb] = [await a.next("room"), await b.next("room")];
		expect(ra.room.capture).toEqual(rb.room.capture);
		expect(ra.room.capture!.startedBy).toBe(b.welcome.selfId);
		expect(ra.room.capture!.startAt).toBeGreaterThanOrEqual(before);
	});

	it("relays signals to the other person, tagged with the sender", async () => {
		const { a, b } = await pair();
		a.send({ type: "signal", key: "1:1", data: { kind: "candidate", candidate: null } });
		const got = await b.next("signal");
		expect(got).toMatchObject({ from: a.welcome.selfId, key: "1:1", data: { kind: "candidate", candidate: null } });
		await expect(a.next("signal", 300)).rejects.toThrow();
	});

	it("answers time requests for clock sync", async () => {
		const { a } = await pair();
		a.send({ type: "time", t0: 123 });
		const t = await a.next("time");
		expect(t.t0).toBe(123);
		expect(Math.abs(t.serverNow - Date.now())).toBeLessThan(5000);
	});
});

describe("reconnecting", () => {
	it("holds the seat when the connection drops and gives it back with the token", async () => {
		const id = await createRoom();
		const a = await joinAs(id, "Ana");
		const b = await joinAs(id, "Bo");
		await a.next("room");

		b.ws.close(1001, "gone");
		const away = await a.next("room");
		expect(away.room.seats[1]).toMatchObject({ present: false });
		expect(away.room.seats[1].awayUntil).toBeGreaterThan(Date.now());

		const back = await joinAs(id, "Bo", b.welcome.token);
		expect(back.welcome.selfId).toBe(b.welcome.selfId);
		expect(back.welcome.seat).toBe("B");
		expect(back.welcome.room.seats[1]).toMatchObject({ present: true, epoch: 2 });
		expect((await a.next("room")).room.seats[1].present).toBe(true);
	});

	it("a second tab with the same seat replaces the first", async () => {
		const id = await createRoom();
		const a1 = await joinAs(id, "Ana");
		const a2 = await joinAs(id, "Ana", a1.welcome.token);
		expect((await a1.next("error")).code).toBe("replaced");
		expect(await a1.closedWith()).toBe(CloseCode.Replaced);
		expect(a2.welcome.room.seats).toHaveLength(1);
		expect(a2.welcome.room.seats[0].present).toBe(true);
	});

	it("releases the seat once the grace period is over", async () => {
		const id = await createRoom();
		const a = await joinAs(id, "Ana");
		const b = await joinAs(id, "Bo");
		await a.next("room");
		b.ws.close(1001, "gone");
		await a.next("room");

		// Pretend two minutes passed.
		const stub = env.ROOM.getByName(id);
		await runInDurableObject(stub, async (_obj: RoomObject, state) => {
			const room = (await state.storage.get<ServerRoom>("room"))!;
			room.seats[1].awayUntil = Date.now() - 1;
			await state.storage.put("room", room);
		});
		// The object reads storage when it starts: restart it with the new data.
		await runInDurableObject(stub, async (obj: RoomObject, state) => {
			(obj as unknown as { room: ServerRoom | null }).room = (await state.storage.get<ServerRoom>("room"))!;
		});
		expect(await runDurableObjectAlarm(stub)).toBe(true);

		const released = await a.next("room");
		expect(released.room.seats.map((s) => s.name)).toEqual(["Ana"]);
		expect(await status(id)).toBe("open");
	});

	it("pressing Leave frees the seat right away", async () => {
		const id = await createRoom();
		const a = await joinAs(id, "Ana");
		const b = await joinAs(id, "Bo");
		await a.next("room");
		b.send({ type: "leave" });
		expect(await b.closedWith()).toBe(CloseCode.Left);
		expect((await a.next("room")).room.seats).toHaveLength(1);
	});
});
