"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Toaster } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";
type EffectiveTheme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  effectiveTheme: EffectiveTheme;
  setTheme: (theme: Theme) => void;
};

const THEME_STORAGE_KEY = "ipxdata-theme";
const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => readStoredTheme());
  const [systemTheme, setSystemTheme] = React.useState<EffectiveTheme>(() =>
    readSystemTheme(),
  );

  const effectiveTheme = theme === "system" ? systemTheme : theme;

  React.useEffect(() => {
    setThemeState(readStoredTheme());

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    syncSystemTheme();
    mediaQuery.addEventListener("change", syncSystemTheme);

    return () => {
      mediaQuery.removeEventListener("change", syncSystemTheme);
    };
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", effectiveTheme === "dark");
    root.style.colorScheme = effectiveTheme;
  }, [effectiveTheme]);

  const setTheme = React.useCallback((nextTheme: Theme) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setThemeState(nextTheme);
  }, []);

  const value = React.useMemo(
    () => ({ theme, effectiveTheme, setTheme }),
    [effectiveTheme, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
    return storedTheme;
  }

  return "system";
}

function readSystemTheme(): EffectiveTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeToggle({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { effectiveTheme, setTheme } = useTheme();
  const nextTheme = effectiveTheme === "dark" ? "light" : "dark";
  const label = nextTheme === "dark" ? "Ativar modo dark" : "Ativar modo light";
  const Icon = effectiveTheme === "dark" ? Sun : Moon;

  return (
    <Button
      type="button"
      variant="ghost"
      size={showLabel ? "default" : "icon"}
      className={cn(showLabel && "w-full justify-start", className)}
      onClick={() => setTheme(nextTheme)}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
      {showLabel ? label : null}
    </Button>
  );
}

export function AppToaster() {
  const { effectiveTheme } = useTheme();

  return (
    <Toaster
      richColors
      closeButton
      position="top-right"
      theme={effectiveTheme}
    />
  );
}

export function useTheme() {
  const context = React.useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
