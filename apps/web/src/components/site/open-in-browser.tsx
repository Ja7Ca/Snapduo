"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { Button } from "@/components/ui/button";
import { androidChromeIntent, type BrowserProblem } from "@/features/media/browser-support";
import { useI18n } from "@/i18n/client";

interface OpenInBrowserScreenProps {
	problem: BrowserProblem;
	url: string;
	/** Detection by user agent is never perfect: let people try anyway. */
	onContinue: () => void;
}

/** "Open this in Safari / Chrome" before asking for the camera. */
export function OpenInBrowserScreen({ problem, url, onContinue }: OpenInBrowserScreenProps) {
	const { t, fmt } = useI18n();
	const b = t.browser;
	const [copied, setCopied] = useState(false);
	const inApp = problem.kind === "in-app";
	const steps = inApp ? (problem.platform === "android" ? b.androidSteps : b.iosSteps) : null;

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

	return (
		<div className="flex min-h-dvh flex-col">
			<SiteHeader />
			<main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-5 py-10">
				<div>
					<h1 className="text-[32px] leading-[1.08] font-extrabold sm:text-[38px]">
						{inApp ? b.inAppTitle : b.unsupportedTitle}
					</h1>
					<p className="mt-3 text-muted-foreground">
						{inApp ? fmt(b.inAppBody, { app: problem.app }) : b.unsupportedBody}
					</p>
				</div>

				{steps && (
					<ol className="flex flex-col gap-3">
						{steps.map((step, i) => (
							<li key={step} className="flex items-start gap-3">
								<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
									{i + 1}
								</span>
								<span className="pt-0.5">{step}</span>
							</li>
						))}
					</ol>
				)}

				<div className="flex flex-col gap-3">
					{inApp && problem.platform === "android" && (
						<Button variant="playful" asChild>
							<a href={androidChromeIntent(url)}>
								<ExternalLink aria-hidden="true" />
								{b.openChrome}
							</a>
						</Button>
					)}
					<Button variant={inApp && problem.platform === "android" ? "secondary-playful" : "playful"} onClick={() => void copy()}>
						{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
						{copied ? t.common.copied : b.copyLink}
					</Button>
					<p className="text-sm text-muted-foreground">{b.pasteHint}</p>
				</div>

				<Button variant="link" size="inline" className="self-start" onClick={onContinue}>
					{b.continueAnyway}
				</Button>
			</main>
			<SiteFooter />
		</div>
	);
}
