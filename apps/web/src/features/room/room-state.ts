import { DEFAULT_FRAME_ID, getFrame, isSameShotCount } from "@/features/frames/frames";

/**
 * Everything the room page needs to render, as a pure reducer.
 *
 * Phase 1 drives it with mock actions; Phase 2 feeds it events from the
 * signaling server and the peer connection. The UI never changes the
 * state directly, so every rule below is unit-tested in isolation.
 */

export type Phase = "prejoin" | "waiting" | "booth" | "capturing" | "result";
export type RoomIssue = "room-full" | "not-found";
export type Who = "self" | "friend";
export type TimerSeconds = 3 | 5 | 10;

export interface Shot {
	/** Object URL or data URL of each person's photo for this slot. */
	self: string;
	friend: string;
	/** Friend's full-res photo didn't arrive; a frame from the video was used. */
	lowQuality?: boolean;
}

export interface Friend {
	name: string;
	micOn: boolean;
	/** false while their connection is gone but their seat is held. */
	present: boolean;
	/** ms timestamp when they dropped; drives the 2:00 countdown. */
	awaySince: number | null;
	weakConnection: boolean;
}

export interface Capture {
	/** Slot indexes to fill, in order. */
	queue: number[];
	/** Position in `queue`. */
	index: number;
	/** Seconds left on the current countdown; 0 = taking the photo. */
	countdown: number;
	startedBy: Who;
}

export interface RoomState {
	roomId: string;
	phase: Phase;
	issue: RoomIssue | null;
	isCreator: boolean;
	selfName: string;
	micOn: boolean;
	friend: Friend | null;
	frameId: string;
	frameChangedBy: Who | null;
	/** Frame waiting for "this will clear your photos" confirmation. */
	pendingFrameId: string | null;
	timer: TimerSeconds;
	shots: (Shot | null)[];
	selectedSlot: number | null;
	capture: Capture | null;
	reconnecting: boolean;
	audioBlocked: boolean;
	finishedBy: Who | null;
}

export type RoomAction =
	| { type: "ENTER_BOOTH"; name: string; micOn: boolean; isCreator: boolean; friend: Friend | null }
	| { type: "ROOM_ISSUE"; issue: RoomIssue }
	| { type: "FRIEND_JOINED"; name: string; micOn: boolean }
	| { type: "FRIEND_AWAY"; at: number }
	| { type: "FRIEND_BACK" }
	| { type: "FRIEND_GONE" }
	| { type: "FRIEND_MIC"; micOn: boolean }
	| { type: "FRIEND_CONNECTION"; weak: boolean }
	| { type: "TOGGLE_MIC" }
	| { type: "SELECT_FRAME"; frameId: string; by: Who }
	| { type: "CONFIRM_FRAME_CHANGE" }
	| { type: "CANCEL_FRAME_CHANGE" }
	| { type: "SET_TIMER"; timer: TimerSeconds }
	| { type: "SELECT_SLOT"; slot: number | null }
	| { type: "START_CAPTURE"; by: Who }
	| { type: "TICK" }
	| { type: "SHOT_TAKEN"; shot: Shot }
	| { type: "FINISH"; by: Who }
	| { type: "BACK_TO_BOOTH" }
	| { type: "START_OVER" }
	| { type: "RECONNECTING"; value: boolean }
	| { type: "AUDIO_BLOCKED"; value: boolean };

export const FRIEND_GRACE_MS = 120_000;

export function initialRoomState(roomId: string): RoomState {
	return {
		roomId,
		phase: "prejoin",
		issue: null,
		isCreator: false,
		selfName: "",
		micOn: true,
		friend: null,
		frameId: DEFAULT_FRAME_ID,
		frameChangedBy: null,
		pendingFrameId: null,
		timer: 3,
		shots: emptyShots(DEFAULT_FRAME_ID),
		selectedSlot: null,
		capture: null,
		reconnecting: false,
		audioBlocked: false,
		finishedBy: null,
	};
}

function emptyShots(frameId: string): null[] {
	return Array.from({ length: getFrame(frameId).shots }, () => null);
}

/* ---------- selectors ---------- */

export const filledCount = (s: RoomState) => s.shots.filter(Boolean).length;
export const allFilled = (s: RoomState) => s.shots.every(Boolean);
export const friendHere = (s: RoomState) => !!s.friend?.present;

/** Shutter is usable only with both people here and nothing in progress. */
export function canCapture(s: RoomState): boolean {
	if (s.phase !== "booth" || !friendHere(s) || s.reconnecting) return false;
	return s.selectedSlot !== null || !allFilled(s);
}

export const canFinish = (s: RoomState) => s.phase === "booth" && allFilled(s);

/** What the shutter would do right now; the view turns it into words. */
export type ShutterAction = { kind: "retake"; slot: number } | { kind: "done" } | { kind: "start" } | { kind: "rest" };

export function shutterAction(s: RoomState): ShutterAction {
	if (s.selectedSlot !== null) return { kind: "retake", slot: s.selectedSlot };
	if (allFilled(s)) return { kind: "done" };
	return filledCount(s) === 0 ? { kind: "start" } : { kind: "rest" };
}

export function currentCaptureSlot(s: RoomState): number | null {
	return s.capture ? s.capture.queue[s.capture.index] : null;
}

/* ---------- reducer ---------- */

export function roomReducer(s: RoomState, a: RoomAction): RoomState {
	switch (a.type) {
		case "ROOM_ISSUE":
			return { ...s, issue: a.issue };

		case "ENTER_BOOTH": {
			const phase = a.friend?.present ? "booth" : "waiting";
			return { ...s, selfName: a.name, micOn: a.micOn, isCreator: a.isCreator, friend: a.friend, phase };
		}

		case "FRIEND_JOINED": {
			const friend: Friend = { name: a.name, micOn: a.micOn, present: true, awaySince: null, weakConnection: false };
			return { ...s, friend, phase: s.phase === "waiting" ? "booth" : s.phase };
		}

		case "FRIEND_AWAY": {
			if (!s.friend) return s;
			const friend = { ...s.friend, present: false, awaySince: a.at };
			// A capture can't finish without them; keep the photos taken so far.
			if (s.phase === "capturing") return { ...s, friend, phase: "booth", capture: null };
			return { ...s, friend };
		}

		case "FRIEND_BACK":
			if (!s.friend) return s;
			return { ...s, friend: { ...s.friend, present: true, awaySince: null } };

		case "FRIEND_GONE": {
			// Grace period over (or creator let someone else join).
			// Photos stay; on the result screen you can still download.
			const phase = s.phase === "result" ? "result" : "waiting";
			return { ...s, friend: null, phase, capture: null, selectedSlot: null };
		}

		case "FRIEND_MIC":
			return s.friend ? { ...s, friend: { ...s.friend, micOn: a.micOn } } : s;

		case "FRIEND_CONNECTION":
			return s.friend ? { ...s, friend: { ...s.friend, weakConnection: a.weak } } : s;

		case "TOGGLE_MIC":
			return { ...s, micOn: !s.micOn };

		case "SELECT_FRAME": {
			if (s.phase !== "booth" && s.phase !== "waiting") return s;
			if (a.frameId === s.frameId) return { ...s, pendingFrameId: null };
			const keepsPhotos = isSameShotCount(s.frameId, a.frameId);
			// Ask only when photos would actually be lost. The friend already
			// confirmed on their side, so their change applies directly.
			if (keepsPhotos || filledCount(s) === 0 || a.by === "friend") {
				return applyFrame(s, a.frameId, a.by, keepsPhotos);
			}
			return { ...s, pendingFrameId: a.frameId };
		}

		case "CONFIRM_FRAME_CHANGE":
			return s.pendingFrameId ? applyFrame(s, s.pendingFrameId, "self", false) : s;

		case "CANCEL_FRAME_CHANGE":
			return { ...s, pendingFrameId: null };

		case "SET_TIMER":
			return s.phase === "capturing" ? s : { ...s, timer: a.timer };

		case "SELECT_SLOT": {
			if (s.phase !== "booth") return s;
			if (a.slot === null || a.slot === s.selectedSlot) return { ...s, selectedSlot: null };
			// Only taken photos can be picked for a retake.
			return s.shots[a.slot] ? { ...s, selectedSlot: a.slot } : s;
		}

		case "START_CAPTURE": {
			if (!canCapture(s)) return s;
			const queue =
				s.selectedSlot !== null
					? [s.selectedSlot]
					: s.shots.flatMap((shot, i) => (shot ? [] : [i]));
			return {
				...s,
				phase: "capturing",
				capture: { queue, index: 0, countdown: s.timer, startedBy: a.by },
				selectedSlot: null,
			};
		}

		case "TICK":
			if (!s.capture || s.capture.countdown === 0) return s;
			return { ...s, capture: { ...s.capture, countdown: s.capture.countdown - 1 } };

		case "SHOT_TAKEN": {
			if (!s.capture) return s;
			const slot = s.capture.queue[s.capture.index];
			const shots = s.shots.map((shot, i) => (i === slot ? a.shot : shot));
			const next = s.capture.index + 1;
			if (next >= s.capture.queue.length) {
				return { ...s, shots, phase: "booth", capture: null };
			}
			return { ...s, shots, capture: { ...s.capture, index: next, countdown: s.timer } };
		}

		case "FINISH":
			return canFinish(s) ? { ...s, phase: "result", finishedBy: a.by, selectedSlot: null } : s;

		case "BACK_TO_BOOTH":
			if (s.phase !== "result") return s;
			return { ...s, phase: friendHere(s) ? "booth" : "waiting", finishedBy: null };

		case "START_OVER":
			return {
				...s,
				phase: friendHere(s) ? "booth" : "waiting",
				shots: emptyShots(s.frameId),
				selectedSlot: null,
				finishedBy: null,
			};

		case "RECONNECTING":
			return { ...s, reconnecting: a.value };

		case "AUDIO_BLOCKED":
			return { ...s, audioBlocked: a.value };
	}
}

function applyFrame(s: RoomState, frameId: string, by: Who, keepPhotos: boolean): RoomState {
	return {
		...s,
		frameId,
		frameChangedBy: by,
		pendingFrameId: null,
		selectedSlot: null,
		shots: keepPhotos ? s.shots : emptyShots(frameId),
	};
}
