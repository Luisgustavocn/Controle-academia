"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";

type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime-local" | "textarea" | "select";
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
};

type CrudModuleProps = {
  endpoint: string;
  title: string;
  fields: Field[];
  listFields: string[];
  defaultValues?: Record<string, string>;
  searchPlaceholder?: string;
};

export function CrudModule({ endpoint, title, fields, listFields, defaultValues, searchPlaceholder }: CrudModuleProps) {
  const [items, setItems] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(defaultValues ?? {});

  async function fetchItems() {
    setLoading(true);
    const query = search ? `?q=${encodeURIComponent(search)}` : "";
    const res = await fetch(`${endpoint}${query}`);
    const data = await res.json();
    setItems(Array.isArray(data.items) ? data.items : []);
    setLoading(false);
  }

  useEffect(() => {
    void fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchItems();
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const headers = useMemo(() => listFields, [listFields]);

  function onChange(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    const method = editingId ? "PUT" : "POST";
    const target = editingId ? `${endpoint}/${editingId}` : endpoint;
    const res = await fetch(target, {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(form)
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? "Erro ao salvar");
      return;
    }

    setForm(defaultValues ?? {});
    setEditingId(null);
    await fetchItems();
  }

  function startEdit(item: Record<string, string>) {
    setEditingId(item.id);
    setForm(item);
  }

  async function remove(id: string) {
    const confirmed = window.confirm("Excluir registro?");
    if (!confirmed) {
      return;
    }
    const res = await fetch(`${endpoint}/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? "Erro ao excluir");
      return;
    }
    await fetchItems();
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder ?? "Buscar..."}
            className="max-w-xs"
          />
        </div>
        <div className="overflow-auto">
          <table>
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={headers.length + 1}>Carregando...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={headers.length + 1}>Sem dados.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    {headers.map((header) => (
                      <td key={header}>{String(item[header] ?? "")}</td>
                    ))}
                    <td className="flex gap-2">
                      <Button variant="secondary" onClick={() => startEdit(item)}>
                        Editar
                      </Button>
                      <Button variant="danger" onClick={() => remove(item.id)}>
                        Excluir
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold">{editingId ? "Editar registro" : "Novo registro"}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {fields.map((field) => (
            <label key={field.key} className="text-sm font-medium text-slate-700">
              {field.label}
              {field.type === "select" ? (
                <Select
                  value={form[field.key] ?? ""}
                  required={field.required}
                  onChange={(event) => onChange(field.key, event.target.value)}
                >
                  <option value="">Selecione</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  type={field.type === "textarea" ? "text" : field.type ?? "text"}
                  value={form[field.key] ?? ""}
                  required={field.required}
                  onChange={(event) => onChange(field.key, event.target.value)}
                />
              )}
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={submit}>{editingId ? "Salvar alterações" : "Cadastrar"}</Button>
          {editingId ? (
            <Button variant="ghost" onClick={() => setEditingId(null)}>
              Cancelar edição
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
