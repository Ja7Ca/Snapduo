/**
 * Sends each person's sharp photo to the other over the peer connection's
 * data channel (never through the server).
 *
 * Wire format on a reliable, ordered channel:
 *   {"t":"have","keys":[…]}            photos I already have from you
 *   {"t":"begin","key":"c:0","size":N} then binary chunks, then
 *   {"t":"end","key":"c:0"}
 *
 * When the channel opens, both sides send "have"; each then sends only
 * the photos the other is missing. That's also how a transfer cut by a
 * reconnect gets finished.
 */

/** The bits of RTCDataChannel this uses (so tests can fake it). */
export interface ChannelLike {
	readonly readyState: string;
	bufferedAmount: number;
	bufferedAmountLowThreshold: number;
	binaryType: string;
	send(data: string | ArrayBuffer): void;
	addEventListener(type: "open" | "close" | "bufferedamountlow", fn: () => void): void;
	addEventListener(type: "message", fn: (e: { data: unknown }) => void): void;
}

export const CHUNK_BYTES = 16 * 1024;
/** Pause sending above this much queued data, resume below the threshold. */
const HIGH_WATER = 1024 * 1024;
const LOW_WATER = 256 * 1024;
/** A camera photo is ~150–400 KB; refuse anything absurd. */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

interface Handlers {
	/** Keys of the photos we already received from the friend. */
	have: () => string[];
	/** The friend is missing these of ours: send them. */
	onPeerHave: (keys: string[]) => void;
	onPhoto: (key: string, blob: Blob) => void;
	log?: (line: string) => void;
}

type Control =
	| { t: "have"; keys: string[] }
	| { t: "begin"; key: string; size: number }
	| { t: "end"; key: string };

export class PhotoChannel {
	private queue: { key: string; blob: Blob }[] = [];
	private sending = false;
	private incoming: { key: string; size: number; parts: ArrayBuffer[]; received: number } | null = null;

	constructor(
		private channel: ChannelLike,
		private handlers: Handlers,
	) {
		channel.binaryType = "arraybuffer";
		channel.bufferedAmountLowThreshold = LOW_WATER;
		channel.addEventListener("open", () => this.onOpen());
		channel.addEventListener("message", (e) => this.onMessage(e.data));
		channel.addEventListener("close", () => {
			this.queue = [];
			this.incoming = null;
		});
		if (channel.readyState === "open") this.onOpen();
	}

	get open(): boolean {
		return this.channel.readyState === "open";
	}

	/** Queue a photo; it goes out as soon as the channel allows. */
	send(key: string, blob: Blob): void {
		if (blob.size > MAX_PHOTO_BYTES) return;
		if (this.queue.some((q) => q.key === key)) return;
		this.queue.push({ key, blob });
		void this.pump();
	}

	private onOpen(): void {
		this.control({ t: "have", keys: this.handlers.have() });
		void this.pump();
	}

	private control(msg: Control): void {
		this.channel.send(JSON.stringify(msg));
	}

	private async pump(): Promise<void> {
		if (this.sending || !this.open) return;
		this.sending = true;
		try {
			while (this.queue.length && this.open) {
				const { key, blob } = this.queue[0];
				const bytes = await blob.arrayBuffer();
				this.control({ t: "begin", key, size: bytes.byteLength });
				for (let at = 0; at < bytes.byteLength; at += CHUNK_BYTES) {
					if (!this.open) return;
					if (this.channel.bufferedAmount > HIGH_WATER) await this.drained();
					this.channel.send(bytes.slice(at, at + CHUNK_BYTES));
				}
				this.control({ t: "end", key });
				this.queue.shift();
				this.handlers.log?.(`sent ${key} (${Math.round(bytes.byteLength / 1024)} KB)`);
			}
		} catch (err) {
			// Channel closed mid-send: the "have" exchange on the next one resends.
			this.handlers.log?.(`send stopped: ${String(err)}`);
		} finally {
			this.sending = false;
		}
	}

	private drained(): Promise<void> {
		return new Promise((resolve) => {
			const done = () => resolve();
			this.channel.addEventListener("bufferedamountlow", done);
			// Some browsers skip the event if the buffer empties at once.
			setTimeout(done, 1000);
		});
	}

	private onMessage(data: unknown): void {
		if (typeof data === "string") {
			let msg: Control;
			try {
				msg = JSON.parse(data);
			} catch {
				return;
			}
			if (msg.t === "have" && Array.isArray(msg.keys)) {
				this.handlers.onPeerHave(msg.keys.filter((k): k is string => typeof k === "string"));
			} else if (msg.t === "begin" && typeof msg.key === "string" && msg.size > 0 && msg.size <= MAX_PHOTO_BYTES) {
				this.incoming = { key: msg.key, size: msg.size, parts: [], received: 0 };
			} else if (msg.t === "end") {
				const inc = this.incoming;
				this.incoming = null;
				if (inc && inc.key === msg.key && inc.received === inc.size) {
					this.handlers.onPhoto(inc.key, new Blob(inc.parts, { type: "image/jpeg" }));
				}
			}
			return;
		}
		if (data instanceof ArrayBuffer && this.incoming) {
			this.incoming.parts.push(data);
			this.incoming.received += data.byteLength;
			// More than announced: drop it.
			if (this.incoming.received > this.incoming.size) this.incoming = null;
		}
	}
}
