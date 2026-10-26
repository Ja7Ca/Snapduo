import { DurableObject } from "cloudflare:workers";
import { SHARE_CHUNK_BYTES, SHARE_TTL_MS, type ShareInfo } from "@snapduo/protocol";

/**
 * Where a share's bytes live. Today: chunks in the Durable Object's own
 * storage. A future R2BlobStore (for video) only has to implement these
 * three; the 24-hour rule stays in ShareObject either way.
 */
export interface BlobStore {
	put(bytes: Uint8Array): Promise<void>;
	get(): Promise<Uint8Array | null>;
	delete(): Promise<void>;
}

/** Splits the file into 1 MB values (a Durable Object value is capped at 2 MB). */
class DoChunkStore implements BlobStore {
	constructor(private storage: DurableObjectStorage) {}

	async put(bytes: Uint8Array): Promise<void> {
		const entries: Record<string, Uint8Array> = {};
		let count = 0;
		for (let at = 0; at < bytes.byteLength; at += SHARE_CHUNK_BYTES, count++) {
			entries[`chunk:${count}`] = bytes.slice(at, at + SHARE_CHUNK_BYTES);
		}
		await this.storage.put({ ...entries, chunks: count });
	}

	async get(): Promise<Uint8Array | null> {
		const count = await this.storage.get<number>("chunks");
		if (!count) return null;
		const keys = Array.from({ length: count }, (_, i) => `chunk:${i}`);
		const parts = await this.storage.get<Uint8Array>(keys);
		const total = keys.reduce((n, k) => n + (parts.get(k)?.byteLength ?? 0), 0);
		const out = new Uint8Array(total);
		let at = 0;
		for (const k of keys) {
			const part = parts.get(k);
			if (!part) return null;
			out.set(part, at);
			at += part.byteLength;
		}
		return out;
	}

	async delete(): Promise<void> {
		await this.storage.deleteAll();
	}
}

interface Meta extends ShareInfo {
	deleteToken: string;
}

/**
 * One shared strip. Lives exactly 24 hours: the alarm deletes everything,
 * and reads after the deadline are refused even if the alarm runs late.
 */
export class ShareObject extends DurableObject<Env> {
	private store = new DoChunkStore(this.ctx.storage);

	/** Returns null if this id is already used. */
	async create(id: string, bytes: Uint8Array, contentType: string): Promise<{ deleteToken: string; expiresAt: number } | null> {
		if (await this.ctx.storage.get("meta")) return null;
		const now = Date.now();
		const meta: Meta = {
			id,
			createdAt: now,
			expiresAt: now + SHARE_TTL_MS,
			contentType,
			bytes: bytes.byteLength,
			deleteToken: crypto.randomUUID(),
		};
		await this.store.put(bytes);
		await this.ctx.storage.put("meta", meta);
		await this.ctx.storage.setAlarm(meta.expiresAt);
		return { deleteToken: meta.deleteToken, expiresAt: meta.expiresAt };
	}

	async info(): Promise<ShareInfo | "gone" | null> {
		const meta = await this.live();
		if (meta === "gone" || meta === null) return meta;
		const { deleteToken: _token, ...info } = meta;
		return info;
	}

	async image(): Promise<{ bytes: Uint8Array; info: ShareInfo } | "gone" | null> {
		const meta = await this.live();
		if (meta === "gone" || meta === null) return meta;
		const bytes = await this.store.get();
		if (!bytes) return null;
		const { deleteToken: _token, ...info } = meta;
		return { bytes, info };
	}

	/** "Delete now". Wrong token → false. */
	async remove(token: string): Promise<boolean> {
		const meta = await this.ctx.storage.get<Meta>("meta");
		if (!meta) return true; // already gone
		if (!safeEqual(token, meta.deleteToken)) return false;
		await this.wipe();
		return true;
	}

	async alarm(): Promise<void> {
		await this.wipe();
	}

	/** Meta if still within 24 h; "gone" (and wiped) if past it. */
	private async live(): Promise<Meta | "gone" | null> {
		const meta = await this.ctx.storage.get<Meta>("meta");
		if (!meta) return null;
		if (Date.now() >= meta.expiresAt) {
			await this.wipe();
			return "gone";
		}
		return meta;
	}

	private async wipe(): Promise<void> {
		await this.ctx.storage.deleteAlarm();
		await this.store.delete();
	}
}

/** Compares tokens without leaking where they differ through timing. */
function safeEqual(a: string, b: string): boolean {
	if (typeof a !== "string" || a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
