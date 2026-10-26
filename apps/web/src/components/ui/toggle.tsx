"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Toggle as TogglePrimitive } from "radix-ui"

/** Chips: timer, filters, frames. Selected = ink fill. */
const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-sans text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 data-[state=on]:bg-ink data-[state=on]:text-background [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground hover:bg-border",
        outline:
          "border border-border bg-background text-foreground hover:bg-secondary data-[state=on]:border-ink",
      },
      size: {
        default: "h-9 min-w-9 px-4",
        sm: "h-8 min-w-8 px-3 text-xs",
        lg: "h-11 min-w-11 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
