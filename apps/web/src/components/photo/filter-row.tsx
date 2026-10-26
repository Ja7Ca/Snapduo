"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FILTERS, filterCss, type FilterId } from "@/features/frames/filters";
import { useI18n } from "@/i18n/client";

interface FilterRowProps {
	value: FilterId;
	onChange: (id: FilterId) => void;
	/** Image used for the small preview on each chip. */
	previewSrc?: string;
}

export function FilterRow({ value, onChange, previewSrc }: FilterRowProps) {
	const { t } = useI18n();
	return (
		<ToggleGroup
			type="single"
			value={value}
			onValueChange={(v) => v && onChange(v as FilterId)}
			aria-label={t.result.filter}
			className="flex w-full flex-wrap gap-2"
		>
			{FILTERS.map((f) => (
				<ToggleGroupItem key={f.id} value={f.id} className="gap-2 pl-1.5" size="lg">
					{previewSrc && (
						// eslint-disable-next-line @next/next/no-img-element -- local preview
						<img src={previewSrc} alt="" className="size-8 rounded-full object-cover" style={{ filter: filterCss(f.id) }} />
					)}
					{t.filters[f.id]}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
