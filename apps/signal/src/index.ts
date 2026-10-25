import { PROTOCOL_VERSION, ROOM_ID_PATTERN } from "@snapduo/protocol";
import { getIceServers } from "./turn";

export { RoomObject } from "./room";

/** Comma-separated list in wrangler vars, e.g. "http://localhost:3000,https://snapduo.vercel.app" */
function allowedOrigins(env: Env): string[] {
	return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(origin: string | null, env: Env): HeadersInit {
	if (!origin || !allowedOrigins(env).includes(origin)) return {};
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		Vary: "Origin",
	};
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
		// Rejecting unknown origins stops other sites from using our TURN quota.
		const originOk = origin !== null && allowedOrigins(env).includes(origin);

		if (url.pathname === "/turn-credentials") {
			if (!originOk) return new Response("Forbidden origin", { status: 403 });
			return Response.json(await getIceServers(env), {
				headers: { ...cors, "Cache-Control": "no-store" },
			});
		}

		const ws = url.pathname.match(/^\/rooms\/([^/]+)\/ws$/);
		if (ws) {
			if (!originOk) return new Response("Forbidden origin", { status: 403 });
			const roomId = ws[1];
			if (!ROOM_ID_PATTERN.test(roomId)) return new Response("Bad room id", { status: 400 });
			return env.ROOM.getByName(roomId).fetch(request);
		}

		return new Response("Not found", { status: 404, headers: cors });
	},
} satisfies ExportedHandler<Env>;
