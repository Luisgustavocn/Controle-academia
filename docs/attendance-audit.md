# Auditoria de presença — checkpoint pré-Fase 6

Data da auditoria: 2026-10-05

Commit auditado: `5266e1e503edd4698412681c6d96df3871605ea5`

Produção: consultas exclusivamente `READ ONLY`; nenhuma escrita, migration, restauração ou deploy.

## Resumo executivo

O modelo atual não garante a regra de uma presença por aluno por dia. A chave única é `(alunoId, data, horario)`, e `horario` aceita `NULL`. O índice PostgreSQL usa a semântica padrão `NULLS DISTINCT`, portanto duas linhas com o mesmo aluno e a mesma data, ambas com `horario = NULL`, são permitidas.

Não há duplicidades nos dados atuais: produção possui apenas uma presença. Mesmo assim, a Fase 6 requer migration controlada para representar a regra diária no banco, corrigir a semântica de data civil e tornar a API idempotente.

Há ainda um defeito de timezone comprovado em produção. A presença existente tem `data = 2026-10-05 00:00:00`, mas o intervalo usado pelo Dashboard para 2026-10-05 em `America/Sao_Paulo` é `[2026-10-05 03:00:00, 2026-10-06 03:00:00)`. Resultado observado: 1 presença por `data::date`, mas 0 no KPI diário equivalente ao código atual. Ao serializar `00:00Z` e formatar em São Paulo, Listagem/Perfil podem exibir 04/10, um dia antes.

## Schema atual

Schema Prisma:

```prisma
model Presenca {
  id          String   @id @default(cuid())
  alunoId     String
  data        DateTime
  horario     String?
  tipoAula    String
  presente    Boolean  @default(true)
  observacao  String?
  createdAt   DateTime @default(now())

  aluno       Aluno    @relation(fields: [alunoId], references: [id], onDelete: Cascade)

  @@unique([alunoId, data, horario])
  @@index([data])
}
```

Não existe enum relacionado a presença. Não existe `updatedAt` no modelo.

Tipos reais confirmados no PostgreSQL:

| Campo | PostgreSQL | Nullable | Default |
|---|---|---:|---|
| `id` | `text` | não | gerado pela aplicação/Prisma |
| `alunoId` | `text` | não | — |
| `data` | `timestamp(3) without time zone` | não | — |
| `horario` | `text` | sim | — |
| `tipoAula` | `text` | não | — |
| `presente` | `boolean` | não | `true` |
| `observacao` | `text` | sim | — |
| `createdAt` | `timestamp(3) without time zone` | não | `CURRENT_TIMESTAMP` |

Relação: `Presenca.alunoId -> Aluno.id`, com `ON DELETE CASCADE` e `ON UPDATE CASCADE`.

## Constraints e índices

- Primary key: `Presenca_pkey (id)`.
- Foreign key: `Presenca_alunoId_fkey`.
- Índice simples: `Presenca_data_idx (data)`.
- Índice unique: `Presenca_alunoId_data_horario_key (alunoId, data, horario)`.
- A criação consta em `prisma/migrations/0001_init/migration.sql`; a migration `0001_init` está aplicada em produção.
- O catálogo real informa `indnullsnotdistinct = false`: `NULL` é tratado como distinto.

Consequência: o índice bloqueia repetições quando os três valores, inclusive horário não nulo (ou string vazia), coincidem. Ele não bloqueia duas ou mais linhas para o mesmo aluno/data com horários diferentes e também não bloqueia repetições com `horario = NULL`.

## Dados de produção

Resultado das consultas em transação `READ ONLY`:

| Métrica | Valor |
|---|---:|
| Total | 1 |
| Com horário não vazio | 0 |
| `horario IS NULL` | 1 |
| Horário como string vazia | 0 |
| Sem horário (`NULL` ou vazio) | 1 |
| `presente = true` | 1 |
| `presente = false` | 0 |
| Menor data | `2026-10-05 00:00:00` |
| Maior data | `2026-10-05 00:00:00` |
| Data fora de meia-noite | 0 |

### Duplicidades

- Grupos duplicados por `alunoId + dia`: 0.
- Registros excedentes por `alunoId + dia`: 0.
- Grupos repetidos pela chave atual, incluindo agrupamento de `NULL`: 0.
- Grupos integralmente idênticos: 0.
- Casos ambíguos que exigem revisão manual: 0.

Não há casos para listar ou classificar. O risco é estrutural e já pode ocorrer em concorrência ou por chamadas diretas à API.

## Escritas de presença

### API genérica

- `app/api/presencas/route.ts`: GET e POST via `createListCreateHandlers`.
- `app/api/presencas/[id]/route.ts`: PUT e DELETE via `createByIdHandlers`.
- `lib/api/crud.ts`: normalização genérica e operações Prisma efetivas (`create`, `update`, `delete`).

Problemas atuais:

- POST e PUT exigem apenas `attendance.write`; `attendance.retroactive` não é verificada.
- Não existe validação específica de presença: aluno, data, horário, tipo de aula, limites temporais e combinações permitidas não são validados no módulo.
- `new Date(String(value))` é usado para `data`; payload `YYYY-MM-DD` vira meia-noite UTC.
- Não existe idempotency key, `upsert` diário, busca prévia ou tratamento semântico de duplicidade.
- Erro Prisma conhecido no POST vira `400` genérico com o código; PUT/DELETE não têm o mesmo tratamento local.
- O payload genérico permite alterar data, horário, aluno e demais campos no PUT, embora a UI normal só altere `presente`.
- DELETE é físico e não pede confirmação na tela de frequência.
- Não há log de auditoria para presença: o allowlist de `lib/api/crud.ts` registra apenas caixa, mensalidades, despesas e pagamentos. Produção contém 0 logs ligados a presença.
- O middleware valida sessão e as rotas validam capabilities. Não existe proteção CSRF explícita; o cookie `SameSite=Lax` reduz, mas não substitui, uma estratégia de CSRF para escritas sensíveis.

### Tela `/frequencia`

- `app/frequencia/page.tsx` carrega alunos ativos/trancados e presenças pela matriz mensal.
- Cada célula é indexada somente por `alunoId|YYYY-MM-DD`; se o banco contiver mais de uma linha no dia, a última iteração sobrescreve as anteriores na memória.
- Ao marcar, envia `alunoId`, data `YYYY-MM-DD`, `tipoAula = musculacao` e `presente = true`; omite `horario`, que fica `NULL`.
- Ao desmarcar uma presença verdadeira, executa DELETE físico.
- A UI permite trocar competência e clicar em qualquer dia, portanto já permite lançamento retroativo sem exigir `attendance.retroactive`.
- Não há confirmação, justificativa nem trilha de auditoria para registrar/remover.
- O estado `savingCell` reduz duplo clique após renderização, mas não torna a operação atômica nem protege concorrência/API direta.

### Agenda Personal

- `app/agenda-personal/page.tsx` lê e escreve pelas mesmas APIs.
- A identidade local é `alunoId|data|horario`.
- Cria presença com horário, tipo da aula e `presente` true ou false; atualiza `presente` quando a chave já existe.
- Esse fluxo expressa múltiplas sessões por dia, enquanto `/frequencia` e os dados históricos expressam uma presença diária. É a principal divergência de regra de negócio a resolver na Fase 6.

### Importação e seed

- `lib/excel/importer.ts`: cada marcador `1` da planilha gera um `upsert` por aluno/data com `horario = ""`. Isso é compatível conceitualmente com uma presença por dia, mas usa uma representação diferente da UI (`""` versus `NULL`).
- O importador cria `data` com `new Date(ano, mês, dia)`, dependente do timezone do processo, enquanto a API converte `YYYY-MM-DD` como UTC.
- `app/api/import/excel/route.ts`: importação é autorizada por `settings.manage`; não há transação única envolvendo todas as abas.
- `prisma/seed.ts`: usa `createMany`, datas date-only e horários explícitos; é dado de desenvolvimento, não job de produção.
- Não foram encontrados jobs periódicos ou outros scripts que escrevam em `Presenca`.

## Fluxo e UI atuais

### Fluxo funcional

1. Operador escolhe competência.
2. Pode buscar aluno por nome.
3. Navega por semanas de sete dias.
4. Clica numa célula, no atalho “Hoje” ou abre o calendário de um aluno.
5. Presença existente verdadeira é apagada; célula ausente cria uma nova presença.
6. O ranking é carregado sob demanda e exibido como JSON bruto.

O operador escolhe data indiretamente pela competência/dia. O horário é omitido em `/frequencia`, preenchido pela Agenda Personal e opcional no banco/API. Há histórico mensal na própria grade e histórico de 60 dias no Perfil 360º, mas não há tela de correção explícita de data/horário. Tecnicamente a API PUT permite isso.

### Avaliação responsiva estática

- Desktop: busca e marcação semanal reduzem a largura da grade, mas exigem alternar entre até cinco semanas e localizar o aluno antes de marcar.
- Tablet: a coluna fixa de aluno tem 240 px e a grade usa overflow horizontal; continua utilizável, mas com área curta para os dias.
- Mobile (390 px): a mesma coluna fixa de 240 px permanece, deixando pouca área visível para os dias. O usuário precisa combinar rolagem, troca semanal e seleção do aluno; o modal do calendário é mais adequado, mas não é o fluxo primário evidente.
- Ações concorrentes “Hoje”, célula e modal fazem a mesma operação sem feedback global/toast ou opção segura de desfazer.
- A busca existe, mas não há lista operacional dedicada “Hoje”, ordenação por mais usados/recentes, confirmação reversível ou estado diário inequívoco.

Esta seção é uma auditoria do layout e dos breakpoints do código atual; não houve redesign nem alteração visual neste checkpoint.

## Timezone e semântica de data

Pontos seguros:

- `lib/timezone.ts` centraliza `America/Sao_Paulo` e calcula corretamente início/fim do dia e do mês como instantes UTC.
- O Dashboard operacional e o Perfil 360º usam esse utilitário para ranges.
- `Presenca_data_idx` atende ranges por `data`.

Pontos de risco confirmados:

- `Presenca.data` é `timestamp without time zone`, embora represente um dia civil, não um instante.
- POST/PUT genérico transforma `YYYY-MM-DD` em `Date` UTC (`00:00Z`).
- `/frequencia` determina competência com `toISOString()` (UTC), mas determina o número do dia com getters locais. Entre 21:00 e 23:59 em São Paulo, UTC já pode estar no dia/mês seguinte, combinando referências diferentes.
- A matriz e o relatório de frequência usam ranges mensais em UTC (`00:00Z`); Dashboard/Perfil usam limites de São Paulo (`03:00Z` no offset atual).
- Perfil e Listagem serializam `data.toISOString()` e formatam em `America/Sao_Paulo`; um valor `00:00Z` aparece às 21:00 do dia anterior.
- Importador usa `new Date(year, month, day)` no timezone local do processo, diferente do parsing da API.
- `horario` é texto independente de `data`; não existe garantia de formato, timezone ou coerência entre ambos.
- `createdAt` é técnico e não deve ser usado como data da presença retroativa.

Cenário 23:30 em São Paulo: um cálculo baseado em `toISOString()` enxerga 02:30 do dia seguinte em UTC. Hoje isso pode selecionar competência/dia incorretos. O horário textual, quando existe, não corrige a data.

## Regra de negócio: uma presença por dia

Evidências a favor:

- `/frequencia` mantém uma única célula por aluno/dia e sobrescreve duplicidades ao indexar a resposta.
- O total do calendário soma no máximo um estado por dia.
- A importação histórica define cada `1` como uma presença diária e não possui horário real.
- Dashboard, relatório e Perfil contam linhas como presenças; a interpretação só é correta se cada dia produzir no máximo uma linha válida por aluno.

Evidência conflitante:

- Agenda Personal usa aluno/data/horário como identidade e pode representar sessões diferentes no mesmo dia.

Regra recomendada para a Fase 6: **uma presença confirmada por aluno por dia civil da academia**. Participações em aulas/sessões distintas devem ser outro conceito caso precisem de contagem própria. A Agenda Personal deve marcar/idempotentemente atualizar a presença diária, e não criar uma presença adicional por sessão.

## Impactos atuais

### Dashboard

- KPI mensal legado (`getDashboardKpis`) faz `count` de linhas, sem `presente = true`; linhas de ausência e duplicidades inflariam o total.
- KPI operacional “Presenças hoje” conta linhas `presente = true`; duplicidades inflariam o número e o bug de timezone já omite o único registro atual.
- “Últimas presenças” agrupa por aluno e usa `_max(data)`: não infla quantidade de alunos, mas pode refletir uma data deslocada.

### Perfil 360º e listagem

- Última presença usa a maior linha verdadeira; duplicidade não muda a data, mas `00:00Z` pode ser exibido como dia anterior.
- Presenças no mês e nos últimos 30 dias usam `count` de linhas; duplicidades inflam métricas.
- Histórico de 60 dias retorna linhas; duplicidades aparecem repetidas e consomem o limite de 60.
- Listagem usa `_max(data)` por aluno; não infla contagem, mas herda o risco de exibição no dia anterior.

### Relatórios

- `/api/relatorios/frequencia` lê todas as linhas verdadeiras do mês, usa `presencas.length` e incrementa o ranking uma vez por linha. Duplicidades inflam total e ranking.
- A rota usa limite mensal UTC, diferente do dia civil adotado em outros serviços.

## Capabilities e papéis

| Papel | Leitura de presença | Escrita | Retroativo declarado | Comportamento real |
|---|---:|---:|---:|---|
| ADMIN | sim | sim | sim | acesso total |
| RECEPCAO | sim | sim | não | consegue lançar qualquer dia pela UI/API |
| PERSONAL | sim | sim | não | consegue lançar qualquer dia pela UI/API |
| FINANCEIRO | não | não | não | sem acesso a `/frequencia` e APIs CRUD; possui `reports.operational`, então pode acessar agregados do relatório de frequência |

`attendance.retroactive` existe, mas somente ADMIN a recebe e nenhuma rota/tela a aplica. A matriz implantada é coerente para leitura/escrita comum, mas o retroativo não está efetivamente segregado.

## Performance

Queries relevantes:

- `/frequencia`: alunos ativos/trancados + todas as presenças da competência.
- Dashboard: `count` por range diário/mensal e `groupBy alunoId` com `_max(data)`.
- Perfil: última presença, dois counts por range e histórico ordenado por data/horário.
- Listagem: `groupBy alunoId` para os IDs da página.
- Relatório: todas as linhas verdadeiras do mês são materializadas e agregadas em JavaScript.

Índices atuais:

- `data` atende ranges mensais/diários; `EXPLAIN` confirmou `Bitmap Index Scan` em `Presenca_data_idx`.
- O índice composto atual começa por `alunoId` e pode atender consultas por aluno; `EXPLAIN` confirmou seu uso.

Possíveis gargalos futuros:

- A matriz transfere o mês inteiro de todos os alunos sem paginação.
- O relatório agrega em memória e inclui relação de aluno em todas as linhas.
- `presente` não participa dos índices; avaliar índice parcial somente com volume e planos reais.
- A chave futura `(alunoId, data)` também servirá às consultas de aluno/período. Manter índice separado por `data` é necessário para consultas globais por período.

## Modelo futuro recomendado

Opção preferida:

```prisma
model Presenca {
  id          String   @id @default(cuid())
  alunoId     String
  data        DateTime @db.Date
  horario     String?
  tipoAula    String?
  presente    Boolean  @default(true)
  observacao  String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  aluno       Aluno    @relation(fields: [alunoId], references: [id], onDelete: Cascade)

  @@unique([alunoId, data])
  @@index([data])
}
```

- `data @db.Date` representa diretamente o dia civil e elimina conversões por offset. A API deve aceitar e validar estritamente `YYYY-MM-DD`.
- `horario` pode permanecer nullable como metadado opcional do primeiro check-in, normalizado como `HH:mm`; não deve compor identidade/unicidade.
- Para histórico importado, usar `horario = NULL`, sem inventar hora.
- Se o negócio exigir várias sessões no mesmo dia, criar futuramente uma entidade separada de sessão/check-in ligada à presença diária. Não sobrecarregar `Presenca`.
- Avaliar remover `presente` posteriormente, pois existência da linha pode significar presença. Na migration inicial, mantê-lo reduz risco; registros `false` devem ser tratados explicitamente antes da nova constraint.
- Escrita futura deve ser transacional/idempotente: unique diária + `upsert`/tratamento de `P2002`, resposta estável para repetição e checagem explícita de `attendance.retroactive` quando `data` não for hoje.
- Correções/exclusões devem gerar `LogAuditoria` com antes/depois, ator e justificativa; preferir desfazer controlado na UI.

Alternativas avaliadas:

- Manter `timestamp`: preserva menos mudanças, mas exige uma convenção artificial de horário/UTC e continua vulnerável a conversões indevidas.
- Tornar `horario` obrigatório: incompatível com histórico por planilha e inventaria informação ausente.
- Remover `horario`: simplifica, mas perde metadado útil de check-in/agenda. Mantê-lo opcional é mais reversível.

## Plano de migration futura

1. Preflight: congelar versão, confirmar HEAD, repetir contagens/duplicidades e verificar writers ativos.
2. Gerar e validar backup lógico PostgreSQL imediatamente antes da mudança.
3. Classificar por aluno/dia: registros idênticos, `NULL`/vazio, horários diferentes, true/false e casos ambíguos.
4. Resolver dados por regra aprovada; não escolher automaticamente primeiro/último.
5. Normalizar `data` para o dia civil pretendido. Como `timestamp without time zone` não carrega offset, qualquer linha fora de meia-noite ou próxima de virada deve ser revisada com origem/createdAt.
6. Converter a coluna para `DATE` com SQL explícito e previamente testado em cópia/restauração.
7. Normalizar horário vazio para `NULL` e formato válido quando informado.
8. Criar unique `(alunoId, data)` e preservar índice global por `data`.
9. Adicionar `updatedAt` se aprovado e ajustar API/UI/importador/Agenda na mesma janela compatível.
10. Validar contagens, Dashboard, Perfil, relatório, retroativo, concorrência e permissões.
11. Rollback: parar writers, restaurar versão compatível do app e restaurar backup se houver transformação irreversível. Antes do deploy, preparar também SQL reverso de tipo/constraint; não depender só dele para recuperar linhas consolidadas.

### Estratégia de duplicidades se surgirem antes da migration

- Integralmente idênticas: consolidação é provável, mas registrar IDs e obter aprovação.
- Mesmo dia, uma com horário e outra sem: preferir a informação com horário somente após confirmar que representam o mesmo comparecimento.
- Horários diferentes: revisão manual ou migração para entidade de sessão; não descartar automaticamente.
- Mistura `presente=true/false`: caso ambíguo; revisão manual obrigatória.
- Primeiro versus último: `createdAt` ajuda a reconstruir sequência, mas não prova qual registro é correto.

## Backup

- `cron` e PostgreSQL ativos.
- Dump nativo diário configurado para 23:50, com retenção de 30 dias.
- Último dump encontrado: 2026-10-04 23:50, checksum `OK`.
- `pg_restore --list` leu o catálogo com sucesso.
- Não houve restauração nem geração de novo backup.

## Decisão

Não há dados ambíguos atuais nem necessidade de limpeza neste instante, mas a garantia diária, o tipo `DATE`, a idempotência, o retroativo e a integração com Agenda exigem mudança coordenada de schema e aplicação.

**FASE 6 EXIGE MIGRATION CONTROLADA**

## Implementação local da Fase 6A

A estratégia recomendada nesta auditoria foi implementada localmente na migration `0003_attendance_civil_date`. O contrato e o procedimento controlado estão documentados em [attendance-model.md](attendance-model.md). Produção permanece no schema anterior até aprovação explícita de push e deploy.
