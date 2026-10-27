"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/site/message-screen";
import { reportError } from "@/lib/report-error";

/** A page crashed while rendering: say so in our own words, report it, offer a retry. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
	useEffect(() => {
		reportError("react", error);
	}, [error]);
	return <ErrorScreen onRetry={reset} />;
}
