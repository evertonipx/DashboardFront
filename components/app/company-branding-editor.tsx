"use client";

import Image from "next/image";
import * as React from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  COMPANY_BRANDING_ACCEPT,
  fetchCompanyBrandingBlob,
  type CompanyBrandingKind,
} from "@/lib/company-branding";
import { abortRequest, isAbortError } from "@/lib/request-cancellation";
import { cn } from "@/lib/utils";

type CompanyBrandingEditorProps = {
  bannerFile: File | null;
  companyId?: string;
  disabled?: boolean;
  hasBanner: boolean;
  hasLogo: boolean;
  logoFile: File | null;
  onFileChange: (kind: CompanyBrandingKind, file: File | null) => void;
};

export function CompanyBrandingEditor({
  bannerFile,
  companyId,
  disabled = false,
  hasBanner,
  hasLogo,
  logoFile,
  onFileChange,
}: CompanyBrandingEditorProps) {
  return (
    <section className="min-w-0 space-y-3 rounded-lg border border-border bg-muted/15 p-3 sm:p-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">Identidade visual</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Personalize a marca exibida para esta empresa. PNG, JPEG, GIF ou WebP,
          com até 5 MB por imagem.
        </p>
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
        <BrandingAssetField
          companyId={companyId}
          disabled={disabled}
          file={logoFile}
          hasExisting={hasLogo}
          kind="logo"
          onFileChange={onFileChange}
        />
        <BrandingAssetField
          companyId={companyId}
          disabled={disabled}
          file={bannerFile}
          hasExisting={hasBanner}
          kind="banner"
          onFileChange={onFileChange}
        />
      </div>
    </section>
  );
}

function BrandingAssetField({
  companyId,
  disabled,
  file,
  hasExisting,
  kind,
  onFileChange,
}: {
  companyId?: string;
  disabled: boolean;
  file: File | null;
  hasExisting: boolean;
  kind: CompanyBrandingKind;
  onFileChange: (kind: CompanyBrandingKind, file: File | null) => void;
}) {
  const inputId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = React.useState("");
  const [previewError, setPreviewError] = React.useState(false);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const label = kind === "logo" ? "Logo" : "Banner";

  React.useEffect(() => {
    let active = true;
    let objectUrl = "";
    const controller = new AbortController();

    setPreviewError(false);
    setLoadingPreview(false);

    if (file) {
      objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }

    if (!companyId || !hasExisting) {
      setPreviewUrl("");
      return () => abortRequest(controller);
    }

    setPreviewUrl("");
    setLoadingPreview(true);
    void fetchCompanyBrandingBlob({
      companyId,
      kind,
      signal: controller.signal,
    })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (!active || isAbortError(error, controller.signal)) return;
        setPreviewError(true);
      })
      .finally(() => {
        if (active) setLoadingPreview(false);
      });

    return () => {
      active = false;
      abortRequest(
        controller,
        "A prévia da identidade visual foi fechada.",
      );
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [companyId, file, hasExisting, kind]);

  const status = file
    ? `${file.name} · ${formatFileSize(file.size)}`
    : hasExisting
      ? previewError
        ? "Imagem atual indisponível para prévia"
        : "Imagem atual"
      : "Ainda não configurado";

  return (
    <div className="min-w-0 space-y-2 rounded-md border border-border/80 bg-background p-2.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={status}>
            {status}
          </p>
        </div>
        {file ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            onClick={() => onFileChange(kind, null)}
            disabled={disabled}
            aria-label={`Descartar novo ${label.toLocaleLowerCase("pt-BR")}`}
            title="Descartar seleção"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      <div
        className={cn(
          "relative flex min-w-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-muted/20",
          kind === "logo" ? "h-32" : "min-h-32 aspect-[16/5]",
        )}
      >
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt={`Prévia do ${label.toLocaleLowerCase("pt-BR")}`}
            fill
            unoptimized
            sizes={kind === "logo" ? "240px" : "640px"}
            className={kind === "logo" ? "object-contain p-3" : "object-contain"}
          />
        ) : loadingPreview ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <div className="flex flex-col items-center gap-2 px-3 text-center text-muted-foreground">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
            <span className="text-[11px] leading-4">
              {previewError ? "Prévia indisponível" : `Selecione um ${label.toLocaleLowerCase("pt-BR")}`}
            </span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={COMPANY_BRANDING_ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const selectedFile = event.currentTarget.files?.[0] ?? null;
          onFileChange(kind, selectedFile);
          event.currentTarget.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        <Upload className="h-3.5 w-3.5" />
        {file || hasExisting ? `Trocar ${label.toLocaleLowerCase("pt-BR")}` : `Escolher ${label.toLocaleLowerCase("pt-BR")}`}
      </Button>
    </div>
  );
}

function formatFileSize(bytes: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
  }).format(bytes / (1024 * 1024)) + " MB";
}
