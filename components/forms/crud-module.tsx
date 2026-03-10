"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";

type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime-local" | "textarea" | "select" | "multi-select";
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
};

type ListField = string | { key: string; label: string };

type CrudModuleProps = {
  endpoint: string;
  title: string;
  fields: Field[];
  listFields: ListField[];
  defaultValues?: Record<string, string>;
  searchPlaceholder?: string;
  createLabel?: string;
  onDataChanged?: () => void | Promise<void>;
  refreshKey?: string | number;
};

type LookupConfig = {
  endpoint: string | ((context: { tipo?: string }) => string);
  labelKeys: string[];
  subLabelKeys?: string[];
};

type LookupOption = {
  id: string;
  label: string;
  subtitle?: string;
  raw?: Record<string, unknown>;
};

type RowActionsMenuState = {
  rowId: string;
  item: Record<string, unknown>;
  top: number;
  left: number;
  openUpwards: boolean;
};

const WEEKDAY_BY_NUMBER: Record<string, string> = {
  "1": "Segunda-feira",
  "2": "Terça-feira",
  "3": "Quarta-feira",
  "4": "Quinta-feira",
  "5": "Sexta-feira",
  "6": "Sábado",
  "7": "Domingo"
};

const LOOKUP_CONFIGS: Record<string, LookupConfig> = {
  alunoId: {
    endpoint: "/api/alunos",
    labelKeys: ["nomeCompleto"],
    subLabelKeys: ["telefone"]
  },
  modalidadeId: {
    endpoint: "/api/modalidades",
    labelKeys: ["nome"]
  },
  categoriaId: {
    endpoint: ({ tipo }) => {
      const normalizedTipo = (tipo ?? "").toUpperCase();
      const validTipo = normalizedTipo === "ENTRADA" || normalizedTipo === "SAIDA" ? normalizedTipo : "";
      const query = new URLSearchParams({ ativa: "true" });
      if (validTipo) {
        query.set("tipo", validTipo);
      }
      return `/api/categorias-financeiras?${query.toString()}`;
    },
    labelKeys: ["nome"],
    subLabelKeys: ["tipo"]
  },
  produtoId: {
    endpoint: "/api/produtos?ativo=true&estoqueMin=1",
    labelKeys: ["nome"],
    subLabelKeys: ["categoria", "tamanho", "cor", "preco", "estoque"]
  },
  userId: {
    endpoint: "/api/users",
    labelKeys: ["name"],
    subLabelKeys: ["email"]
  },
  professor: {
    endpoint: "/api/professores-options",
    labelKeys: ["nome"]
  }
};

function prettifyKeyLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function normalizeValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }
  if (typeof value === "number") {
    return String(value);
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(`${text.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("pt-BR");
    }
  }
  return text;
}

function isCurrencyFieldMeta(key: string, label?: string) {
  const source = `${key} ${label ?? ""}`.toLowerCase();
  return /(valor|preco|preço|ticket|saldo|receita|despesa|pago)/.test(source);
}

function toCurrency(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numeric = (() => {
    if (typeof value === "number") {
      return value;
    }

    const raw = String(value).trim();
    if (!raw) {
      return Number.NaN;
    }

    if (raw.includes(",") && raw.includes(".")) {
      return Number(raw.replace(/\./g, "").replace(",", "."));
    }

    if (raw.includes(",")) {
      return Number(raw.replace(",", "."));
    }

    return Number(raw);
  })();

  if (Number.isNaN(numeric)) {
    return String(value);
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(numeric);
}

function normalizeCellValue(key: string, value: unknown, label?: string, row?: Record<string, unknown>) {
  if (key === "alunoNome") {
    const direct = value === null || value === undefined ? "" : String(value).trim();
    if (direct) {
      return direct;
    }

    const aluno = row?.aluno;
    if (aluno && typeof aluno === "object" && "nomeCompleto" in aluno) {
      const fromRelation = String((aluno as { nomeCompleto?: unknown }).nomeCompleto ?? "").trim();
      if (fromRelation) {
        return fromRelation;
      }
    }
  }

  if (key === "diaSemana") {
    const day = value === null || value === undefined ? "" : String(value);
    return WEEKDAY_BY_NUMBER[day] ?? day;
  }

  if (key.toLowerCase() === "horario" && value !== null && value !== undefined) {
    const raw = String(value).trim();
    const match = /^(\d{1,2})(?:[:hH]?(\d{2}))?$/.exec(raw.replace(/\s+/g, ""));
    if (match) {
      const hour = Number(match[1]);
      const minute = Number(match[2] ?? "00");
      if (Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      }
    }
  }

  if (isCurrencyFieldMeta(key, label)) {
    return toCurrency(value);
  }

  return normalizeValue(value);
}

function toFormState(item: Record<string, unknown>, allowedKeys: string[]) {
  return allowedKeys.reduce<Record<string, string>>((acc, key) => {
    const value = item[key];
    acc[key] = value === null || value === undefined ? "" : String(value);
    return acc;
  }, {});
}

function readFirst(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return "";
}

function readAll(item: Record<string, unknown>, keys: string[]) {
  const parts: string[] = [];
  for (const key of keys) {
    const value = item[key];
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "number") {
      if (key.toLowerCase().includes("preco") || key.toLowerCase().includes("valor")) {
        parts.push(
          new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL"
          }).format(value)
        );
        continue;
      }
      parts.push(String(value));
      continue;
    }

    const text = String(value).trim();
    if (!text) {
      continue;
    }
    if (key.toLowerCase().includes("preco") || key.toLowerCase().includes("valor")) {
      const parsed = Number(text);
      if (Number.isFinite(parsed)) {
        parts.push(
          new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL"
          }).format(parsed)
        );
        continue;
      }
    }
    parts.push(text);
  }
  return parts;
}

function isTypingElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target.isContentEditable;
}

function splitMultiValue(value: string | undefined) {
  if (!value) return [];
  return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean)));
}

function resolveLookupEndpoint(config: LookupConfig, tipo?: string) {
  if (typeof config.endpoint === "function") {
    return config.endpoint({ tipo });
  }
  return config.endpoint;
}

function normalizeTextKey(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function CrudModule({
  endpoint,
  title,
  fields,
  listFields,
  defaultValues,
  searchPlaceholder,
  createLabel,
  onDataChanged,
  refreshKey
}: CrudModuleProps) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(defaultValues ?? {});
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [localStatusFilter, setLocalStatusFilter] = useState("");
  const [localCompetenciaFilter, setLocalCompetenciaFilter] = useState("");

  const [lookupOptions, setLookupOptions] = useState<Record<string, LookupOption[]>>({});
  const [lookupLoading, setLookupLoading] = useState<Record<string, boolean>>({});
  const [lookupError, setLookupError] = useState<Record<string, string>>({});
  const [openActions, setOpenActions] = useState<RowActionsMenuState | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  async function fetchItems() {
    setLoading(true);
    try {
      const url = new URL(endpoint, window.location.origin);
      if (search) {
        url.searchParams.set("q", search);
      }
      const res = await fetch(`${url.pathname}${url.search}`);
      const raw = await res.text();
      let data: { items?: Record<string, unknown>[]; error?: string } = {};

      if (raw) {
        try {
          data = JSON.parse(raw) as { items?: Record<string, unknown>[]; error?: string };
        } catch {
          data = {};
        }
      }

      if (!res.ok) {
        setItems([]);
        return;
      }

      setItems(Array.isArray(data.items) ? data.items : []);
      setLastUpdatedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
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

  useEffect(() => {
    if (refreshKey === undefined) {
      return;
    }
    void fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingElement(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && key === "n") {
        event.preventDefault();
        setEditingId(null);
        setForm(defaultValues ?? {});
        setFormOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [defaultValues]);

  useEffect(() => {
    if (!formOpen) {
      return;
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFormOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [formOpen]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) {
        return;
      }
      if (event.target.closest("[data-row-actions-root='true']")) {
        return;
      }
      setOpenActions(null);
    }

    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  useEffect(() => {
    if (!openActions) {
      return;
    }

    function closeActionsMenu() {
      setOpenActions(null);
    }

    window.addEventListener("scroll", closeActionsMenu, true);
    window.addEventListener("resize", closeActionsMenu);

    return () => {
      window.removeEventListener("scroll", closeActionsMenu, true);
      window.removeEventListener("resize", closeActionsMenu);
    };
  }, [openActions]);

  const columns = useMemo(
    () =>
      listFields.map((field) =>
        typeof field === "string" ? { key: field, label: prettifyKeyLabel(field) } : field
      ),
    [listFields]
  );

  const statusField = useMemo(
    () => fields.find((field) => field.key.toLowerCase() === "status" && field.type === "select"),
    [fields]
  );

  const statusValues = useMemo(() => statusField?.options?.map((option) => option.value) ?? [], [statusField]);

  const statusKey = statusField?.key;

  const statusSummary = useMemo(() => {
    if (!statusKey) {
      return [];
    }

    const counter = new Map<string, number>();
    for (const item of items) {
      const raw = item[statusKey];
      const normalized = normalizeValue(raw).toUpperCase();
      if (!normalized) {
        continue;
      }
      counter.set(normalized, (counter.get(normalized) ?? 0) + 1);
    }

    return Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [items, statusKey]);

  const competenciaOptions = useMemo(() => {
    const all = new Set<string>();
    for (const item of items) {
      const raw = item.competencia;
      if (raw === null || raw === undefined) continue;
      const competencia = String(raw).trim();
      if (competencia) {
        all.add(competencia);
      }
    }
    return Array.from(all).sort((a, b) => b.localeCompare(a));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (localCompetenciaFilter) {
        const competencia = item.competencia === null || item.competencia === undefined ? "" : String(item.competencia);
        if (competencia !== localCompetenciaFilter) {
          return false;
        }
      }

      if (localStatusFilter && statusKey) {
        const rowStatus = item[statusKey] === null || item[statusKey] === undefined ? "" : String(item[statusKey]);
        if (rowStatus !== localStatusFilter) {
          return false;
        }
      }

      return true;
    });
  }, [items, localCompetenciaFilter, localStatusFilter, statusKey]);

  const relationFieldKeys = useMemo(
    () => fields.filter((field) => Boolean(LOOKUP_CONFIGS[field.key])).map((field) => field.key),
    [fields]
  );
  const selectedTipo = (form.tipo ?? "").toUpperCase();

  const multiSelectFieldKeys = useMemo(
    () => fields.filter((field) => field.type === "multi-select").map((field) => field.key),
    [fields]
  );
  const editableFieldKeys = useMemo(() => fields.map((field) => field.key), [fields]);

  useEffect(() => {
    if (relationFieldKeys.length === 0 || !formOpen) {
      return;
    }

    const controllers: AbortController[] = [];
    let active = true;

    for (const fieldKey of relationFieldKeys) {
      const config = LOOKUP_CONFIGS[fieldKey];
      if (!config) {
        continue;
      }

      const controller = new AbortController();
      controllers.push(controller);
      setLookupLoading((prev) => ({ ...prev, [fieldKey]: true }));

      const lookupEndpoint = resolveLookupEndpoint(config, selectedTipo);
      void fetch(lookupEndpoint, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) {
            const payload = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(payload.error ?? "Falha ao carregar opções");
          }
          return res.json() as Promise<{ items?: Array<Record<string, unknown>> }>;
        })
        .then((payload) => {
          if (!active) {
            return;
          }
          const options = (payload.items ?? [])
            .filter((item) => item.id !== undefined && item.id !== null)
            .slice(0, 30)
            .map((item) => {
              const label = readFirst(item, config.labelKeys) || String(item.id);
              const subtitleParts = config.subLabelKeys ? readAll(item, config.subLabelKeys) : [];
              return {
                id: String(item.id),
                label,
                subtitle: subtitleParts.length > 0 ? subtitleParts.join(" • ") : undefined,
                raw: item
              };
            });

          setLookupOptions((prev) => ({ ...prev, [fieldKey]: options }));
          setLookupError((prev) => ({ ...prev, [fieldKey]: "" }));
        })
        .catch((error: unknown) => {
          if (!active) {
            return;
          }
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          const message = error instanceof Error ? error.message : "Falha ao carregar opções";
          setLookupOptions((prev) => ({ ...prev, [fieldKey]: [] }));
          setLookupError((prev) => ({ ...prev, [fieldKey]: message }));
        })
        .finally(() => {
          if (!active) {
            return;
          }
          setLookupLoading((prev) => ({ ...prev, [fieldKey]: false }));
        });
    }

    return () => {
      active = false;
      for (const controller of controllers) {
        controller.abort();
      }
    };
  }, [formOpen, relationFieldKeys, selectedTipo]);

  function onChange(key: string, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };

      if (key === "modalidadeId" && value && fields.some((field) => field.key === "mensalidadeValor")) {
        const selectedModalidade = (lookupOptions.modalidadeId ?? []).find((option) => option.id === value);
        const valorPadrao = Number(selectedModalidade?.raw?.valorPadrao ?? Number.NaN);
        const modalidadeNome = normalizeTextKey(
          String(selectedModalidade?.raw?.nome ?? selectedModalidade?.label ?? "")
        );
        if (Number.isFinite(valorPadrao) && modalidadeNome !== "personalizada") {
          next.mensalidadeValor = valorPadrao.toFixed(2);
        }
        if (modalidadeNome !== "personalizada") {
          next.mensalidadeValor = Number.isFinite(valorPadrao) ? valorPadrao.toFixed(2) : "";
        }
      }

      return next;
    });
  }

  async function notifyDataChanged() {
    if (!onDataChanged) return;
    try {
      await onDataChanged();
    } catch {
      // Keep the CRUD flow responsive even if external refresh fails.
    }
  }

  async function submit() {
    for (const field of fields) {
      if (!field.required) {
        continue;
      }

      if (field.type === "multi-select") {
        const selected = splitMultiValue(form[field.key]);
        if (selected.length === 0) {
          alert(`Selecione ao menos uma opção para "${field.label}".`);
          return false;
        }
        continue;
      }

      const value = (form[field.key] ?? "").trim();
      if (!value) {
        alert(`Preencha o campo obrigatório "${field.label}".`);
        return false;
      }
    }

    const buildPayload = (override?: Record<string, string>) => {
      const payload: Record<string, string> = { ...form, ...(override ?? {}) };
      for (const fieldKey of multiSelectFieldKeys) {
        const selected = splitMultiValue(payload[fieldKey]);
        payload[fieldKey] = selected[0] ?? "";
      }

      if ("alunoId" in payload && "alunoNome" in payload) {
        const selectedAlunoId = String(payload.alunoId ?? "").trim();
        if (selectedAlunoId) {
          const selectedAluno = (lookupOptions.alunoId ?? []).find((option) => option.id === selectedAlunoId);
          if (selectedAluno?.label) {
            payload.alunoNome = selectedAluno.label;
          }
        } else {
          payload.alunoNome = String(payload.alunoNome ?? "").trim();
        }
      }

      return payload;
    };

    if (editingId) {
      const res = await fetch(`${endpoint}/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildPayload())
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Erro ao salvar");
        return false;
      }

      setForm(defaultValues ?? {});
      setEditingId(null);
      await fetchItems();
      await notifyDataChanged();
      return true;
    }

    const primaryMultiField = fields.find((field) => field.type === "multi-select");
    const selectedMultiValues = primaryMultiField ? splitMultiValue(form[primaryMultiField.key]) : [];

    if (primaryMultiField && selectedMultiValues.length > 1) {
      for (const value of selectedMultiValues) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(buildPayload({ [primaryMultiField.key]: value }))
        });

        if (!res.ok) {
          const err = await res.json();
          alert(err.error ?? "Erro ao salvar");
          return false;
        }
      }
    } else {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildPayload())
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Erro ao salvar");
        return false;
      }
    }

    setForm(defaultValues ?? {});
    setEditingId(null);
    await fetchItems();
    await notifyDataChanged();
    return true;
  }

  function startEdit(item: Record<string, unknown>) {
    const itemId = item.id === undefined || item.id === null ? null : String(item.id);
    setEditingId(itemId);
    setForm(toFormState(item, editableFieldKeys));
    setFormOpen(true);
    setOpenActions(null);
  }

  async function remove(id: unknown) {
    const normalizedId = String(id);
    const confirmed = window.confirm("Excluir registro?");
    if (!confirmed) {
      return;
    }
    const res = await fetch(`${endpoint}/${normalizedId}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? "Erro ao excluir");
      return;
    }
    await fetchItems();
    await notifyDataChanged();
    setOpenActions(null);
  }

  async function patchItem(id: unknown, data: Record<string, unknown>) {
    const normalizedId = String(id);
    const res = await fetch(`${endpoint}/${normalizedId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      alert(payload.error ?? "Não foi possível atualizar o registro");
      return;
    }

    await fetchItems();
    await notifyDataChanged();
    setOpenActions(null);
  }

  function toggleRowActions(event: ReactMouseEvent<HTMLButtonElement>, rowId: string, item: Record<string, unknown>) {
    if (openActions?.rowId === rowId) {
      setOpenActions(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 190;
    const menuHeight = quickBooleanField ? 160 : 118;
    const screenPadding = 12;
    const openUpwards = rect.bottom + menuHeight > window.innerHeight - screenPadding;
    let left = rect.right - menuWidth;
    left = Math.max(screenPadding, Math.min(left, window.innerWidth - menuWidth - screenPadding));
    const top = openUpwards ? rect.top - 6 : rect.bottom + 6;

    setOpenActions({
      rowId,
      item,
      top,
      left,
      openUpwards
    });
  }

  function openCreateModal() {
    setEditingId(null);
    setForm(defaultValues ?? {});
    setFormOpen(true);
  }

  function closeFormModal() {
    setFormOpen(false);
  }

  const quickBooleanField = useMemo(
    () => fields.find((field) => ["ativo", "presente", "active"].includes(field.key))?.key,
    [fields]
  );

  const totalFields = fields.length;

  return (
    <div className="space-y-5">
      <Card className="p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">Listagem</p>
            <h2 className="text-xl font-black text-ink">{title}</h2>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-line bg-white/80 px-2.5 py-1 text-xs font-semibold text-muted">
                Registros: {filteredItems.length}/{items.length}
              </span>
              <span className="rounded-full border border-line bg-white/80 px-2.5 py-1 text-xs font-semibold text-muted">
                Atualizado: {lastUpdatedAt ?? "--:--"}
              </span>
              {statusSummary.map(([status, count]) => (
                <span key={status} className="rounded-full border border-[rgba(207,22,33,0.22)] bg-accentSoft px-2.5 py-1 text-xs font-semibold text-accentDark">
                  {status}: {count}
                </span>
              ))}
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[420px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder ?? "Buscar..."}
                className="w-full rounded-xl border border-line/90 bg-white/95 py-2 pl-9 pr-3 text-sm text-ink outline-none ring-accent transition focus:border-accent/60 focus:ring-2"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {statusValues.length > 0 ? (
                <Select value={localStatusFilter} onChange={(event) => setLocalStatusFilter(event.target.value)}>
                  <option value="">Todos os status</option>
                  {statusValues.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              ) : (
                <div />
              )}

              {competenciaOptions.length > 0 ? (
                <Select
                  value={localCompetenciaFilter}
                  onChange={(event) => setLocalCompetenciaFilter(event.target.value)}
                >
                  <option value="">Todas competências</option>
                  {competenciaOptions.map((competencia) => (
                    <option key={competencia} value={competencia}>
                      {competencia}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => void fetchItems()} className="inline-flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setLocalStatusFilter("");
                  setLocalCompetenciaFilter("");
                }}
              >
                Limpar filtros
              </Button>
              <Button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                {createLabel ?? "Novo registro"}
              </Button>
            </div>
          </div>
        </div>

        <p className="mb-3 text-xs text-muted">Atalhos: <strong>Ctrl/Cmd + K</strong> busca rápida, <strong>Ctrl/Cmd + N</strong> novo registro.</p>

        <div className="overflow-x-auto rounded-xl border border-line/80 bg-white/80">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length + 1}>Carregando...</td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1}>Sem dados.</td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const rowId =
                    item.id === undefined || item.id === null || String(item.id).trim() === ""
                      ? `row-${index}`
                      : String(item.id);
                  return (
                  <tr key={rowId}>
                    {columns.map((column) => (
                      <td key={`${rowId}-${column.key}`}>{normalizeCellValue(column.key, item[column.key], column.label, item)}</td>
                    ))}
                    <td className="relative">
                      <div data-row-actions-root="true" className="relative inline-flex">
                        <button
                          type="button"
                          aria-label="Abrir ações"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-ink transition hover:bg-accentSoft"
                          onClick={(event) => toggleRowActions(event, rowId, item)}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {openActions
          ? createPortal(
              <div
                data-row-actions-root="true"
                className={
                  openActions.openUpwards
                    ? "fixed z-[70] flex min-w-[190px] -translate-y-full flex-col gap-1 rounded-xl border border-line bg-white p-2 shadow-[0_12px_28px_rgba(24,18,20,0.16)]"
                    : "fixed z-[70] flex min-w-[190px] flex-col gap-1 rounded-xl border border-line bg-white p-2 shadow-[0_12px_28px_rgba(24,18,20,0.16)]"
                }
                style={{ top: `${openActions.top}px`, left: `${openActions.left}px` }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  className="justify-start"
                  onClick={() => startEdit(openActions.item)}
                >
                  Editar
                </Button>

                {quickBooleanField &&
                openActions.item[quickBooleanField] !== undefined &&
                openActions.item.id !== undefined ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-start"
                    onClick={() =>
                      void patchItem(openActions.item.id, {
                        [quickBooleanField]: !Boolean(openActions.item[quickBooleanField])
                      })
                    }
                  >
                    {Boolean(openActions.item[quickBooleanField])
                      ? quickBooleanField === "presente"
                        ? "Marcar ausente"
                        : "Desativar"
                      : quickBooleanField === "presente"
                        ? "Marcar presente"
                        : "Ativar"}
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant="danger"
                  className="justify-start"
                  onClick={() => void remove(openActions.item.id)}
                >
                  Excluir
                </Button>
              </div>,
              document.body
            )
          : null}

      </Card>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,14,17,0.62)] p-4 backdrop-blur-[2px]">
          <Card className="max-h-[92vh] w-full max-w-6xl overflow-hidden p-0">
            <div className="flex items-start justify-between border-b border-line/80 px-5 py-4 md:px-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">Formulário</p>
                <h3 className="text-xl font-black text-ink">{editingId ? "Editar registro" : createLabel ?? "Novo registro"}</h3>
                <p className="mt-1 text-sm text-muted">
                  Preencha os campos obrigatórios. Total de campos: <strong>{totalFields}</strong>.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar formulário"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-ink transition hover:bg-accentSoft"
                onClick={closeFormModal}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(92vh-88px)] overflow-y-auto px-5 py-4 md:px-6 md:py-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {fields.map((field) => {
                  if (field.key === "mensalidadeValor" && fields.some((entry) => entry.key === "modalidadeId")) {
                    const modalidadeId = form.modalidadeId ?? "";
                    const selectedModalidade = (lookupOptions.modalidadeId ?? []).find(
                      (option) => option.id === modalidadeId
                    );
                    const modalidadeNome = normalizeTextKey(
                      String(selectedModalidade?.raw?.nome ?? selectedModalidade?.label ?? "")
                    );
                    if (modalidadeNome !== "personalizada") {
                      return null;
                    }
                  }

                  const lookupConfig = LOOKUP_CONFIGS[field.key];
                  const options = lookupOptions[field.key] ?? [];
                  const selectedId = form[field.key] ?? "";
                  const hasSelectedOption = options.some((option) => option.id === selectedId);
                  const displayLabel =
                    lookupConfig && field.label.toLowerCase().startsWith("id ")
                      ? field.label.slice(3)
                      : field.label;

                  return (
                    <label key={field.key} className="text-sm font-medium text-ink">
                      <span className="mb-1 block">
                        {displayLabel}
                        {field.required ? <span className="ml-1 text-accent">*</span> : null}
                      </span>

                      {lookupConfig ? (
                        <div className="space-y-1.5">
                          {lookupError[field.key] ? (
                            <>
                              <p className="text-xs text-[#a21b25]">{lookupError[field.key]}. Digite o ID manualmente abaixo.</p>
                              <Input
                                value={form[field.key] ?? ""}
                                required={field.required}
                                onChange={(event) => onChange(field.key, event.target.value)}
                                placeholder="ID"
                              />
                            </>
                          ) : (
                            <Select
                              value={selectedId}
                              required={field.required}
                              onChange={(event) => onChange(field.key, event.target.value)}
                            >
                              <option value="">Selecione</option>
                              {selectedId && !hasSelectedOption ? (
                                <option value={selectedId}>Selecionado ({selectedId})</option>
                              ) : null}
                              {options.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                  {option.subtitle ? ` • ${option.subtitle}` : ""}
                                </option>
                              ))}
                            </Select>
                          )}

                          <p className="text-[11px] text-muted">
                            {lookupLoading[field.key]
                              ? "Carregando opções..."
                              : `${options.length} opções carregadas`}
                          </p>
                        </div>
                      ) : field.type === "multi-select" ? (
                        <div className="space-y-2 rounded-xl border border-line/90 bg-white/85 p-2.5">
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {field.options?.map((option) => {
                              const selected = splitMultiValue(form[field.key]).includes(option.value);
                              return (
                                <label
                                  key={option.value}
                                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink transition hover:bg-accentSoft"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={(event) => {
                                      setForm((prev) => {
                                        const current = splitMultiValue(prev[field.key]);
                                        const next = event.target.checked
                                          ? Array.from(new Set([...current, option.value]))
                                          : current.filter((value) => value !== option.value);
                                        return {
                                          ...prev,
                                          [field.key]: next.join(",")
                                        };
                                      });
                                    }}
                                  />
                                  <span>{option.label}</span>
                                </label>
                              );
                            })}
                          </div>
                          <p className="text-[11px] text-muted">
                            Selecionados: {splitMultiValue(form[field.key]).length}
                          </p>
                        </div>
                      ) : field.type === "select" ? (
                        (() => {
                          const selectedValue = form[field.key] ?? "";
                          const hasSelectedOption = (field.options ?? []).some(
                            (option) => option.value === selectedValue
                          );

                          return (
                            <Select
                              value={selectedValue}
                              required={field.required}
                              onChange={(event) => onChange(field.key, event.target.value)}
                            >
                              <option value="">Selecione</option>
                              {selectedValue && !hasSelectedOption ? (
                                <option value={selectedValue}>Selecionado ({selectedValue})</option>
                              ) : null}
                              {field.options?.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                          );
                        })()
                      ) : field.type === "textarea" ? (
                        <textarea
                          value={form[field.key] ?? ""}
                          required={field.required}
                          onChange={(event) => onChange(field.key, event.target.value)}
                          className="min-h-[96px] w-full rounded-xl border border-line/90 bg-white/95 px-3 py-2 text-sm text-ink outline-none ring-accent transition focus:border-accent/60 focus:ring-2"
                        />
                      ) : field.type === "number" && isCurrencyFieldMeta(field.key, field.label) ? (
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">
                            R$
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            value={form[field.key] ?? ""}
                            required={field.required}
                            onChange={(event) => onChange(field.key, event.target.value)}
                            className="pl-10"
                          />
                        </div>
                      ) : (
                        <Input
                          type={field.type ?? "text"}
                          value={form[field.key] ?? ""}
                          required={field.required}
                          onChange={(event) => onChange(field.key, event.target.value)}
                        />
                      )}
                    </label>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap gap-2 border-t border-line/70 pt-4">
                <Button
                  onClick={async () => {
                    const saved = await submit();
                    if (saved) {
                      closeFormModal();
                    }
                  }}
                >
                  {editingId ? "Salvar alterações" : "Cadastrar"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    closeFormModal();
                    if (editingId) {
                      setEditingId(null);
                      setForm(defaultValues ?? {});
                    }
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
