# Disaster recovery — Controle Academia

Este runbook orienta diagnóstico e recuperação. Não contém secrets e não autoriza restore destrutivo sem validação. Preserve evidências, registre horários e mudanças, e gere um backup do estado atual sempre que ele ainda estiver acessível.

## Prioridades e ordem geral

1. Segurança de pessoas, credenciais e dados.
2. Preservação do banco e dos backups existentes.
3. Diagnóstico de VPS, disco, PostgreSQL, PM2 e Nginx.
4. Recuperação do banco em ambiente temporário.
5. Recuperação da aplicação e proxy.
6. Validação de health, login e operações críticas.
7. Reabertura do acesso e monitoramento reforçado.

Dados necessários:

- acesso administrativo SSH e console do provedor;
- repositório privado e Deploy Key exclusiva;
- `.env.production` recuperado de fonte segura;
- dumps em `/var/lib/controle-academia/database-backups` ou cópia off-site;
- inventário e procedimentos de [production-deployment.md](production-deployment.md).

## VPS indisponível

**Diagnóstico:** consulte o painel do provedor, status da instância, console, rede, uso de disco e eventos de manutenção. Diferencie falha de DNS, SSH e desligamento da VPS.

**Ação:** tente o console do provedor; confirme boot, filesystem e `sshd`; evite recriar a VPS antes de copiar dados acessíveis. Se o servidor não for recuperável, siga “Perda do servidor inteiro”.

**Ordem:** infraestrutura → SSH → disco → PostgreSQL → PM2 → Nginx → health.

## Corrupção do banco

**Diagnóstico:** preserve logs do PostgreSQL, valide espaço em disco e identifique quando a corrupção começou. Não execute `migrate reset`, `db push` ou restore sobre o banco real.

**Ação:** gere um dump do estado atual se possível; valide checksum e `pg_restore --list` do backup candidato; restaure primeiro em banco temporário; confira tabelas, `_prisma_migrations`, usuários e contagens de negócio. Planeje uma janela de manutenção e só substitua o banco real após aprovação do teste.

**Dados:** dump anterior validado, checksum, schema/migrations do mesmo commit e `.pgpass` protegido.

**Ordem:** preservar atual → testar dump → comparar → decidir migration corretiva ou restore → validar aplicação.

## Deploy quebrado

**Diagnóstico:** verifique `git status`, HEAD, build, `pm2 status`, error log e health. Confirme se houve migration.

**Ação sem migration:** reverta o commit no repositório de desenvolvimento com `git revert`, publique em `main`, atualize a VPS por `pull --ff-only`, reinstale dependências se necessário, faça build e reload do PM2.

**Ação com migration:** não faça rollback automático. Preserve o banco, avalie compatibilidade do código anterior e considere migration corretiva ou restore ensaiado.

**Ordem:** restringir impacto → preservar dados → identificar commit/migration → corrigir → build → health/logs.

## Certificado expirado ou renovação falhando

**Diagnóstico:** use `certbot certificates`, `systemctl status certbot.timer`, `journalctl -u certbot.timer` e `certbot renew --dry-run`. Confirme DNS, portas 80/443 e sintaxe Nginx.

**Ação:** corrija DNS, ACME challenge ou configuração Nginx; execute dry-run; renove sem `--force-renewal` salvo motivo documentado; valide HTTPS e cadeia do certificado.

**Ordem:** DNS → Nginx/portas → dry-run → renovação → HTTPS.

## Falha PM2 ou aplicação offline

**Diagnóstico:** consulte `systemctl status pm2-controle-academia`, `sudo -u controle-academia -H pm2 status`, logs e porta `127.0.0.1:3000`.

**Ação:** corrija primeiro ambiente, permissões, build ou dependências. Reinicie apenas o serviço da academia; não use PM2 de root. Confirme health local e público.

**Ordem:** logs → ambiente/build → systemd PM2 → listener → health.

## Falha Nginx

**Diagnóstico:** confirme que a aplicação responde localmente, execute `nginx -t`, consulte `systemctl status nginx` e os logs do site.

**Ação:** não recarregue configuração inválida. Restaure o último template versionado aprovado, execute `nginx -t` e só então faça reload.

**Ordem:** upstream local → sintaxe → certificado → reload → HTTP/HTTPS.

## Perda do repositório na VPS

**Diagnóstico:** confirme que dados persistentes, `.env.production`, backups e logs continuam disponíveis. Não inicialize Git sobre diretório incerto.

**Ação:** preserve o diretório antigo, clone `main` usando a Deploy Key exclusiva em um novo diretório controlado, valide o commit, instale dependências, gere Prisma Client e build. Reassocie somente os paths persistentes previstos e valide antes de trocar o diretório ativo.

**Ordem:** preservar antigo → clonar → validar commit → dependências/build → ambiente → PM2 → health.

## Perda do servidor inteiro

**Diagnóstico:** confirme que a instância e os discos não são recuperáveis e identifique o backup externo mais recente. Backups somente na VPS também são perdidos nesse cenário.

**Ação:** provisione uma nova VPS, aplique hardening, crie usuário e diretórios exclusivos, instale as versões compatíveis de Node/PostgreSQL/Nginx/Certbot, clone o repositório, recupere secrets por canal seguro e restaure primeiro o dump em banco temporário. Depois valide e promova o banco, configure PM2, HTTPS, firewall, cron e logrotate.

**Ordem:** infraestrutura → isolamento → repositório → secrets → restore temporário → banco real → aplicação → proxy/TLS → firewall → jobs → validação.

**Dados:** repositório remoto, documentação, secrets seguros e backup off-site. Sem backup off-site, não existe garantia de recuperação dos dados após perda total.

## Checklist de recuperação

- [ ] incidente e horário registrados;
- [ ] credenciais possivelmente expostas rotacionadas;
- [ ] estado atual preservado antes de qualquer restore;
- [ ] checksum e `pg_restore --list` aprovados;
- [ ] restore testado em banco temporário;
- [ ] migrations e tabelas conferidas;
- [ ] aplicação executada como `controle-academia`;
- [ ] PM2, PostgreSQL e Nginx ativos;
- [ ] portas 3000 e 5432 privadas;
- [ ] health público HTTP 200/database `ok`;
- [ ] login validado;
- [ ] cron, backups e logrotate revalidados;
- [ ] logs revisados após recuperação;
- [ ] causa raiz e ações preventivas documentadas.

## Backup off-site

**STATUS: PENDENTE**

Escolha futura deve manter cópia fora da VPS, criptografia em trânsito, acesso mínimo, retenção definida e teste periódico de restore. Não habilite sincronização externa sem autorização e sem validar que logs/comandos não exponham credenciais.
