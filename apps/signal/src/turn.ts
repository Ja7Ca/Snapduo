import type { IceServersResponse } from "@snapduo/protocol";

const STUN_ONLY: IceServersResponse = {
	iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
	turn: false,
};

/** Credentials live 2 hours: longer than any realistic photobooth session. */
const TTL_SECONDS = 2 * 60 * 60;

/**
 * Asks Cloudflare Realtime for short-lived TURN credentials.
 * The TURN key itself never leaves the Worker.
 */
export async function getIceServers(env: Env): Promise<IceServersResponse> {
	if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
		console.warn("TURN_KEY_ID / TURN_KEY_API_TOKEN not set — returning STUN only");
		return STUN_ONLY;
	}

	const res = await fetch(
		`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ ttl: TTL_SECONDS }),
		},
	);

	if (!res.ok) {
		console.error("TURN credential request failed", res.status, await res.text());
		return STUN_ONLY;
	}

	const data = (await res.json()) as { iceServers: IceServersResponse["iceServers"] };

	// Browsers block port 53; Cloudflare's docs recommend dropping those URLs.
	const iceServers = data.iceServers.map((server) => {
		const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(
			(url) => !/:53(\?|$)/.test(url),
		);
		return { ...server, urls };
	});

	return { iceServers, turn: true };
}
