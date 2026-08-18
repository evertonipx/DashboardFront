import * as React from "react";

import { cn } from "@/lib/utils";

export function WidgetCardActions({
  children,
  className,
  label,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "aria-label"> & {
  label: string;
}) {
  return (
    <div
      data-widget-actions
      role="group"
      aria-label={label}
      className={cn(
        "flex shrink-0 flex-nowrap items-center justify-end gap-0.5 self-start justify-self-end",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
