import { cn } from "@/lib/utils";

interface ShutterButtonProps {
	label: string;
	disabled?: boolean;
	onClick?: () => void;
	className?: string;
}

/** 76px camera shutter: orange disc, white ring, thin ink outer ring. */
export function ShutterButton({ label, disabled, onClick, className }: ShutterButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-label={label}
			title={label}
			className={cn(
				"group relative size-19 shrink-0 cursor-pointer rounded-full border-2 border-ink bg-background p-1 outline-none transition-transform focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
				className,
			)}
		>
			<span className="block size-full rounded-full bg-primary transition-colors group-hover:bg-primary-hover group-disabled:bg-primary" />
		</button>
	);
}
