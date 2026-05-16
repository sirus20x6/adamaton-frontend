import { Check, Monitor, Moon, Sun } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
};

const OPTIONS: ReadonlyArray<{
  value: Theme;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isDarkResolved = resolvedTheme === "dark";
  const ariaLabel =
    theme === "system"
      ? `Theme: system (${resolvedTheme})`
      : `Theme: ${theme}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          title={ariaLabel}
          className={cn(
            "relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-border",
            "bg-card/40 text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          {isDarkResolved ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
          {theme === "system" ? (
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full",
                "bg-primary ring-2 ring-card",
              )}
            />
          ) : null}
          <span className="sr-only">{ariaLabel}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[8rem]">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const selected = theme === value;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => setTheme(value)}
              className={cn(
                "justify-between gap-2",
                selected && "text-foreground",
              )}
              aria-current={selected ? "true" : undefined}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
              {selected ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <span className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
