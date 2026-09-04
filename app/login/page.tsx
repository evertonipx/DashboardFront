"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  ChartSpline,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { ThemeToggle } from "@/components/app/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { resolvePostLoginPath } from "@/lib/access";
import {
  preloadAppRoute,
  type AppDashboardModule,
} from "@/lib/app-route-preload";
import {
  canViewCounting,
  canViewDemographics,
  canViewOccupancy,
} from "@/lib/permissions";
import type { CurrentUser } from "@/lib/types";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import {
  DEFAULT_LOGIN_BRANDING,
  type LoginBranding,
  loginBrandColorWithAlpha,
  loginBrandInitials,
  readableLoginBrandColor,
  resolveLoginBranding,
} from "@/lib/login-branding";

const LOGIN_CAPABILITIES = [
  {
    icon: Activity,
    title: "Operação em tempo real",
  },
  {
    icon: BarChart3,
    title: "Análises com contexto",
  },
  {
    icon: ChartSpline,
    title: "Inteligência de dados",
  },
] as const;

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
  const [formError, setFormError] = React.useState("");
  const loginAttemptRef = React.useRef(0);
  const submitOwnsNavigationRef = React.useRef(false);
  const submitInFlightRef = React.useRef(false);
  const isDefaultBrand = branding.key === DEFAULT_LOGIN_BRANDING.key;

  React.useEffect(() => {
    setBranding(resolveLoginBranding(window.location));
  }, []);

  React.useEffect(() => {
    let mounted = true;

    if (!loading && user && !submitOwnsNavigationRef.current) {
      loginAttemptRef.current += 1;
      setFormError("");
      setSubmitting(false);
      resolvePostLoginPath(user).then((path) => {
        if (mounted) navigateToAuthenticatedRoute(router, path, user);
      });
    }

    return () => {
      mounted = false;
    };
  }, [loading, router, user]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React state is applied on the next render. A synchronous ref closes the
    // small window in which Enter + click (or a double click) could send two
    // successful login requests with the same credentials.
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    submitOwnsNavigationRef.current = true;
    const loginAttempt = ++loginAttemptRef.current;
    setFormError("");
    setSubmitting(true);

    try {
      const currentUser = await login(email.trim(), password);
      if (loginAttempt !== loginAttemptRef.current) return;
      toast.success("Login realizado com sucesso");
      const path = await resolvePostLoginPath(currentUser);
      navigateToAuthenticatedRoute(router, path, currentUser);
    } catch (error) {
      if (loginAttempt !== loginAttemptRef.current) return;
      submitOwnsNavigationRef.current = false;
      const message = userFacingErrorMessage(
        error,
        "Não foi possível autenticar. Verifique os dados informados e tente novamente.",
      );
      setFormError(message);
      toast.error(message);
    } finally {
      submitInFlightRef.current = false;
      if (loginAttempt === loginAttemptRef.current) {
        setSubmitting(false);
      }
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-[100dvh] bg-background lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
        <div className="hidden bg-slate-950 lg:block" aria-hidden="true" />
        <section
          aria-label="Carregando acesso ao IPXData"
          className="flex items-center justify-center p-5 sm:p-8"
        >
          <div className="w-full max-w-[460px] space-y-5">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-[480px] w-full rounded-xl" />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative grid min-h-[100dvh] overflow-hidden bg-background lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
      <aside
        aria-label="Apresentação da plataforma IPXData"
        className="relative hidden min-h-[100dvh] overflow-hidden px-8 py-7 text-white lg:flex lg:flex-col xl:px-12 xl:py-10"
        style={brandPanelStyle(branding.accentColor)}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgb(255 255 255 / 0.055) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.055) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute -left-24 bottom-[-8rem] h-80 w-80 rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="absolute -left-10 bottom-[-5rem] h-56 w-56 rounded-full border border-white/10"
        />

        <header className="relative z-10 flex items-center gap-3">
          <IPXDataMark />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
              Inteligência de dados
            </div>
            <div className="text-lg font-semibold tracking-tight">IPXData</div>
          </div>
        </header>

        <div className="relative z-10 my-auto max-w-2xl py-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm">
            <ShieldCheck className="h-3.5 w-3.5" />
            Ambiente operacional integrado
          </div>

          <BrandMark branding={branding} hero />

          <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3">
            {LOGIN_CAPABILITIES.map(({ icon: Icon, title }) => (
              <div
                key={title}
                className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.055] px-3.5 py-3 backdrop-blur-sm"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 text-sm font-semibold leading-5 text-white">
                  {title}
                </div>
              </div>
            ))}
          </div>
        </div>

      </aside>

      <section className="relative flex min-h-[100dvh] items-center justify-center px-4 py-16 sm:px-8 lg:px-10 xl:px-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[-8rem] top-[-8rem] h-80 w-80 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-10rem] left-[-8rem] h-72 w-72 rounded-full bg-accent/10 blur-3xl"
        />

        <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
          <ThemeToggle className="border border-border/80 bg-card/80 shadow-sm backdrop-blur-sm" />
        </div>

        <div className="relative z-10 w-full max-w-[460px]">
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <IPXDataMark compact />
            <div className="min-w-0">
              <div className="text-sm font-semibold">IPXData</div>
              <div className="text-xs text-muted-foreground">
                Inteligência de dados
              </div>
            </div>
          </div>

          <Card className="overflow-hidden rounded-xl border-border/80 bg-card/95 shadow-[0_24px_70px_-38px_hsl(var(--foreground)/0.45)] backdrop-blur-sm">
            <div
              aria-hidden="true"
              className="h-1 w-full"
              style={{ backgroundColor: branding.accentColor }}
            />
            <CardHeader className="gap-0 px-6 pb-5 pt-6 sm:px-8 sm:pt-8">
              <div className="mb-5 flex min-w-0 items-start justify-between gap-3">
                <BrandMark branding={branding} compact />
                <div className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Acesso seguro
                </div>
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                Acesso ao ambiente
              </div>
              <h1 className="mt-2 min-w-0 break-words text-balance text-2xl font-semibold leading-tight tracking-[-0.025em] [overflow-wrap:anywhere] sm:text-[1.75rem]">
                {isDefaultBrand
                  ? "Bem-vindo ao IPXData"
                  : `Bem-vindo ao ambiente ${branding.companyName}`}
              </h1>
              <CardDescription className="mt-2 max-w-sm leading-6">
                {isDefaultBrand
                  ? "Entre com suas credenciais para continuar para o painel operacional."
                  : "Use suas credenciais IPXData para acessar os dados e painéis da empresa."}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
              <form
                aria-busy={submitting}
                className="space-y-5"
                onSubmit={onSubmit}
              >
                {formError ? (
                  <div
                    id="login-error"
                    className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                    role="alert"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{formError}</span>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail corporativo</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      autoCapitalize="none"
                      autoComplete="email"
                      autoCorrect="off"
                      spellCheck={false}
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (formError) setFormError("");
                      }}
                      placeholder="voce@empresa.com"
                      className="h-11 rounded-lg bg-background/75 pl-10"
                      aria-describedby={formError ? "login-error" : undefined}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">Senha</Label>
                    <span className="text-[11px] text-muted-foreground">
                      Credencial do seu ambiente
                    </span>
                  </div>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        if (formError) setFormError("");
                      }}
                      placeholder="Digite sua senha"
                      className="h-11 rounded-lg bg-background/75 pl-10 pr-11"
                      aria-describedby={formError ? "login-error" : undefined}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-11 w-11 rounded-lg text-muted-foreground"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="h-11 w-full rounded-lg"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Validando acesso...
                    </>
                  ) : (
                    <>
                      Entrar no ambiente
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                <div className="flex items-center gap-2 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">
                  <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-primary" />
                  Acesso protegido para sua empresa.
                </div>
              </form>
            </CardContent>
          </Card>

          <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
            Precisa de acesso? Fale com o administrador responsável pela sua empresa.
          </p>
        </div>
      </section>
    </main>
  );
}

function navigateToAuthenticatedRoute(
  router: ReturnType<typeof useRouter>,
  path: string,
  user: CurrentUser,
) {
  router.prefetch(path);
  preloadAppRoute(path, preferredDashboardModule(user));
  router.replace(path);
}

function preferredDashboardModule(
  user: CurrentUser,
): AppDashboardModule | undefined {
  if (canViewCounting(user)) return "counting";
  if (canViewOccupancy(user)) return "occupancy";
  if (canViewDemographics(user)) return "demographics";
  return undefined;
}

function IPXDataMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-label="Logo IPXData"
      className={`${compact ? "h-10 w-10" : "h-11 w-11"} flex shrink-0 items-center justify-center rounded-xl bg-white text-[11px] font-black tracking-tight text-[#0B4EA2] shadow-sm ring-1 ring-black/5`}
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
  const sizeClass = branding.logoUrl
    ? hero
      ? "h-20 w-52 sm:h-24 sm:w-64"
      : compact
        ? "h-10 w-28 sm:h-12 sm:w-36 lg:hidden"
        : "h-12 w-36"
    : hero
      ? "h-20 w-20 sm:h-24 sm:w-24"
      : compact
        ? "h-10 w-10 sm:h-12 sm:w-12 lg:hidden"
        : "h-12 w-12";
  const initialsClass = hero ? "text-3xl sm:text-4xl" : "text-xs";

  if (branding.logoUrl) {
    return (
      <div
        aria-label={`Logo ${branding.companyName}`}
        className={`${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-2 shadow-lg ring-1 ring-black/5`}
        role="img"
      >
        <div
          className="h-full w-full"
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
      aria-label={`Marca ${branding.companyName}`}
      className={`${sizeClass} ${initialsClass} flex shrink-0 items-center justify-center rounded-xl bg-white font-black shadow-lg ring-1 ring-black/5`}
      role="img"
      style={{ color: readableLoginBrandColor(branding.accentColor) }}
    >
      {loginBrandInitials(branding.companyName)}
    </div>
  );
}

function brandPanelStyle(accentColor: string): React.CSSProperties {
  return {
    backgroundColor: "#07111f",
    backgroundImage: [
      `radial-gradient(circle at 14% 18%, ${loginBrandColorWithAlpha(accentColor, 0.28)} 0, transparent 34%)`,
      `radial-gradient(circle at 88% 78%, ${loginBrandColorWithAlpha(accentColor, 0.14)} 0, transparent 31%)`,
      "linear-gradient(145deg, #07111f 0%, #0a1b2f 52%, #081321 100%)",
    ].join(", "),
  };
}
