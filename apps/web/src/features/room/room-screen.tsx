"use client";

import { ROOM_ID_PATTERN } from "@snapduo/protocol";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { FlashOverlay } from "@/components/booth/capture-overlay";
import {
	OtherTabScreen,
	RoomFullScreen,
	RoomNotFoundScreen,
	UpdateScreen,
} from "@/components/site/message-screen";
import { useAudioLevel, useLocalMedia } from "@/features/media/use-local-media";
import { useI18n } from "@/i18n/client";
import { fetchRoomStatus } from "@/lib/signal-client";
import { DebugPanel } from "./debug-panel";
import { INITIAL_UI, liveRoomState, routeAction, type LocalUi } from "./live-view";
import type { RoomAction } from "./room-state";
import { RoomSession, rememberedSeat } from "./session";
import { BoothView } from "./views/booth-view";
import { PrejoinView } from "./views/prejoin-view";
import { ResultView } from "./views/result-view";
import { RoomHeader } from "./views/room-header";

const noopSubscribe = () => () => {};

/** The room page: pre-join, then the live booth and result. */
export function RoomScreen() {
	const { roomId } = useParams<{ roomId: string }>();
	if (!ROOM_ID_PATTERN.test(roomId)) return <RoomNotFoundScreen />;
	return <LiveRoom key={roomId} roomId={roomId} />;
}

type Precheck = "checking" | "ok" | "not_found" | "full";

function LiveRoom({ roomId }: { roomId: string }) {
	const router = useRouter();
	const search = useSearchParams();
	const { t } = useI18n();
	const debug = search.get("debug") === "1";
	const [session] = useState(() => new RoomSession(roomId, { forceRelay: search.get("relay") === "1", debug }));
	const s = useSyncExternalStore(session.subscribe, session.getState, session.getState);
	const media = useLocalMedia();
	const [ui, setUi] = useState<LocalUi>(INITIAL_UI);
	const [typedName, setTypedName] = useState<string | null>(null);
	const [now, setNow] = useState(0);
	const [precheck, setPrecheck] = useState<Precheck>("checking");

	const rememberedName = useSyncExternalStore(
		noopSubscribe,
		() => rememberedSeat(roomId)?.name ?? "",
		() => "",
	);
	const name = typedName ?? rememberedName;
	const roomUrl = useSyncExternalStore(
		noopSubscribe,
		() => `${window.location.origin}/r/${roomId}`,
		() => `/r/${roomId}`,
	);

	useEffect(() => {
		session.attach();
		return () => session.detach();
	}, [session]);

	useEffect(() => {
		session.setLocalStream(media.stream);
	}, [session, media.stream]);

	// Tell people early if the link is dead or the booth is taken, before
	// they set up their camera. Someone coming back to their own seat
	// (a reload) is let through even when the room shows as full.
	useEffect(() => {
		let cancelled = false;
		void fetchRoomStatus(roomId).then((status) => {
			if (cancelled) return;
			if (status === "not_found") setPrecheck("not_found");
			else if (status === "full" && !rememberedSeat(roomId)) setPrecheck("full");
			else setPrecheck("ok");
		});
		return () => {
			cancelled = true;
		};
	}, [roomId]);

	const view =
		s.room && s.selfId
			? liveRoomState({
					roomId,
					room: s.room,
					selfId: s.selfId,
					photos: s.photos,
					ui,
					now,
					offset: s.offset,
					selfName: name.trim(),
					micOn: media.micOn,
					reconnecting: s.status === "reconnecting",
					audioBlocked: s.audioBlocked,
					weakConnection: s.weakConnection,
					friendFallbackName: t.common.friend,
				})
			: null;

	// Clock for countdowns: fast while shooting, slow while a friend is away.
	const tickMs = view?.phase === "capturing" ? 100 : view?.friend && !view.friend.present ? 1000 : 0;
	useEffect(() => {
		if (!tickMs) return;
		const tick = () => setNow(Date.now());
		const first = setTimeout(tick, 0);
		const id = setInterval(tick, tickMs);
		return () => {
			clearTimeout(first);
			clearInterval(id);
		};
	}, [tickMs]);

	const dispatch = useCallback(
		(action: RoomAction) => {
			if (!view) return;
			const routed = routeAction(action, view, ui);
			if (routed.ui) setUi(routed.ui);
			if (routed.intent) session.send(routed.intent);
			if (routed.resumeAudio) session.resumeAudio();
		},
		[session, view, ui],
	);

	const leave = useCallback(() => {
		session.leave();
		media.stop();
		router.push("/");
	}, [session, media, router]);

	// Mic meter around your tile while you're in the booth.
	const selfLevel = useAudioLevel(media.stream, media.micOn && !!view && view.phase !== "result");

	const enter = useCallback(() => {
		session.enter(name.trim(), media.micOn);
	}, [session, name, media.micOn]);

	const failure = s.failure;
	if (precheck === "not_found" || failure === "not_found") return <RoomNotFoundScreen />;
	if (precheck === "full" || failure === "room_full") return <RoomFullScreen />;
	if (failure === "replaced") return <OtherTabScreen onUseHere={() => session.takeOver()} />;
	if (failure === "protocol_mismatch") return <UpdateScreen />;

	const debugPanel = debug ? <DebugPanel state={s} /> : null;

	if (s.status === "idle" || failure === "left") {
		return (
			<div className="flex min-h-dvh flex-col">
				<RoomHeader roomId={roomId} onLeave={leave} />
				<main className="flex-1 px-4 pt-2 pb-10">
					<PrejoinView media={media} name={name} onNameChange={setTypedName} onEnter={enter} />
				</main>
				{debugPanel}
			</div>
		);
	}

	if (!view) {
		return (
			<div className="flex min-h-dvh flex-col">
				<RoomHeader roomId={roomId} onLeave={leave} />
				<main className="flex flex-1 items-center justify-center px-4 pb-10">
					<p role="status" className="animate-pulse text-muted-foreground">
						{t.booth.connecting}
					</p>
				</main>
				{debugPanel}
			</div>
		);
	}

	return (
		<>
			{view.phase === "result" ? (
				<ResultView state={view} dispatch={dispatch} onLeave={leave} friendStream={s.remoteStream} />
			) : (
				<BoothView
					state={view}
					dispatch={dispatch}
					selfStream={media.stream}
					friendStream={s.remoteStream}
					micOn={media.micOn}
					micBlocked={media.micBlocked}
					canSwitchCamera={media.canSwitchCamera}
					onToggleMic={() => {
						session.setMic(!media.micOn);
						media.toggleMic();
					}}
					onSwitchCamera={() => void media.switchCamera()}
					onLeave={leave}
					roomUrl={roomUrl}
					now={now}
					selfSpeaking={selfLevel > 0.3}
				/>
			)}
			<FlashOverlay active={s.flash} />
			{debugPanel}
		</>
	);
}

