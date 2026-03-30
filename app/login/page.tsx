"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Zap, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type BrandingPayload = {
  item?: {
    academyName?: string;
    logoUrl?: string;
  };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@academia.local");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [academyName, setAcademyName] = useState("Forja Prime Academia");
  const [logoUrl, setLogoUrl] = useState("/logo-forja.svg");

  useEffect(() => {
    void fetch("/api/branding", { cache: "no-store" })
      .then((res) => res.json() as Promise<BrandingPayload>)
      .then((payload) => {
        if (payload.item?.academyName) {
          setAcademyName(payload.item.academyName);
        }
        if (payload.item?.logoUrl) {
          setLogoUrl(payload.item.logoUrl);
        }
      })
      .catch(() => {
        setAcademyName("Forja Prime Academia");
        setLogoUrl("/logo-forja.svg");
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
        body: JSON.stringify({ email, password })
      });

      let data: { error?: string } | null = null;
      try {
        data = (await res.json()) as { error?: string };
      } catch {
        data = null;
      }

      if (!res.ok) {
        setError(data?.error ?? "Falha no login");
        setLoading(false);
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Nao foi possivel conectar ao servidor");
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center p-4 md:p-8">
      <div className="pointer-events-none absolute -left-24 top-8 h-64 w-64 rounded-full bg-[rgba(207,22,33,0.2)] blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-4 h-72 w-72 rounded-full bg-[rgba(150,16,24,0.16)] blur-3xl" />

      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="hidden rounded-3xl border border-white/40 bg-gradient-to-br from-[#271a1f] via-[#1b1417] to-[#1f1216] p-8 text-white shadow-[0_22px_50px_rgba(19,8,11,0.45)] lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-6 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/90">
              {academyName}
            </div>
            <h1 className="text-4xl font-black leading-tight">Gestao completa da academia em uma unica plataforma.</h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/75">
              Controle financeiro, frequencia, agenda personal e relatorios gerenciais com uma experiencia rapida e visual profissional.
            </p>
          </div>

          <ul className="mt-8 space-y-3 text-sm">
            <li className="flex items-center gap-2 text-white/90"><ShieldCheck className="h-4 w-4 text-[#ff828c]" /> Controle por perfil de acesso</li>
            <li className="flex items-center gap-2 text-white/90"><Zap className="h-4 w-4 text-[#ff828c]" /> Lancamentos rapidos para rotina diaria</li>
            <li className="flex items-center gap-2 text-white/90"><Trophy className="h-4 w-4 text-[#ff828c]" /> Dashboard com indicadores estrategicos</li>
          </ul>
        </section>

        <Card className="w-full max-w-xl justify-self-center p-6 md:p-7">
          <div className="mb-4 flex items-center gap-3">
            <img src={logoUrl} alt={academyName} className="h-[82px] w-[82px] rounded-full border border-line object-cover" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent">Acesso seguro</p>
              <h2 className="text-3xl font-black text-ink">Entrar</h2>
            </div>
          </div>

          <p className="text-sm text-muted">Acesso ao sistema de gestao da academia</p>

          <form className="mt-4 space-y-3" onSubmit={submit}>
            <label className="text-sm font-medium text-ink">
              E-mail
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="text-sm font-medium text-ink">
              Senha
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error ? <p className="rounded-lg border border-[#f1c5ca] bg-[#fff0f2] px-3 py-2 text-sm text-[#a21b25]">{error}</p> : null}
            <Button disabled={loading} className="mt-1 w-full">
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
