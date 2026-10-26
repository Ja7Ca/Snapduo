"use client";

import type { CreateShareResponse } from "@snapduo/protocol";
import { useCallback, useEffect, useState } from "react";
import { createShareRequest, deleteShareRequest } from "@/lib/signal-client";

/**
 * Your share link for a room, remembered on this device so it's still
 * there after a reload. Each person makes their own link (with their own
 * filter); the delete token never leaves this device.
 */
export type ShareLink = CreateShareResponse;

const key = (roomId: string) => `snapduo:share:${roomId}`;

export function loadShareLink(roomId: string, now = Date.now()): ShareLink | null {
	try {
		const raw = localStorage.getItem(key(roomId));
		const link = raw ? (JSON.parse(raw) as ShareLink) : null;
		if (!link || typeof link.id !== "string" || !(link.expiresAt > now)) {
			if (raw) localStorage.removeItem(key(roomId));
			return null;
		}
		return link;
	} catch {
		return null;
	}
}

function storeShareLink(roomId: string, link: ShareLink | null): void {
	try {
		if (link) localStorage.setItem(key(roomId), JSON.stringify(link));
		else localStorage.removeItem(key(roomId));
	} catch {
		// Kept in memory for this visit only.
	}
}

export function useShareLink(roomId: string, seatToken: string | null) {
	const [link, setLink] = useState<ShareLink | null>(() => loadShareLink(roomId));
	const [now, setNow] = useState(() => Date.now());

	// Countdown, and forget the link the moment it expires.
	useEffect(() => {
		if (!link) return;
		const tick = () => {
			const t = Date.now();
			setNow(t);
			if (t >= link.expiresAt) {
				storeShareLink(roomId, null);
				setLink(null);
			}
		};
		const id = setInterval(tick, 30_000);
		return () => clearInterval(id);
	}, [link, roomId]);

	const create = useCallback(
		async (strip: Blob) => {
			if (!seatToken) throw new Error("No seat token");
			const created = await createShareRequest(roomId, seatToken, strip);
			storeShareLink(roomId, created);
			setNow(Date.now());
			setLink(created);
			return created;
		},
		[roomId, seatToken],
	);

	const remove = useCallback(async () => {
		if (!link) return;
		await deleteShareRequest(link.id, link.deleteToken);
		storeShareLink(roomId, null);
		setLink(null);
	}, [link, roomId]);

	return { link, now, create, remove };
}
