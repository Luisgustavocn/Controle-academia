"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { ModuleHeader } from "@/components/ui/module-header";
import { CrudModule } from "@/components/forms/crud-module";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  const [branding, setBranding] = useState<BrandingForm>(DEFAULT_BRANDING);

  useEffect(() => {
    void loadBranding();
    void loadBackupSettings();
  }, []);

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
          O sistema continua usando o banco local. Quando voce clicar no botao abaixo, ele gera uma copia JSON completa
          em outra pasta, como OneDrive, Google Drive ou Dropbox.
        </p>

        <label className="text-sm font-medium text-ink">
          Pasta de backup
          <Input
            value={backupDir}
            onChange={(event) => setBackupDir(event.target.value)}
            placeholder="C:\\Users\\SeuUsuario\\OneDrive\\Backups\\Academia"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void saveBackupNow()} disabled={backupSaving || backupLoading || !backupDir.trim()}>
            {backupSaving ? "Salvando backup..." : "Salvar copia agora"}
          </Button>
          <Button variant="secondary" onClick={() => void loadBackupSettings()} disabled={backupLoading || backupSaving}>
            {backupLoading ? "Carregando..." : "Recarregar pasta"}
          </Button>
          <a href="/api/admin/backup" target="_blank" rel="noreferrer" className="inline-flex">
            <Button type="button" variant="ghost">Baixar JSON</Button>
          </a>
        </div>

        {backupMessage ? <p className="text-sm text-muted">{backupMessage}</p> : null}
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
