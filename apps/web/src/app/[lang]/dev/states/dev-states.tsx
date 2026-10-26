"use client";

import Link from "next/link";
import { useSyncExternalStore, type Dispatch } from "react";
import { RoomFullScreen, RoomNotFoundScreen, PhotoGoneScreen } from "@/components/site/message-screen";
import type { CameraStatus } from "@/features/media/use-local-media";
import { mockPortrait, mockShot } from "@/features/mock/mock-photos";
import { initialRoomState, roomReducer, type RoomAction, type RoomState } from "@/features/room/room-state";
import { BoothView } from "@/features/room/views/booth-view";
import { PrejoinView } from "@/features/room/views/prejoin-view";
import { ResultView } from "@/features/room/views/result-view";
import { RoomHeader } from "@/features/room/views/room-header";

const NOW = 1_000_000_000;
const ROOM = "k7m2pq9xa4bc";
const SELF = mockPortrait(4);
const FRIEND = mockPortrait(7);
const noop: Dispatch<RoomAction> = () => {};
const run = (...actions: RoomAction[]) => actions.reduce(roomReducer, initialRoomState(ROOM));

const enter: RoomAction = { type: "ENTER_BOOTH", name: "Jarot", micOn: true, isCreator: true, friend: null };
const join: RoomAction = { type: "FRIEND_JOINED", name: "Alex", micOn: true };
const shots = (n: number): RoomAction[] => [
	{ type: "START_CAPTURE", by: "self" },
	...Array.from({ length: n }, (_, i): RoomAction => ({ type: "SHOT_TAKEN", shot: mockShot(i, i === 2) })),
];
const full = [enter, join, ...shots(4)];

function prejoin(status: CameraStatus, micBlocked = false) {
	const media = {
		status,
		stream: null,
		micBlocked,
		micOn: !micBlocked,
		canSwitchCamera: true,
		request: async () => {},
		toggleMic: () => {},
		switchCamera: async () => {},
	};
	return function Prejoin() {
		return (
			<div className="flex min-h-dvh flex-col">
				<RoomHeader roomId={ROOM} onLeave={() => {}} />
				<main className="flex-1 px-4 pt-2 pb-10">
					<PrejoinView media={media} name="Jarot" onNameChange={() => {}} onEnter={() => {}} fallbackSrc={SELF} />
				</main>
			</div>
		);
	};
}

function booth(state: RoomState) {
	return function Booth() {
		return (
			<BoothView
				state={state}
				dispatch={noop}
				selfStream={null}
				selfPlaceholder={SELF}
				friendPlaceholder={FRIEND}
				micOn
				micBlocked={false}
				canSwitchCamera
				onToggleMic={() => {}}
				onSwitchCamera={() => {}}
				onLeave={() => {}}
				roomUrl={`https://snapduo.ja7ca.web.id/r/${ROOM}`}
				now={NOW}
			/>
		);
	};
}

function result(state: RoomState, shared = false) {
	return function Result() {
		return <ResultView state={state} dispatch={noop} onLeave={() => {}} friendPlaceholder={FRIEND} initialShared={shared} />;
	};
}

export const STATES: Record<string, () => React.ReactNode> = {
	"prejoin-ask": prejoin("idle"),
	"prejoin-ready": prejoin("ready"),
	"prejoin-mic-blocked": prejoin("ready", true),
	"prejoin-camera-blocked": prejoin("blocked"),
	"prejoin-camera-busy": prejoin("busy"),
	waiting: booth(run(enter)),
	"booth-empty": booth(run(enter, join)),
	"booth-partial": booth(run(enter, join, { type: "START_CAPTURE", by: "self" }, { type: "SHOT_TAKEN", shot: mockShot(0) }, { type: "FRIEND_AWAY", at: NOW }, { type: "FRIEND_BACK" })),
	"booth-full": booth(run(...full)),
	"booth-retake": booth(run(...full, { type: "SELECT_SLOT", slot: 1 })),
	"booth-friend-picked": booth(run(enter, join, { type: "SELECT_FRAME", frameId: "grid-white", by: "friend" })),
	"booth-weak-muted": booth(run(enter, join, { type: "FRIEND_CONNECTION", weak: true }, { type: "FRIEND_MIC", micOn: false })),
	capturing: booth(run(enter, join, { type: "START_CAPTURE", by: "self" }, { type: "SHOT_TAKEN", shot: mockShot(0) })),
	"capturing-retake": booth(run(...full, { type: "SELECT_SLOT", slot: 2 }, { type: "START_CAPTURE", by: "self" }, { type: "TICK" })),
	"friend-away": booth(run(...full, { type: "FRIEND_AWAY", at: NOW - 13_000 })),
	reconnecting: booth(run(enter, join, { type: "RECONNECTING", value: true })),
	"audio-blocked": booth(run(enter, join, { type: "AUDIO_BLOCKED", value: true })),
	"frame-confirm": booth(run(...full, { type: "SELECT_FRAME", frameId: "duo-cream", by: "self" })),
	"duo-frame": booth(run(enter, join, { type: "SELECT_FRAME", frameId: "duo-cream", by: "self" }, ...shots(2))),
	result: result(run(...full, { type: "FINISH", by: "self" })),
	"result-shared": result(run(...full, { type: "FINISH", by: "self" }), true),
	"result-friend-finished": result(run(...full, { type: "FINISH", by: "friend" })),
	"result-grid": result(run(enter, join, { type: "SELECT_FRAME", frameId: "grid-white", by: "self" }, ...shots(4), { type: "FINISH", by: "self" })),
	"room-full": () => <RoomFullScreen />,
	"room-not-found": () => <RoomNotFoundScreen />,
	"photo-gone": () => <PhotoGoneScreen />,
};

const subscribe = () => () => {};

export function DevStates() {
	const selected = useSyncExternalStore(
		subscribe,
		() => new URLSearchParams(window.location.search).get("s"),
		() => null,
	);

	const Render = selected ? STATES[selected] : null;
	if (Render) return <Render />;

	return (
		<main className="mx-auto max-w-3xl p-6">
			<h1 className="text-3xl font-bold">Room states</h1>
			<p className="mt-1 text-muted-foreground">Development only. Every screen the room can show, with mock data.</p>
			<ul className="mt-6 grid gap-1 sm:grid-cols-2">
				{Object.keys(STATES).map((name) => (
					<li key={name}>
						<Link className="font-mono text-sm underline underline-offset-4" href={`/dev/states?s=${name}`}>
							{name}
						</Link>
					</li>
				))}
			</ul>
		</main>
	);
}
