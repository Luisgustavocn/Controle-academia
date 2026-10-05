# Dashboard operacional

O Dashboard é somente leitura: abrir a página não gera mensalidades, não sincroniza caixa e não atualiza status.

## Definições

- **Alunos ativos:** alunos cujo status atual é `ATIVO`, seguindo a regra já usada pelo sistema.
- **Recebido no mês/hoje:** regime de caixa existente, pela `dataPagamento` de mensalidades `PAGO`/`PARCIAL`, somado ao valor pago de pedidos pela `dataPedido`. Todos os cortes civis usam `America/Sao_Paulo`.
- **A receber:** soma das mensalidades `PENDENTE` e `ATRASADO` da competência atual. Mensalidades futuras não entram. `PARCIAL` não entra porque o modelo atual não guarda o valor efetivamente pago nem o saldo restante; inferir esse saldo produziria um dado falso.
- **Inadimplentes:** alunos ativos únicos com ao menos uma mensalidade `ATRASADO`, evitando contar o mesmo aluno mais de uma vez.
- **Vencendo hoje:** cobranças `PENDENTE`/`ATRASADO` da competência atual cujo vencimento pertence ao dia civil atual. Cobranças pagas e parciais não entram.
- **Sem frequência recente:** alunos ativos com histórico de presença cuja última presença ocorreu há 10 dias ou mais. Alunos sem qualquer histórico são excluídos. O limiar é a constante `NO_ATTENDANCE_ALERT_DAYS` e não é persistido no banco.
- **Agendamentos hoje:** agenda ativa do dia da semana e da semana ISO atual; não são inferidas vagas, lotação ou sessões.

## Limitações preservadas

- O fluxo principal registra recebimento na própria mensalidade; o modelo `Pagamento` não é a origem canônica desse fluxo hoje.
- Pedidos não têm uma data separada para cada recebimento, portanto seguem a `dataPedido`, como nas regras financeiras existentes.
- Cancelamentos e trancamentos recentes não aparecem porque o schema atual não preserva um histórico confiável desses eventos.
- Valores `PARCIAL` continuam seguindo a regra financeira existente no recebido e no gráfico, pois o schema não separa total da cobrança e valor efetivamente pago. Eles são excluídos de “A receber”.

## Visibilidade

- `ADMIN`: visão completa operacional e financeira.
- `FINANCEIRO`: KPIs e movimentação financeira, inadimplência e gráfico; não recebe presença, agenda, baixa frequência ou novos alunos no DTO.
- `RECEPCAO`: operação diária e mensalidades permitidas pela capability atual; não recebe gráfico com despesas/saldo.
- `PERSONAL`: permanece redirecionado para `/frequencia`; o endpoint do Dashboard responde `403` pelo guard de capability.
