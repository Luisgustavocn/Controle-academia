import { prisma } from "@/lib/prisma";

export type BrandingConfig = {
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

const BRANDING_KEYS = {
  academyName: "branding.academyName",
  logoUrl: "branding.logoUrl",
  bg: "branding.bg",
  ink: "branding.ink",
  muted: "branding.muted",
  line: "branding.line",
  accent: "branding.accent",
  accentDark: "branding.accentDark",
  accentSoft: "branding.accentSoft",
  sidebar: "branding.sidebar",
  sidebarLine: "branding.sidebarLine"
} as const;

const BRANDING_DEFAULTS: BrandingConfig = {
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

const LEGACY_DEFAULTS = {
  academyName: "Power Life Academia",
  logoUrl: "/logo.jpeg",
  colors: {
    bg: "#f3efef",
    ink: "#1f171a",
    muted: "#6f6568",
    line: "#ded7d9",
    accent: "#cf1621",
    accentDark: "#9a1018",
    accentSoft: "#fdecef",
    sidebar: "#1b1417",
    sidebarLine: "#2f2228"
  }
} as const;

function normalizeHex(value: string, fallback: string) {
  const normalized = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toLowerCase();
  }
  return fallback;
}

export async function ensureBrandingDefaults() {
  if (!process.env.DATABASE_URL) {
    return;
  }

  await prisma.configuracao.createMany({
    data: [
      {
        chave: BRANDING_KEYS.academyName,
        valor: BRANDING_DEFAULTS.academyName,
        descricao: "Nome exibido no sistema"
      },
      {
        chave: BRANDING_KEYS.logoUrl,
        valor: BRANDING_DEFAULTS.logoUrl,
        descricao: "Logo da academia (path em /public ou URL)"
      },
      {
        chave: BRANDING_KEYS.bg,
        valor: BRANDING_DEFAULTS.colors.bg,
        descricao: "Cor de fundo principal"
      },
      {
        chave: BRANDING_KEYS.ink,
        valor: BRANDING_DEFAULTS.colors.ink,
        descricao: "Cor de texto principal"
      },
      {
        chave: BRANDING_KEYS.muted,
        valor: BRANDING_DEFAULTS.colors.muted,
        descricao: "Cor de texto secundário"
      },
      {
        chave: BRANDING_KEYS.line,
        valor: BRANDING_DEFAULTS.colors.line,
        descricao: "Cor de bordas"
      },
      {
        chave: BRANDING_KEYS.accent,
        valor: BRANDING_DEFAULTS.colors.accent,
        descricao: "Cor de destaque principal"
      },
      {
        chave: BRANDING_KEYS.accentDark,
        valor: BRANDING_DEFAULTS.colors.accentDark,
        descricao: "Cor de destaque escura"
      },
      {
        chave: BRANDING_KEYS.accentSoft,
        valor: BRANDING_DEFAULTS.colors.accentSoft,
        descricao: "Cor de destaque suave"
      },
      {
        chave: BRANDING_KEYS.sidebar,
        valor: BRANDING_DEFAULTS.colors.sidebar,
        descricao: "Cor da barra lateral"
      },
      {
        chave: BRANDING_KEYS.sidebarLine,
        valor: BRANDING_DEFAULTS.colors.sidebarLine,
        descricao: "Cor de borda da barra lateral"
      }
    ],
    skipDuplicates: true
  });

  // Safe upgrade: only replace old defaults if they are still untouched.
  const migrations: Array<{ chave: string; antigo: string; novo: string }> = [
    { chave: BRANDING_KEYS.academyName, antigo: LEGACY_DEFAULTS.academyName, novo: BRANDING_DEFAULTS.academyName },
    { chave: BRANDING_KEYS.logoUrl, antigo: LEGACY_DEFAULTS.logoUrl, novo: BRANDING_DEFAULTS.logoUrl },
    { chave: BRANDING_KEYS.bg, antigo: LEGACY_DEFAULTS.colors.bg, novo: BRANDING_DEFAULTS.colors.bg },
    { chave: BRANDING_KEYS.ink, antigo: LEGACY_DEFAULTS.colors.ink, novo: BRANDING_DEFAULTS.colors.ink },
    { chave: BRANDING_KEYS.muted, antigo: LEGACY_DEFAULTS.colors.muted, novo: BRANDING_DEFAULTS.colors.muted },
    { chave: BRANDING_KEYS.line, antigo: LEGACY_DEFAULTS.colors.line, novo: BRANDING_DEFAULTS.colors.line },
    { chave: BRANDING_KEYS.accent, antigo: LEGACY_DEFAULTS.colors.accent, novo: BRANDING_DEFAULTS.colors.accent },
    { chave: BRANDING_KEYS.accentDark, antigo: LEGACY_DEFAULTS.colors.accentDark, novo: BRANDING_DEFAULTS.colors.accentDark },
    { chave: BRANDING_KEYS.accentSoft, antigo: LEGACY_DEFAULTS.colors.accentSoft, novo: BRANDING_DEFAULTS.colors.accentSoft },
    { chave: BRANDING_KEYS.sidebar, antigo: LEGACY_DEFAULTS.colors.sidebar, novo: BRANDING_DEFAULTS.colors.sidebar },
    { chave: BRANDING_KEYS.sidebarLine, antigo: LEGACY_DEFAULTS.colors.sidebarLine, novo: BRANDING_DEFAULTS.colors.sidebarLine }
  ];

  for (const migration of migrations) {
    await prisma.configuracao.updateMany({
      where: {
        chave: migration.chave,
        valor: migration.antigo
      },
      data: {
        valor: migration.novo
      }
    });
  }
}

export async function getBrandingConfig(): Promise<BrandingConfig> {
  try {
    await ensureBrandingDefaults();

    if (!process.env.DATABASE_URL) {
      return BRANDING_DEFAULTS;
    }

    const items = await prisma.configuracao.findMany({
      where: {
        chave: {
          in: Object.values(BRANDING_KEYS)
        }
      }
    });

    const byKey = new Map(items.map((item) => [item.chave, item.valor]));
    return {
      academyName: byKey.get(BRANDING_KEYS.academyName) || BRANDING_DEFAULTS.academyName,
      logoUrl: byKey.get(BRANDING_KEYS.logoUrl) || BRANDING_DEFAULTS.logoUrl,
      colors: {
        bg: normalizeHex(byKey.get(BRANDING_KEYS.bg) || "", BRANDING_DEFAULTS.colors.bg),
        ink: normalizeHex(byKey.get(BRANDING_KEYS.ink) || "", BRANDING_DEFAULTS.colors.ink),
        muted: normalizeHex(byKey.get(BRANDING_KEYS.muted) || "", BRANDING_DEFAULTS.colors.muted),
        line: normalizeHex(byKey.get(BRANDING_KEYS.line) || "", BRANDING_DEFAULTS.colors.line),
        accent: normalizeHex(byKey.get(BRANDING_KEYS.accent) || "", BRANDING_DEFAULTS.colors.accent),
        accentDark: normalizeHex(byKey.get(BRANDING_KEYS.accentDark) || "", BRANDING_DEFAULTS.colors.accentDark),
        accentSoft: normalizeHex(byKey.get(BRANDING_KEYS.accentSoft) || "", BRANDING_DEFAULTS.colors.accentSoft),
        sidebar: normalizeHex(byKey.get(BRANDING_KEYS.sidebar) || "", BRANDING_DEFAULTS.colors.sidebar),
        sidebarLine: normalizeHex(byKey.get(BRANDING_KEYS.sidebarLine) || "", BRANDING_DEFAULTS.colors.sidebarLine)
      }
    };
  } catch {
    return BRANDING_DEFAULTS;
  }
}

export async function saveBrandingConfig(input: BrandingConfig) {
  const safe: BrandingConfig = {
    academyName: input.academyName.trim() || BRANDING_DEFAULTS.academyName,
    logoUrl: input.logoUrl.trim() || BRANDING_DEFAULTS.logoUrl,
    colors: {
      bg: normalizeHex(input.colors.bg, BRANDING_DEFAULTS.colors.bg),
      ink: normalizeHex(input.colors.ink, BRANDING_DEFAULTS.colors.ink),
      muted: normalizeHex(input.colors.muted, BRANDING_DEFAULTS.colors.muted),
      line: normalizeHex(input.colors.line, BRANDING_DEFAULTS.colors.line),
      accent: normalizeHex(input.colors.accent, BRANDING_DEFAULTS.colors.accent),
      accentDark: normalizeHex(input.colors.accentDark, BRANDING_DEFAULTS.colors.accentDark),
      accentSoft: normalizeHex(input.colors.accentSoft, BRANDING_DEFAULTS.colors.accentSoft),
      sidebar: normalizeHex(input.colors.sidebar, BRANDING_DEFAULTS.colors.sidebar),
      sidebarLine: normalizeHex(input.colors.sidebarLine, BRANDING_DEFAULTS.colors.sidebarLine)
    }
  };

  await ensureBrandingDefaults();

  const entries: Array<{ chave: string; valor: string; descricao: string }> = [
    { chave: BRANDING_KEYS.academyName, valor: safe.academyName, descricao: "Nome exibido no sistema" },
    { chave: BRANDING_KEYS.logoUrl, valor: safe.logoUrl, descricao: "Logo da academia (path em /public ou URL)" },
    { chave: BRANDING_KEYS.bg, valor: safe.colors.bg, descricao: "Cor de fundo principal" },
    { chave: BRANDING_KEYS.ink, valor: safe.colors.ink, descricao: "Cor de texto principal" },
    { chave: BRANDING_KEYS.muted, valor: safe.colors.muted, descricao: "Cor de texto secundário" },
    { chave: BRANDING_KEYS.line, valor: safe.colors.line, descricao: "Cor de bordas" },
    { chave: BRANDING_KEYS.accent, valor: safe.colors.accent, descricao: "Cor de destaque principal" },
    { chave: BRANDING_KEYS.accentDark, valor: safe.colors.accentDark, descricao: "Cor de destaque escura" },
    { chave: BRANDING_KEYS.accentSoft, valor: safe.colors.accentSoft, descricao: "Cor de destaque suave" },
    { chave: BRANDING_KEYS.sidebar, valor: safe.colors.sidebar, descricao: "Cor da barra lateral" },
    { chave: BRANDING_KEYS.sidebarLine, valor: safe.colors.sidebarLine, descricao: "Cor de borda da barra lateral" }
  ];

  for (const entry of entries) {
    await prisma.configuracao.upsert({
      where: { chave: entry.chave },
      update: { valor: entry.valor, descricao: entry.descricao },
      create: entry
    });
  }

  return safe;
}
