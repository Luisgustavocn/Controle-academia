# Produção e operações — Controle Academia

Este documento descreve o ambiente real de produção e os procedimentos oficiais de manutenção. Ele não contém credenciais. Antes de executar uma mudança, confirme o alvo e mantenha uma sessão administrativa disponível para recuperação.

## Inventário do ambiente

| Item | Valor |
| --- | --- |
| URL canônica | `https://painel.academiapowerlife.com` |
| IP público | `179.236.242.97` |
| Usuário Linux | `controle-academia` |
| Aplicação | `/opt/controle-academia/app` |
| Dados persistentes | `/var/lib/controle-academia` |
| Logs | `/var/log/controle-academia` |
| Processo PM2 | `controle-academia` |
| Serviço systemd | `pm2-controle-academia.service` |
| Database | `controle_academia` |
| Role PostgreSQL | `controle_academia_app` |
| Porta da aplicação | `127.0.0.1:3000` |
| PostgreSQL | `127.0.0.1:5432` e `[::1]:5432` |
| Timezone | `America/Sao_Paulo` |

### Arquivos operacionais

- Nginx: `/etc/nginx/sites-available/controle-academia`, habilitado por symlink em `sites-enabled`;
- template Nginx versionado: `deploy/nginx/controle-academia.conf`;
- certificado: gerenciado pelo Certbot sob `/etc/letsencrypt`;
- crontab: instalado para o usuário `controle-academia` a partir de `deploy/cron/controle-academia.cron.example`;
- logrotate: `/etc/logrotate.d/controle-academia`, baseado em `deploy/logrotate/controle-academia-jobs`;
- backup PostgreSQL: `/var/lib/controle-academia/database-backups`;
- backup JSON: `/var/lib/controle-academia/backups`;
- locks: `/var/lib/controle-academia/locks`;
- logs dos jobs: `/var/log/controle-academia/jobs`.

## Atualização oficial

1. Desenvolva e valide a mudança localmente.
2. Faça commit e push normal para `main`.
3. Antes de uma migration que altere schema, gere e valide um dump PostgreSQL:

   ```bash
   sudo -u controle-academia -H /usr/bin/flock -n \
     /var/lib/controle-academia/locks/backup-postgres.lock \
     /bin/bash /opt/controle-academia/app/scripts/backup-postgres.sh
   ```

4. Confirme que a árvore da VPS está limpa e atualize somente por fast-forward:

   ```bash
   sudo -u controle-academia git -C /opt/controle-academia/app fetch origin
   sudo -u controle-academia git -C /opt/controle-academia/app status -sb
   sudo -u controle-academia git -C /opt/controle-academia/app pull --ff-only origin main
   ```

5. Instale exatamente as dependências do lockfile e gere o Prisma Client:

   ```bash
   sudo -u controle-academia -H bash -lc \
     'cd /opt/controle-academia/app && npm ci && npx prisma generate'
   ```

6. Consulte o estado das migrations carregando o ambiente sem imprimi-lo:

   ```bash
   sudo -u controle-academia -H bash -lc \
     'cd /opt/controle-academia/app && set -a && . ./.env.production && set +a && npx prisma migrate status'
   ```

7. Se o commit contiver migrations novas e revisadas, aplique-as explicitamente:

   ```bash
   sudo -u controle-academia -H bash -lc \
     'cd /opt/controle-academia/app && set -a && . ./.env.production && set +a && npm run migrate:deploy'
   ```

8. Gere o build e só então recarregue o processo:

   ```bash
   sudo -u controle-academia -H bash -lc \
     'cd /opt/controle-academia/app && npm run build'
   sudo -u controle-academia -H pm2 reload controle-academia
   ```

9. Valide saúde, status e logs:

   ```bash
   curl -fsS https://painel.academiapowerlife.com/api/health
   sudo -u controle-academia -H pm2 status
   sudo -u controle-academia -H pm2 logs controle-academia --lines 100 --nostream
   ```

Se a mudança for exclusivamente documental, não execute `npm ci`, build ou reload do PM2.

Nunca use como rotina de produção `git reset --hard`, `git pull --rebase`, `prisma db push`, `prisma migrate dev`, `prisma migrate reset` ou `npm audit fix --force`.

## Rollback de código

### Sem migration

1. Identifique o commit defeituoso e o último commit saudável.
2. No repositório de desenvolvimento, crie um commit de reversão com `git revert`; não reescreva `main` e não use force push.
3. Revise, teste e publique o commit de reversão.
4. Na VPS, use o fluxo normal de `fetch` + `pull --ff-only`.
5. Execute `npm ci` se o lockfile mudou, gere o build, recarregue o PM2 e valide health/logs.

### Após migration destrutiva

Não tente reverter migrations Prisma automaticamente. Coloque o sistema em manutenção conforme o impacto, preserve um dump do estado atual, identifique o último dump validado anterior à migration e ensaie a restauração em banco temporário. A decisão entre migration corretiva e restore integral exige análise de schema e perda de dados. Registre a decisão e valide a aplicação antes de reabrir o acesso.

## Backups

### PostgreSQL

- diretório: `/var/lib/controle-academia/database-backups`;
- retenção: 30 dias;
- formato: dump custom do PostgreSQL;
- conteúdo: cópia integral do banco;
- artefatos: `.dump` e `.dump.sha256`;
- validação: checksum e `pg_restore --list`.

Execução manual:

```bash
sudo -u controle-academia -H /usr/bin/flock -n \
  /var/lib/controle-academia/locks/backup-postgres.lock \
  /bin/bash /opt/controle-academia/app/scripts/backup-postgres.sh
```

### JSON

- diretório: `/var/lib/controle-academia/backups`;
- retenção: 14 dias;
- conteúdo: exportação operacional sanitizada;
- `passwordHash` e configurações sensíveis: `[REDACTED]`;
- artefatos: `.json` e `.json.sha256`.

O JSON facilita inspeção e recuperação operacional, mas não substitui o dump PostgreSQL completo.

## Restore validado

Nunca restaure diretamente sobre `controle_academia` sem preservar o estado atual.

1. Identifique o dump e valide seu checksum.
2. Execute `pg_restore --list`.
3. Gere um novo dump do banco atual e confirme que ele é restaurável.
4. Crie um banco temporário, por exemplo `controle_academia_restore_test`.
5. Restaure o dump no banco temporário, sem alterar owner/ACL do backup.
6. Compare tabelas, `_prisma_migrations`, contagem de usuários e ADMIN com a origem esperada.
7. Remova o banco temporário após o ensaio.
8. Somente então planeje o restore real, com janela de manutenção, aplicação parada e plano de retorno.

O procedimento destrutivo de substituição do banco real não deve ser improvisado. Consulte também [disaster-recovery.md](disaster-recovery.md).

## Agendamentos

O crontab pertence a `controle-academia` e usa `CRON_TZ` e `TZ` iguais a `America/Sao_Paulo`.

| Horário | Job | Lock |
| --- | --- | --- |
| 05:30 | mensalidades | `mensalidades.lock` |
| 06:00 | atualização de atrasos | `atrasos.lock` |
| 09:00 | alertas WhatsApp | `whatsapp.lock` |
| 23:20 | backup JSON | `backup-json.lock` |
| 23:35 | retenção JSON | `backup-json.lock` |
| 23:50 | backup PostgreSQL | `backup-postgres.lock` |

O WhatsApp está desabilitado e o job encerra sem envio enquanto `enabled=false`. O fechamento mensal permanece manual:

```bash
npm run jobs:fechamento -- AAAA-MM
```

## Monitoramento mínimo

```bash
curl -fsS https://painel.academiapowerlife.com/api/health
sudo -u controle-academia -H pm2 status
systemctl status nginx --no-pager
systemctl status postgresql --no-pager
systemctl status pm2-controle-academia --no-pager
systemctl status cron --no-pager
df -h /
free -h
swapon --show
```

Logs principais:

- Nginx: `/var/log/nginx/controle-academia-access.log` e `/var/log/nginx/controle-academia-error.log`;
- aplicação/PM2: `/var/log/controle-academia/out.log` e `/var/log/controle-academia/error.log`;
- jobs: `/var/log/controle-academia/jobs`;
- PostgreSQL: `journalctl -u postgresql -u postgresql@16-main` e `/var/log/postgresql`;
- serviços: `journalctl -u nginx`, `journalctl -u pm2-controle-academia` e `journalctl -u cron`.

### Espaço em disco

```bash
df -h /
du -sh /var/lib/controle-academia/*
du -sh /var/log/controle-academia/*
du -sh /opt/controle-academia/app/.next /opt/controle-academia/app/node_modules
```

Investigue crescimento fora do padrão em backups, logs, `.next` e `node_modules`. Não apague backups válidos sem verificar retenção e cópia externa. O logrotate mantém 14 rotações diárias dos jobs.

## Certificado e firewall

- certificado: `painel.academiapowerlife.com`;
- renovação: timer automático do Certbot;
- teste seguro de renovação: `certbot renew --dry-run`;
- firewall esperado: 22, 80 e 443 públicos; 3000 e 5432 privados.

Validação:

```bash
ufw status verbose
ss -ltnp
```

## Capacidade observada

Snapshot de 2026-10-04:

- 2 vCPU;
- 7,7 GiB de RAM, aproximadamente 6,9 GiB disponíveis;
- aplicação PM2 em aproximadamente 76 MiB;
- swap de 2 GiB, sem uso;
- disco de 96 GiB, 89 GiB livres, 8% usado;
- `.next`: aproximadamente 226 MiB;
- `node_modules`: aproximadamente 960 MiB;
- backups locais: menos de 1 MiB no estado inicial;
- logs da aplicação/jobs: menos de 50 KiB no estado inicial.

Esses valores são referência, não limites. Acompanhe tendência e espaço livre antes de adicionar outro sistema.

## Futuro deploy — Lentes no Esporte

O Lentes não está instalado. Seu futuro deploy deve obrigatoriamente usar:

- usuário Linux diferente;
- diretório próprio em `/opt`;
- diretórios próprios em `/var/lib` e `/var/log`;
- processo e serviço PM2 diferentes;
- database e role PostgreSQL diferentes;
- Deploy Key GitHub diferente;
- domínio ou subdomínio diferente;
- porta loopback diferente de `3000`;
- crontab, backups e locks diferentes;
- secrets próprios, sem reutilização.

Pode compartilhar apenas VPS, kernel/SO, Nginx, servidor PostgreSQL, Node system-wide, Certbot e UFW. Antes do deploy, revise RAM, disco, portas e conflitos de nomes.

## Backup off-site

**STATUS: PENDENTE**

O backup local não protege contra perda total da VPS. A estratégia futura deve usar um destino externo, criptografia em trânsito, credencial restrita somente a backup, retenção definida e testes periódicos de restore. A cópia deve incluir ao menos dumps PostgreSQL validados; a inclusão dos JSON sanitizados é opcional. Não contrate nem configure um provedor sem autorização explícita.

## Política de segredos

- `.env.production` existe somente na VPS, com modo `600`, e nunca entra no Git;
- a Deploy Key privada nunca entra no Git;
- `.pgpass` permanece fora do repositório e com modo `600`;
- passwords, URLs completas de banco, JWT, API keys, chaves privadas e cookies não entram em documentação ou logs;
- qualquer exposição exige revogação/rotação imediata e revisão dos logs e do histórico Git.

## Checklist pós-deploy

- [ ] health retorna HTTP 200 e database `ok`;
- [ ] login funciona;
- [ ] PM2 está online e sem crash loop;
- [ ] PostgreSQL está ativo;
- [ ] Nginx está ativo;
- [ ] HTTPS está válido;
- [ ] UFW está ativo;
- [ ] existe backup PostgreSQL recente e validado;
- [ ] existe backup JSON recente e sanitizado;
- [ ] cron está instalado para `controle-academia`;
- [ ] logs não apresentam erro crítico;
- [ ] disco e memória estão saudáveis.

## Pendências conhecidas

- backup off-site;
- configuração futura do WhatsApp, se desejada;
- remoção do efeito de escrita das rotas GET de mensalidades.
