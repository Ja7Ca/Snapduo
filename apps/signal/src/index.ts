import {
	PROTOCOL_VERSION,
	ROOM_ID_PATTERN,
	roomIdFromBytes,
	type CreateRoomResponse,
	type RoomStatusResponse,
} from "@snapduo/protocol";
import { originAllowed } from "./origins";
import { getIceServers } from "./turn";

export { RoomObject } from "./room";

function corsHeaders(origin: string | null, env: Env): HeadersInit {
	if (!originAllowed(origin, env.ALLOWED_ORIGINS)) return {};
	return {
		"Access-Control-Allow-Origin": origin!,
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		Vary: "Origin",
	};
}

async function createRoom(env: Env): Promise<string | null> {
	// 60 random bits: a clash is practically impossible, but cheap to handle.
	for (let attempt = 0; attempt < 3; attempt++) {
		const roomId = roomIdFromBytes(crypto.getRandomValues(new Uint8Array(12)));
		if (await env.ROOM.getByName(roomId).create()) return roomId;
	}
	return null;
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		const origin = request.headers.get("Origin");
		const cors = corsHeaders(origin, env);

		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: cors });
		}

		if (url.pathname === "/health") {
			return Response.json({ ok: true, protocol: PROTOCOL_VERSION }, { headers: cors });
		}

		// Browsers always send Origin on WebSocket and cross-site fetches.
		// Rejecting unknown origins stops other sites from using our quota.
		if (!originAllowed(origin, env.ALLOWED_ORIGINS)) {
			return new Response("Forbidden origin", { status: 403 });
		}
		const noStore = { ...cors, "Cache-Control": "no-store" };

		if (url.pathname === "/turn-credentials" && request.method === "GET") {
			return Response.json(await getIceServers(env), { headers: noStore });
		}

		if (url.pathname === "/rooms" && request.method === "POST") {
			const roomId = await createRoom(env);
			if (!roomId) return new Response("Try again", { status: 503, headers: noStore });
			return Response.json({ roomId } satisfies CreateRoomResponse, { status: 201, headers: noStore });
		}

		const route = url.pathname.match(/^\/rooms\/([^/]+)(\/ws)?$/);
		if (route) {
			const [, roomId, ws] = route;
			if (!ROOM_ID_PATTERN.test(roomId)) return new Response("Bad room id", { status: 400, headers: cors });
			const stub = env.ROOM.getByName(roomId);
			if (ws) return stub.fetch(request);
			if (request.method === "GET") {
				return Response.json({ status: await stub.status() } satisfies RoomStatusResponse, { headers: noStore });
			}
		}

		return new Response("Not found", { status: 404, headers: cors });
	},
} satisfies ExportedHandler<Env>;
