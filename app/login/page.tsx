"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@academia.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Falha no login");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-gradient-to-br from-cyan-50 via-white to-amber-50">
      <form className="card w-full max-w-md p-6 space-y-4" onSubmit={onSubmit}>
        <h1 className="text-2xl font-bold text-primary">Controle Academia SaaS</h1>
        <p className="text-sm text-slate-600">Acesse sua conta para continuar</p>

        <div>
          <label className="label">Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div>
          <label className="label">Senha</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button className="btn-primary w-full" type="submit">Entrar</button>
      </form>
    </div>
  );
}
