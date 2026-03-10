import "./globals.css";
import { ReactNode } from "react";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { LayoutShell } from "@/components/layout-shell";

export const metadata = {
  title: "Controle Academia",
  description: "Sistema web completo para gestão de academia",
  icons: {
    icon: "/logo.jpeg",
    apple: "/logo.jpeg"
  }
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get("x-pathname");
  const user = await getSessionUser();
  const shouldUseShell = Boolean(user) && pathname !== "/login";

  return (
    <html lang="pt-BR">
      <body>{shouldUseShell && user ? <LayoutShell user={user}>{children}</LayoutShell> : children}</body>
    </html>
  );
}
