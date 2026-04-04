"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { ModuleHeader } from "@/components/ui/module-header";
import { CrudModule } from "@/components/forms/crud-module";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type DirectoryHandle = {
  name: string;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<DirectoryHandle>;
  }
}

type BrandingForm = {
  academyName: string;
  logoUrl: string;
  colors: {
    bg: string;
    ink: string;
    muted: string;
    line: string;
    accent: string;
    accentDark: string;
    accentSoft: string;
    sidebar: string;
    sidebarLine: string;
  };
};

type WhatsAppForm = {
  enabled: boolean;
  baseUrl: string;
  instanceName: string;
  apiKey: string;
  countryCode: string;
  daysBeforeDue: number;
  testPhone: string;
  templates: {
    dueSoon: string;
    overdue: string;
  };
};

type WhatsAppPreview = {
  enabled: boolean;
  configValid: boolean;
  reason?: string;
  dueSoonCandidates: Array<{ id: string }>;
  overdueCandidates: Array<{ id: string }>;
};

const DEFAULT_BRANDING: BrandingForm = {
  academyName: "Forja Prime Academia",
  logoUrl: "/logo-forja.svg",
  colors: {
    bg: "#f5f1f0",
    ink: "#1f1718",
    muted: "#6f6466",
    line: "#ddd2d4",
    accent: "#c51623",
    accentDark: "#8e1018",
    accentSoft: "#fbeaec",
    sidebar: "#181113",
    sidebarLine: "#2e2025"
  }
};

const DEFAULT_WHATSAPP: WhatsAppForm = {
  enabled: false,
  baseUrl: "",
  instanceName: "",
  apiKey: "",
  countryCode: "55",
  daysBeforeDue: 3,
  testPhone: "",
  templates: {
    dueSoon:
      "Oi, {nome}! Sua mensalidade da {academia} vence em {vencimento}. Valor: {valor}. Se ja pagou, desconsidere esta mensagem.",
    overdue:
      "Oi, {nome}! Sua mensalidade da {academia} venceu em {vencimento}. Valor pendente: {valor}. Se precisar, fale com a recepcao para regularizar."
  }
};

export default function ConfiguracoesPage() {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [backupDir, setBackupDir] = useState("");
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupPickerSupported, setBackupPickerSupported] = useState(false);
  const [branding, setBranding] = useState<BrandingForm>(DEFAULT_BRANDING);
  const [whatsAppLoading, setWhatsAppLoading] = useState(false);
  const [whatsAppSaving, setWhatsAppSaving] = useState(false);
  const [whatsAppTesting, setWhatsAppTesting] = useState(false);
  const [whatsAppDispatching, setWhatsAppDispatching] = useState(false);
  const [whatsApp, setWhatsApp] = useState<WhatsAppForm>(DEFAULT_WHATSAPP);
  const [whatsAppPreview, setWhatsAppPreview] = useState<WhatsAppPreview | null>(null);

  useEffect(() => {
    setBackupPickerSupported(typeof window !== "undefined" && typeof window.showDirectoryPicker === "function");
    void loadBranding();
    void loadBackupSettings();
    void loadWhatsApp();
  }, []);

  function getBackupFilename(contentDisposition: string | null) {
    if (!contentDisposition) {
      return `backup-academia-${new Date().toISOString().slice(0, 10)}.json`;
    }

    const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
    if (utfMatch?.[1]) {
      return decodeURIComponent(utfMatch[1]);
    }

    const plainMatch = /filename="?([^"]+)"?/i.exec(contentDisposition);
    return plainMatch?.[1] ?? `backup-academia-${new Date().toISOString().slice(0, 10)}.json`;
  }

  async function buildChecksum(blob: Blob) {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  }

  async function fetchBackupFile() {
    const res = await fetch("/api/admin/backup", {
      method: "GET",
      cache: "no-store"
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Falha ao gerar backup");
    }

    return {
      blob: await res.blob(),
      fileName: getBackupFilename(res.headers.get("content-disposition"))
    };
  }

  async function loadBranding() {
    setBrandingLoading(true);
    try {
      const res = await fetch("/api/branding", { cache: "no-store" });
      const payload = (await res.json().catch(() => ({}))) as { item?: Partial<BrandingForm>; error?: string };

      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao carregar branding");
      }

      setBranding({
        academyName: payload.item?.academyName ?? DEFAULT_BRANDING.academyName,
        logoUrl: payload.item?.logoUrl ?? DEFAULT_BRANDING.logoUrl,
        colors: {
          ...DEFAULT_BRANDING.colors,
          ...(payload.item?.colors ?? {})
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar branding";
      alert(message);
      setBranding(DEFAULT_BRANDING);
    } finally {
      setBrandingLoading(false);
    }
  }

  async function loadBackupSettings() {
    setBackupLoading(true);
    setBackupMessage("");
    try {
      const res = await fetch("/api/admin/backup/save", { cache: "no-store" });
      const payload = (await res.json().catch(() => ({}))) as { backupDir?: string; error?: string };

      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao carregar pasta de backup");
      }

      setBackupDir(String(payload.backupDir ?? ""));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar pasta de backup";
      setBackupMessage(message);
    } finally {
      setBackupLoading(false);
    }
  }

  async function persistBranding(nextBranding: BrandingForm, successMessage?: string) {
    setBrandingSaving(true);
    try {
      const res = await fetch("/api/branding", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(nextBranding)
      });

      const payload = (await res.json().catch(() => ({}))) as { item?: BrandingForm; error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao salvar branding");
      }

      if (payload.item) {
        setBranding(payload.item);
      } else {
        setBranding(nextBranding);
      }
      router.refresh();
      if (successMessage) {
        alert(successMessage);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar branding";
      alert(message);
    } finally {
      setBrandingSaving(false);
    }
  }

  async function saveBranding() {
    await persistBranding(branding, "Branding atualizado com sucesso.");
  }

  async function loadWhatsApp() {
    setWhatsAppLoading(true);
    try {
      const res = await fetch("/api/whatsapp", { cache: "no-store" });
      const payload = (await res.json().catch(() => ({}))) as {
        item?: Partial<WhatsAppForm>;
        preview?: WhatsAppPreview;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao carregar configuracao do WhatsApp");
      }

      setWhatsApp({
        enabled: Boolean(payload.item?.enabled ?? DEFAULT_WHATSAPP.enabled),
        baseUrl: payload.item?.baseUrl ?? DEFAULT_WHATSAPP.baseUrl,
        instanceName: payload.item?.instanceName ?? DEFAULT_WHATSAPP.instanceName,
        apiKey: payload.item?.apiKey ?? DEFAULT_WHATSAPP.apiKey,
        countryCode: payload.item?.countryCode ?? DEFAULT_WHATSAPP.countryCode,
        daysBeforeDue: Number(payload.item?.daysBeforeDue ?? DEFAULT_WHATSAPP.daysBeforeDue),
        testPhone: payload.item?.testPhone ?? DEFAULT_WHATSAPP.testPhone,
        templates: {
          dueSoon: payload.item?.templates?.dueSoon ?? DEFAULT_WHATSAPP.templates.dueSoon,
          overdue: payload.item?.templates?.overdue ?? DEFAULT_WHATSAPP.templates.overdue
        }
      });
      setWhatsAppPreview(payload.preview ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar configuracao do WhatsApp";
      alert(message);
      setWhatsApp(DEFAULT_WHATSAPP);
      setWhatsAppPreview(null);
    } finally {
      setWhatsAppLoading(false);
    }
  }

  async function saveWhatsApp() {
    setWhatsAppSaving(true);
    try {
      const res = await fetch("/api/whatsapp", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(whatsApp)
      });

      const payload = (await res.json().catch(() => ({}))) as {
        item?: WhatsAppForm;
        preview?: WhatsAppPreview;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao salvar configuracao do WhatsApp");
      }

      if (payload.item) {
        setWhatsApp(payload.item);
      }
      setWhatsAppPreview(payload.preview ?? null);
      alert("Configuracao de WhatsApp atualizada com sucesso.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar configuracao do WhatsApp";
      alert(message);
    } finally {
      setWhatsAppSaving(false);
    }
  }

  async function sendWhatsAppTest() {
    setWhatsAppTesting(true);
    try {
      const res = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phone: whatsApp.testPhone
        })
      });

      const payload = (await res.json().catch(() => ({}))) as { phone?: string; error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao enviar teste de WhatsApp");
      }

      alert(`Mensagem de teste enviada para ${payload.phone ?? whatsApp.testPhone}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar teste de WhatsApp";
      alert(message);
    } finally {
      setWhatsAppTesting(false);
    }
  }

  async function dispatchWhatsAppReminders() {
    setWhatsAppDispatching(true);
    try {
      const res = await fetch("/api/jobs/alertas/whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });

      const payload = (await res.json().catch(() => ({}))) as {
        configValid?: boolean;
        reason?: string;
        sent?: Array<{ mensalidadeId: string }>;
        errors?: Array<{ error: string }>;
        dueSoonCandidates?: Array<{ id: string }>;
        overdueCandidates?: Array<{ id: string }>;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao disparar lembretes de WhatsApp");
      }

      setWhatsAppPreview({
        enabled: whatsApp.enabled,
        configValid: Boolean(payload.configValid),
        reason: payload.reason,
        dueSoonCandidates: payload.dueSoonCandidates ?? [],
        overdueCandidates: payload.overdueCandidates ?? []
      });

      if (payload.reason) {
        alert(payload.reason);
        return;
      }

      alert(
        `Envio concluido. ${payload.sent?.length ?? 0} mensagem(ns) enviada(s) e ${payload.errors?.length ?? 0} erro(s).`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao disparar lembretes de WhatsApp";
      alert(message);
    } finally {
      setWhatsAppDispatching(false);
    }
  }

  async function uploadLogo(file: File) {
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);

      const res = await fetch("/api/branding/upload", {
        method: "POST",
        body: formData
      });

      const payload = (await res.json().catch(() => ({}))) as { logoUrl?: string; error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao enviar logo");
      }

      const logoUrl = String(payload.logoUrl ?? "").trim();
      if (!logoUrl) {
        throw new Error("Upload concluido, mas sem URL de logo");
      }

      const nextBranding: BrandingForm = {
        ...branding,
        logoUrl
      };
      setBranding(nextBranding);
      await persistBranding(nextBranding, "Logo enviada e aplicada com sucesso.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar logo";
      alert(message);
    } finally {
      setLogoUploading(false);
    }
  }

  async function saveBackupNow() {
    setBackupSaving(true);
    setBackupMessage("");

    try {
      const res = await fetch("/api/admin/backup/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          backupDir,
          savePath: true
        })
      });

      const payload = (await res.json().catch(() => ({}))) as { filePath?: string; error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao salvar backup");
      }

      setBackupMessage(`Backup salvo em: ${payload.filePath ?? backupDir}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar backup";
      setBackupMessage(message);
    } finally {
      setBackupSaving(false);
    }
  }

  async function downloadBackupNow() {
    setBackupSaving(true);
    setBackupMessage("");

    try {
      const { blob, fileName } = await fetchBackupFile();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBackupMessage(`Download iniciado: ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao baixar backup";
      setBackupMessage(message);
    } finally {
      setBackupSaving(false);
    }
  }

  async function pickFolderAndSaveBackup() {
    if (!window.showDirectoryPicker) {
      setBackupMessage("Seu navegador não permite selecionar uma pasta diretamente. Use o download do backup.");
      return;
    }

    setBackupSaving(true);
    setBackupMessage("");

    try {
      const directoryHandle = await window.showDirectoryPicker();
      const { blob, fileName } = await fetchBackupFile();
      const checksum = await buildChecksum(blob);

      const backupHandle = await directoryHandle.getFileHandle(fileName, { create: true });
      const backupWritable = await backupHandle.createWritable();
      await backupWritable.write(blob);
      await backupWritable.close();

      const checksumHandle = await directoryHandle.getFileHandle(`${fileName}.sha256`, { create: true });
      const checksumWritable = await checksumHandle.createWritable();
      await checksumWritable.write(`${checksum}  ${fileName}\n`);
      await checksumWritable.close();

      setBackupMessage(`Backup salvo em ${directoryHandle.name}/${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao salvar backup na pasta selecionada";
      setBackupMessage(message);
    } finally {
      setBackupSaving(false);
    }
  }

  async function importExcel(file: File) {
    setImporting(true);
    const form = new FormData();
    form.set("file", file);
    form.set("year", String(new Date().getFullYear()));

    const res = await fetch("/api/import/excel", {
      method: "POST",
      body: form
    });

    const data = await res.json();
    setImporting(false);

    if (!res.ok) {
      alert(data.error ?? "Falha na importacao");
      return;
    }

    alert("Importacao concluida. Verifique os modulos.");
  }

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Configuracoes"
        description="Usuarios, perfis, parametros do sistema, backup manual e importacao da planilha antiga."
        icon={Settings}
        badges={["Administracao", "Permissoes", "Backup manual", "Importacao Excel"]}
        stats={[
          { label: "Seguranca", value: "Perfis de acesso" },
          { label: "Backup", value: "JSON em pasta nuvem" }
        ]}
      />

      <Card className="space-y-3">
        <h2 className="text-lg font-black text-ink">Nome, logo e cores</h2>

        {brandingLoading ? <p className="text-sm text-muted">Carregando branding...</p> : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium text-ink md:col-span-2">
            Nome da academia
            <Input
              value={branding.academyName}
              onChange={(event) => setBranding((prev) => ({ ...prev, academyName: event.target.value }))}
              placeholder="Nome exibido no sistema"
            />
          </label>

          <label className="text-sm font-medium text-ink">
            Logo (path/URL)
            <Input
              value={branding.logoUrl}
              onChange={(event) => setBranding((prev) => ({ ...prev, logoUrl: event.target.value }))}
              placeholder="/logo-forja.svg"
            />
          </label>

          <div className="space-y-2 rounded-xl border border-line/80 bg-white/80 p-3 md:col-span-2">
            <p className="text-sm font-semibold text-ink">Enviar logo do computador</p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              disabled={logoUploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void uploadLogo(file);
                }
                event.currentTarget.value = "";
              }}
            />
            <p className="text-xs text-muted">Formatos: PNG, JPG, WEBP ou SVG. Tamanho maximo: 4MB.</p>
          </div>

          <div className="rounded-xl border border-line/80 bg-white/80 p-3">
            <p className="mb-2 text-sm font-semibold text-ink">Pre-visualizacao da logo</p>
            <img
              src={branding.logoUrl}
              alt={branding.academyName}
              className="h-20 w-20 rounded-full border border-line bg-white object-cover"
            />
          </div>

          <label className="text-sm font-medium text-ink">
            Cor destaque
            <Input
              value={branding.colors.accent}
              onChange={(event) =>
                setBranding((prev) => ({
                  ...prev,
                  colors: { ...prev.colors, accent: event.target.value }
                }))
              }
            />
          </label>

          <label className="text-sm font-medium text-ink">
            Cor destaque escura
            <Input
              value={branding.colors.accentDark}
              onChange={(event) =>
                setBranding((prev) => ({
                  ...prev,
                  colors: { ...prev.colors, accentDark: event.target.value }
                }))
              }
            />
          </label>

          <label className="text-sm font-medium text-ink">
            Cor destaque suave
            <Input
              value={branding.colors.accentSoft}
              onChange={(event) =>
                setBranding((prev) => ({
                  ...prev,
                  colors: { ...prev.colors, accentSoft: event.target.value }
                }))
              }
            />
          </label>

          <label className="text-sm font-medium text-ink">
            Cor fundo
            <Input
              value={branding.colors.bg}
              onChange={(event) =>
                setBranding((prev) => ({
                  ...prev,
                  colors: { ...prev.colors, bg: event.target.value }
                }))
              }
            />
          </label>

          <label className="text-sm font-medium text-ink">
            Cor texto
            <Input
              value={branding.colors.ink}
              onChange={(event) =>
                setBranding((prev) => ({
                  ...prev,
                  colors: { ...prev.colors, ink: event.target.value }
                }))
              }
            />
          </label>

          <label className="text-sm font-medium text-ink">
            Cor texto secundario
            <Input
              value={branding.colors.muted}
              onChange={(event) =>
                setBranding((prev) => ({
                  ...prev,
                  colors: { ...prev.colors, muted: event.target.value }
                }))
              }
            />
          </label>

          <label className="text-sm font-medium text-ink">
            Cor bordas
            <Input
              value={branding.colors.line}
              onChange={(event) =>
                setBranding((prev) => ({
                  ...prev,
                  colors: { ...prev.colors, line: event.target.value }
                }))
              }
            />
          </label>

          <label className="text-sm font-medium text-ink">
            Cor sidebar
            <Input
              value={branding.colors.sidebar}
              onChange={(event) =>
                setBranding((prev) => ({
                  ...prev,
                  colors: { ...prev.colors, sidebar: event.target.value }
                }))
              }
            />
          </label>

          <label className="text-sm font-medium text-ink">
            Cor borda sidebar
            <Input
              value={branding.colors.sidebarLine}
              onChange={(event) =>
                setBranding((prev) => ({
                  ...prev,
                  colors: { ...prev.colors, sidebarLine: event.target.value }
                }))
              }
            />
          </label>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => void saveBranding()} disabled={brandingSaving || logoUploading}>
            {brandingSaving ? "Salvando..." : logoUploading ? "Enviando logo..." : "Salvar branding"}
          </Button>
          <Button variant="secondary" onClick={() => void loadBranding()} disabled={brandingLoading || logoUploading}>
            Recarregar
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-black text-ink">Backup manual para pasta sincronizada</h2>
        <p className="text-sm text-muted">
          Gere uma copia completa do sistema sem precisar digitar caminho manual. Quando o navegador permitir, voce pode
          escolher a pasta na hora. Se preferir, tambem pode manter uma pasta automatica no servidor.
        </p>

        <div className="flex flex-wrap gap-2">
          {backupPickerSupported ? (
            <Button type="button" onClick={() => void pickFolderAndSaveBackup()} disabled={backupSaving || backupLoading}>
              {backupSaving ? "Salvando backup..." : "Selecionar pasta e salvar"}
            </Button>
          ) : (
            <p className="text-sm text-muted">
              Seu navegador não oferece seleção direta de pasta nesta tela. Use o botão de download abaixo.
            </p>
          )}
          <Button type="button" variant="secondary" onClick={() => void downloadBackupNow()} disabled={backupSaving || backupLoading}>
            {backupSaving ? "Preparando..." : "Baixar backup agora"}
          </Button>
        </div>

        <label className="text-sm font-medium text-ink">
          Pasta automática do servidor
          <Input
            value={backupDir}
            onChange={(event) => setBackupDir(event.target.value)}
            placeholder="/Users/seu-usuario/iCloud Drive/Backups/Academia"
          />
        </label>
        <p className="text-xs text-muted">
          Essa pasta é usada pelos backups automáticos do servidor. Se ela não estiver preenchida, você ainda pode baixar
          o backup manualmente a qualquer momento.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void saveBackupNow()} disabled={backupSaving || backupLoading || !backupDir.trim()}>
            {backupSaving ? "Salvando..." : "Salvar na pasta automática"}
          </Button>
          <Button variant="secondary" onClick={() => void loadBackupSettings()} disabled={backupLoading || backupSaving}>
            {backupLoading ? "Carregando..." : "Recarregar pasta"}
          </Button>
        </div>

        {backupMessage ? <p className="text-sm text-muted">{backupMessage}</p> : null}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-ink">WhatsApp de mensalidades</h2>
            <p className="text-sm text-muted">
              Dispare avisos antes do vencimento e quando a mensalidade ficar vencida.
            </p>
          </div>
          {whatsAppPreview ? (
            <div className="rounded-xl border border-line/80 bg-white/80 px-3 py-2 text-xs text-muted">
              <div>Proximas: {whatsAppPreview.dueSoonCandidates.length}</div>
              <div>Vencidas: {whatsAppPreview.overdueCandidates.length}</div>
            </div>
          ) : null}
        </div>

        {whatsAppLoading ? <p className="text-sm text-muted">Carregando configuracao do WhatsApp...</p> : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium text-ink">
            Integração ativa
            <select
              value={whatsApp.enabled ? "true" : "false"}
              onChange={(event) =>
                setWhatsApp((prev) => ({
                  ...prev,
                  enabled: event.target.value === "true"
                }))
              }
              className="w-full rounded-xl border border-line/90 bg-white/95 px-3 py-2 text-sm text-ink outline-none ring-accent transition focus:border-accent/60 focus:ring-2"
            >
              <option value="false">Nao</option>
              <option value="true">Sim</option>
            </select>
          </label>

          <label className="text-sm font-medium text-ink">
            Base URL da API
            <Input
              value={whatsApp.baseUrl}
              onChange={(event) => setWhatsApp((prev) => ({ ...prev, baseUrl: event.target.value }))}
              placeholder="http://localhost:8080"
            />
          </label>

          <label className="text-sm font-medium text-ink">
            Instancia
            <Input
              value={whatsApp.instanceName}
              onChange={(event) => setWhatsApp((prev) => ({ ...prev, instanceName: event.target.value }))}
              placeholder="academia"
            />
          </label>

          <label className="text-sm font-medium text-ink">
            API key
            <Input
              value={whatsApp.apiKey}
              onChange={(event) => setWhatsApp((prev) => ({ ...prev, apiKey: event.target.value }))}
              placeholder="apikey"
            />
          </label>

          <label className="text-sm font-medium text-ink">
            DDI padrao
            <Input
              value={whatsApp.countryCode}
              onChange={(event) => setWhatsApp((prev) => ({ ...prev, countryCode: event.target.value }))}
              placeholder="55"
            />
          </label>

          <label className="text-sm font-medium text-ink">
            Dias antes do vencimento
            <Input
              type="number"
              min={1}
              max={30}
              value={String(whatsApp.daysBeforeDue)}
              onChange={(event) =>
                setWhatsApp((prev) => ({
                  ...prev,
                  daysBeforeDue: Number(event.target.value || DEFAULT_WHATSAPP.daysBeforeDue)
                }))
              }
            />
          </label>

          <label className="text-sm font-medium text-ink md:col-span-2">
            Telefone de teste
            <Input
              value={whatsApp.testPhone}
              onChange={(event) => setWhatsApp((prev) => ({ ...prev, testPhone: event.target.value }))}
              placeholder="11999999999"
            />
          </label>

          <label className="text-sm font-medium text-ink md:col-span-2 xl:col-span-3">
            Mensagem antes do vencimento
            <textarea
              value={whatsApp.templates.dueSoon}
              onChange={(event) =>
                setWhatsApp((prev) => ({
                  ...prev,
                  templates: { ...prev.templates, dueSoon: event.target.value }
                }))
              }
              rows={4}
              className="w-full rounded-xl border border-line/90 bg-white/95 px-3 py-2 text-sm text-ink outline-none ring-accent transition focus:border-accent/60 focus:ring-2"
            />
          </label>

          <label className="text-sm font-medium text-ink md:col-span-2 xl:col-span-3">
            Mensagem vencida
            <textarea
              value={whatsApp.templates.overdue}
              onChange={(event) =>
                setWhatsApp((prev) => ({
                  ...prev,
                  templates: { ...prev.templates, overdue: event.target.value }
                }))
              }
              rows={4}
              className="w-full rounded-xl border border-line/90 bg-white/95 px-3 py-2 text-sm text-ink outline-none ring-accent transition focus:border-accent/60 focus:ring-2"
            />
          </label>
        </div>

        <p className="text-xs text-muted">
          Variaveis disponiveis nos templates: {"{nome}"}, {"{academia}"}, {"{valor}"}, {"{vencimento}"}, {"{competencia}"}, {"{telefone}"} e {"{dias}"}.
        </p>

        {whatsAppPreview?.reason ? (
          <p className="rounded-lg border border-[#f1c5ca] bg-[#fff0f2] px-3 py-2 text-sm text-[#a21b25]">
            {whatsAppPreview.reason}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void saveWhatsApp()} disabled={whatsAppSaving || whatsAppTesting || whatsAppDispatching}>
            {whatsAppSaving ? "Salvando..." : "Salvar WhatsApp"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void loadWhatsApp()}
            disabled={whatsAppLoading || whatsAppSaving || whatsAppTesting || whatsAppDispatching}
          >
            Recarregar
          </Button>
          <Button
            variant="secondary"
            onClick={() => void sendWhatsAppTest()}
            disabled={whatsAppTesting || whatsAppSaving || whatsAppDispatching}
          >
            {whatsAppTesting ? "Enviando teste..." : "Enviar teste"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void dispatchWhatsAppReminders()}
            disabled={whatsAppDispatching || whatsAppSaving || whatsAppTesting}
          >
            {whatsAppDispatching ? "Disparando..." : "Disparar lembretes agora"}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-black text-ink">Importar planilha antiga</h2>
        <p className="mb-3 text-sm text-muted">Mapeamento automatico: Musc, caixa, despesas, presenca, personal e pedidos.</p>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void importExcel(file);
            }
          }}
        />
        {importing ? <p className="mt-2 text-sm text-muted">Importando...</p> : null}
      </Card>

      <CrudModule
        endpoint="/api/users"
        title="Usuarios e perfis"
        createLabel="Novo usuario"
        listFields={[
          { key: "name", label: "Nome" },
          { key: "email", label: "E-mail" },
          { key: "role", label: "Perfil" },
          { key: "active", label: "Ativo" },
          { key: "createdAt", label: "Criado em" }
        ]}
        fields={[
          { key: "name", label: "Nome", required: true },
          { key: "email", label: "E-mail", required: true },
          { key: "password", label: "Senha", required: true },
          {
            key: "role",
            label: "Perfil",
            type: "select",
            options: [
              { label: "Administrador", value: "ADMIN" },
              { label: "Financeiro", value: "FINANCEIRO" },
              { label: "Recepcao", value: "RECEPCAO" },
              { label: "Personal", value: "PERSONAL" }
            ]
          },
          {
            key: "active",
            label: "Ativo",
            type: "select",
            options: [
              { label: "Sim", value: "true" },
              { label: "Nao", value: "false" }
            ]
          }
        ]}
        defaultValues={{ role: "RECEPCAO", active: "true" }}
      />

      <CrudModule
        endpoint="/api/configuracoes"
        title="Parametros do sistema"
        createLabel="Novo parametro"
        listFields={[
          { key: "chave", label: "Chave" },
          { key: "valor", label: "Valor" },
          { key: "descricao", label: "Descricao" },
          { key: "updatedAt", label: "Atualizado em" }
        ]}
        fields={[
          { key: "chave", label: "Chave", required: true },
          { key: "valor", label: "Valor", required: true },
          { key: "descricao", label: "Descricao", type: "textarea" }
        ]}
      />
    </div>
  );
}
