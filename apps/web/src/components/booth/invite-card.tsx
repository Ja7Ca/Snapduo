"use client";

import { Check, Copy, Share2 } from "lucide-react";
import QRCode from "qrcode";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** QR as plain SVG rects, computed synchronously (no effect needed). */
function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
	const cells = useMemo(() => {
		const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
		const out: [number, number][] = [];
		for (let y = 0; y < modules.size; y++) {
			for (let x = 0; x < modules.size; x++) if (modules.get(x, y)) out.push([x, y]);
		}
		return { size: modules.size, out };
	}, [value]);

	return (
		<svg
			viewBox={`-2 -2 ${cells.size + 4} ${cells.size + 4}`}
			role="img"
			aria-label={label}
			className={cn("rounded-lg bg-white p-1", className)}
			shapeRendering="crispEdges"
		>
			{cells.out.map(([x, y]) => (
				<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#1f1a17" />
			))}
		</svg>
	);
}

export function InviteCard({ url, className }: { url: string; className?: string }) {
	const [copied, setCopied] = useState(false);
	const { t } = useI18n();
	const canShare = typeof navigator !== "undefined" && "share" in navigator;

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			toast.success(t.common.linkCopied);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error(t.common.copyFailed);
		}
	}

	async function share() {
		try {
			await navigator.share({ title: t.invite.shareTitle, url });
		} catch {
			// Cancelled by the user; nothing to do.
		}
	}

	return (
		<section className={cn("rounded-2xl border border-border bg-card p-5", className)} aria-labelledby="invite-title">
			<div className="flex items-start gap-4">
				<div className="min-w-0 flex-1">
					<h2 id="invite-title" className="text-lg font-bold">
						{t.invite.title}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t.invite.body}</p>
				</div>
				<QrCode value={url} label={t.invite.qr} className="hidden size-24 shrink-0 sm:block" />
			</div>

			<div className="mt-4 flex items-center gap-2 rounded-[14px] border border-border bg-secondary py-1.5 pr-1.5 pl-4">
				<span className="min-w-0 flex-1 truncate font-mono text-sm" title={url}>
					{url.replace(/^https?:\/\//, "")}
				</span>
				<Button variant="secondary" size="sm" onClick={copy} aria-label={t.invite.copyLink}>
					{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
					{copied ? t.common.copied : t.common.copy}
				</Button>
			</div>

			{canShare && (
				<Button className="mt-3 w-full" onClick={share}>
					<Share2 aria-hidden="true" />
					{t.invite.share}
				</Button>
			)}

			<p className="mt-3 text-xs text-muted-foreground">{t.invite.limit}</p>
		</section>
	);
}
