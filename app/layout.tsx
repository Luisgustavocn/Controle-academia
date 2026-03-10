import "./globals.css";
import { cache, CSSProperties, ReactNode } from "react";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { LayoutShell } from "@/components/layout-shell";
import { getBrandingConfig } from "@/lib/services/branding";

const loadBranding = cache(async () => getBrandingConfig());

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
    "--ink": branding.colors.ink,
    "--muted": branding.colors.muted,
    "--line": branding.colors.line,
    "--accent": branding.colors.accent,
    "--accent-dark": branding.colors.accentDark,
    "--accent-soft": branding.colors.accentSoft,
    "--sidebar": branding.colors.sidebar,
    "--sidebar-line": branding.colors.sidebarLine
  } as CSSProperties;

  return (
    <html lang="pt-BR">
      <body style={brandStyle}>
        {shouldUseShell && user ? <LayoutShell user={user} branding={branding}>{children}</LayoutShell> : children}
      </body>
    </html>
  );
}
