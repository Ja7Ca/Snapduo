"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Own camera + mic, with the permission states the pre-join screen shows.
 * Shared by the room page now and the real connection in Phase 2.
 */
export type CameraStatus =
	| "idle" // not asked yet
	| "requesting"
	| "ready"
	| "blocked" // permission denied
	| "busy" // in use by another app
	| "missing" // no camera at all
	| "error";

export interface LocalMedia {
	status: CameraStatus;
	stream: MediaStream | null;
	/** Mic permission was refused; camera still works. */
	micBlocked: boolean;
	micOn: boolean;
	facing: "user" | "environment";
	canSwitchCamera: boolean;
	request: () => Promise<void>;
	toggleMic: () => void;
	switchCamera: () => Promise<void>;
	stop: () => void;
}

const VIDEO: MediaTrackConstraints = {
	width: { ideal: 1280 },
	height: { ideal: 960 },
	frameRate: { ideal: 24, max: 30 },
};
const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true };

function classify(err: unknown): CameraStatus {
	const name = (err as DOMException)?.name;
	if (name === "NotAllowedError" || name === "SecurityError") return "blocked";
	if (name === "NotReadableError" || name === "AbortError") return "busy";
	if (name === "NotFoundError" || name === "OverconstrainedError") return "missing";
	return "error";
}

export function useLocalMedia(): LocalMedia {
	const [status, setStatus] = useState<CameraStatus>("idle");
	const [stream, setStream] = useState<MediaStream | null>(null);
	const [micBlocked, setMicBlocked] = useState(false);
	const [micOn, setMicOn] = useState(true);
	const [facing, setFacing] = useState<"user" | "environment">("user");
	const [canSwitchCamera, setCanSwitchCamera] = useState(false);
	const streamRef = useRef<MediaStream | null>(null);

	const replaceStream = useCallback((next: MediaStream | null) => {
		streamRef.current?.getTracks().forEach((t) => t.stop());
		streamRef.current = next;
		setStream(next);
	}, []);

	const detectCameras = useCallback(async () => {
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			setCanSwitchCamera(devices.filter((d) => d.kind === "videoinput").length > 1);
		} catch {
			setCanSwitchCamera(false);
		}
	}, []);

	const open = useCallback(
		async (facingMode: "user" | "environment") => {
			if (!navigator.mediaDevices?.getUserMedia) {
				setStatus("error");
				return;
			}
			setStatus("requesting");
			const video = { ...VIDEO, facingMode };
			try {
				const s = await navigator.mediaDevices.getUserMedia({ video, audio: AUDIO });
				setMicBlocked(false);
				replaceStream(s);
				setStatus("ready");
				void detectCameras();
			} catch (err) {
				const kind = classify(err);
				// Mic refused or missing but camera may still work: retry video only.
				if (kind === "blocked" || kind === "missing" || kind === "busy") {
					try {
						const s = await navigator.mediaDevices.getUserMedia({ video, audio: false });
						setMicBlocked(true);
						setMicOn(false);
						replaceStream(s);
						setStatus("ready");
						void detectCameras();
						return;
					} catch (videoErr) {
						setStatus(classify(videoErr));
						return;
					}
				}
				setStatus(kind);
			}
		},
		[replaceStream, detectCameras],
	);

	const request = useCallback(() => open(facing), [open, facing]);

	const toggleMic = useCallback(() => {
		setMicOn((on) => {
			streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !on));
			return !on;
		});
	}, []);

	const switchCamera = useCallback(async () => {
		const next = facing === "user" ? "environment" : "user";
		setFacing(next);
		await open(next);
	}, [facing, open]);

	const stop = useCallback(() => {
		replaceStream(null);
		setStatus("idle");
	}, [replaceStream]);

	useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

	return { status, stream, micBlocked, micOn, facing, canSwitchCamera, request, toggleMic, switchCamera, stop };
}

/** 0..1 input level for the mic meter. */
export function useAudioLevel(stream: MediaStream | null, enabled: boolean): number {
	const [level, setLevel] = useState(0);

	useEffect(() => {
		if (!stream || !enabled || stream.getAudioTracks().length === 0) return;
		const ctx = new AudioContext();
		const source = ctx.createMediaStreamSource(stream);
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 256;
		source.connect(analyser);
		const data = new Uint8Array(analyser.frequencyBinCount);
		let raf = 0;
		const loop = () => {
			analyser.getByteTimeDomainData(data);
			let peak = 0;
			for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
			setLevel(Math.min(1, peak / 64));
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(raf);
			setLevel(0);
			void ctx.close();
		};
	}, [stream, enabled]);

	return enabled ? level : 0;
}

/** Grabs a still frame from a stream (used by the mock capture in Phase 1). */
export async function grabFrame(stream: MediaStream, mirror: boolean): Promise<string | null> {
	const video = document.createElement("video");
	video.muted = true;
	video.playsInline = true;
	video.srcObject = stream;
	try {
		await video.play();
		const w = video.videoWidth;
		const h = video.videoHeight;
		if (!w || !h) return null;
		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		if (mirror) {
			ctx.translate(w, 0);
			ctx.scale(-1, 1);
		}
		ctx.drawImage(video, 0, 0, w, h);
		return canvas.toDataURL("image/jpeg", 0.85);
	} catch {
		return null;
	} finally {
		video.pause();
		video.srcObject = null;
	}
}
