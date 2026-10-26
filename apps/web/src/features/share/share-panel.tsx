"use client";

import { remainingParts } from "@snapduo/protocol";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/client";

interface SharePanelProps {
	/** Full link (copied) and the shorter text shown. */
	url: string;
	expiresAt: number;
	now: number;
	onDelete: () => Promise<void>;
}

/** The link after sharing: copy it, see when it disappears, delete it now. */
export function SharePanel({ url, expiresAt, now, onDelete }: SharePanelProps) {
	const { t, fmt } = useI18n();
	const [copied, setCopied] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const left = remainingParts(expiresAt, now);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			toast.success(t.common.linkCopied);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error(t.common.copyFailed);
		}
	};

	const remove = async () => {
		setDeleting(true);
		try {
			await onDelete();
			toast(t.result.deleted);
		} catch {
			toast.error(t.result.deleteFailed);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<section className="rounded-2xl p-5 outline-playful" aria-labelledby="share-title">
			<h2 id="share-title" className="text-lg font-bold">
				{t.result.shareTitle}
			</h2>
			<p className="mt-1 text-sm text-muted-foreground">{t.result.shareBody}</p>
			<div className="mt-4 flex items-center gap-2 rounded-[14px] border border-border bg-secondary py-1.5 pr-1.5 pl-4">
				<span className="min-w-0 flex-1 truncate font-mono text-sm" data-share-url={url}>
					{url.replace(/^https?:\/\//, "")}
				</span>
				<Button variant="secondary" size="sm" onClick={() => void copy()}>
					{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
					{copied ? t.common.copied : t.common.copy}
				</Button>
			</div>
			<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
				<span className="text-muted-foreground">
					{t.result.deletedIn} <span className="font-mono">{fmt(t.result.remaining, left)}</span>
				</span>
				<Dialog>
					<DialogTrigger asChild>
						<Button variant="destructive-link" size="inline" disabled={deleting}>
							{t.result.deleteNow}
						</Button>
					</DialogTrigger>
					<DialogContent showCloseButton={false}>
						<DialogHeader>
							<DialogTitle>{t.result.deleteTitle}</DialogTitle>
							<DialogDescription>{t.result.deleteBody}</DialogDescription>
						</DialogHeader>
						<DialogFooter className="gap-2">
							<DialogClose asChild>
								<Button variant="secondary">{t.result.keepIt}</Button>
							</DialogClose>
							<DialogClose asChild>
								<Button variant="destructive" onClick={() => void remove()}>
									{t.result.deleteNow}
								</Button>
							</DialogClose>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</section>
	);
}
