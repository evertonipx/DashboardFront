"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { canonicalCompanyTimeZone } from "@/lib/company-time-zone";
import {
  buildCompanyTimeZoneOptions,
  companyTimeZoneLabel,
  isPreferredCompanyTimeZone,
  readRuntimeCompanyTimeZones,
} from "@/lib/company-time-zone-options";

type CompanyTimeZoneSelectProps = {
  disabled?: boolean;
  id: string;
  onValueChange: (timeZone: string) => void;
  value: string;
};

export function CompanyTimeZoneSelect({
  disabled = false,
  id,
  onValueChange,
  value,
}: CompanyTimeZoneSelectProps) {
  const canonicalValue = canonicalCompanyTimeZone(value) ?? "";
  const [runtimeTimeZones, setRuntimeTimeZones] = React.useState<
    readonly string[]
  >([]);

  React.useEffect(() => {
    setRuntimeTimeZones(readRuntimeCompanyTimeZones());
  }, []);

  const options = React.useMemo(
    () => buildCompanyTimeZoneOptions(canonicalValue, runtimeTimeZones),
    [canonicalValue, runtimeTimeZones],
  );
  const preferredOptions = options.filter(isPreferredCompanyTimeZone);
  const remainingOptions = options.filter(
    (timeZone) => !isPreferredCompanyTimeZone(timeZone),
  );
  const descriptionId = `${id}-description`;

  return (
    <div className="min-w-0 max-w-full space-y-1.5">
      <Select
        disabled={disabled}
        value={canonicalValue || undefined}
        onValueChange={onValueChange}
      >
        <SelectTrigger
          id={id}
          aria-describedby={descriptionId}
          aria-required="true"
          data-company-time-zone-select=""
        >
          <SelectValue placeholder="Selecione um fuso IANA" />
        </SelectTrigger>
        <SelectContent
          align="start"
          className="max-h-80 w-[var(--radix-select-trigger-width)]"
          position="popper"
        >
          <SelectGroup>
            <SelectLabel>Brasil e UTC</SelectLabel>
            {preferredOptions.map((timeZone) => (
              <SelectItem key={timeZone} value={timeZone}>
                {companyTimeZoneLabel(timeZone)}
              </SelectItem>
            ))}
          </SelectGroup>
          {remainingOptions.length ? (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Outros fusos IANA</SelectLabel>
                {remainingOptions.map((timeZone) => (
                  <SelectItem key={timeZone} value={timeZone}>
                    {companyTimeZoneLabel(timeZone)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          ) : null}
        </SelectContent>
      </Select>
      <p
        id={descriptionId}
        className="break-words text-xs leading-5 text-muted-foreground"
      >
        Define o fechamento do dia e os agrupamentos por horário. Abra a lista
        e digite o nome da cidade para localizar.
      </p>
    </div>
  );
}
