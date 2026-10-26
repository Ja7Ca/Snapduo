"use client";

import type { SessionState } from "./session";

/**
 * Connection details for testing on real networks: open a room with
 * ?debug=1 (add &relay=1 to force the TURN relay). Developer-facing, so
 * not translated.
 */
export function DebugPanel({ state }: { state: SessionState }) {
	const me = state.room?.seats.find((s) => s.peerId === state.selfId);
	const friend = state.room?.seats.find((s) => s.peerId !== state.selfId);
	const st = state.debug.stats;
	const rows: [string, string][] = [
		["socket", state.status + (state.failure ? ` (${state.failure})` : "")],
		["seat", me ? `${me.seat} · epoch ${me.epoch}` : "–"],
		["friend", friend ? `${friend.seat} · ${friend.present ? "here" : "away"} · epoch ${friend.epoch}` : "–"],
		["room v", String(state.room?.version ?? "–")],
		["clock", `${Math.round(state.offset)} ms · rtt ${state.debug.rttMs ?? "–"} ms`],
		["turn", state.debug.turn === null ? "…" : state.debug.turn ? "yes" : "stun only"],
		["peer", state.peerState],
		["path", st ? `${st.localCandidate} ↔ ${st.remoteCandidate} (${st.protocol})` : "–"],
		["media", st ? `rtt ${st.rttMs ?? "–"} ms · ↑${st.sendKbps ?? "–"} ↓${st.recvKbps ?? "–"} kbps` : "–"],
		["photos", String(state.photos.size)],
	];
	return (
		<aside
			aria-label="Connection details"
			className="fixed bottom-2 left-2 z-50 max-w-[calc(100vw-1rem)] rounded-lg bg-black/80 p-2 font-mono text-[11px] leading-snug text-white"
		>
			<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
				{rows.map(([k, v]) => (
					<div key={k} className="contents">
						<dt className="text-white/60">{k}</dt>
						<dd className="truncate" data-debug={k}>
							{v}
						</dd>
					</div>
				))}
			</dl>
		</aside>
	);
}
