import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Controle Academia SaaS",
  description: "Gestao completa de academia com financeiro, frequencia e agenda.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
