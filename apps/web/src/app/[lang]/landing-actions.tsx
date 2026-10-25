"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
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
import { createdKey, newRoomId, parseRoomInput } from "@/features/room/room-id";
import { rememberLocale, useI18n } from "@/i18n/client";

export function CreateRoomButton({ className }: { className?: string }) {
	const router = useRouter();
	const { t, locale } = useI18n();
	return (
		<Button
			variant="playful"
			className={className}
			onClick={() => {
				const id = newRoomId();
				try {
					sessionStorage.setItem(createdKey(id), "1");
				} catch {
					// Private mode: still works, you just won't be marked as host.
				}
				// Room links have no language prefix; keep the one you're using.
				rememberLocale(locale);
				router.push(`/r/${id}`);
			}}
		>
			{t.common.createRoom}
		</Button>
	);
}

export function JoinRoomDialog({ trigger }: { trigger: React.ReactNode }) {
	const router = useRouter();
	const { t, locale } = useI18n();
	const inputId = useId();
	const errorId = useId();
	const [value, setValue] = useState("");
	const [error, setError] = useState("");

	return (
		<Dialog>
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
