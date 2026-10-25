"use client";

import { ROOM_ID_PATTERN } from "@snapduo/protocol";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useState, useSyncExternalStore } from "react";
import { FlashOverlay } from "@/components/booth/capture-overlay";
import { RoomFullScreen, RoomNotFoundScreen } from "@/components/site/message-screen";
import { grabFrame, useAudioLevel, useLocalMedia } from "@/features/media/use-local-media";
import { mockPortrait, mockShot } from "@/features/mock/mock-photos";
import { createdKey } from "./room-id";
import { FRIEND_GRACE_MS, initialRoomState, roomReducer } from "./room-state";
import { BoothView } from "./views/booth-view";
import { PrejoinView } from "./views/prejoin-view";
import { PreviewControls } from "./views/preview-controls";
import { ResultView } from "./views/result-view";
import { RoomHeader } from "./views/room-header";

const MOCK_FRIEND = "Alex";
const FRIEND_PORTRAIT = mockPortrait(7);
const noopSubscribe = () => () => {};

/**
 * Phase 1 room page: real local camera, simulated friend.
 * Phase 2 swaps the simulation for the signaling server + peer connection
 * by dispatching the same actions.
 */
export function RoomScreen() {
	const { roomId } = useParams<{ roomId: string }>();
	const router = useRouter();
	const [state, dispatch] = useReducer(roomReducer, roomId, initialRoomState);
	const media = useLocalMedia();
	const [name, setName] = useState("");
	const [now, setNow] = useState(0);
	const [flash, setFlash] = useState(false);
	const selfLevel = useAudioLevel(media.stream, media.micOn && state.phase !== "prejoin");
	const roomUrl = useSyncExternalStore(
		noopSubscribe,
		() => `${window.location.origin}/r/${roomId}`,
		() => `/r/${roomId}`,
	);

	// Simulated friend: joins a few seconds after the creator enters.
	useEffect(() => {
		if (state.phase !== "waiting" || state.friend) return;
		const t = setTimeout(() => dispatch({ type: "FRIEND_JOINED", name: MOCK_FRIEND, micOn: true }), 4000);
		return () => clearTimeout(t);
	}, [state.phase, state.friend]);

	// Countdown → flash → photo. Phase 3 replaces this with the synced capture.
	const capture = state.capture;
	useEffect(() => {
		if (state.phase !== "capturing" || !capture) return;
		if (capture.countdown > 0) {
			const t = setTimeout(() => dispatch({ type: "TICK" }), 1000);
			return () => clearTimeout(t);
		}
		let cancelled = false;
		const slot = capture.queue[capture.index];
		void (async () => {
			setFlash(true);
			const self = media.stream ? await grabFrame(media.stream, true) : null;
			if (cancelled) return;
			const mock = mockShot(slot + capture.index * 3);
			dispatch({ type: "SHOT_TAKEN", shot: { ...mock, self: self ?? mock.self } });
			setTimeout(() => setFlash(false), 120);
		})();
		return () => {
			cancelled = true;
		};
	}, [state.phase, capture, media.stream]);

	// Friend-away countdown; their seat is released after the grace period.
	const awaySince = state.friend?.awaySince ?? null;
	useEffect(() => {
		if (awaySince === null) return;
		const tick = () => {
			const t = Date.now();
			setNow(t);
			if (t - awaySince >= FRIEND_GRACE_MS) dispatch({ type: "FRIEND_GONE" });
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [awaySince]);

	const leave = useCallback(() => {
		media.stop();
		router.push("/");
	}, [media, router]);

	const enter = useCallback(() => {
		let isCreator = false;
		try {
			isCreator = sessionStorage.getItem(createdKey(roomId)) === "1";
		} catch {
			// Storage blocked: treat as guest.
		}
		dispatch({
			type: "ENTER_BOOTH",
			// Empty = the view shows the translated "You".
			name: name.trim(),
			micOn: media.micOn,
			isCreator,
			friend: isCreator
				? null
				: { name: MOCK_FRIEND, micOn: true, present: true, awaySince: null, weakConnection: false },
		});
	}, [media.micOn, name, roomId]);

	if (!ROOM_ID_PATTERN.test(roomId) || state.issue === "not-found") return <RoomNotFoundScreen />;
	if (state.issue === "room-full") return <RoomFullScreen />;

	return (
		<>
			{state.phase === "prejoin" ? (
				<div className="flex min-h-dvh flex-col">
					<RoomHeader roomId={roomId} onLeave={leave} />
					<main className="flex-1 px-4 pt-2 pb-10">
						<PrejoinView media={media} name={name} onNameChange={setName} onEnter={enter} />
					</main>
				</div>
			) : state.phase === "result" ? (
				<ResultView state={state} dispatch={dispatch} onLeave={leave} friendPlaceholder={FRIEND_PORTRAIT} preview />
			) : (
				<BoothView
					state={state}
					dispatch={dispatch}
					selfStream={media.stream}
					friendPlaceholder={FRIEND_PORTRAIT}
					micOn={media.micOn}
					micBlocked={media.micBlocked}
					canSwitchCamera={media.canSwitchCamera}
					onToggleMic={() => {
						media.toggleMic();
						dispatch({ type: "TOGGLE_MIC" });
					}}
					onSwitchCamera={() => void media.switchCamera()}
					onLeave={leave}
					roomUrl={roomUrl}
					now={now}
					selfSpeaking={selfLevel > 0.3}
				/>
			)}
			<FlashOverlay active={flash} />
			{state.phase !== "prejoin" && <PreviewControls state={state} dispatch={dispatch} friendName={MOCK_FRIEND} />}
		</>
	);
}
