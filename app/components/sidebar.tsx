import Link from "next/link";

const links = [
  ["Dashboard", "/dashboard"],
  ["Alunos", "/dashboard/alunos"],
  ["Mensalidades", "/dashboard/mensalidades"],
  ["Caixa", "/dashboard/caixa"],
  ["Despesas Academia", "/dashboard/despesas-academia"],
  ["Despesas Familia", "/dashboard/despesas-familia"],
  ["Frequencia", "/dashboard/frequencia"],
  ["Agenda Personal", "/dashboard/agenda"],
  ["Produtos", "/dashboard/produtos"],
  ["Pedidos", "/dashboard/pedidos"],
  ["Relatorios", "/dashboard/relatorios"],
  ["Configuracoes", "/dashboard/configuracoes"],
];

export function Sidebar() {
  return (
    <aside className="w-full lg:w-64 lg:min-h-screen border-r border-slate-200 bg-white">
      <div className="p-4 text-lg font-semibold text-primary">Controle Academia</div>
      <nav className="grid gap-1 p-2">
        {links.map(([label, href]) => (
          <Link key={href} href={href} className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
