import { SELF, env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import {
	MAX_SHARE_BYTES,
	PROTOCOL_VERSION,
	SHARES_PER_SEAT,
	type CreateRoomResponse,
	type CreateShareResponse,
	type ServerMessage,
	type ShareInfo,
} from "@snapduo/protocol";
import { describe, expect, it } from "vitest";
import type { ShareObject } from "../src/share";

const ORIGIN = "http://localhost:3000";
const BASE = "https://signal.test";

/** A room with one person in it; returns their seat token. */
async function seatInRoom(): Promise<{ roomId: string; token: string; ws: WebSocket }> {
	const res = await SELF.fetch(`${BASE}/rooms`, { method: "POST", headers: { Origin: ORIGIN } });
	const { roomId } = (await res.json()) as CreateRoomResponse;
	const up = await SELF.fetch(`${BASE}/rooms/${roomId}/ws?v=${PROTOCOL_VERSION}`, {
		headers: { Upgrade: "websocket", Origin: ORIGIN },
	});
	const ws = up.webSocket!;
	ws.accept();
	const welcome = new Promise<string>((resolve) =>
		ws.addEventListener("message", (e) => {
			const msg = JSON.parse(e.data as string) as ServerMessage;
			if (msg.type === "welcome") resolve(msg.token);
		}),
	);
	ws.send(JSON.stringify({ type: "join", name: "Ana", micOn: true }));
	return { roomId, token: await welcome, ws };
}

/** A fake JPEG: correct first bytes, then filler. */
function jpeg(size: number, fill = 7): Uint8Array {
	const b = new Uint8Array(size).fill(fill);
	b.set([0xff, 0xd8, 0xff, 0xe0]);
	return b;
}

function upload(roomId: string, token: string, body: Uint8Array, origin = ORIGIN) {
	return SELF.fetch(`${BASE}/shares`, {
		method: "POST",
		headers: { Origin: origin, "X-Room-Id": roomId, Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
		body,
	});
}

describe("creating a share link", () => {
	it("stores the strip and returns an id, a delete token and a 24 h deadline", async () => {
		const { roomId, token } = await seatInRoom();
		const before = Date.now();
		const res = await upload(roomId, token, jpeg(5000));
		expect(res.status).toBe(201);
		const share = (await res.json()) as CreateShareResponse;
		expect(share.id).toMatch(/^[a-z2-9]{16}$/);
		expect(share.deleteToken).toBeTruthy();
		expect(share.expiresAt - before).toBeGreaterThanOrEqual(24 * 3600_000 - 1000);
	});

	it("refuses people who aren't in the room, other sites, non-JPEGs and huge files", async () => {
		const { roomId, token } = await seatInRoom();
		expect((await upload(roomId, "not-a-seat", jpeg(100))).status).toBe(401);
		expect((await upload(roomId, token, jpeg(100), "https://evil.com")).status).toBe(403);
		expect((await upload(roomId, token, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]))).status).toBe(415);
		expect((await upload(roomId, token, jpeg(MAX_SHARE_BYTES + 1))).status).toBe(413);
	});

	it(`allows ${SHARES_PER_SEAT} links per person per room`, async () => {
		const { roomId, token } = await seatInRoom();
		for (let i = 0; i < SHARES_PER_SEAT; i++) expect((await upload(roomId, token, jpeg(100))).status).toBe(201);
		const res = await upload(roomId, token, jpeg(100));
		expect(res.status).toBe(429);
		expect(await res.json()).toEqual({ error: "limit" });
	});
});

describe("opening a share link", () => {
	it("returns info and the exact bytes, to any page, even when bigger than one storage value", async () => {
		const { roomId, token } = await seatInRoom();
		const body = jpeg(2_500_000, 42); // > 2 MB: stored as 3 chunks
		const { id } = (await (await upload(roomId, token, body)).json()) as CreateShareResponse;

		const info = await SELF.fetch(`${BASE}/shares/${id}`);
		expect(info.headers.get("Access-Control-Allow-Origin")).toBe("*");
		const meta = (await info.json()) as ShareInfo;
		expect(meta).toMatchObject({ id, bytes: body.byteLength, contentType: "image/jpeg" });
		expect(JSON.stringify(meta)).not.toContain("deleteToken");

		const img = await SELF.fetch(`${BASE}/shares/${id}/image`); // no Origin, like an <img>
		expect(img.status).toBe(200);
		expect(img.headers.get("Content-Type")).toBe("image/jpeg");
		expect(img.headers.get("Cache-Control")).toMatch(/^private, max-age=\d+$/);
		const got = new Uint8Array(await img.arrayBuffer());
		expect(got.byteLength).toBe(body.byteLength);
		expect(got.every((v, i) => v === body[i])).toBe(true);
	});

	it("unknown ids are not found", async () => {
		expect((await SELF.fetch(`${BASE}/shares/aaaaaaaaaaaaaaaa`)).status).toBe(404);
		expect((await SELF.fetch(`${BASE}/shares/bad`)).status).toBe(404);
	});
});

describe("deleting", () => {
	it("needs the delete token; afterwards the link is gone", async () => {
		const { roomId, token } = await seatInRoom();
		const { id, deleteToken } = (await (await upload(roomId, token, jpeg(100))).json()) as CreateShareResponse;
		const del = (t: string) =>
			SELF.fetch(`${BASE}/shares/${id}`, { method: "DELETE", headers: { Origin: ORIGIN, Authorization: `Bearer ${t}` } });
		expect((await del("wrong")).status).toBe(403);
		expect((await SELF.fetch(`${BASE}/shares/${id}`)).status).toBe(200);
		expect((await del(deleteToken)).status).toBe(204);
		expect((await SELF.fetch(`${BASE}/shares/${id}/image`)).status).toBe(404);
	});

	it("disappears at 24 h: refused right at the deadline, wiped by the alarm", async () => {
		const { roomId, token } = await seatInRoom();
		const { id } = (await (await upload(roomId, token, jpeg(100))).json()) as CreateShareResponse;
		const stub = env.SHARE.getByName(id);

		// Pretend the day is over but the alarm hasn't run yet.
		await runInDurableObject(stub, async (_obj: ShareObject, state) => {
			const meta = (await state.storage.get<ShareInfo>("meta"))!;
			await state.storage.put("meta", { ...meta, expiresAt: Date.now() - 1 });
		});
		expect((await SELF.fetch(`${BASE}/shares/${id}`)).status).toBe(410);
		expect((await SELF.fetch(`${BASE}/shares/${id}`)).status).toBe(404); // and it's wiped

		// The alarm path on its own also wipes everything.
		const { id: id2 } = (await (await upload(roomId, token, jpeg(100))).json()) as CreateShareResponse;
		const stub2 = env.SHARE.getByName(id2);
		expect(await runDurableObjectAlarm(stub2)).toBe(true);
		const left = await runInDurableObject(stub2, async (_obj: ShareObject, state) => (await state.storage.list()).size);
		expect(left).toBe(0);
		expect((await SELF.fetch(`${BASE}/shares/${id2}`)).status).toBe(404);
	});
});
