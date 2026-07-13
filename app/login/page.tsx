"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/app/auth-provider";
import { ThemeToggle } from "@/components/app/theme-provider";
import { resolvePostLoginPath } from "@/lib/access";
import {
  DEFAULT_LOGIN_BRANDING,
  type LoginBranding,
  loginBrandInitials,
  resolveLoginBranding,
} from "@/lib/login-branding";

export default function LoginPage() {
  const router = useRouter();
  const { login, user, loading } = useAuth();
  const [branding, setBranding] = React.useState<LoginBranding>(
    DEFAULT_LOGIN_BRANDING,
  );
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const isDefaultBrand = branding.key === DEFAULT_LOGIN_BRANDING.key;

  React.useEffect(() => {
    setBranding(resolveLoginBranding(window.location));
  }, []);

  React.useEffect(() => {
    let mounted = true;

    if (!loading && user) {
      resolvePostLoginPath(user).then((path) => {
        if (mounted) router.replace(path);
      });
    }

    return () => {
      mounted = false;
    };
  }, [loading, router, user]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    try {
      const currentUser = await login(email.trim(), password);
      toast.success("Login realizado com sucesso");
      router.replace(await resolvePostLoginPath(currentUser));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível autenticar.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Skeleton className="h-[420px] w-full max-w-md" />
      </main>
    );
  }

  return (
    <main className="relative grid min-h-screen bg-background lg:grid-cols-[1.02fr_0.98fr]">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <section
        className="hidden min-h-screen p-8 text-white lg:flex lg:flex-col"
        style={{ backgroundColor: branding.accentColor }}
      >
        <div className="flex items-center gap-3">
          <IPXDataMark />
          <div>
            <div className="text-lg font-semibold">IPXData</div>
          </div>
        </div>

        <div className="my-auto max-w-xl">
          <div className="mb-4 inline-flex items-center rounded-md border border-white/15 bg-white/[0.08] px-3 py-1 text-xs text-white/75">
            IPXData Dashboard
          </div>
          <div className="flex flex-col items-start gap-5">
            <BrandMark branding={branding} hero />
            <div className="max-w-lg text-3xl font-semibold leading-tight tracking-normal sm:text-4xl">
              Business Intelligence.
            </div>
          </div>
        </div>

      </section>

      <section className="flex min-h-screen items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-md border-border bg-card shadow-soft">
          <CardHeader className="space-y-2">
            <BrandMark branding={branding} compact />
            <CardTitle className="text-2xl">
              {isDefaultBrand
                ? "Entrar no IPXData"
                : `Entrar no ${branding.companyName}`}
            </CardTitle>
            <CardDescription>
              {isDefaultBrand
                ? "Use suas credenciais para acessar o ambiente operacional."
                : "Use suas credenciais IPXData para acessar o dashboard da empresa."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="voce@empresa.com"
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Sua senha"
                    className="pl-9 pr-10"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-10 w-10 text-muted-foreground"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button className="w-full" disabled={submitting}>
                {submitting ? "Entrando..." : "Entrar"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function IPXDataMark() {
  return (
    <div
      aria-label="Logo IPXData"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white text-xs font-black text-[#0B4EA2] shadow-sm"
      role="img"
    >
      IPX
    </div>
  );
}

function BrandMark({
  branding,
  compact = false,
  hero = false,
}: {
  branding: LoginBranding;
  compact?: boolean;
  hero?: boolean;
}) {
  const sizeClass = hero
    ? "h-32 w-32 sm:h-40 sm:w-40"
    : compact
      ? "h-11 w-11 lg:hidden"
      : "h-11 w-11";
  const logoClass = hero
    ? "h-24 w-24 sm:h-32 sm:w-32"
    : compact
      ? "h-8 w-8"
      : "h-8 w-8";
  const initialsClass = hero ? "text-4xl sm:text-5xl" : "text-xs";

  if (branding.logoUrl) {
    return (
      <div
        aria-label={`Logo ${branding.companyName}`}
        className={`${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-1.5 shadow-sm`}
        role="img"
      >
        <div
          className={logoClass}
          style={{
            backgroundImage: `url("${branding.logoUrl}")`,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "contain",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClass} ${initialsClass} flex shrink-0 items-center justify-center rounded-md bg-white font-black shadow-sm`}
      style={{ color: branding.accentColor }}
    >
      {loginBrandInitials(branding.companyName)}
    </div>
  );
}
