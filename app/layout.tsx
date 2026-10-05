import "./globals.css";
import { cache, CSSProperties, ReactNode } from "react";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { LayoutShell } from "@/components/layout-shell";
import { getBrandingConfig } from "@/lib/services/branding";
import { ToastProvider } from "@/components/ui/toast";

const loadBranding = cache(async () => getBrandingConfig());

function hexToRgbChannels(value: string, fallback: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  const safe = match?.[1] ?? fallback;
  return `${Number.parseInt(safe.slice(0, 2), 16)} ${Number.parseInt(safe.slice(2, 4), 16)} ${Number.parseInt(safe.slice(4, 6), 16)}`;
}

export async function generateMetadata() {
  const branding = await loadBranding();
  const logoUrl = branding.logoUrl || "/logo-forja.svg";

  return {
    title: branding.academyName,
    description: `Sistema web completo para gestão da ${branding.academyName}`,
    icons: {
      icon: logoUrl,
      apple: logoUrl
    }
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get("x-pathname");
  const user = await getSessionUser();
  const branding = await loadBranding();
  const shouldUseShell = Boolean(user) && pathname !== "/login";
  const brandStyle = {
    "--bg": branding.colors.bg,
    "--bg-rgb": hexToRgbChannels(branding.colors.bg, "f5f1f0"),
    "--ink": branding.colors.ink,
    "--ink-rgb": hexToRgbChannels(branding.colors.ink, "1f1718"),
    "--muted": branding.colors.muted,
    "--muted-rgb": hexToRgbChannels(branding.colors.muted, "6f6466"),
    "--line": branding.colors.line,
    "--line-rgb": hexToRgbChannels(branding.colors.line, "ddd2d4"),
    "--accent": branding.colors.accent,
    "--accent-rgb": hexToRgbChannels(branding.colors.accent, "c51623"),
    "--accent-dark": branding.colors.accentDark,
    "--accent-dark-rgb": hexToRgbChannels(branding.colors.accentDark, "8e1018"),
    "--accent-soft": branding.colors.accentSoft,
    "--accent-soft-rgb": hexToRgbChannels(branding.colors.accentSoft, "fbeaec"),
    "--sidebar": branding.colors.sidebar,
    "--sidebar-rgb": hexToRgbChannels(branding.colors.sidebar, "181113"),
    "--sidebar-line": branding.colors.sidebarLine,
    "--sidebar-line-rgb": hexToRgbChannels(branding.colors.sidebarLine, "2e2025")
  } as CSSProperties;

  return (
    <html lang="pt-BR">
      <body style={brandStyle}>
        <ToastProvider>
          {shouldUseShell && user ? <LayoutShell user={user} branding={branding}>{children}</LayoutShell> : children}
        </ToastProvider>
      </body>
    </html>
  );
}
