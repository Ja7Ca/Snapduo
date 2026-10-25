import { DurableObject } from "cloudflare:workers";
import { PROTOCOL_VERSION } from "@snapduo/protocol";

/**
 * One RoomObject instance = one photobooth room.
 * Phase 0 will add WebSocket signaling here (Hibernation API).
 */
export class RoomObject extends DurableObject<Env> {
	async ping(): Promise<string> {
		return `room alive (protocol v${PROTOCOL_VERSION})`;
	}
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return Response.json({ ok: true, protocol: PROTOCOL_VERSION });
		}

		// Temporary smoke test: GET /rooms/<id>/ping
		const match = url.pathname.match(/^\/rooms\/([\w-]+)\/ping$/);
		if (match) {
			const stub = env.ROOM.getByName(match[1]);
			return new Response(await stub.ping());
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
