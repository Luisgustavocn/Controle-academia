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

## Usuário inicial
- E-mail: `admin@academia.local`
- No primeiro acesso, o sistema solicita a definição de um e-mail e de uma senha segura.

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

- Backup completo em pasta específica (uso administrativo local; em produção o destino vem do ambiente):

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
- O WhatsApp foi preparado para provedores compatíveis com Evolution API; a chave fica exclusivamente em `WHATSAPP_API_KEY`, enquanto os parâmetros não sensíveis podem permanecer no banco.
- Exportações foram implementadas em CSV (compatível com Excel e impressão em PDF pelo navegador).
- O projeto está pronto para deploy em Vercel/Node + Postgres gerenciado.

# Produção — VPS

Esta seção descreve somente os requisitos da aplicação. A configuração do servidor, proxy reverso e gerenciador de processos é tratada separadamente.

## Requisitos de produção

- Node.js 20 ou superior;
- npm;
- PostgreSQL acessível pela aplicação;
- diretório persistente gravável pelo usuário que executará o processo;
- variáveis de ambiente configuradas antes do build e do start.

## Build e inicialização

Execute migrations de produção de forma explícita durante o deploy. O comando `npm start` não executa migration, seed, importação ou limpeza de dados.

```bash
npm ci
npm run prisma:generate
npm run migrate:deploy
npm run build
npm start
```

O `postinstall` já executa `prisma generate` após `npm ci`; o comando explícito acima pode ser mantido no procedimento de deploy para facilitar a verificação operacional.

Por padrão, `npm start` escuta somente em `127.0.0.1:3000`. Use `APP_HOST` e `PORT` para alterar esses valores quando necessário. O processo força `NODE_ENV=production`.

## Variáveis de ambiente

Obrigatórias em produção:

- `DATABASE_URL`
- `JWT_SECRET`
- `APP_DATA_DIR`

Opcionais:

- `APP_HOST`
- `PORT`
- `NEXT_PUBLIC_APP_NAME`
- `UPLOAD_DIR`
- `BACKUP_EXPORT_DIR`
- `BACKUP_EXPORT_DIR_MIRROR`
- `WHATSAPP_BASE_URL`
- `WHATSAPP_INSTANCE_NAME`
- `WHATSAPP_COUNTRY_CODE`
- `WHATSAPP_DAYS_BEFORE_DUE`
- `WHATSAPP_TEST_PHONE`

Condicional:

- `WHATSAPP_API_KEY`, obrigatória somente quando a integração WhatsApp estiver habilitada.

## Diretórios persistentes

Uma organização recomendada é:

```text
/var/lib/controle-academia/
├── uploads/
│   └── branding/
└── backups/
```

Defina `APP_DATA_DIR` com a raiz persistente. Se `UPLOAD_DIR` e `BACKUP_EXPORT_DIR` estiverem vazios, a aplicação deriva automaticamente os diretórios `uploads` e `backups` dessa raiz. `BACKUP_EXPORT_DIR_MIRROR` é opcional; vazio significa que não haverá espelho.

Novas logos são armazenadas fora do código e continuam acessíveis pelas URLs `/uploads/branding/...`. Os diretórios necessários são criados somente quando ocorre um upload ou a geração de um backup.

## Health check

`GET /api/health` verifica a aplicação e executa uma consulta mínima no PostgreSQL:

- HTTP `200`: aplicação e banco disponíveis;
- HTTP `503`: banco indisponível.

A resposta não inclui URLs, credenciais, hostname, versões de dependências ou detalhes internos do erro.

## Reverse proxy e sessão

O cookie `academy_session` permanece `httpOnly`, `sameSite=lax`, com path `/` e duração de 12 horas. A aplicação considera `x-forwarded-proto: https` para manter o cookie `secure` quando o HTTPS termina no proxy reverso.

# PostgreSQL em produção

## Versão e arquitetura

A versão recomendada é PostgreSQL 16, estável, suportada até novembro de 2028 e compatível com o provider `postgresql` do Prisma usado pelo projeto. Instale sempre o minor 16.x mais recente disponível. A aplicação e o PostgreSQL ficarão na mesma VPS e a conexão será feita por loopback:

```text
Next.js → Prisma → 127.0.0.1:5432 → PostgreSQL 16
```

O PostgreSQL não deve ser publicado na internet. A configuração alvo é `listen_addresses = 'localhost'`, sem regra de firewall liberando a porta 5432 externamente.

## Database, usuário e permissões

Convenção definida:

- database: `controle_academia`;
- usuário: `controle_academia_app`.

Para esta aplicação de baixa ou média carga, o mesmo usuário será usado pelo runtime e pelas migrations explícitas. Ele pode ser dono somente do database `controle_academia`, mas não pode ser superuser, criar outros usuários, criar outros databases nem administrar o cluster.

Criação conceitual, executada posteriormente em uma sessão administrativa local do PostgreSQL:

```sql
CREATE ROLE controle_academia_app
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION;

CREATE DATABASE controle_academia
  OWNER controle_academia_app
  ENCODING 'UTF8'
  TEMPLATE template0;

REVOKE ALL ON DATABASE controle_academia FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE controle_academia TO controle_academia_app;
```

A senha deve ser definida interativamente com `\password controle_academia_app`, para não aparecer no comando nem no histórico do shell. Não use senha padrão. A credencial deve existir somente no ambiente protegido da aplicação.

Separar futuramente um usuário exclusivo para migrations é possível, mas exigiria manutenção de grants e privilégios padrão após cada alteração de schema. Para o porte atual, um usuário não-superuser isolado em um único database mantém a operação previsível sem conceder privilégios sobre o cluster.

## DATABASE_URL

Formato esperado, sem credenciais reais:

```text
DATABASE_URL=postgresql://controle_academia_app:PASSWORD@127.0.0.1:5432/controle_academia
```

Caracteres reservados da senha, como `@`, `:`, `/`, `?`, `#` e `%`, precisam ser percent-encoded na URL. Como aplicação e banco estarão na mesma VPS e a conexão ficará restrita ao loopback, `sslmode` não é necessário inicialmente. Se o banco for movido para outro host, TLS deverá ser reavaliado.

Não adicione `connection_limit` inicialmente. O pool padrão do Prisma é suficiente para a carga baixa ou média esperada. Monitore conexões e `max_connections` antes de introduzir limites ou pooler externo.

## Configuração de segurança

Configuração alvo de `postgresql.conf`:

```text
listen_addresses = 'localhost'
port = 5432
password_encryption = 'scram-sha-256'
timezone = 'America/Sao_Paulo'
```

Regras conceituais de `pg_hba.conf`:

```text
local   all                postgres                 peer
host    controle_academia controle_academia_app    127.0.0.1/32    scram-sha-256
host    controle_academia controle_academia_app    ::1/128         scram-sha-256
```

Não use autenticação `trust`, não permita redes remotas e não abra a porta 5432 publicamente. Os arquivos de configuração, ambiente e backup devem ser legíveis apenas pelos usuários de sistema responsáveis.

## Migrations

O projeto possui duas migrations versionadas:

1. `0001_init`: cria enums, tabelas, índices e relacionamentos;
2. `0002_remove_despesa_familia`: executa `DROP TABLE IF EXISTS "DespesaFamilia"`.

Em um database vazio, a segunda migration remove a tabela criada pela primeira antes de qualquer seed e o resultado corresponde ao schema atual. Em uma instalação existente onde essa migration ainda não tenha sido aplicada, ela é destrutiva e elimina os dados de `DespesaFamilia`. Um backup nativo verificado é obrigatório antes de aplicá-la.

Não há migrations dependentes de dados prévios, SQL fora da sequência versionada ou extensões específicas do PostgreSQL. O fluxo correto de produção é:

```text
backup nativo verificado
↓
atualização do código
↓
npm ci
↓
npm run prisma:generate
↓
npm run migrate:deploy
↓
npm run build
↓
restart da aplicação
↓
GET /api/health
```

Nunca use `prisma migrate dev` ou `prisma db push` como procedimento normal de produção. `npm start` não executa migrations automaticamente.

## Seed e primeiro administrador

O seed é manual e não faz parte de `npm install`, `npm start`, restart ou migration. Ele cria:

- um administrador inicial com senha aleatória descartável;
- o marcador de primeiro acesso;
- modalidades e dados demonstrativos de alunos, mensalidades, caixa, despesas, presença, agenda e produtos.

Por conter dados demonstrativos, `npm run prisma:seed` deve ser usado somente em instalação vazia e controlada, nunca em um database real já operacional. Após o seed, a rota de primeiro acesso permite definir o e-mail e a senha definitivos enquanto o marcador estiver pendente.

O seed não é totalmente idempotente para todos os dados demonstrativos: alguns lançamentos, despesas e pedidos podem ser duplicados se ele for repetido. Execute-o no máximo uma vez durante a instalação controlada.

Existe uma janela de takeover se a aplicação for publicada antes da conclusão desse primeiro acesso. No primeiro deploy, mantenha a aplicação acessível apenas por loopback ou por acesso administrativo restrito, execute o seed conscientemente, conclua imediatamente o cadastro do administrador e somente depois permita acesso público. A senha aleatória gerada pelo seed não é exibida nem reutilizada.

## Backup nativo

O backup JSON da aplicação é complementar e não substitui um dump do PostgreSQL. Antes de toda migration de produção, mesmo aparentemente simples, gere um dump nativo em formato custom:

```bash
pg_dump \
  --host=127.0.0.1 \
  --port=5432 \
  --username=controle_academia_app \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=/var/lib/controle-academia/database-backups/backup-AAAA-MM-DD-HHMM.dump \
  controle_academia
```

Use prompt seguro ou arquivo `PGPASSFILE` com permissão `0600`; não coloque a senha na linha de comando. O diretório de dumps deve ter permissão restrita, e cada arquivo deve ter checksum e ser verificado com `pg_restore --list`.

Política inicial de retenção:

- diários: 7 dias;
- semanais: 4 semanas;
- mensais: 6 meses.

Ao menos uma cópia deve sair da VPS para armazenamento externo seguro e, preferencialmente, criptografado. Um dump mantido apenas na mesma VPS não protege contra perda total do servidor. A automação e o destino off-site serão definidos em checkpoint posterior.

## Restauração

Procedimento conceitual:

```text
parar a aplicação
↓
preservar o banco atual e verificar o checksum do dump
↓
criar um database vazio de restauração
↓
restaurar o dump
↓
verificar migrations e contagens
↓
apontar a aplicação para o database restaurado
↓
subir a aplicação
↓
validar GET /api/health e funções críticas
```

Exemplo sem credenciais reais:

```bash
sudo -u postgres createdb \
  --owner=controle_academia_app \
  --encoding=UTF8 \
  controle_academia_restauracao

pg_restore \
  --host=127.0.0.1 \
  --port=5432 \
  --username=controle_academia_app \
  --dbname=controle_academia_restauracao \
  --no-owner \
  --no-acl \
  /caminho/seguro/backup.dump
```

Antes de substituir o database ativo, valide `npm run migrate:deploy`, o health check, as tabelas principais e uma amostra funcional sem expor dados pessoais.

## Timezone, encoding e locale

Configure tanto o sistema/Node quanto o PostgreSQL com `America/Sao_Paulo`; a aplicação documenta `TZ=America/Sao_Paulo`. Instantes operacionais continuam usando `TIMESTAMP(3)` sem timezone conforme o schema legado. `Presenca.data` é uma exceção intencional: usa PostgreSQL `DATE`, trafega como `YYYY-MM-DD` e representa o dia civil sem conversão de offset. Consulte `docs/attendance-model.md` antes de alterar esse contrato.

O database deve usar encoding UTF8. Não é necessário forçar um locale específico neste momento; escolha um locale UTF-8 disponível no sistema e mantenha-o consistente. Alterar collation posteriormente pode exigir recriação de índices ou do database.

## Índices e capacidade inicial

Os principais acessos já possuem cobertura básica:

- `Aluno`: nome, telefone e status;
- `Mensalidade`: unicidade por aluno/competência e índice por competência/status;
- `MovimentacaoCaixa`: competência/tipo;
- `Presenca`: índice por data e unicidade diária por aluno/data;
- `PedidoProduto`: data do pedido;
- `LogAuditoria`: módulo/data de criação.

Riscos a monitorar conforme o volume crescer:

- lembretes e dashboards filtram `Mensalidade` por status junto de `vencimento` ou `dataPagamento`, combinações ainda sem índices dedicados;
- consultas de alunos fazem contagem de inadimplência por aluno, gerando padrão N+1;
- busca textual com `contains` não aproveita bem índices B-tree comuns;
- logs de WhatsApp filtram também entidade, entidadeId e ação, além do módulo;
- chaves estrangeiras como `alunoId` e `categoriaId` nem sempre possuem índice dedicado.

Não foram adicionados índices neste checkpoint. A decisão deve ser baseada em volume real e `EXPLAIN ANALYZE`, evitando otimização prematura.

# Processo de produção — PM2

## Modelo de execução

O processo será executado por um usuário Linux não-root e ficará acessível somente pelo loopback da VPS:

```text
PM2
↓
Next.js production server (127.0.0.1:3000)
↓
Prisma
↓
PostgreSQL local
```

O arquivo `ecosystem.config.cjs` gerencia apenas a aplicação já instalada e compilada. Ele chama diretamente `scripts/start-production.mjs`, o mesmo entrypoint de `npm start`, e não executa instalação, geração do Prisma Client, migration, seed ou build durante um restart.

A configuração inicial usa uma instância em `fork` mode. Com a carga prevista, uma única instância reduz consumo e evita duplicidade futura de jobs e concorrência desnecessária sobre recursos persistidos no filesystem. Cluster mode poderá ser avaliado quando houver métricas que o justifiquem.

## Instalação futura e primeiro start

Em uma VPS tradicional, instale a versão estável corrente do PM2 globalmente, sem adicioná-lo às dependências da aplicação:

```bash
npm install -g pm2
```

Execute os comandos do PM2 como o usuário `controle-academia`. Depois de preparar o código, o banco e a build, inicie e salve a lista de processos:

```bash
cd /opt/controle-academia/app
pm2 start ecosystem.config.cjs --only controle-academia
pm2 save
```

Os diretórios de dados e logs precisam existir, pertencer ao usuário da aplicação e ter permissões restritas antes do primeiro start. Eles não são criados neste checkpoint.

## Fluxo de atualização e restart

A atualização do código deve permanecer uma etapa explícita e controlada. Não há `git pull` automático nem script de deploy neste momento, porque o backup nativo obrigatório anterior às migrations ainda não foi automatizado. O fluxo operacional é:

```text
atualização controlada do código
↓
backup nativo verificado
↓
npm ci
↓
npm run prisma:generate
↓
npm run migrate:deploy
↓
npm run build
↓
pm2 restart controle-academia
↓
curl --fail http://127.0.0.1:3000/api/health
```

Com uma única instância, `reload` não oferece garantia de zero downtime. Use `pm2 restart controle-academia` e considere uma interrupção curta durante a troca do processo. Quando variáveis exportadas no ambiente do PM2 ou valores não sensíveis do ecosystem mudarem, use:

```bash
pm2 restart controle-academia --update-env
```

O entrypoint encaminha `SIGTERM` e `SIGINT` ao servidor Next.js. O Next.js encerra normalmente suas conexões e o pool do Prisma deixa de existir com o processo; não é necessário adicionar desconexão complexa. O PM2 concede até 10 segundos antes de forçar o encerramento. `wait_ready` não é usado porque a aplicação não emite `process.send("ready")`.

## Política de restart e memória

O PM2 reinicia a aplicação após crash, aguardando 5 segundos entre tentativas. O processo precisa permanecer ativo por pelo menos 10 segundos para ser considerado estável e há limite de 10 reinícios instáveis consecutivos, reduzindo loops agressivos quando o ambiente ou o banco estiverem incorretos.

O limite inicial de memória é `750M`, um valor conservador para Next.js e Prisma compartilhando a VPS com outros serviços. Ele pode ser ajustado por `PM2_MAX_MEMORY_RESTART` após observar o consumo real, sem alterar o arquivo versionado.

## Variáveis e secrets

A estratégia recomendada para uma única VPS é manter `/opt/controle-academia/app/.env.production` fora do Git, com proprietário `controle-academia` e modo `0600`. `scripts/start-production.mjs` utiliza o carregador nativo de ambiente do Next.js em modo de produção, portanto não é necessária uma biblioteca `dotenv` adicional.

O ecosystem define somente `NODE_ENV`, `APP_HOST`, `PORT` e `TZ`, além de aceitar opções não sensíveis de memória e caminhos de logs. Credenciais como `DATABASE_URL`, `JWT_SECRET` e `WHATSAPP_API_KEY`, bem como os caminhos persistentes da aplicação, devem ser fornecidas pelo arquivo protegido ou pelo ambiente do serviço. Valores reais nunca devem entrar no Git, no ecosystem ou em comandos registrados no histórico.

Use `APP_HOST=127.0.0.1`; o projeto não usa `HOSTNAME` para bind porque essa variável costuma ser preenchida pelo próprio sistema operacional. A porta permanece configurável por `PORT` e usa `3000` por padrão.

## Logs e rotação

O PM2 captura stdout em `/var/log/controle-academia/out.log` e stderr em `/var/log/controle-academia/error.log`, com timestamps no timezone `America/Sao_Paulo`. A aplicação não deve registrar secrets; mensagens de erro de produção devem continuar genéricas quando puderem conter credenciais ou detalhes internos.

Comandos básicos de operação:

```bash
pm2 status
pm2 describe controle-academia
pm2 logs controle-academia
pm2 monit
```

Logs precisam de rotação para não ocupar o disco indefinidamente. Em checkpoint operacional futuro, configure `pm2-logrotate` ou `logrotate` do Linux com limite inicial de 20 MB por arquivo, retenção de 7 arquivos e compressão dos arquivos antigos. Não foi instalado nenhum módulo neste checkpoint.

## Inicialização após reboot

No servidor, execute `pm2 startup` como o usuário da aplicação. O PM2 exibirá um comando adicional, normalmente com `sudo`, que deverá ser revisado e executado com os privilégios indicados para registrar o serviço daquele usuário. Depois, execute novamente como `controle-academia`:

```bash
pm2 save
```

O `save` persiste a lista atual de processos para restauração no boot. Sempre valide `pm2 status` e o health check após simular ou realizar um reboot. A aplicação em si não deve rodar como root.

## Usuário, diretórios e permissões

Estrutura planejada:

```text
/opt/controle-academia/
└── app/
    ├── ecosystem.config.cjs
    └── .env.production

/var/lib/controle-academia/
├── uploads/
├── backups/
└── database-backups/

/var/log/controle-academia/
├── out.log
└── error.log
```

O usuário `controle-academia` deve conseguir ler a aplicação e escrever somente onde o procedimento de deploy exigir. Ele precisa de leitura e escrita nos diretórios de dados e logs. O arquivo `.env.production` deve ser legível exclusivamente por esse usuário (`0600`). Não use `chmod 777`, escrita global ou root para executar a aplicação.

## Health check pós-restart

Após cada start, restart ou reboot, valide localmente:

```bash
curl --fail http://127.0.0.1:3000/api/health
```

HTTP `200` confirma aplicação e PostgreSQL disponíveis; HTTP `503` indica falha de banco. O endpoint poderá ser consumido posteriormente pelo proxy e pelo monitoramento, sem polling agressivo dentro do processo Node.js.

# Reverse proxy — Nginx e HTTPS

## Arquitetura pública

```text
Internet
↓
DNS
↓
Nginx (80/443)
↓
HTTPS público → proxy HTTP local
↓
Next.js / PM2 (127.0.0.1:3000)
↓
Prisma → PostgreSQL (127.0.0.1:5432)
```

Somente o Nginx deve aceitar conexões públicas. As portas `3000` e `5432` permanecem restritas ao loopback e não devem ser liberadas no firewall.

## Template e domínio

O template temporário está em `deploy/nginx/controle-academia-http-bootstrap.conf` e o template final em `deploy/nginx/controle-academia.conf`. Antes de instalá-los, substitua todas as ocorrências do placeholder `academia.exemplo.com.br` pelo domínio escolhido. Não use o diretório do projeto como `root` do Nginx e nunca mantenha os dois templates ativos ao mesmo tempo.

Crie um registro DNS `A` apontando o domínio para o IPv4 público da VPS. Se a VPS e a rede estiverem preparadas para IPv6, crie também um registro `AAAA` e habilite os `listen [::]` comentados. Um nome `www` exige registro próprio e inclusão explícita em `server_name` e no certificado; ele não é presumido pelo template.

Aguarde a propagação e confirme que o domínio resolve para a VPS antes de solicitar o certificado.

## Bootstrap HTTP e HTTPS

O template final referencia arquivos do Let's Encrypt e somente poderá passar em `nginx -t` depois que o certificado existir. No primeiro provisionamento, use o template bootstrap, que expõe apenas o desafio ACME e `/api/health`; todas as outras rotas retornam `503`, evitando login ou primeiro acesso sem TLS. Valide-o e só então emita o certificado. A sequência é:

```text
DNS apontado e propagado
↓
Nginx HTTP validado
↓
Certbot emite o certificado
↓
template final instalado com o domínio correto
↓
nginx -t
↓
reload do Nginx
↓
HTTP 308 para HTTPS e health check externo
```

Em Ubuntu/Debian, instale Nginx e Certbot pelo mecanismo recomendado para a versão da distribuição. Não fixe comandos de pacote antes de confirmar o sistema operacional. O Certbot pode usar o plugin Nginx ou o webroot `/var/www/letsencrypt` previsto no template. Depois da emissão, valide a renovação:

```bash
certbot renew --dry-run
```

Normalmente o pacote configura um timer do systemd; não crie cron adicional se esse timer estiver ativo. O header HSTS existe somente no bloco HTTPS final e deve ser habilitado apenas depois que o acesso TLS estiver validado. Ele não inclui subdomínios nem preload. Uma CSP deverá ser estudada e testada separadamente para não quebrar scripts, imagens ou o runtime do Next.js.

## Reverse proxy e timeouts

O Nginx usa HTTP/1.1 com upstream `http://127.0.0.1:3000` e encaminha:

- `Host`;
- `X-Real-IP`;
- `X-Forwarded-For`;
- `X-Forwarded-Proto`.

No bloco TLS, `$scheme` resulta em `https`, permitindo que a aplicação marque `academy_session` como seguro mesmo que a conexão interna até o Next.js use HTTP. O cookie continua `httpOnly`, `secure`, `sameSite=lax`, com path `/` e duração de 12 horas.

Não há WebSocket ou SSE no sistema, portanto não foram adicionados headers `Upgrade`. O buffering padrão foi mantido e não existe cache Nginx para HTML ou API. Os timeouts são 5 segundos para conexão, 60 segundos para envio e 120 segundos para resposta do upstream, acomodando importações e relatórios sem aplicar valores excessivos globalmente.

## Uploads, assets e backups

`client_max_body_size 16m` comporta o logo, limitado pela aplicação a 4 MB, e planilhas Excel de tamanho moderado. Planilhas maiores deverão ser avaliadas antes de aumentar o limite porque são carregadas em memória pelo processo Node.js.

O Nginx não possui alias para `_next/static`, uploads ou `APP_DATA_DIR`. O Next.js continua servindo assets e somente `/uploads/branding/` é público para permitir o logo na tela de login. A rota valida rigidamente o nome do arquivo e aceita apenas PNG, JPG e WEBP previamente gravados pela aplicação.

Os diretórios `/var/lib/controle-academia/backups` e `/var/lib/controle-academia/database-backups` nunca são expostos. Também não há `root` apontando para `/opt/controle-academia/app`, directory listing ou alias genérico que possa publicar `.env`, `.git`, dumps, logs ou arquivos do projeto.

## Headers de segurança e compressão

O bloco HTTPS adiciona:

- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` bloqueando câmera, microfone e geolocalização;
- `Strict-Transport-Security` por um ano, somente após HTTPS validado.

`server_tokens off` reduz detalhes de versão sem ser tratado como substituto de atualização e hardening. Gzip é aplicado a texto, CSS, JavaScript, JSON, XML e SVG acima de 1 KB; imagens e outros formatos já comprimidos não são recomprimidos.

## Rate limiting de autenticação

Somente requisições `POST` para `/api/auth/login` e `/api/auth/setup` usam a zona `controle_academia_auth`: média de 5 requisições por minuto por IP, com burst de 5 e resposta HTTP `429` ao exceder. GETs de verificação de primeiro acesso não consomem o limite.

O limite não é global para evitar interferir em dashboards, relatórios ou redes compartilhadas. Se um proxy externo como Cloudflare for adotado futuramente, a identificação do IP real deverá ser configurada com redes confiáveis antes de usar headers enviados pelo cliente.

No primeiro deploy, não publique o DNS antes de concluir o cadastro inicial. Prefira acesso restrito por túnel SSH ou HTTP temporariamente limitado na infraestrutura, configure imediatamente o administrador e somente depois exponha o domínio.

## Health check, logs e validação

O health check público permanece sem dados sensíveis:

```bash
curl --fail https://academia.exemplo.com.br/api/health
```

HTTP `200` confirma aplicação e banco; HTTP `503` indica indisponibilidade do PostgreSQL. Use-o no pós-deploy, monitoramento e diagnóstico sem polling agressivo.

Logs dedicados:

```text
/var/log/nginx/controle-academia-access.log
/var/log/nginx/controle-academia-error.log
```

O formato padrão não registra cookies ou headers de autorização explicitamente. A rotação deve usar a política `logrotate` fornecida pela distribuição para Nginx.

Antes de cada reload na VPS:

```bash
nginx -t
```

Depois do reload, verifique redirect HTTP, certificado, headers, login, rate limiting, upload do logo, importação Excel e `/api/health`. O arquivo versionado não é copiado automaticamente para `/etc/nginx`.

## Firewall desejado

Quando a infraestrutura for configurada, permita publicamente apenas a porta SSH administrativa escolhida e TCP `80`/`443`. Não permita acesso público a TCP `3000` ou `5432`. O firewall não foi alterado neste checkpoint.

# Jobs e automações de produção

## Arquitetura e inventário

```text
cron do usuário controle-academia
↓
flock
↓
CLI local
↓
services da aplicação
↓
Prisma / PostgreSQL
```

Os jobs não chamam endpoints HTTP, não dependem de domínio, Nginx, cookie ou JWT e não armazenam credenciais administrativas no crontab.

| Job | Frequência recomendada | Efeito | Idempotente? | Risco | Comando |
| --- | --- | --- | --- | --- | --- |
| Mensalidades | diária, 05:30 | cria `Mensalidade` ausente e atualiza `ControleMensalAlunos` | sim; unique por aluno/competência, `skipDuplicates` e upsert | financeiro baixo/moderado | `npm run jobs:mensalidades` |
| Atrasos | diária, 06:00 | alterna mensalidades vencidas entre `PENDENTE` e `ATRASADO` conforme a data | sim | baixo | `npm run jobs:atrasos` |
| WhatsApp | diária, 09:00 | envia lembretes e grava `LogAuditoria` | deduplicado por mensalidade/tipo, com ressalva de crash | envio externo | `npm run jobs:whatsapp-alertas` |
| Alertas comuns | sob demanda | consulta mensalidades e despesas pendentes, sem escrita | sim | baixo | endpoint administrativo `GET /api/jobs/alertas` |
| Fechamento | manual | recalcula resumo em `Configuracao` e tenta gerar backup JSON | reexecutável, mas altera timestamp e pode concluir sem backup | financeiro moderado | `npm run jobs:fechamento -- AAAA-MM` |
| Backup JSON | diária, 23:20 | lê dados sanitizados e gera JSON, SHA-256 e espelho opcional | cria artefato novo | dados pessoais/armazenamento | `npm run jobs:backup` |
| Retenção JSON | diária, 23:35 | remove apenas artefatos JSON reconhecidos acima de 14 dias | sim | exclusão limitada | `npm run jobs:backup-prune` |
| Backup PostgreSQL | diária, 23:50 | gera dump custom, valida, cria checksum e aplica retenção de 30 dias | cria artefato novo | dados pessoais/armazenamento | `npm run jobs:backup-postgres` |
| Sincronização automática do caixa | acionada por fluxos existentes | upsert/remove lançamentos automáticos em `MovimentacaoCaixa` e mantém categorias | convergente pelos IDs automáticos | financeiro moderado | sem CLI/cron próprio |

Todos os horários pressupõem `America/Sao_Paulo`. As execuções foram espaçadas para reduzir concorrência e carga simultânea.

## Mensalidades e atrasos

A geração consulta alunos ativos e ignora qualquer competência já existente, inclusive `PAGO`, `PARCIAL` ou `ISENTO`. A constraint `@@unique([alunoId, competencia])` e `createMany(..., skipDuplicates: true)` fornecem uma segunda proteção em caso de corrida. O controle mensal usa upsert. Repetir o job para a mesma competência não substitui pagamentos, valores ou isenções existentes.

Executar diariamente é mais resiliente que depender apenas do primeiro dia do mês: recupera falhas de cron, banco indisponível, reboot ou deploy. O job explícito de atrasos reutiliza `atualizarStatusMensalidadesAtrasadas`, comparando com o início do dia local, sem depender de alguém abrir uma tela.

Ainda existem GETs com escrita: as consultas de mensalidades e colunas chamam a garantia mensal e sincronizam vencimentos/status; dashboard, caixa, exportação e relatório de caixa podem sincronizar lançamentos automáticos. Essa dívida técnica não foi refatorada neste checkpoint.

## WhatsApp

O job usa configurações não sensíveis do banco e `WHATSAPP_API_KEY` exclusivamente do ambiente. Ele processa os candidatos individualmente e continua depois de telefone inválido ou falha do provedor. O CLI registra somente contagens, sem texto das mensagens, telefone, chave ou lista de alunos, e retorna exit code diferente de zero quando há falha parcial.

A deduplicação consulta `LogAuditoria` pela combinação de `entidadeId` da mensalidade e ação `WHATSAPP_MENSALIDADE_PRE_VENCIMENTO` ou `WHATSAPP_MENSALIDADE_VENCIDA`. Assim, cada mensalidade recebe no máximo um aviso pré-vencimento e um aviso vencido nas condições normais.

Existe uma janela residual: se o provedor aceitar a mensagem e o processo morrer antes de gravar o log, a próxima execução poderá reenviar. `flock` elimina concorrência do cron, mas não substitui idempotency key no provedor nem impede uma ação manual/API simultânea.

Antes de habilitar a entrada real do cron, execute como o usuário da aplicação:

```bash
npm run jobs:whatsapp-alertas -- --dry-run
```

O dry-run consulta e contabiliza candidatos, mas o service não chama o provedor nem grava auditoria de envio. Se a integração estiver desabilitada, o job termina sem envio; se estiver habilitada com configuração incompleta ou houver erros individuais, termina com falha.

## Fechamento manual

O fechamento lê todas as movimentações da competência, calcula entradas, saídas e saldo e faz upsert em `Configuracao` sob `fechamento:AAAA-MM`. Depois tenta um backup JSON, mas a gravação do resumo não está na mesma transação e o service captura a falha desse backup.

Ele permanecerá manual porque uma nova execução altera `fechadoEm`, movimentos lançados posteriormente mudam o resultado e não existe conceito de competência bloqueada. Antes de fechar, gere e valide um backup nativo; confirme a competência explicitamente e confira o resultado. O CLI agora retorna falha se o resumo for gravado mas o backup JSON falhar, sem esconder a condição parcial.

## Ambiente e execução dos CLIs

Os scripts TypeScript usam `scripts/cli-runtime.ts`, que define produção, carrega `.env.production` com `@next/env`, valida o ambiente, emite uma linha JSON com timestamp ISO UTC explícito, timezone operacional e resultado, remove valores conhecidos de secrets das falhas e encerra o Prisma em `finally`. Sucesso retorna exit `0`; erro total, falha parcial relevante ou erro no disconnect retorna valor diferente de zero.

Não use `source .env.production`. O arquivo pode seguir a sintaxe do Next.js e deve permanecer `0600`. O backup PostgreSQL usa `scripts/read-postgres-backup-env.mjs` para ler somente nomes não sensíveis previamente permitidos; a senha não passa por esse helper.

## Backup JSON e retenção

O backup lógico continua sendo uma exportação complementar. Ele sanitiza hashes de senha, configurações sensíveis e campos sensíveis dos logs, grava em `BACKUP_EXPORT_DIR` ou em `APP_DATA_DIR/backups`, gera nome timestampado, checksum `.sha256` e não escreve no Git. Falha de diretório ou escrita produz exit diferente de zero.

A retenção padrão remove somente nomes compatíveis com `backup-academia-*.json` e respectivos checksums, com mais de 14 dias, dentro do diretório absoluto validado. Para simular:

```bash
npm run jobs:backup-prune -- --dry-run
```

Altere `JSON_BACKUP_RETENTION_DAYS` somente depois de avaliar espaço e requisitos legais.

## Backup nativo PostgreSQL

`scripts/backup-postgres.sh` usa `set -euo pipefail`, umask `077`, formato custom, arquivo parcial e validação por `pg_restore --list`. O dump só recebe o nome final depois de validado e então ganha checksum SHA-256. Falha de ferramenta, credencial, dump ou validação retorna exit diferente de zero.

A senha fica em `/var/lib/controle-academia/.pgpass`, pertencente ao usuário `controle-academia` e obrigatoriamente com modo `0600`. Formato conceitual, sem senha real:

```text
127.0.0.1:5432:controle_academia:controle_academia_app:SENHA
```

O script passa host, porta, usuário e database separadamente ao `pg_dump`; não passa `DATABASE_URL`, `PGPASSWORD` nem senha em argumentos visíveis por `ps`. Variáveis não sensíveis podem vir do ambiente ou `.env.production` e possuem defaults alinhados à arquitetura definida.

Por padrão são mantidos 30 dias. A limpeza só alcança `controle-academia-*.dump` e `.dump.sha256` dentro de um caminho absoluto diferente de `/`. Simulação, sem gerar dump ou remover arquivos:

```bash
npm run jobs:backup-postgres -- --dry-run
```

O backup diário não substitui o dump imediatamente anterior a cada migration. Antes de `migrate:deploy`, gere outro dump, valide checksum e `pg_restore --list` e só então prossiga.

Backups mantidos apenas na VPS não são suficientes. Uma cópia off-site criptografada e testes periódicos de restauração deverão ser adicionados futuramente.

## Crontab, locks e usuário

O exemplo está em `deploy/cron/controle-academia.cron.example` e deve ser instalado no crontab do usuário não-root `controle-academia`, nunca no crontab do root. Antes da instalação, confirme `command -v npm`, `command -v flock` e `command -v bash`, ajustando os caminhos absolutos do template.

Prepare previamente, com propriedade do usuário da aplicação:

```text
/var/lib/controle-academia/locks/
/var/lib/controle-academia/backups/
/var/lib/controle-academia/database-backups/
/var/log/controle-academia/jobs/
```

Cada rotina possui lock próprio em `/var/lib/controle-academia/locks`. Backup e retenção JSON compartilham o mesmo lock. `flock -n` evita espera e retorna falha quando outra execução ainda está ativa, permitindo detecção futura por monitoramento.

Depois de revisar o arquivo, instale-o como o próprio usuário:

```bash
crontab /opt/controle-academia/app/deploy/cron/controle-academia.cron.example
crontab -l
```

Não instale a linha real de WhatsApp antes de validar o dry-run e confirmar horário, configuração, templates e consentimento operacional.

## Logs e recuperação de falhas

Os logs são separados em:

```text
/var/log/controle-academia/jobs/mensalidades.log
/var/log/controle-academia/jobs/atrasos.log
/var/log/controle-academia/jobs/whatsapp.log
/var/log/controle-academia/jobs/backup-json.log
/var/log/controle-academia/jobs/backup-postgres.log
```

O template `deploy/logrotate/controle-academia-jobs` gira diariamente, mantém 14 arquivos, comprime e cria novos logs com modo `0640` e proprietário `controle-academia`. Ele deverá ser instalado e validado pelo Linux no deploy.

Após falha, preserve o log, corrija a causa e reexecute manualmente sob o mesmo usuário e com `flock`. Mensalidades, atrasos e backups podem ser repetidos conforme suas proteções. No WhatsApp, confira primeiro `LogAuditoria` e o provedor por causa da janela de confirmação. Fechamento exige conferência manual.

Os exit codes estão prontos para integração futura com e-mail, webhook ou monitoramento externo; nenhum serviço de alerta foi configurado agora.

## Segurança dos endpoints

Os endpoints existentes permanecem apenas para administração manual:

- geração de mensalidades: `ADMIN`;
- alertas comuns: `RECEPCAO` ou papel superior;
- preview/envio de WhatsApp: `FINANCEIRO` ou papel superior;
- fechamento: `FINANCEIRO` ou papel superior;
- backups administrativos: `ADMIN`.

O cron não usa esses endpoints.
