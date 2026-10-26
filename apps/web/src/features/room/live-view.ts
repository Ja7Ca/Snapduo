import {
	GRACE_MS,
	captureProgress,
	shotCount,
	type Intent,
	type RoomSnapshot,
} from "@snapduo/protocol";
import type { Capture, Friend, RoomAction, RoomState, Shot, Who } from "./room-state";

/**
 * Bridges the server's room snapshot and the views.
 *
 * The views (booth, result) were built against RoomState in Phase 1 and
 * don't change: here the live snapshot is turned into a RoomState, and the
 * actions the views dispatch are turned into server requests. Both are
 * pure functions so the rules are unit-tested.
 */

/** Things only this browser knows about. */
export interface LocalUi {
	selectedSlot: number | null;
	/** Frame waiting for "this will clear your photos". */
	pendingFrameId: string | null;
}

export const INITIAL_UI: LocalUi = { selectedSlot: null, pendingFrameId: null };

export interface LiveInput {
	roomId: string;
	room: RoomSnapshot;
	selfId: string;
	photos: ReadonlyMap<string, PhotoRecord>;
	ui: LocalUi;
	/** Local clock now, and server − local. */
	now: number;
	offset: number;
	selfName: string;
	micOn: boolean;
	reconnecting: boolean;
	audioBlocked: boolean;
	weakConnection: boolean;
	/** Shown when the friend didn't type a name. */
	friendFallbackName: string;
}

export const photoKey = (captureId: string, slot: number) => `${captureId}:${slot}`;

/**
 * One slot's photos as this browser holds them: yours, and your friend's.
 * Theirs starts as a frame of their live video and is replaced by their
 * own camera photo when it arrives over the data channel.
 */
export interface PhotoRecord {
	mine: string;
	theirs: string;
	/** `theirs` is their real camera photo. */
	sharp: boolean;
	/** Waited long enough: keep the video frame and say so. */
	gaveUp: boolean;
}

/** Grey stand-in for a photo this browser doesn't have. */
export const MISSING_PHOTO_URL =
	"data:image/svg+xml;utf8," +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40"><rect width="30" height="40" fill="#d9d4cd"/></svg>',
	);
export const MISSING_SHOT: Shot = { left: MISSING_PHOTO_URL, right: MISSING_PHOTO_URL, lowQuality: true };

/** Creator on the left, friend on the right: the same strip on both phones. */
export function toShot(rec: PhotoRecord, selfIsLeft: boolean): Shot {
	const flags = { lowQuality: !rec.sharp && rec.gaveUp, pending: !rec.sharp && !rec.gaveUp };
	return selfIsLeft ? { left: rec.mine, right: rec.theirs, ...flags } : { left: rec.theirs, right: rec.mine, ...flags };
}

export function liveRoomState(i: LiveInput): RoomState {
	const { room, selfId } = i;
	const serverNow = i.now + i.offset;
	const self = room.seats.find((s) => s.peerId === selfId);
	const other = room.seats.find((s) => s.peerId !== selfId);
	const who = (peerId: string | null): Who | null =>
		peerId === null ? null : peerId === selfId ? "self" : other && peerId === other.peerId ? "friend" : null;

	const friend: Friend | null = other
		? {
				name: other.name || i.friendFallbackName,
				micOn: other.micOn,
				present: other.present,
				// The view counts down from awaySince + GRACE_MS on the local clock.
				awaySince: other.awayUntil !== null ? other.awayUntil - i.offset - GRACE_MS : null,
				weakConnection: other.present && i.weakConnection,
			}
		: null;

	// Photos: finished slots from the snapshot, plus shots of a capture in
	// progress as soon as their shutter has fired.
	const selfIsLeft = self?.seat !== "B";
	const shotFor = (key: string): Shot | null => {
		const rec = i.photos.get(key);
		return rec ? toShot(rec, selfIsLeft) : null;
	};
	const shots: (Shot | null)[] = room.slots.map((captureId, slot) =>
		captureId ? (shotFor(photoKey(captureId, slot)) ?? MISSING_SHOT) : null,
	);
	let capture: Capture | null = null;
	const c = room.capture;
	if (c && room.phase === "capturing") {
		const p = captureProgress(c, serverNow);
		c.queue.slice(0, p.taken).forEach((slot) => {
			const fresh = shotFor(photoKey(c.id, slot));
			if (fresh) shots[slot] = fresh;
		});
		capture = { queue: c.queue, index: p.index, countdown: p.countdown, startedBy: who(c.startedBy) ?? "friend" };
	}

	const phase =
		room.phase === "result" ? "result" : room.phase === "capturing" ? "capturing" : other ? "booth" : "waiting";

	const filled = (slot: number | null) => slot !== null && slot < shots.length && !!shots[slot];
	return {
		roomId: i.roomId,
		phase,
		issue: null,
		isCreator: self?.seat === "A",
		selfName: i.selfName,
		micOn: i.micOn,
		friend,
		frameId: room.frameId,
		frameChangedBy: who(room.frameChangedBy),
		pendingFrameId: phase === "booth" || phase === "waiting" ? i.ui.pendingFrameId : null,
		timer: room.timer,
		shots,
		selectedSlot: phase === "booth" && filled(i.ui.selectedSlot) ? i.ui.selectedSlot : null,
		capture,
		reconnecting: i.reconnecting,
		audioBlocked: i.audioBlocked,
		finishedBy: who(room.finishedBy),
	};
}

export interface Routed {
	ui?: LocalUi;
	intent?: Intent;
	/** "Tap to hear": retry playing the friend's audio. */
	resumeAudio?: true;
}

/**
 * What a view action means in a live room. `view` is the state the user
 * was looking at when they clicked.
 */
export function routeAction(action: RoomAction, view: RoomState, ui: LocalUi): Routed {
	switch (action.type) {
		case "SELECT_FRAME": {
			if (action.frameId === view.frameId) return { ui: { ...ui, pendingFrameId: null } };
			const losesPhotos =
				shotCount(action.frameId) !== shotCount(view.frameId) && view.shots.some(Boolean);
			if (losesPhotos) return { ui: { ...ui, pendingFrameId: action.frameId } };
			return { ui: { ...ui, selectedSlot: null }, intent: { type: "select-frame", frameId: action.frameId } };
		}
		case "CONFIRM_FRAME_CHANGE":
			if (!ui.pendingFrameId) return {};
			return {
				ui: { selectedSlot: null, pendingFrameId: null },
				intent: { type: "select-frame", frameId: ui.pendingFrameId },
			};
		case "CANCEL_FRAME_CHANGE":
			return { ui: { ...ui, pendingFrameId: null } };
		case "SET_TIMER":
			return { intent: { type: "set-timer", timer: action.timer } };
		case "SELECT_SLOT": {
			if (view.phase !== "booth") return {};
			const slot = action.slot === null || action.slot === view.selectedSlot ? null : action.slot;
			if (slot !== null && !view.shots[slot]) return {};
			return { ui: { ...ui, selectedSlot: slot } };
		}
		case "START_CAPTURE":
			return {
				ui: { ...ui, selectedSlot: null },
				intent: { type: "start-capture", slot: view.selectedSlot },
			};
		case "FINISH":
			return { ui: { ...ui, selectedSlot: null }, intent: { type: "finish" } };
		case "BACK_TO_BOOTH":
			return { intent: { type: "back-to-booth" } };
		case "START_OVER":
			return { intent: { type: "start-over" } };
		case "FRIEND_GONE":
			// "Let someone else join" on an away friend.
			return { intent: { type: "release-friend" } };
		case "AUDIO_BLOCKED":
			return action.value ? {} : { resumeAudio: true };
		default:
			// Everything else comes from the server, not from a click.
			return {};
	}
}
