/**
 * Takes the photo at the exact shutter moment.
 *
 * Keeps one hidden, always-playing <video> per stream, so a grab is a
 * synchronous drawImage (no waiting for a fresh element to start, which
 * can take 100+ ms and would make the two people's photos drift apart).
 *
 * Your half comes from your camera. Your friend's half starts as a frame
 * of their live video (blurry, but instant); their own camera photo then
 * arrives over the data channel (photo-channel.ts) and replaces it.
 */
export class FrameGrabber {
	private local = makeVideo();
	private remote = makeVideo();

	setLocal(stream: MediaStream | null): void {
		attach(this.local, stream);
	}

	setRemote(stream: MediaStream | null): void {
		attach(this.remote, stream);
	}

	/**
	 * Draws both frames now; encodes afterwards. Both are mirrored, like a
	 * selfie, so the strip looks the same on both phones.
	 */
	grab(): Promise<{ self: Blob | null; friend: Blob | null }> {
		const self = drawNow(this.local);
		const friend = drawNow(this.remote);
		return Promise.all([encode(self), encode(friend)]).then(([s, f]) => ({ self: s, friend: f }));
	}

	dispose(): void {
		attach(this.local, null);
		attach(this.remote, null);
	}
}

function makeVideo(): HTMLVideoElement {
	const v = document.createElement("video");
	v.muted = true;
	v.playsInline = true;
	v.autoplay = true;
	return v;
}

function attach(video: HTMLVideoElement, stream: MediaStream | null): void {
	if (video.srcObject === stream) return;
	video.srcObject = stream;
	if (stream) void video.play().catch(() => {});
}

/** Long edge of a saved photo: plenty for a 300 dpi print half (~520×750). */
const MAX_EDGE = 1280;

function drawNow(video: HTMLVideoElement): HTMLCanvasElement | null {
	const vw = video.videoWidth;
	const vh = video.videoHeight;
	if (!video.srcObject || !vw || !vh) return null;
	const scale = Math.min(1, MAX_EDGE / Math.max(vw, vh));
	const w = Math.round(vw * scale);
	const h = Math.round(vh * scale);
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	ctx.translate(w, 0);
	ctx.scale(-1, 1);
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(video, 0, 0, w, h);
	return canvas;
}

function encode(canvas: HTMLCanvasElement | null): Promise<Blob | null> {
	if (!canvas) return Promise.resolve(null);
	return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9));
}
