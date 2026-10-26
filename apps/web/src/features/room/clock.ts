/**
 * Estimates the gap between this device's clock and the server's, so both
 * phones count down to the same moment even if one clock is minutes off.
 *
 * Each sample is a round trip: we send t0, the server replies with its
 * time, we note t1. Assuming the trip is symmetric, server time at t1 is
 * serverNow + (t1 - t0) / 2. The sample with the shortest round trip is
 * the most accurate, so that's the one kept.
 */
export class ClockSync {
	private best: { rtt: number; offset: number } | null = null;

	/** server time − local time, in ms. */
	get offset(): number {
		return this.best?.offset ?? 0;
	}

	get rtt(): number | null {
		return this.best?.rtt ?? null;
	}

	add(t0: number, serverNow: number, t1: number): void {
		const rtt = Math.max(0, t1 - t0);
		const offset = serverNow + rtt / 2 - t1;
		if (!this.best || rtt <= this.best.rtt) this.best = { rtt, offset };
	}

	/** Network changed (reconnect): old samples may no longer apply. */
	reset(): void {
		this.best = null;
	}

	toServer(local: number): number {
		return local + this.offset;
	}

	toLocal(server: number): number {
		return server - this.offset;
	}
}
