import { Logo } from "@/components/brand/logo";

/** Shown for a moment while URL params resolve (Suspense fallback). */
export function PageFallback() {
	return (
		<div className="flex min-h-dvh flex-col" aria-busy="true">
			<header className="mx-auto flex w-full max-w-6xl items-center px-4 py-3 lg:px-6">
				<Logo className="text-lg" />
			</header>
		</div>
	);
}
