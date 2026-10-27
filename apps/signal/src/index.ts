import {
	MAX_ERROR_REPORT_BYTES,
	MAX_SHARE_BYTES,
	PROTOCOL_VERSION,
	ROOM_ID_PATTERN,
	SHARE_ID_PATTERN,
	isJpeg,
	roomIdFromBytes,
	sanitizeReport,
	shareIdFromBytes,
	type CreateRoomResponse,
	type CreateShareResponse,
	type RateLimitedResponse,
	type RoomStatusResponse,
	type ShareError,
} from "@snapduo/protocol";
import { clientIp, overRate, takeQuota } from "./limits";
import { originAllowed } from "./origins";
import { getIceServers } from "./turn";

export { QuotaObject } from "./limits";
export { RoomObject } from "./room";
export { ShareObject } from "./share";

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
	if (!originAllowed(origin, env.ALLOWED_ORIGINS)) return {};
	return {
		"Access-Control-Allow-Origin": origin!,
		"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Room-Id",
		Vary: "Origin",
	};
}

/** Share links are public to whoever has them: readable from any page. */
const PUBLIC_READ = { "Access-Control-Allow-Origin": "*", "X-Robots-Tag": "noindex" };

async function createRoom(env: Env): Promise<string | null> {
	// 60 random bits: a clash is practically impossible, but cheap to handle.
	for (let attempt = 0; attempt < 3; attempt++) {
		const roomId = roomIdFromBytes(crypto.getRandomValues(new Uint8Array(12)));
		if (await env.ROOM.getByName(roomId).create()) return roomId;
	}
	return null;
}

function shareError(code: ShareError, status: number, headers: HeadersInit): Response {
	return Response.json({ error: code }, { status, headers });
}

function rateLimited(headers: HeadersInit): Response {
	return Response.json({ error: "rate_limited" } satisfies RateLimitedResponse, {
		status: 429,
		headers: { ...headers, "Retry-After": "60" },
	});
}

/** Bearer token from the Authorization header ("" if none). */
function bearer(request: Request): string {
	return (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
}

/** POST /shares — body: the JPEG; headers: X-Room-Id + Authorization: Bearer <seat token>. */
async function createShare(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
	const roomId = request.headers.get("X-Room-Id") ?? "";
	const token = bearer(request);
	if (!ROOM_ID_PATTERN.test(roomId) || !token) return shareError("unauthorized", 401, headers);
	if (await overRate(env.RL_SHARES, clientIp(request))) return rateLimited(headers);

	const declared = Number(request.headers.get("Content-Length") ?? 0);
	if (declared > MAX_SHARE_BYTES) return shareError("too_large", 413, headers);
	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.byteLength > MAX_SHARE_BYTES) return shareError("too_large", 413, headers);
	if (!isJpeg(bytes)) return shareError("not_jpeg", 415, headers);

	// Only someone holding a seat in that room, a few times per room, and
	// a few dozen times per IP per day (storage is the costly part).
	if (!(await takeQuota(env, request, "shares"))) return rateLimited(headers);
	const claim = await env.ROOM.getByName(roomId).claimShare(token);
	if (claim === "unauthorized") return shareError("unauthorized", 401, headers);
	if (claim === "limit") return shareError("limit", 429, headers);

	for (let attempt = 0; attempt < 3; attempt++) {
		const id = shareIdFromBytes(crypto.getRandomValues(new Uint8Array(16)));
		const created = await env.SHARE.getByName(id).create(id, bytes, "image/jpeg");
		if (created) {
			return Response.json({ id, ...created } satisfies CreateShareResponse, { status: 201, headers });
		}
	}
	return new Response("Try again", { status: 503, headers });
}

async function shareRoute(request: Request, env: Env, id: string, image: boolean, headers: Record<string, string>): Promise<Response> {
	const stub = env.SHARE.getByName(id);

	if (request.method === "DELETE" && !image) {
		const ok = await stub.remove(bearer(request));
		return new Response(null, { status: ok ? 204 : 403, headers });
	}
	if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers });

	const read = { ...PUBLIC_READ, "Cache-Control": "no-store" };
	if (!image) {
		const info = await stub.info();
		if (info === null) return shareError("not_found", 404, read);
		if (info === "gone") return shareError("not_found", 410, read);
		return Response.json(info, { headers: read });
	}

	const result = await stub.image();
	if (result === null) return new Response("Not found", { status: 404, headers: read });
	if (result === "gone") return new Response("Gone", { status: 410, headers: read });
	// Browsers may keep it until it expires, never longer (and never shared caches).
	const maxAge = Math.max(0, Math.min(3600, Math.floor((result.info.expiresAt - Date.now()) / 1000)));
	return new Response(result.bytes, {
		headers: {
			...PUBLIC_READ,
			"Content-Type": result.info.contentType,
			"Content-Length": String(result.bytes.byteLength),
			"Cache-Control": `private, max-age=${maxAge}`,
		},
	});
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

		// Reading a share link: anyone with the link, from any page (an <img>
		// sends no Origin at all).
		const share = url.pathname.match(/^\/shares\/([^/]+)(\/image)?$/);
		if (share && request.method === "GET") {
			const [, id, image] = share;
			if (!SHARE_ID_PATTERN.test(id)) return new Response("Not found", { status: 404, headers: PUBLIC_READ });
			if (await overRate(env.RL_READS, clientIp(request))) return rateLimited(PUBLIC_READ);
			return shareRoute(request, env, id, !!image, {});
		}

		// Everything else: only our own site. Browsers always send Origin on
		// WebSocket and cross-site fetches; this stops other sites from using
		// our TURN quota, rooms or storage.
		if (!originAllowed(origin, env.ALLOWED_ORIGINS)) {
			return new Response("Forbidden origin", { status: 403 });
		}
		const noStore = { ...cors, "Cache-Control": "no-store" };

		// TURN relays any traffic, and past the free allowance it is billed:
		// credentials only for someone sitting in a room.
		if (url.pathname === "/turn-credentials" && request.method === "GET") {
			const roomId = request.headers.get("X-Room-Id") ?? "";
			const token = bearer(request);
			if (!ROOM_ID_PATTERN.test(roomId) || !token) return new Response("Unauthorized", { status: 401, headers: noStore });
			if (await overRate(env.RL_TURN, clientIp(request))) return rateLimited(noStore);
			if (!(await env.ROOM.getByName(roomId).hasSeat(token))) {
				return new Response("Unauthorized", { status: 401, headers: noStore });
			}
			return Response.json(await getIceServers(env), { headers: noStore });
		}

		if (url.pathname === "/rooms" && request.method === "POST") {
			if (await overRate(env.RL_ROOMS, clientIp(request))) return rateLimited(noStore);
			if (!(await takeQuota(env, request, "rooms"))) return rateLimited(noStore);
			const roomId = await createRoom(env);
			if (!roomId) return new Response("Try again", { status: 503, headers: noStore });
			return Response.json({ roomId } satisfies CreateRoomResponse, { status: 201, headers: noStore });
		}

		// Error reports from browsers → Workers Logs (see protocol/errors.ts).
		if (url.pathname === "/errors" && request.method === "POST") {
			if (await overRate(env.RL_ERRORS, clientIp(request))) return new Response(null, { status: 429, headers: cors });
			const declared = Number(request.headers.get("Content-Length") ?? 0);
			if (declared > MAX_ERROR_REPORT_BYTES) return new Response(null, { status: 413, headers: cors });
			const text = await request.text();
			if (text.length > MAX_ERROR_REPORT_BYTES) return new Response(null, { status: 413, headers: cors });
			let report: ReturnType<typeof sanitizeReport> = null;
			try {
				report = sanitizeReport(JSON.parse(text));
			} catch {
				// not JSON
			}
			if (!report) return new Response(null, { status: 400, headers: cors });
			console.error(JSON.stringify({ event: "client_error", ...report }));
			return new Response(null, { status: 204, headers: cors });
		}

		if (url.pathname === "/shares" && request.method === "POST") {
			return createShare(request, env, noStore);
		}
		if (share) {
			const [, id, image] = share;
			if (!SHARE_ID_PATTERN.test(id)) return new Response("Not found", { status: 404, headers: noStore });
			return shareRoute(request, env, id, !!image, noStore);
		}

		const route = url.pathname.match(/^\/rooms\/([^/]+)(\/ws)?$/);
		if (route) {
			const [, roomId, ws] = route;
			if (!ROOM_ID_PATTERN.test(roomId)) return new Response("Bad room id", { status: 400, headers: cors });
			const stub = env.ROOM.getByName(roomId);
			if (ws) {
				// Too many connections from one IP: refuse before the upgrade.
				if (await overRate(env.RL_SOCKETS, clientIp(request))) return rateLimited(noStore);
				return stub.fetch(request);
			}
			if (request.method === "GET") {
				return Response.json({ status: await stub.status() } satisfies RoomStatusResponse, { headers: noStore });
			}
		}

		return new Response("Not found", { status: 404, headers: cors });
	},
} satisfies ExportedHandler<Env>;
