"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  title: string;
  endpoint: string;
  listKey: string;
  samplePayload: Record<string, unknown>;
};

export function ModulePage({ title, endpoint, listKey, samplePayload }: Props) {
  const [data, setData] = useState<any[]>([]);
  const [jsonText, setJsonText] = useState(JSON.stringify(samplePayload, null, 2));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(endpoint);
    const payload = await res.json();
    setData(payload[listKey] || payload.despesas || payload.itens || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [endpoint]);

  async function createItem() {
    try {
      setError("");
      const parsed = JSON.parse(jsonText);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        const e = await res.json();
        setError(e.error || "Falha ao criar");
        return;
      }
      await load();
    } catch {
      setError("JSON invalido");
    }
  }

  const columns = useMemo(() => {
    const first = data[0];
    if (!first) return [];
    return Object.keys(first).slice(0, 8);
  }, [data]);

  return (
    <section className="space-y-4">
      <article className="card p-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-slate-500">Cadastro e listagem rapida com banco de dados.</p>
      </article>

      <article className="card p-4 space-y-3">
        <h3 className="font-semibold">Novo registro</h3>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          className="input min-h-44 font-mono text-xs"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary" onClick={createItem}>Salvar</button>
      </article>

      <article className="card p-4 overflow-auto">
        <h3 className="mb-3 font-semibold">Listagem</h3>
        {loading ? (
          <p>Carregando...</p>
        ) : (
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="text-left border-b border-slate-200">
                {columns.map((c) => (
                  <th key={c} className="py-2 pr-4">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={row.id || idx} className="border-b border-slate-100">
                  {columns.map((c) => (
                    <td key={c} className="py-2 pr-4">{typeof row[c] === "object" ? JSON.stringify(row[c]) : String(row[c] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </section>
  );
}
