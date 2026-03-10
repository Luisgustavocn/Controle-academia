# Controle Academia SaaS

Sistema web completo para gestão de academia, construído para substituir e evoluir a planilha **"Controle academia 2026"**.

## Stack
- Next.js 15 + React 19 + TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- JWT em cookie httpOnly
- Recharts
- Parser Excel (`xlsx`)

## Módulos entregues
1. Cadastro de alunos
2. Mensalidades e pagamentos
3. Livro-caixa
4. Despesas da academia
5. Despesas da família
6. Frequência mensal
7. Agenda de personal
8. Produtos e pedidos
9. Dashboard gerencial
10. Configurações, usuários e permissões
11. Relatórios e exportações CSV
12. Rotina de importação da planilha antiga

## Requisitos
- Node.js 20+
- PostgreSQL 14+

## Instalação
1. Copie `.env.example` para `.env`.
2. Ajuste `DATABASE_URL` e `JWT_SECRET`.
3. Instale dependências:

```bash
npm install
```

4. Gere Prisma Client e rode migração:

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```

5. Rode seed:

```bash
npm run prisma:seed
```

6. Inicie:

```bash
npm run dev
```

## Usuário inicial
- E-mail: `admin@academia.local`
- Senha: `admin123`

## Rotas principais
- `GET/POST /api/alunos`
- `GET/POST /api/mensalidades`
- `GET/POST /api/caixa`
- `GET/POST /api/despesas-academia`
- `GET/POST /api/despesas-familia`
- `GET/POST /api/presencas`
- `GET/POST /api/agenda-personal`
- `GET/POST /api/produtos`
- `GET/POST /api/pedidos`
- `GET /api/dashboard/summary`
- `POST /api/import/excel`
- `POST /api/jobs/gerar-mensalidades`
- `POST /api/jobs/fechamento-caixa`
- `GET /api/jobs/alertas`
- `GET /api/admin/backup`

## Importação da planilha antiga
No menu **Configurações**, selecione o arquivo `.xlsx` e envie.

Mapeamento implementado:
- `Musc` -> `alunos` + `mensalidades`
- `caixa` -> `movimentacoes_caixa`
- `despesa academia` -> `despesas_academia`
- `despesa família` -> `despesas_familia`
- `Personal` -> `agenda_personal`
- `Jan..Dez` -> `presencas`
- `Pedido` + `roupas` -> `pedidos_produto` + `produtos`
- `Graficos` -> recalculado no dashboard

## Jobs automáticos
- Geração mensal de mensalidades:

```bash
npm run jobs:mensalidades -- 2026-03
```

- Fechamento mensal de caixa:

```bash
npm run jobs:fechamento -- 2026-03
```

## Permissões
- `ADMIN`
- `FINANCEIRO`
- `RECEPCAO`
- `PERSONAL`

## Observações
- Alterações financeiras geram log em `logs_auditoria`.
- Exportações foram implementadas em CSV (compatível com Excel e impressão em PDF pelo navegador).
- O projeto está pronto para deploy em Vercel/Node + Postgres gerenciado.
