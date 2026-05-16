import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "border-border bg-card/40 text-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        success:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 dark:text-emerald-300",
        warning:
          "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
        danger:
          "border-red-500/40 bg-red-500/10 text-red-500 dark:text-red-300",
        outline: "border-border text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
