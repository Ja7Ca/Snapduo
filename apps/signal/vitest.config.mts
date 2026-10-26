import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside the real Workers runtime (workerd), with Durable Objects.
export default defineConfig({
	plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
});
