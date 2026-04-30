import type * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-9 w-full rounded-lg border border-input bg-background px-3 text-foreground outline-none transition focus:border-ring focus:ring-4 focus:ring-ring/20",
        className,
      )}
      {...props}
    />
  );
}
