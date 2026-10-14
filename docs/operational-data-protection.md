# Proteção permanente de dados operacionais

Dados criados ou alterados pela interface, API operacional, usuário autenticado ou fluxo normal da aplicação têm prioridade sobre planilhas, snapshots, imports e inferências históricas.

## Regra obrigatória

- Registro operacional existente: preservar.
- Registro existente com origem desconhecida: preservar.
- Conflito histórico: classificar como `CONFLITO_COM_DADO_OPERACIONAL`, registrar os dois valores e não alterar.
- Registro ausente: a rotina pode planejar criação idempotente quando o escopo permitir.
- Registro importado: somente pode ser alterado com autorização explícita e guarda otimista por `id` e `updatedAt`.
- `updatedAt` divergente: `SKIPPED_PRECONDITION`.
- Segunda execução: deve classificar os registros já criados como `EXISTENTE` e não duplicar.

## Entidades

A regra cobre `Aluno`, `PeriodoMatricula`, `Presenca`, `Mensalidade`, `Pagamento`, `MovimentacaoCaixa`, `DespesaAcademia`, `Produto`, `PedidoProduto`, `PedidoItem`, `AgendaPersonal`, `Configuracao` e qualquer outra entidade persistida.

## Rotinas históricas

Toda rotina com possibilidade de escrita deve possuir dry-run e relatório com novos, existentes, protegidos, conflitos, ignorados e alterações planejadas. `DELETE`, `UPDATE` e `UPSERT` de dados existentes são proibidos por padrão.

O helper `protectHistoricalMutation` centraliza a classificação e a guarda de concorrência para novos importadores.

O endpoint legado de importação Excel, que escrevia diretamente sem um dry-run auditável, permanece bloqueado com HTTP 409. Os importadores controlados e específicos continuam disponíveis em modo `--dry-run`/`--apply`, com criação idempotente apenas de registros ausentes.
