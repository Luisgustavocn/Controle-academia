"use client";

import { useState } from "react";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, DataTableBody, DataTableCell, DataTableContainer, DataTableHead, DataTableHeader, DataTableRow } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FilterBar, FilterBarActions, FilterBarPrimary, FilterChip } from "@/components/ui/filter-bar";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { ResponsiveList } from "@/components/ui/responsive-list";
import { SearchField } from "@/components/ui/search-field";
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";

const students = [
  { name: "Ana Souza", plan: "Musculação", status: "Ativo" },
  { name: "Bruno Lima", plan: "Funcional", status: "Pendente" }
];

export function DesignSystemPreview() {
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  return (
    <main className="mx-auto min-w-0 max-w-7xl space-y-8 overflow-x-clip p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Design System"
        description="Galeria disponível somente em desenvolvimento para validação visual e de interação."
        breadcrumbs={[{ label: "Desenvolvimento" }, { label: "Componentes" }]}
        primaryAction={<Button leadingIcon={<Plus className="h-4 w-4" />}>Ação principal</Button>}
        secondaryActions={<Button variant="outline">Ação secundária</Button>}
      />

      <section className="space-y-3" aria-labelledby="controls-title">
        <h2 id="controls-title" className="text-section-title text-ink">Controles e feedback</h2>
        <Card>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Button size="sm">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button loading>Salvando</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Nome" htmlFor="preview-name" description="Descrição curta do campo.">
                <Input id="preview-name" placeholder="Nome do aluno" />
              </FormField>
              <FormField label="Plano" htmlFor="preview-plan">
                <Select id="preview-plan"><option>Musculação</option><option>Funcional</option></Select>
              </FormField>
              <Input aria-label="Campo com erro" defaultValue="inválido" error="Revise este valor." />
              <SearchField aria-label="Buscar" value={search} onChange={(event) => setSearch(event.target.value)} onClear={() => setSearch("")} placeholder="Buscar aluno" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Checkbox label="Enviar comprovante" description="Confirma o envio após salvar." />
              <Switch label="Ativar lembretes" description="Pode ser alterado a qualquer momento." />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Genérico</Badge><StatusBadge status="Ativo" /><StatusBadge status="Pendente" /><StatusBadge status="Atrasado" />
              <Tooltip content="Informação complementar"><Button size="icon" variant="ghost" aria-label="Ajuda"><Search className="h-4 w-4" /></Button></Tooltip>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="composition-title">
        <h2 id="composition-title" className="text-section-title text-ink">Composição e navegação</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Card composto</CardTitle><CardDescription>Sem sombra pesada e com áreas independentes.</CardDescription></CardHeader>
            <CardContent><p className="text-body text-ink">Conteúdo principal do card.</p></CardContent>
            <CardFooter><Button variant="outline">Cancelar</Button><Button>Salvar</Button></CardFooter>
          </Card>
          <Card>
            <Tabs defaultValue="geral">
              <TabsList aria-label="Exemplo de abas"><TabsTrigger value="geral">Visão geral</TabsTrigger><TabsTrigger value="financeiro">Financeiro</TabsTrigger><TabsTrigger value="historico">Histórico longo</TabsTrigger></TabsList>
              <TabsContent value="geral">Conteúdo geral.</TabsContent>
              <TabsContent value="financeiro">Conteúdo financeiro.</TabsContent>
              <TabsContent value="historico">Conteúdo histórico.</TabsContent>
            </Tabs>
          </Card>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialog(true)}>Abrir Dialog</Button>
          <Button variant="secondary" onClick={() => setDrawer(true)}>Abrir Drawer</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>Confirmar ação</Button>
          <Button variant="outline" onClick={() => toast({ title: "Alterações salvas", description: "Feedback não bloqueante.", tone: "success" })}>Mostrar Toast</Button>
          <DropdownMenu trigger="Ações" label="Ações da demonstração"><DropdownMenuItem>Editar</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem destructive>Excluir</DropdownMenuItem></DropdownMenu>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="data-title">
        <h2 id="data-title" className="text-section-title text-ink">Filtros e dados responsivos</h2>
        <FilterBar>
          <FilterBarPrimary><SearchField aria-label="Buscar nos dados" placeholder="Buscar" /></FilterBarPrimary>
          <FilterBarActions><FilterChip onRemove={() => undefined}>Ativos</FilterChip><Button variant="outline">Filtros</Button></FilterBarActions>
        </FilterBar>
        <ResponsiveList
          desktop={
            <DataTableContainer><DataTable><DataTableHeader><DataTableRow><DataTableHead>Aluno</DataTableHead><DataTableHead>Plano</DataTableHead><DataTableHead>Status</DataTableHead><DataTableHead><span className="sr-only">Ações</span></DataTableHead></DataTableRow></DataTableHeader><DataTableBody>{students.map((student) => <DataTableRow key={student.name}><DataTableCell><span className="flex items-center gap-2"><Avatar name={student.name} size="sm" />{student.name}</span></DataTableCell><DataTableCell>{student.plan}</DataTableCell><DataTableCell><StatusBadge status={student.status} /></DataTableCell><DataTableCell><Button variant="ghost" size="icon" aria-label={`Ações de ${student.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DataTableCell></DataTableRow>)}</DataTableBody></DataTable></DataTableContainer>
          }
          mobile={<div className="space-y-2">{students.map((student) => <Card key={student.name} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"><Avatar name={student.name} /><div className="min-w-0"><p className="truncate font-semibold text-ink">{student.name}</p><p className="truncate text-helper text-muted">{student.plan}</p></div><StatusBadge status={student.status} className="col-start-2 w-fit sm:col-start-3 sm:row-start-1" /></Card>)}</div>}
        />
        <Pagination page={1} totalPages={4} totalItems={36} onPageChange={() => undefined} />
      </section>

      <section className="space-y-3" aria-labelledby="states-title">
        <h2 id="states-title" className="text-section-title text-ink">Estados</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <EmptyState title="Nenhum aluno" description="Cadastre o primeiro aluno para começar." action={<Button size="sm">Cadastrar</Button>} />
          <ErrorState message="Não foi possível carregar os dados." onRetry={() => undefined} />
          <Card><Skeleton className="mb-4 h-10 w-10 rounded-full" /><SkeletonText lines={4} /></Card>
        </div>
      </section>

      <Dialog open={dialog} onOpenChange={setDialog} title="Dialog acessível" description="Escape fecha e o foco volta ao botão."><Input aria-label="Campo do diálogo" placeholder="Digite algo" /></Dialog>
      <Drawer open={drawer} onOpenChange={setDrawer} title="Filtros rápidos"><Checkbox label="Somente ativos" /></Drawer>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Confirmar exclusão?" description="Esta demonstração não executa nenhuma ação." confirmVariant="danger" onConfirm={() => setConfirm(false)} />
    </main>
  );
}
