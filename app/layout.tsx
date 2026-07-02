import type { Metadata } from "next";

import "@/app/globals.css";
import { AuthProvider } from "@/components/app/auth-provider";
import { AppToaster, ThemeProvider } from "@/components/app/theme-provider";

export const metadata: Metadata = {
  title: "IPXData",
  description: "Frontend operacional para analytics de video do IPXData.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem("ipxdata-theme") || "system";
                var dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
                document.documentElement.classList.toggle("dark", dark);
                document.documentElement.style.colorScheme = dark ? "dark" : "light";
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            {children}
            <AppToaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
