"use client";

import * as React from "react";
import { Link2 } from "lucide-react";

import { Checkbox, type CheckboxCheckedState } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type UserAccessGridOption = {
  id: string;
  key: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  linked?: boolean;
};

export type UserAccessGridGroup = {
  id: string;
  label: string;
  description?: string;
  kind: "module" | "menus";
  options: UserAccessGridOption[];
};

type UserAccessGridProps = {
  groups: UserAccessGridGroup[];
  disabled?: boolean;
  onOptionChange: (groupId: string, optionId: string, checked: boolean) => void;
  onGroupChange: (groupId: string, checked: boolean) => void;
};

export function UserAccessGrid({
  groups,
  disabled = false,
  onOptionChange,
  onGroupChange,
}: UserAccessGridProps) {
  const instanceId = React.useId();

  return (
    <div className="min-w-0 space-y-3" data-user-access-grid>
      {groups.map((group, groupIndex) => {
        const editableOptions = group.options.filter((option) => !option.disabled);
        const selectionOptions = editableOptions.length ? editableOptions : group.options;
        const checkedCount = selectionOptions.filter((option) => option.checked).length;
        const groupChecked: CheckboxCheckedState = checkedCount === 0
          ? false
          : checkedCount === selectionOptions.length
            ? true
            : "indeterminate";
        const groupDisabled = disabled || editableOptions.length === 0;
        const linked = group.options.some((option) => option.linked);
        const headingId = `${instanceId}-group-${groupIndex}`;
        const linkedDescriptionId = `${headingId}-linked`;

        return (
          <section
            key={group.id}
            aria-labelledby={headingId}
            aria-describedby={linked ? linkedDescriptionId : undefined}
            className="@container min-w-0 rounded-lg border border-border bg-card"
            data-user-access-group={group.kind}
          >
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-muted/20 px-3 py-2.5">
              <div className="min-w-0 flex-1 basis-40">
                <h3
                  id={headingId}
                  className="break-words text-sm font-semibold text-foreground [overflow-wrap:anywhere]"
                >
                  {group.label}
                </h3>
                {group.description ? (
                  <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                    {group.description}
                  </p>
                ) : null}
              </div>
              <label
                className={cn(
                  "flex min-h-8 min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground",
                  groupDisabled ? "cursor-not-allowed" : "cursor-pointer",
                )}
              >
                <Checkbox
                  checked={groupChecked}
                  disabled={groupDisabled}
                  aria-label={`Selecionar todos os acessos de ${group.label}`}
                  onCheckedChange={(checked) => {
                    if (!groupDisabled) onGroupChange(group.id, checked === true);
                  }}
                />
                <span>Selecionar grupo</span>
              </label>
            </div>

            <div className="min-w-0 space-y-2 p-3">
              <div className="grid min-w-0 gap-2 @sm:grid-cols-2 @xl:grid-cols-3">
                {group.options.map((option, optionIndex) => {
                  const optionDisabled = disabled || Boolean(option.disabled);
                  const descriptionId = `${headingId}-option-${optionIndex}`;

                  return (
                    <label
                      key={option.id}
                      className={cn(
                        "flex min-h-11 min-w-0 items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors",
                        option.checked
                          ? "border-primary/30 bg-primary/5"
                          : "border-border bg-background",
                        optionDisabled
                          ? "cursor-not-allowed"
                          : "cursor-pointer hover:border-primary/40 hover:bg-primary/5",
                      )}
                      data-user-access-option
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={option.checked}
                        disabled={optionDisabled}
                        aria-label={`${group.label}: ${option.label}`}
                        aria-describedby={option.description ? descriptionId : undefined}
                        onCheckedChange={(checked) => {
                          if (!optionDisabled) {
                            onOptionChange(group.id, option.id, checked === true);
                          }
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium leading-5 text-foreground [overflow-wrap:anywhere]">
                          {option.label}
                        </span>
                        {option.description ? (
                          <span
                            id={descriptionId}
                            className="mt-0.5 block break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]"
                          >
                            {option.description}
                          </span>
                        ) : null}
                        {option.disabled && !option.checked ? (
                          <span className="mt-1 block text-[11px] font-medium text-muted-foreground">
                            Indisponível
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              {linked ? (
                <p
                  id={linkedDescriptionId}
                  className="flex min-w-0 items-start gap-1.5 text-xs leading-5 text-muted-foreground"
                >
                  <Link2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    Acesso conjunto às três telas
                  </span>
                </p>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
