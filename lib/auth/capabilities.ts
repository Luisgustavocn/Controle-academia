import type { SessionRole } from "@/lib/auth/jwt-payload";

export const CAPABILITIES = [
  "dashboard.view",
  "students.read",
  "students.create",
  "students.update",
  "students.status",
  "attendance.read",
  "attendance.write",
  "attendance.retroactive",
  "schedule.read",
  "schedule.write",
  "finance.monthlies.read",
  "finance.monthlies.manage",
  "finance.cash.read",
  "finance.cash.manage",
  "finance.expenses.read",
  "finance.expenses.manage",
  "products.read",
  "products.manage",
  "sales.read",
  "sales.create",
  "sales.manage",
  "reports.financial",
  "reports.operational",
  "whatsapp.manage",
  "team.read",
  "team.manage",
  "settings.manage"
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const roleCapabilities: Record<SessionRole, readonly Capability[]> = {
  ADMIN: CAPABILITIES,
  FINANCEIRO: [
    "dashboard.view",
    "students.read",
    "finance.monthlies.read",
    "finance.monthlies.manage",
    "finance.cash.read",
    "finance.cash.manage",
    "finance.expenses.read",
    "finance.expenses.manage",
    "reports.financial",
    "reports.operational"
  ],
  RECEPCAO: [
    "dashboard.view",
    "students.read",
    "students.create",
    "students.update",
    "students.status",
    "attendance.read",
    "attendance.write",
    "schedule.read",
    "schedule.write",
    "finance.monthlies.read",
    "products.read",
    "products.manage",
    "sales.read",
    "sales.create",
    "sales.manage",
    "reports.operational"
  ],
  PERSONAL: [
    "students.read",
    "attendance.read",
    "attendance.write",
    "schedule.read",
    "schedule.write",
    "reports.operational"
  ]
};

export type CapabilityRequirement = Capability | { anyOf: readonly Capability[] };

export function getCapabilitiesForRole(role: SessionRole): readonly Capability[] {
  return roleCapabilities[role] ?? [];
}

export function hasCapability(role: SessionRole, capability: Capability): boolean {
  return getCapabilitiesForRole(role).includes(capability);
}

export function meetsCapabilityRequirement(role: SessionRole, requirement: CapabilityRequirement): boolean {
  if (typeof requirement === "string") return hasCapability(role, requirement);
  return requirement.anyOf.some((capability) => hasCapability(role, capability));
}

export function getDefaultPathForRole(role: SessionRole): string {
  if (hasCapability(role, "dashboard.view")) return "/dashboard";
  if (hasCapability(role, "attendance.read")) return "/frequencia";
  if (hasCapability(role, "schedule.read")) return "/agenda-personal";
  return "/login";
}

const pageCapabilityRules: Array<{ path: string; requirement: CapabilityRequirement }> = [
  { path: "/dashboard", requirement: "dashboard.view" },
  { path: "/alunos", requirement: "students.read" },
  { path: "/mensalidades", requirement: "finance.monthlies.read" },
  { path: "/caixa", requirement: "finance.cash.read" },
  { path: "/despesas-academia", requirement: "finance.expenses.read" },
  { path: "/frequencia", requirement: "attendance.read" },
  { path: "/agenda-personal", requirement: "schedule.read" },
  { path: "/produtos", requirement: "products.read" },
  { path: "/pedidos", requirement: "sales.read" },
  { path: "/relatorios", requirement: "reports.financial" },
  { path: "/configuracoes", requirement: "settings.manage" }
];

export function getPageCapabilityRequirement(pathname: string): CapabilityRequirement | null {
  return pageCapabilityRules.find(({ path }) => pathname === path || pathname.startsWith(`${path}/`))?.requirement ?? null;
}

export function getUnauthorizedPageRedirect(role: SessionRole, pathname: string): string | null {
  const requirement = getPageCapabilityRequirement(pathname);
  if (!requirement || meetsCapabilityRequirement(role, requirement)) return null;
  return getDefaultPathForRole(role);
}
