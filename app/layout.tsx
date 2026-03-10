import "./globals.css";
import { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth/session";
import { LayoutShell } from "@/components/layout-shell";

export const metadata = {
  title: "Controle Academia",
  description: "Sistema web completo para gestão de academia"
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

  return (
    <html lang="pt-BR">
      <body>{user ? <LayoutShell user={user}>{children}</LayoutShell> : children}</body>
    </html>
  );
}
