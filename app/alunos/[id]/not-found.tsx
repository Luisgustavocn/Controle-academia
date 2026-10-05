import Link from "next/link";
import { UserRound } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export default function StudentNotFound() {
  return <EmptyState icon={UserRound} title="Aluno não encontrado" description="O cadastro informado não existe ou não está mais disponível." action={<Link href="/alunos" className="inline-flex min-h-control-md items-center rounded-ds-lg border border-line bg-card px-4 text-sm font-semibold text-ink hover:bg-accentSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Voltar para Alunos</Link>} />;
}
