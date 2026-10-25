"use client";

import { isPolite, type ServerMessage } from "@snapduo/protocol";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Peer, readStats, type ConnectionStats } from "@/lib/peer";
import { fetchIceServers, SIGNAL_URL, SignalClient, signalConfigError } from "@/lib/signal-client";

type Phase = "idle" | "starting" | "in-room" | "error";

const noopSubscribe = () => () => {};

function randomRoomId(): string {
	const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
	const bytes = crypto.getRandomValues(new Uint8Array(12));
	return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function getMedia(log: (l: string) => void): Promise<MediaStream> {
	const video: MediaTrackConstraints = {
		facingMode: "user",
		width: { ideal: 640 },
		height: { ideal: 480 },
		frameRate: { ideal: 24, max: 30 },
	};
	try {
		return await navigator.mediaDevices.getUserMedia({
			video,
			audio: { echoCancellation: true, noiseSuppression: true },
		});
	} catch (err) {
		log(`camera+mic failed (${(err as Error).name}) → trying camera only`);
		return navigator.mediaDevices.getUserMedia({ video, audio: false });
	}
}

/**
 * Phase 0 connection spike. Deliberately ugly: the goal is to prove that
 * two devices on different networks can see and hear each other.
 */
export function Spike() {
	// Room id comes from ?room=…; a new one is created on first join.
	const urlRoom = useSyncExternalStore(
		noopSubscribe,
		() => new URLSearchParams(window.location.search).get("room") ?? "",
		() => "",
	);
	const [createdRoom, setCreatedRoom] = useState("");
	const roomId = urlRoom || createdRoom;
	const [forceRelay, setForceRelay] = useState(false);
	const [phase, setPhase] = useState<Phase>("idle");
	const [peerState, setPeerState] = useState<string>("—");
	const [turnEnabled, setTurnEnabled] = useState<boolean | null>(null);
	const [candidates, setCandidates] = useState<Record<string, number>>({});
	const [stats, setStats] = useState<ConnectionStats | null>(null);
	const [logs, setLogs] = useState<string[]>([]);

	const localVideo = useRef<HTMLVideoElement>(null);
	const remoteVideo = useRef<HTMLVideoElement>(null);
	const localStream = useRef<MediaStream | null>(null);
	const signal = useRef<SignalClient | null>(null);
	const peer = useRef<Peer | null>(null);
	const selfId = useRef<string>("");
	const iceServers = useRef<RTCIceServer[]>([]);

	const log = useCallback((line: string) => {
		const time = new Date().toLocaleTimeString();
		setLogs((prev) => [`${time}  ${line}`, ...prev].slice(0, 200));
	}, []);

	useEffect(() => {
		if (phase !== "in-room") return;
		const timer = setInterval(async () => {
			if (peer.current) setStats(await readStats(peer.current.pc));
		}, 2000);
		return () => clearInterval(timer);
	}, [phase]);

	const closePeer = useCallback(() => {
		peer.current?.close();
		peer.current = null;
		if (remoteVideo.current) remoteVideo.current.srcObject = null;
		setPeerState("—");
		setStats(null);
	}, []);

	const createPeer = useCallback(
		(peerId: string) => {
			closePeer();
			if (!localStream.current) return;
			const polite = isPolite(selfId.current, peerId);
			log(`creating peer with ${peerId.slice(0, 8)} (${polite ? "polite" : "impolite"})`);
			peer.current = new Peer({
				iceServers: iceServers.current,
				forceRelay,
				polite,
				localStream: localStream.current,
				sendSignal: (data) => signal.current?.send({ type: "signal", data }),
				onRemoteStream: (stream) => {
					if (remoteVideo.current && remoteVideo.current.srcObject !== stream) {
						remoteVideo.current.srcObject = stream;
					}
				},
				onStateChange: setPeerState,
				onLocalCandidate: (type) => setCandidates((c) => ({ ...c, [type]: (c[type] ?? 0) + 1 })),
				log,
			});
		},
		[closePeer, forceRelay, log],
	);

	const handleMessage = useCallback(
		(msg: ServerMessage) => {
			switch (msg.type) {
				case "welcome":
					selfId.current = msg.selfId;
					log(`joined as ${msg.selfId.slice(0, 8)}, peers in room: ${msg.peers.length}`);
					setPhase("in-room");
					if (msg.peers[0]) createPeer(msg.peers[0]);
					break;
				case "peer-joined":
					log(`friend joined: ${msg.peerId.slice(0, 8)}`);
					createPeer(msg.peerId);
					break;
				case "peer-left":
					log(`friend left: ${msg.peerId.slice(0, 8)}`);
					closePeer();
					break;
				case "signal":
					peer.current?.handleSignal(msg.data);
					break;
				case "error":
					log(`server error: ${msg.code} — ${msg.message}`);
					setPhase("error");
					break;
			}
		},
		[closePeer, createPeer, log],
	);

	const join = useCallback(async () => {
		setPhase("starting");
		let id = roomId;
		if (!id) {
			id = randomRoomId();
			const url = new URL(window.location.href);
			url.searchParams.set("room", id);
			window.history.replaceState(null, "", url);
			setCreatedRoom(id);
		}
		try {
			localStream.current = await getMedia(log);
			if (localVideo.current) localVideo.current.srcObject = localStream.current;
			log(`media: ${localStream.current.getTracks().map((t) => t.kind).join(" + ")}`);

			const configError = signalConfigError();
			if (configError) throw new Error(configError);
			log(`signal server: ${SIGNAL_URL}`);
			setCandidates({});

			const ice = await fetchIceServers();
			iceServers.current = ice.iceServers;
			setTurnEnabled(ice.turn);
			log(ice.turn ? "TURN credentials received" : "⚠ no TURN key on server — STUN only");

			signal.current = new SignalClient(id, handleMessage, (code, reason) => {
				log(`signal closed: ${code} ${reason}`);
			});
			signal.current.connect();
		} catch (err) {
			log(`start failed: ${String(err)}`);
			setPhase("error");
		}
	}, [handleMessage, log, roomId]);

	const leave = useCallback(() => {
		closePeer();
		signal.current?.close();
		signal.current = null;
		localStream.current?.getTracks().forEach((t) => t.stop());
		localStream.current = null;
		if (localVideo.current) localVideo.current.srcObject = null;
		setPhase("idle");
		log("left room");
	}, [closePeer, log]);

	useEffect(() => () => leave(), [leave]);

	const shareUrl = roomId ? `${window.location.origin}/spike?room=${roomId}` : "";

	return (
		<main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 font-mono text-sm">
			<h1 className="text-lg font-bold">Snapduo · connection spike (Phase 0)</h1>

			<section className="flex flex-col gap-2 rounded border p-3">
				<div>
					room: <b>{roomId || "(new room on join)"}</b>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						className="rounded border px-3 py-1"
						onClick={() => navigator.clipboard.writeText(shareUrl)}
						disabled={!shareUrl}
					>
						copy link
					</button>
					<label className="flex items-center gap-1">
						<input
							type="checkbox"
							checked={forceRelay}
							disabled={phase !== "idle"}
							onChange={(e) => setForceRelay(e.target.checked)}
						/>
						force relay (TURN only)
					</label>
				</div>
				<div className="flex gap-2">
					{phase === "idle" || phase === "error" ? (
						<button className="rounded bg-orange-500 px-4 py-2 font-bold text-black" onClick={join}>
							join
						</button>
					) : (
						<button className="rounded border px-4 py-2" onClick={leave}>
							leave
						</button>
					)}
				</div>
			</section>

			<section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<figure>
					<video
						ref={localVideo}
						autoPlay
						playsInline
						muted
						className="aspect-[4/3] w-full -scale-x-100 rounded bg-black object-cover"
					/>
					<figcaption>you</figcaption>
				</figure>
				<figure>
					<video ref={remoteVideo} autoPlay playsInline className="aspect-[4/3] w-full rounded bg-black object-cover" />
					<figcaption>friend · {peerState}</figcaption>
				</figure>
			</section>

			<section className="rounded border p-3">
				<div>phase: {phase}</div>
				<div>turn on server: {turnEnabled === null ? "—" : String(turnEnabled)}</div>
				<div>force relay: {String(forceRelay)}</div>
				<div className="break-all">signal: {SIGNAL_URL}</div>
				<div>
					local candidates: host {candidates.host ?? 0} · srflx {candidates.srflx ?? 0} · relay {candidates.relay ?? 0}
					{forceRelay && phase === "in-room" && peerState !== "—" && !candidates.relay && " ⚠ no relay candidates: TURN unreachable"}
				</div>
				{stats ? (
					<>
						<div>
							path: <b>{stats.localCandidate}</b> ↔ <b>{stats.remoteCandidate}</b> ({stats.protocol})
						</div>
						<div>rtt: {stats.rttMs ?? "—"} ms</div>
						<div>
							video send/recv: {stats.sendKbps ?? "—"} / {stats.recvKbps ?? "—"} kbps
						</div>
					</>
				) : (
					<div>path: —</div>
				)}
			</section>

			<section className="max-h-72 overflow-auto rounded border p-3 text-xs">
				{logs.map((line, i) => (
					<div key={i}>{line}</div>
				))}
			</section>
		</main>
	);
}
