import { notFound } from "next/navigation";

/*
 * Catches every URL that matches no page, so the 404 renders inside the
 * [lang] layout (fonts, theme, translations, <html lang>) via
 * ../not-found.tsx. Without it Next.js shows its own bare 404, because
 * our root layout lives in [lang].
 */
export default function UnknownPage() {
	notFound();
}
