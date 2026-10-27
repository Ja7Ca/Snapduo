import { DurableObject } from "cloudflare:workers";
import { PER_DAY, type QuotaKind } from "@snapduo/protocol";

/**
 * The caller's IP as Cloudflare saw it. Locally (wrangler dev, tests)
 * there is no such header: everyone shares one bucket.
 */
export function clientIp(request: Request): string {
	return request.headers.get("CF-Connecting-IP") ?? "local";
}

/**
 * Per-minute limit (Cloudflare Rate Limiting binding). true = over the
 * limit. If the binding is missing or errors, let the request through:
 * a broken limiter must not take the whole app down.
 */
export async function overRate(limiter: RateLimit | undefined, key: string): Promise<boolean> {
	if (!limiter) return false;
	try {
		const { success } = await limiter.limit({ key });
		return !success;
	} catch {
		return false;
	}
}

/** One object per IP per UTC day: `${ip}:${YYYY-MM-DD}`. */
export function quotaKey(ip: string, now = Date.now()): string {
	return `${ip}:${new Date(now).toISOString().slice(0, 10)}`;
}

/**
 * Exact daily quota for one IP. Deletes itself a little after the day
 * ends, so it never accumulates storage.
 */
export class QuotaObject extends DurableObject<Env> {
	/** true = allowed (and counted), false = quota used up. */
	async take(kind: QuotaKind): Promise<boolean> {
		const max = PER_DAY[kind];
		const used = (await this.ctx.storage.get<number>(kind)) ?? 0;
		if (used >= max) return false;
		await this.ctx.storage.put(kind, used + 1);
		if ((await this.ctx.storage.getAlarm()) === null) {
			await this.ctx.storage.setAlarm(Date.now() + 26 * 60 * 60 * 1000);
		}
		return true;
	}

	async alarm(): Promise<void> {
		await this.ctx.storage.deleteAll();
	}
}

export async function takeQuota(env: Env, request: Request, kind: QuotaKind): Promise<boolean> {
	try {
		return await env.QUOTA.getByName(quotaKey(clientIp(request))).take(kind);
	} catch {
		return true; // same rule: never fail closed on our own bookkeeping
	}
}
