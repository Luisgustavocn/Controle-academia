# Modelo de presença diária

## Regra de domínio

`Presenca` representa uma presença confirmada de um aluno em um dia civil da academia. Há no máximo uma linha por `alunoId + data`, independentemente de horário, tela ou quantidade de sessões agendadas.

- Timezone operacional: `America/Sao_Paulo`.
- Entrada e saída de dia civil: `YYYY-MM-DD`.
- PostgreSQL: `DATE`.
- `horario`: metadado opcional `HH:mm`, nunca parte da identidade.
- `presente`: preservado por compatibilidade; operações de confirmação sempre gravam `true` e métricas sempre filtram `true`.
- Histórico sem horário real usa `NULL`; não se inventa `00:00`.

## Schema

```prisma
model Presenca {
  id          String   @id @default(cuid())
  alunoId     String
  data        DateTime @db.Date
  horario     String?
  tipoAula    String
  presente    Boolean  @default(true)
  observacao  String?
  createdAt   DateTime @default(now())

  aluno       Aluno    @relation(fields: [alunoId], references: [id], onDelete: Cascade)

  @@unique([alunoId, data])
  @@index([data])
}
```

O índice unique é também a garantia contra concorrência. O índice global de `data` permanece para Dashboard, matriz e relatórios por período.

## Dia civil e DTO

`lib/attendance-date.ts` centraliza:

- validação real de `YYYY-MM-DD`;
- conversão entre o `Date` materializado pelo Prisma e a string civil;
- hoje da academia;
- comparação e soma de dias;
- ranges mensais;
- formatação e rótulos Hoje/Ontem.

O `Date` interno usado pelo Prisma é apenas um adaptador para `@db.Date`. APIs não serializam essa instância. DTOs devolvem `data: "YYYY-MM-DD"`, impedindo que `00:00Z` seja reinterpretado como o dia anterior no navegador.

## API

### `GET /api/presencas`

- Requer `attendance.read`.
- Aceita `alunoId`, `competencia=YYYY-MM` e busca textual opcional.
- Retorna `data` como dia civil.

### `POST /api/presencas`

- Requer `attendance.write`.
- Payload principal: `alunoId`, `data`, `horario?`, `tipoAula?`, `observacao?`.
- Hoje: permitido para ADMIN, RECEPCAO e PERSONAL conforme a matriz atual.
- Data anterior: requer também `attendance.retroactive`.
- Data futura: rejeitada.
- Aluno inexistente: 404.
- Data/horário inválido: 400.
- Repetição do mesmo aluno/dia: 200 com o registro existente.
- Criação nova: 201.

A implementação tenta criar diretamente. Em conflito `P2002`, recupera a linha diária existente. Assim, a operação é idempotente e não depende de `SELECT` antes do `INSERT` para garantir unicidade.

### `PUT /api/presencas/:id`

Compatibilidade restrita: aceita apenas `{ "presente": true }`. Também aplica a regra de retroativo/futuro.

### `DELETE /api/presencas/:id`

Mantido nesta fase. Remove fisicamente e aplica a regra de retroativo/futuro. A UI futura poderá oferecer uma correção mais orientada e reversível.

## Auditoria

Criação, reativação de uma linha `false` e remoção geram `LogAuditoria` com:

- usuário, quando ainda existe;
- módulo e entidade;
- ID da presença;
- ação;
- aluno, dia civil, horário, tipo de aula e estado confirmado.

Observações livres e dados do aluno não são copiados para o log. O timestamp da operação é o `createdAt` do próprio `LogAuditoria`.

Uma repetição idempotente de presença já confirmada não cria nova linha nem novo evento de criação.

## Retroativo

`attendance.retroactive` é aplicada no servidor:

- ADMIN: possui a capability e pode corrigir dias anteriores.
- RECEPCAO: não possui; apenas hoje.
- PERSONAL: não possui; apenas hoje.
- FINANCEIRO: não possui `attendance.write`.

A UI também desabilita datas que o papel não pode editar, mas a API continua sendo a barreira obrigatória.

## Agenda Personal

A agenda continua armazenando suas sessões normalmente. Ao confirmar comparecimento:

- usa o horário real da sessão somente na primeira criação do dia;
- todas as sessões do mesmo aluno/dia apontam para a mesma presença diária;
- uma segunda sessão não cria nova presença;
- “não foi” deixou de criar `Presenca(presente=false)`, pois ausência de sessão não é presença diária.

Não foi criada entidade nova de sessão nesta fase.

## Importação histórica

Cada marcador `1` é enviado ao mesmo serviço idempotente:

- dia civil `YYYY-MM-DD`;
- horário `NULL`;
- no máximo uma presença por aluno/dia;
- repetição da planilha não duplica;
- criação gera auditoria associada ao administrador que iniciou a importação.

## Migration `0003_attendance_civil_date`

Antes de modificar o schema, a migration bloqueia:

- qualquer grupo duplicado por aluno + parte literal da data;
- qualquer `presente=false`;
- qualquer `data` com hora diferente de `00:00:00`.

Se aprovada, executa:

1. abre transação e adquire lock exclusivo da tabela para impedir corrida com writers;
2. remove `Presenca_alunoId_data_horario_key`;
3. transforma horário vazio/em branco em `NULL`;
4. converte `data` com `data::date`, sem timezone;
5. cria `Presenca_alunoId_data_key`;
6. preserva `Presenca_data_idx`.

O script `npm run preflight:attendance` repete as contagens antes do deploy e falha com código não zero diante de qualquer decisão manual.

## Deploy controlado futuro

Ordem recomendada, ainda não executada:

1. confirmar HEAD e árvore limpa;
2. colocar o fluxo de escrita em manutenção;
3. executar `npm run preflight:attendance` contra produção ainda no schema antigo;
4. parar se houver qualquer blocker;
5. gerar e validar backup PostgreSQL;
6. executar `prisma migrate deploy`;
7. gerar Prisma Client e buildar a aplicação nova;
8. recarregar somente o PM2 da academia;
9. validar schema, índices, contagens, caso 05/10, APIs, Dashboard, Perfil, Listagem, Agenda e logs;
10. manter o backup anterior à migration disponível durante a janela de validação.

Rollback não deve usar `migrate reset` ou `db push`. Se a aplicação não puder ser corrigida de forma compatível, manter writers parados e restaurar o dump ensaiado em banco controlado antes de promover a recuperação.

## Testes PostgreSQL

`scripts/test-attendance-migration.sh` exige explicitamente um banco chamado `attendance_test` e cobre:

- tabela vazia;
- horário `NULL` e vazio;
- alunos distintos no mesmo dia;
- mesmo aluno em dias distintos;
- bloqueio de duplicidade diária;
- bloqueio de `presente=false`;
- bloqueio de timestamp não zerado;
- conversão para `DATE` e índices;
- dump, validação do catálogo e restore no banco temporário.

`tests/attendance-postgres.integration.ts` cobre idempotência sequencial/concorrente, horário opcional, dias distintos, retroativo, futuro, códigos HTTP e auditoria.
