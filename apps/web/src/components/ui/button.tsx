import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/*
 * Snapduo button. Two families:
 *  - calm (camera screens): flat, no outline, no shadow
 *  - playful (landing / result / about): 2px ink outline; the single
 *    primary CTA also gets the hard shadow ("playful" + shadow-hard-press)
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-sans font-medium whitespace-nowrap transition-[background-color,color,transform,box-shadow] outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        /** Calm primary: orange fill, ink text. */
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        /** Playful primary: + ink outline + hard shadow. Use once per screen. */
        playful:
          "bg-primary text-primary-foreground outline-playful shadow-hard-press hover:bg-primary-hover",
        /** Calm secondary: surface fill, 1px border. */
        secondary:
          "border border-border bg-background text-foreground hover:bg-secondary",
        /** Playful secondary: white with 2px ink outline, no shadow. */
        "secondary-playful":
          "outline-playful bg-background text-foreground hover:bg-secondary",
        /** Neutral icon buttons (mic, camera switch, leave). */
        neutral: "bg-secondary text-secondary-foreground hover:bg-border",
        /** Active-off state, e.g. mic muted. */
        inverted: "bg-ink text-background hover:bg-ink/85",
        ghost: "text-foreground hover:bg-secondary",
        link: "rounded-none px-0 text-foreground underline decoration-1 underline-offset-4 hover:decoration-2",
        "destructive-link":
          "rounded-none px-0 text-destructive underline decoration-1 underline-offset-4 hover:decoration-2",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-13 px-6 text-base has-[>svg]:px-5",
        sm: "h-10 px-4 text-sm has-[>svg]:px-3.5 [&_svg:not([class*='size-'])]:size-4",
        inline: "h-auto p-0 text-sm",
        icon: "size-13",
        "icon-sm": "size-10 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
