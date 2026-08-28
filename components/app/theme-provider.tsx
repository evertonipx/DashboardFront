"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Toaster } from "sonner";

import { useAuth } from "@/components/app/auth-provider";
import { Button } from "@/components/ui/button";
import { getUserViewScopedStorageKey } from "@/lib/master-company-scope";
import { USER_GRID_HYDRATED_EVENT } from "@/lib/user-grid";
import {
  claimLegacyUserGridPreference,
  hasUserGridKnownDeletion,
  writeUserGridPreference,
} from "@/lib/user-grid-local";
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
  const { user } = useAuth();
  const userId = user?.id?.trim() ?? "";
  const [theme, setThemeState] = React.useState<Theme>(() => readStoredTheme());
  const [systemTheme, setSystemTheme] = React.useState<EffectiveTheme>(() =>
    readSystemTheme(),
  );

  const effectiveTheme = theme === "system" ? systemTheme : theme;

  React.useEffect(() => {
    const synchronizeTheme = () => {
      const storedTheme = readStoredTheme(userId);
      setThemeState(storedTheme);
      cacheThemeForBoot(storedTheme);
      if (
        userId &&
        !readThemeAtKey(themeStorageKey(userId)) &&
        !hasUserGridKnownDeletion(themeStorageKey(userId))
      ) {
        writeUserGridPreference(themeStorageKey(userId), storedTheme);
      }
    };
    const synchronizeThemeFromStorage = (event: StorageEvent) => {
      const scopedKey = userId ? themeStorageKey(userId) : THEME_STORAGE_KEY;
      if (event.key && event.key !== scopedKey) return;
      synchronizeTheme();
    };

    synchronizeTheme();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    syncSystemTheme();
    mediaQuery.addEventListener("change", syncSystemTheme);
    window.addEventListener(USER_GRID_HYDRATED_EVENT, synchronizeTheme);
    window.addEventListener("storage", synchronizeThemeFromStorage);

    return () => {
      mediaQuery.removeEventListener("change", syncSystemTheme);
      window.removeEventListener(USER_GRID_HYDRATED_EVENT, synchronizeTheme);
      window.removeEventListener("storage", synchronizeThemeFromStorage);
    };
  }, [userId]);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", effectiveTheme === "dark");
    root.style.colorScheme = effectiveTheme;
  }, [effectiveTheme]);

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      cacheThemeForBoot(nextTheme);
      if (userId) {
        writeUserGridPreference(themeStorageKey(userId), nextTheme);
      }
      setThemeState(nextTheme);
    },
    [userId],
  );

  const value = React.useMemo(
    () => ({ theme, effectiveTheme, setTheme }),
    [effectiveTheme, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function readStoredTheme(userId = ""): Theme {
  if (typeof window === "undefined") return "system";

  const scopedTheme = userId ? readThemeAtKey(themeStorageKey(userId)) : null;
  const legacyTheme = scopedTheme || hasUserGridKnownDeletion(themeStorageKey(userId))
    ? null
    : userId
      ? normalizeTheme(claimLegacyUserGridPreference(THEME_STORAGE_KEY, userId))
      : readThemeAtKey(THEME_STORAGE_KEY);
  const storedTheme = scopedTheme ?? legacyTheme;
  if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
    return storedTheme;
  }

  return "system";
}

function normalizeTheme(value: unknown): Theme | null {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : null;
}

function readThemeAtKey(storageKey: string): Theme | null {
  try {
    return normalizeTheme(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function cacheThemeForBoot(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme switching must remain usable when storage is unavailable.
  }
}

function themeStorageKey(userId: string) {
  return getUserViewScopedStorageKey(THEME_STORAGE_KEY, null, userId);
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
