"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { parseRoomInput } from "@/features/room/room-id";
import { rememberLocale, useI18n } from "@/i18n/client";
import { RateLimitedError, createRoomRequest } from "@/lib/signal-client";

export function CreateRoomButton({ className }: { className?: string }) {
	const router = useRouter();
	const { t, locale } = useI18n();
	// A transition, not a "busy" flag: Next keeps this page's state when you
	// come back from the room (Leave), and a flag left at "true" would lock
	// the button. The transition ends on its own once navigation is done.
	const [pending, startTransition] = useTransition();
	return (
		<Button
			variant="playful"
			className={className}
			disabled={pending}
			aria-busy={pending}
			onClick={() =>
				startTransition(async () => {
					try {
						// The server makes the room: a mistyped link then shows
						// "not found" instead of an empty booth nobody will join.
						const id = await createRoomRequest();
						// Room links have no language prefix; keep the one you're using.
						rememberLocale(locale);
						startTransition(() => router.push(`/r/${id}`));
					} catch (err) {
						console.error(err);
						toast.error(err instanceof RateLimitedError ? t.common.rateLimited : t.common.createFailed);
					}
				})
			}
		>
			{pending ? t.common.creatingRoom : t.common.createRoom}
		</Button>
	);
}

export function JoinRoomDialog({ trigger }: { trigger: React.ReactNode }) {
	const router = useRouter();
	const { t, locale } = useI18n();
	const inputId = useId();
	const errorId = useId();
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");
	const [error, setError] = useState("");

	return (
		// Controlled and closed on submit: Next keeps this page's state, so an
		// uncontrolled dialog would still be open when you come back (Leave).
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent closeLabel={t.common.close}>
				<form
					className="grid gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						const id = parseRoomInput(value);
						if (!id) {
							setError(t.join.invalid);
							return;
						}
						rememberLocale(locale);
						setOpen(false);
						setValue("");
						router.push(`/r/${id}`);
					}}
				>
					<DialogHeader>
						<DialogTitle>{t.join.title}</DialogTitle>
						<DialogDescription>{t.join.description}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-1.5">
						<label htmlFor={inputId} className="sr-only">
							{t.join.label}
						</label>
						<Input
							id={inputId}
							value={value}
							onChange={(e) => {
								setValue(e.target.value);
								setError("");
							}}
							placeholder={t.join.placeholder}
							autoComplete="off"
							aria-invalid={!!error}
							aria-describedby={error ? errorId : undefined}
							className="font-mono text-sm"
						/>
						{error && (
							<p id={errorId} className="text-sm text-destructive">
								{error}
							</p>
						)}
					</div>
					<DialogFooter>
						<Button type="submit">{t.join.submit}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
