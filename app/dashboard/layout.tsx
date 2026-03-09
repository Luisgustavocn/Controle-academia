import { Sidebar } from "@/app/components/sidebar";
import { requireSession } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-6">
        <header className="mb-4 flex items-center justify-between card p-4">
          <div>
            <h1 className="text-lg font-semibold">Painel da Academia</h1>
            <p className="text-sm text-slate-500">{session.name} ({session.role})</p>
          </div>
          <form action="/api/logout" method="post">
            <button className="btn-secondary" type="submit">Sair</button>
          </form>
        </header>
        {children}
      </main>
    </div>
  );
}
