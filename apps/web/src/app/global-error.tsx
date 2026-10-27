"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

/**
 * Last resort: the root layout itself failed, so there are no fonts,
 * theme or translations. Plain markup, both languages.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
	useEffect(() => {
		reportError("react", error);
	}, [error]);
	return (
		<html lang="id">
			<body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#1f1a17" }}>
				<main style={{ maxWidth: 420, margin: "20vh auto", padding: "0 20px", textAlign: "center" }}>
					<h1 style={{ fontSize: 28, margin: "0 0 8px" }}>Ada yang tidak beres</h1>
					<p style={{ margin: "0 0 4px", color: "#6b625a" }}>Something went wrong.</p>
					<button
						type="button"
						onClick={() => window.location.reload()}
						style={{ marginTop: 20, padding: "12px 24px", borderRadius: 999, border: "2px solid #1f1a17", background: "#ff6b2c", color: "#1f1a17", fontSize: 16, cursor: "pointer" }}
					>
						Muat ulang · Reload
					</button>
				</main>
			</body>
		</html>
	);
}
