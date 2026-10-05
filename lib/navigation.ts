import type { Capability } from "@/lib/auth/capabilities";

export type NavigationIcon =
  | "dashboard"
  | "students"
  | "attendance"
  | "schedule"
  | "monthlies"
  | "cash"
  | "expenses"
  | "products"
  | "sales"
  | "reports"
  | "settings";

export type NavigationItem = {
  label: string;
  href: string;
  icon: NavigationIcon;
  capability: Capability;
};

export type NavigationGroup = {
  label: string;
  items: readonly NavigationItem[];
};

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Início",
    items: [{ label: "Dashboard", href: "/dashboard", icon: "dashboard", capability: "dashboard.view" }]
  },
  {
    label: "Operação",
    items: [
      { label: "Alunos", href: "/alunos", icon: "students", capability: "students.read" },
      { label: "Presença", href: "/frequencia", icon: "attendance", capability: "attendance.read" },
      { label: "Agenda", href: "/agenda-personal", icon: "schedule", capability: "schedule.read" }
    ]
  },
  {
    label: "Financeiro",
    items: [
      { label: "Mensalidades", href: "/mensalidades", icon: "monthlies", capability: "finance.monthlies.read" },
      { label: "Caixa", href: "/caixa", icon: "cash", capability: "finance.cash.read" },
      { label: "Despesas", href: "/despesas-academia", icon: "expenses", capability: "finance.expenses.read" }
    ]
  },
  {
    label: "Vendas",
    items: [
      { label: "Produtos", href: "/produtos", icon: "products", capability: "products.read" },
      { label: "Pedidos", href: "/pedidos", icon: "sales", capability: "sales.read" }
    ]
  },
  {
    label: "Gestão",
    items: [
      { label: "Relatórios", href: "/relatorios", icon: "reports", capability: "reports.financial" },
      { label: "Configurações", href: "/configuracoes", icon: "settings", capability: "settings.manage" }
    ]
  }
];

export function filterNavigationByCapabilities(capabilities: readonly Capability[]): NavigationGroup[] {
  const allowed = new Set(capabilities);
  return navigationGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => allowed.has(item.capability)) }))
    .filter((group) => group.items.length > 0);
}

export function findNavigationItem(pathname: string): (NavigationItem & { group: string }) | null {
  for (const group of navigationGroups) {
    const item = group.items.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
    if (item) return { ...item, group: group.label };
  }
  return null;
}
