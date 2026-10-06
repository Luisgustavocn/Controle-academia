"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SetupStatusPayload = {
  setupRequired?: boolean;
  email?: string | null;
};

const neutralLoginTheme = {
  "--bg": "#f5f5f4",
  "--bg-rgb": "245 245 244",
  "--card": "#ffffff",
  "--card-rgb": "255 255 255",
  "--ink": "#1c1917",
  "--ink-rgb": "28 25 23",
  "--muted": "#57534e",
  "--muted-rgb": "87 83 78",
  "--line": "#d6d3d1",
  "--line-rgb": "214 211 209",
  "--accent": "#1f2937",
  "--accent-rgb": "31 41 55",
  "--accent-dark": "#111827",
  "--accent-dark-rgb": "17 24 39",
  "--accent-soft": "#f3f4f6",
  "--accent-soft-rgb": "243 244 246"
} as CSSProperties;

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("admin@academia.local");
  const [password, setPassword] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupEmail, setSetupEmail] = useState("admin@academia.local");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirmPassword, setSetupConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const redirectTo = useMemo(() => {
    const from = searchParams.get("from");
    return from && from.startsWith("/") ? from : "/dashboard";
  }, [searchParams]);

  useEffect(() => {
    void fetch("/api/auth/setup", { cache: "no-store" })
      .then((res) => res.json() as Promise<SetupStatusPayload>)
      .then((payload) => {
        const nextSetupRequired = Boolean(payload.setupRequired);
        setSetupRequired(nextSetupRequired);
        if (payload.email) {
          setEmail(payload.email);
          setSetupEmail(payload.email);
        }
      })
      .catch(() => {
        setSetupRequired(false);
      })
      .finally(() => {
        setSetupLoading(false);
      });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "same-origin"
      });

      if (!res.ok) {
        let message = "Falha no login";
        let shouldOpenSetup = false;

        try {
          const data = (await res.json()) as { error?: string; setupRequired?: boolean };
          message = data.error ?? message;
          shouldOpenSetup = Boolean(data.setupRequired);
        } catch {
          message = "Não foi possível concluir o login.";
        }

        if (shouldOpenSetup) {
          setSetupRequired(true);
          setSetupEmail(email || "admin@academia.local");
        }
        setError(message);
        return;
      }

      // Force a full navigation so middleware/server components see the fresh session cookie.
      window.location.assign(redirectTo);
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  async function submitFirstAccess(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: setupEmail,
          password: setupPassword,
          confirmPassword: setupConfirmPassword
        }),
        credentials: "same-origin"
      });

      if (!res.ok) {
        let message = "Falha ao concluir o primeiro acesso";

        try {
          const data = (await res.json()) as { error?: string };
          message = data.error ?? message;
        } catch {
          message = "Não foi possível concluir a configuração inicial.";
        }

        setError(message);
        return;
      }

      window.location.assign(redirectTo);
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-8 sm:px-6 md:py-12"
      style={neutralLoginTheme}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(31,41,55,0.08),transparent_42%)]" aria-hidden="true" />

      <Card className="relative w-full max-w-md rounded-[1.25rem] p-6 shadow-[0_20px_55px_rgba(28,25,23,0.10)] sm:p-8">
        <header className="mb-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Acesso seguro</p>
          <h1 className="text-3xl font-black tracking-tight text-ink">Entrar</h1>
          <p className="text-sm leading-relaxed text-muted" aria-live="polite">
            {setupLoading
              ? "Verificando configuração inicial..."
              : setupRequired
                ? "Primeiro acesso: defina o e-mail e a senha do administrador."
                : "Acesse sua conta para continuar"}
          </p>
        </header>

        {setupRequired ? (
          <form className="space-y-4" onSubmit={submitFirstAccess}>
            <div className="space-y-1.5">
              <label htmlFor="setup-email" className="block text-sm font-medium text-ink">
                E-mail do administrador
              </label>
              <Input
                id="setup-email"
                type="email"
                autoComplete="email"
                value={setupEmail}
                onChange={(event) => setSetupEmail(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="setup-password" className="block text-sm font-medium text-ink">
                Nova senha
              </label>
              <Input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                value={setupPassword}
                onChange={(event) => setSetupPassword(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="setup-confirm-password" className="block text-sm font-medium text-ink">
                Confirmar senha
              </label>
              <Input
                id="setup-confirm-password"
                type="password"
                autoComplete="new-password"
                value={setupConfirmPassword}
                onChange={(event) => setSetupConfirmPassword(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
                required
              />
            </div>
            {error ? <p id="login-error" role="alert" className="rounded-lg border border-[#f1c5ca] bg-[#fff0f2] px-3 py-2 text-sm text-[#a21b25]">{error}</p> : null}
            <Button type="submit" loading={loading} disabled={setupLoading} className="mt-1 w-full">
              {loading ? "Salvando..." : "Criar acesso inicial"}
            </Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-sm font-medium text-ink">
                E-mail
              </label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-sm font-medium text-ink">
                Senha
              </label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
                required
              />
            </div>
            {error ? <p id="login-error" role="alert" className="rounded-lg border border-[#f1c5ca] bg-[#fff0f2] px-3 py-2 text-sm text-[#a21b25]">{error}</p> : null}
            <Button type="submit" loading={loading} disabled={setupLoading} className="mt-1 w-full">
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
