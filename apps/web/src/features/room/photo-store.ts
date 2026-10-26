/**
 * Keeps the photos of a room in IndexedDB, so a reload (or the phone
 * killing the tab while you share the link) doesn't lose them.
 *
 * Only this browser ever sees them. Everything older than a day is
 * deleted the next time a room opens. Every call fails soft: private
 * mode or a full disk just means photos live in memory only.
 */

const DB_NAME = "snapduo";
const STORE = "photos";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface StoredPhoto {
	/** `${roomId}/${captureId}:${slot}` */
	id: string;
	roomId: string;
	key: string;
	self: Blob;
	friend: Blob | null;
	savedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
	dbPromise ??= new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			const store = req.result.createObjectStore(STORE, { keyPath: "id" });
			store.createIndex("roomId", "roomId");
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
	dbPromise.catch(() => {
		dbPromise = null;
	});
	return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error);
	});
}

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function savePhoto(roomId: string, key: string, self: Blob, friend: Blob | null): Promise<void> {
	try {
		const db = await openDb();
		const tx = db.transaction(STORE, "readwrite");
		tx.objectStore(STORE).put({ id: `${roomId}/${key}`, roomId, key, self, friend, savedAt: Date.now() } satisfies StoredPhoto);
		await done(tx);
	} catch {
		// Memory only.
	}
}

/** Loads a room's photos and drops anything older than a day (any room). */
export async function loadPhotos(roomId: string): Promise<StoredPhoto[]> {
	try {
		const db = await openDb();
		const tx = db.transaction(STORE, "readwrite");
		const store = tx.objectStore(STORE);
		const all = await request(store.getAll() as IDBRequest<StoredPhoto[]>);
		const cutoff = Date.now() - MAX_AGE_MS;
		for (const p of all) if (p.savedAt < cutoff) store.delete(p.id);
		await done(tx);
		return all.filter((p) => p.roomId === roomId && p.savedAt >= cutoff);
	} catch {
		return [];
	}
}

export async function deletePhotos(roomId: string, keys: string[]): Promise<void> {
	if (!keys.length) return;
	try {
		const db = await openDb();
		const tx = db.transaction(STORE, "readwrite");
		for (const key of keys) tx.objectStore(STORE).delete(`${roomId}/${key}`);
		await done(tx);
	} catch {
		// Removed from memory anyway; the 24h sweep gets the rest.
	}
}
