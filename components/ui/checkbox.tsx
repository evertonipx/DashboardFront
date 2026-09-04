"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

export type CheckboxCheckedState = boolean | "indeterminate";

export interface CheckboxProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "checked" | "defaultChecked" | "onChange" | "type"
  > {
  checked?: CheckboxCheckedState;
  defaultChecked?: CheckboxCheckedState;
  onCheckedChange?: (checked: CheckboxCheckedState) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      checked,
      className,
      defaultChecked = false,
      disabled,
      onCheckedChange,
      ...props
    },
    forwardedRef,
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [uncontrolledChecked, setUncontrolledChecked] =
      React.useState<CheckboxCheckedState>(defaultChecked);
    const resolvedChecked = checked ?? uncontrolledChecked;
    const isIndeterminate = resolvedChecked === "indeterminate";
    const isChecked = resolvedChecked === true;

    React.useImperativeHandle(forwardedRef, () => inputRef.current!, []);

    React.useLayoutEffect(() => {
      if (!inputRef.current) return;
      inputRef.current.indeterminate = isIndeterminate;
    }, [isIndeterminate]);

    return (
      <span
        className={cn(
          "relative inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle",
          disabled && "opacity-50",
          className,
        )}
        data-disabled={disabled ? "" : undefined}
        data-state={
          isIndeterminate ? "indeterminate" : isChecked ? "checked" : "unchecked"
        }
      >
        <input
          ref={inputRef}
          type="checkbox"
          role="checkbox"
          aria-checked={isIndeterminate ? "mixed" : isChecked}
          checked={isChecked}
          disabled={disabled}
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none rounded-[4px] opacity-0 disabled:cursor-not-allowed"
          onChange={(event) => {
            const nextChecked = event.currentTarget.checked;
            if (checked === undefined) setUncontrolledChecked(nextChecked);
            onCheckedChange?.(nextChecked);
          }}
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none flex h-full w-full items-center justify-center rounded-[4px] border border-input bg-background text-primary-foreground shadow-sm transition-colors",
            "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
            (isChecked || isIndeterminate) && "border-primary bg-primary",
          )}
        >
          {isIndeterminate ? (
            <Minus className="h-3 w-3 stroke-[3]" />
          ) : isChecked ? (
            <Check className="h-3 w-3 stroke-[3]" />
          ) : null}
        </span>
      </span>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
