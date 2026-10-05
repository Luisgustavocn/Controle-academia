# Perfil 360º do aluno

## Estrutura

A ficha principal fica em `/alunos/[id]`. A rota é renderizada no servidor com o resumo inicial e retorna 404 quando o aluno não existe. As abas Financeiro, Frequência e Histórico usam o endpoint único `/api/alunos/[id]/perfil?section=...` e são carregadas somente quando abertas.

A listagem aponta para a ficha pela ação `Ver aluno` e pelo nome do aluno. O link de retorno transporta, por query string, busca, filtros, ordenação, página e tamanho de página da listagem.

## Dados exibidos

- Cadastro: nome, telefone, modalidade atual, dia de vencimento, status, início, saída atual e observações.
- Resumo: última presença, frequência do mês e dos últimos 30 dias, mensalidade atual, quantidade em aberto e último pagamento registrado na mensalidade.
- Financeiro: até 12 mensalidades recentes e até 12 registros explícitos do modelo `Pagamento`.
- Frequência: presenças confirmadas dos últimos 60 dias, limitadas a 60 registros.
- Histórico: criação do cadastro, saída atualmente registrada e até 20 mudanças persistidas em `HistoricoPlano`.

Datas de frequência e apresentação de datas usam `America/Sao_Paulo`.

## Regras financeiras

A situação é `INADIMPLENTE` quando existe ao menos uma mensalidade `PENDENTE` ou `ATRASADO`, preservando a regra usada pela listagem de alunos. Não é calculado saldo residual de mensalidade parcial.

O fluxo operacional atual registra pagamento principalmente nos campos da própria `Mensalidade`. O modelo `Pagamento` é mostrado separadamente apenas quando existem registros persistidos; ele não é tratado como histórico completo nem usado para reconstruir eventos ausentes. A ação de registrar pagamento encaminha para o módulo existente de Mensalidades e não duplica regras no perfil.

## Capabilities

- `ADMIN`: cadastro, financeiro, frequência, histórico, edição, pagamento e mudança de status.
- `FINANCEIRO`: cadastro básico, financeiro, mensalidades e pagamentos; sem edição ou mudança de status do aluno.
- `RECEPCAO`: cadastro, frequência, financeiro permitido e ações operacionais previstas pela matriz atual.
- `PERSONAL`: cadastro operacional, modalidade, frequência e histórico de modalidade sem valores; o DTO não consulta nem envia mensalidades, pagamentos, valores ou situação financeira.

O servidor constrói o resumo conforme as capabilities. As abas protegidas também rejeitam acesso direto sem a capability correspondente.

## Performance

O resumo inicial usa um conjunto constante de consultas consolidadas, condicionado às capabilities. As relações não são consultadas individualmente por linha. Históricos extensos não são carregados no primeiro request; cada aba possui limites explícitos e carregamento sob demanda.

## Limites do modelo atual

Ficam postergados:

- períodos formais de matrícula;
- pausa e retorno com meses sem cobrança;
- histórico completo de alterações de status e reativações;
- saldo residual de pagamento parcial;
- foto do aluno;
- treinos e avaliações físicas;
- contratos e área do aluno;
- correção do débito técnico `Configuracao.createdAt`.

Nenhum desses conceitos é inferido a partir de observações ou do estado atual. A Fase 5 não altera schema Prisma, migrations ou seed.
