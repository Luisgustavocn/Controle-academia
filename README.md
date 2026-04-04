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
5. Frequência mensal
6. Agenda de personal
7. Produtos e pedidos
8. Dashboard gerencial
9. Configurações, usuários e permissões
10. Relatórios e exportações CSV
11. Rotina de importação da planilha antiga

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

## Atalhos Windows
- `Iniciar Controle Academia.bat`: gera a build e sobe o servidor local.
- `Atualizar e Iniciar Controle Academia.bat`: atualiza do GitHub, instala dependências, aplica migrations e inicia.
- `Instalar Atualizar e Iniciar Controle Academia.bat`: pode ser baixado sozinho; ele tenta instalar `winget`, `git`, `node` e `postgresql` quando faltarem, baixa/atualiza o projeto, prepara o banco e inicia o sistema.

## Usuário inicial
- E-mail: `admin@academia.local`
- Senha: `admin123`

## Rotas principais
- `GET/POST /api/alunos`
- `GET/POST /api/mensalidades`
- `GET/POST /api/caixa`
- `GET/POST /api/despesas-academia`
- `GET/POST /api/presencas`
- `GET/POST /api/agenda-personal`
- `GET/POST /api/produtos`
- `GET/POST /api/pedidos`
- `GET /api/dashboard/summary`
- `POST /api/import/excel`
- `POST /api/jobs/gerar-mensalidades`
- `POST /api/jobs/fechamento-caixa`
- `GET /api/jobs/alertas`
- `GET/POST /api/jobs/alertas/whatsapp`
- `GET/PUT /api/whatsapp`
- `POST /api/whatsapp/test`
- `GET /api/admin/backup`

## Importação da planilha antiga
No menu **Configurações**, selecione o arquivo `.xlsx` e envie.

Mapeamento implementado:
- `Musc` -> `alunos` + `mensalidades`
- `caixa` -> `movimentacoes_caixa`
- `despesa academia` -> `despesas_academia`
- `Personal` -> `agenda_personal`
- `Jan..Dez` -> `presencas`
- `Pedido` + `roupas` -> `pedidos_produto` + `produtos`
- `Graficos` -> recalculado no dashboard

## Jobs automáticos
- Backup completo manual/cron:

```bash
npm run jobs:backup
```

- Backup completo em pasta específica:

```bash
npm run jobs:backup -- /caminho/do/backup
```

- Geração mensal de mensalidades:

```bash
npm run jobs:mensalidades -- 2026-03
```

- Fechamento mensal de caixa:

```bash
npm run jobs:fechamento -- 2026-03
```

- Disparo de lembretes de WhatsApp:

```bash
npm run jobs:whatsapp-alertas
```

Para apenas simular sem enviar:

```bash
npm run jobs:whatsapp-alertas -- --dry-run
```

## Permissões
- `ADMIN`
- `FINANCEIRO`
- `RECEPCAO`
- `PERSONAL`

## Observações
- Alterações financeiras geram log em `logs_auditoria`.
- Exclusões físicas de mensalidades, pagamentos, despesas, caixa e pedidos foram bloqueadas para proteger o histórico.
- Remoção de aluno agora vira arquivamento seguro e remoção de usuário vira desativação.
- Backups geram arquivo JSON e checksum `.sha256`; se `BACKUP_EXPORT_DIR_MIRROR` estiver definido, a cópia é salva também em um segundo destino.
- O WhatsApp foi preparado para provedores compatíveis com Evolution API usando `baseUrl`, `instanceName` e `apiKey`.
- Exportações foram implementadas em CSV (compatível com Excel e impressão em PDF pelo navegador).
- O projeto está pronto para deploy em Vercel/Node + Postgres gerenciado.
