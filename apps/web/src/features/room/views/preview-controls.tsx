"use client";

import { FlaskConical, X } from "lucide-react";
import { useState, type Dispatch } from "react";
import { Button } from "@/components/ui/button";
import type { RoomAction, RoomState } from "@/features/room/room-state";
import { useI18n } from "@/i18n/client";

/** Read at click time, not during render. */
const nowMs = () => Date.now();

/**
 * Phase 1 only: the friend is simulated, so this panel lets you play their
 * part. Deleted in Phase 2 when real people connect.
 */
export function PreviewControls({
	state,
	dispatch,
	friendName,
}: {
	state: RoomState;
	dispatch: Dispatch<RoomAction>;
	friendName: string;
}) {
	const [open, setOpen] = useState(false);
	const { t, fmt } = useI18n();
	const p = t.preview;
	const f = state.friend;
	const name = { name: friendName };

	const actions: { label: string; run: () => void; show: boolean }[] = [
		{ label: fmt(p.joins, name), run: () => dispatch({ type: "FRIEND_JOINED", name: friendName, micOn: true }), show: !f },
		{ label: fmt(p.drops, name), run: () => dispatch({ type: "FRIEND_AWAY", at: nowMs() }), show: !!f?.present },
		{ label: fmt(p.back, name), run: () => dispatch({ type: "FRIEND_BACK" }), show: !!f && !f.present },
		{ label: fmt(p.gone, name), run: () => dispatch({ type: "FRIEND_GONE" }), show: !!f },
		{ label: fmt(f?.micOn ? p.mute : p.unmute, name), run: () => dispatch({ type: "FRIEND_MIC", micOn: !f?.micOn }), show: !!f },
		{ label: f?.weakConnection ? p.good : p.weak, run: () => dispatch({ type: "FRIEND_CONNECTION", weak: !f?.weakConnection }), show: !!f },
		{ label: fmt(p.picksGrid, name), run: () => dispatch({ type: "SELECT_FRAME", frameId: "grid-white", by: "friend" }), show: !!f && state.phase === "booth" },
		{ label: fmt(p.pressesDone, name), run: () => dispatch({ type: "FINISH", by: "friend" }), show: state.phase === "booth" },
		{ label: state.reconnecting ? p.backOnline : p.loseConnection, run: () => dispatch({ type: "RECONNECTING", value: !state.reconnecting }), show: true },
		{ label: p.blockSound, run: () => dispatch({ type: "AUDIO_BLOCKED", value: true }), show: !state.audioBlocked },
		{ label: p.roomFull, run: () => dispatch({ type: "ROOM_ISSUE", issue: "room-full" }), show: true },
	];

	return (
		<div className="fixed bottom-4 left-4 z-40 print:hidden">
			{open ? (
				<div className="w-64 rounded-2xl border border-border bg-card p-3 shadow-sheet">
					<div className="mb-2 flex items-center justify-between">
						<p className="text-sm font-semibold">{p.title}</p>
						<Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label={p.close}>
							<X aria-hidden="true" />
						</Button>
					</div>
					<p className="mb-3 text-xs text-muted-foreground">{fmt(p.body, name)}</p>
					<div className="flex flex-col gap-1.5">
						{actions
							.filter((a) => a.show)
							.map((a) => (
								<Button key={a.label} variant="secondary" size="sm" className="justify-start" onClick={a.run}>
									{a.label}
								</Button>
							))}
					</div>
				</div>
			) : (
				<Button variant="inverted" size="sm" onClick={() => setOpen(true)} className="shadow-sheet">
					<FlaskConical aria-hidden="true" />
					{p.button}
				</Button>
			)}
		</div>
	);
}
