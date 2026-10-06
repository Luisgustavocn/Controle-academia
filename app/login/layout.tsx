import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta para continuar.",
  icons: {
    icon: [],
    apple: []
  }
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
