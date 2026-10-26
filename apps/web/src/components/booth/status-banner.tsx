import { Loader2, Volume2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Thin calm banner at the top of the booth. */
export function StatusBanner({
	kind,
	children,
	action,
	className,
}: {
	kind: "reconnecting" | "audio";
	children: ReactNode;
	action?: ReactNode;
	className?: string;
}) {
	return (
		<div
			role="status"
			className={cn(
				"flex items-center gap-3 rounded-full border border-border bg-card py-1.5 pr-1.5 pl-4 text-sm",
				!action && "pr-4",
				className,
			)}
		>
			{kind === "reconnecting" ? (
				<Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
			) : (
				<Volume2 className="size-4 shrink-0" aria-hidden="true" />
			)}
			<span className="min-w-0 flex-1">{children}</span>
			{action}
		</div>
	);
}
