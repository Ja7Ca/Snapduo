"use client";

import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

/** Calm header for camera screens. */
export function RoomHeader({ roomId, onLeave, trailing }: { roomId: string; onLeave?: () => void; trailing?: ReactNode }) {
	const { t } = useI18n();
	return (
		<header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 lg:px-6">
			<Logo className="text-lg" />
			<span className="hidden truncate font-mono text-xs text-muted-foreground sm:inline" title="Room">
				{roomId}
			</span>
			<div className="ml-auto flex items-center gap-2">
				{trailing}
				{onLeave && (
					<Button variant="ghost" size="sm" onClick={onLeave}>
						<LogOut aria-hidden="true" />
						{t.common.leave}
					</Button>
				)}
			</div>
		</header>
	);
}
