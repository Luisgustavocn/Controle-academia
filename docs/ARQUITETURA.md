# Arquitetura

## Camadas
- `app/`: páginas e rotas API (App Router)
- `components/`: UI reutilizável (cards, botões, CRUD)
- `lib/`: autenticação, auditoria, serviços e importação Excel
- `prisma/`: schema e seed
- `scripts/`: execução de automações via CLI

## Banco de dados
Tabelas implementadas:
- `users`
- `alunos`
- `modalidades`
- `historico_planos`
- `mensalidades`
- `pagamentos`
- `movimentacoes_caixa`
- `categorias_financeiras`
- `despesas_academia`
- `despesas_familia`
- `presencas`
- `controle_mensal_alunos`
- `agenda_personal`
- `produtos`
- `pedidos_produto`
- `pedido_itens`
- `configuracoes`
- `logs_auditoria`

## Regras de negócio aplicadas
- Geração automática de mensalidade para alunos `ATIVO`.
- Aluno `CANCELADO`/`TRANCADO` não gera mensalidade automática.
- Presença é controlada por aluno e data.
- Caixa mensal com fechamento e resumo persistido em configurações.
- Despesas de academia e família segregadas.
- Dashboard consolidado com KPIs e séries financeiras.
- Logs de auditoria em operações financeiras.
- Controle de início/entrou/saiu/total final calculado automaticamente.

## API
### Autenticação
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Núcleo
- CRUD completo para alunos, mensalidades, caixa, despesas, presença, agenda, produtos, pedidos.

### Relatórios
- `GET /api/relatorios/ativos`
- `GET /api/relatorios/inadimplentes`
- `GET /api/relatorios/caixa-mensal`
- `GET /api/relatorios/frequencia`
- `GET /api/caixa/export`
- `POST /api/relatorios/export`

### Operações administrativas
- `POST /api/import/excel`
- `POST /api/jobs/gerar-mensalidades`
- `POST /api/jobs/fechamento-caixa`
- `GET /api/jobs/alertas`
- `GET /api/admin/backup`

## Frontend
Telas implementadas:
- login
- dashboard
- alunos
- mensalidades
- caixa
- despesas academia
- despesas família
- frequência
- agenda personal
- produtos
- pedidos
- relatórios
- configurações

## Produção
- Deploy app: Vercel ou VPS Node
- Deploy banco: PostgreSQL gerenciado
- Jobs: cron chamando scripts CLI ou endpoints autenticados
- Backup: endpoint administrativo JSON + backup nativo do banco
