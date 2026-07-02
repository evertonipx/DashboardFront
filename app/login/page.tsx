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

export default function LoginPage() {
  const router = useRouter();
  const { login, user, loading } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

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
      <section className="hidden min-h-screen bg-[#0B4EA2] p-8 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-sm font-black text-[#0B4EA2]">
            IPX
          </div>
          <div>
            <div className="text-lg font-semibold">IPXData</div>
            <div className="text-xs text-white/65">IPExtreme Analytics</div>
          </div>
        </div>

        <div className="my-auto max-w-xl">
          <div className="mb-4 inline-flex items-center rounded-md border border-white/15 bg-white/[0.08] px-3 py-1 text-xs text-white/75">
            Enterprise Video Analytics
          </div>
          <h1 className="text-4xl font-semibold tracking-normal text-balance">
            Monitoramento limpo para dados ao vivo e cenários.
          </h1>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {["Ao vivo", "Cenários", "Dashboard"].map((item) => (
              <div
                key={item}
                className="rounded-md border border-white/15 bg-white/[0.08] p-4"
              >
                <div className="h-1.5 w-8 rounded-full bg-sky-200" />
                <div className="mt-4 text-sm font-medium">{item}</div>
              </div>
            ))}
          </div>
        </div>

      </section>

      <section className="flex min-h-screen items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-md border-border bg-card shadow-soft">
          <CardHeader className="space-y-2">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground lg:hidden">
              IPX
            </div>
            <CardTitle className="text-2xl">Entrar no IPXData</CardTitle>
            <CardDescription>
              Use suas credenciais para acessar o ambiente operacional.
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
