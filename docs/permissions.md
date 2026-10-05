# Permissões e capabilities

## Princípio

A autorização usa capabilities explícitas derivadas do papel da sessão. A ordem numérica `ADMIN > FINANCEIRO > RECEPCAO > PERSONAL` não concede mais acesso implícito.

O mesmo mapa é consumido por quatro camadas:

1. menu: itens sem capability são omitidos;
2. página: o middleware nega acesso direto antes da renderização;
3. interface: ações de escrita compartilhadas são ocultadas para perfis somente leitura;
4. API: cada método exige a capability correspondente e responde `403` quando a sessão autenticada não a possui.

Ocultar um item não é uma medida de segurança. A API é a autoridade final.

## Capabilities

- Dashboard: `dashboard.view`.
- Alunos: `students.read`, `students.create`, `students.update`, `students.status`.
- Presença: `attendance.read`, `attendance.write`, `attendance.retroactive`.
- Agenda: `schedule.read`, `schedule.write`.
- Mensalidades: `finance.monthlies.read`, `finance.monthlies.manage`.
- Caixa: `finance.cash.read`, `finance.cash.manage`.
- Despesas: `finance.expenses.read`, `finance.expenses.manage`.
- Produtos: `products.read`, `products.manage`.
- Pedidos: `sales.read`, `sales.create`, `sales.manage`.
- Relatórios: `reports.financial`, `reports.operational`.
- Administração: `whatsapp.manage`, `team.read`, `team.manage`, `settings.manage`.

## Matriz por papel

| Módulo | ADMIN | FINANCEIRO | RECEPCAO | PERSONAL |
| --- | --- | --- | --- | --- |
| Dashboard | total | gestor | operacional | não |
| Alunos | escrita | leitura | escrita | leitura |
| Presença | escrita | não | escrita | escrita |
| Agenda | escrita | não | escrita | escrita |
| Mensalidades | gestão | gestão | leitura | não |
| Caixa | gestão | gestão | não | não |
| Despesas | gestão | gestão | não | não |
| Produtos | gestão | não | gestão | não |
| Pedidos | gestão | não | gestão | não |
| Relatórios financeiros | sim | sim | não | não |
| Relatórios operacionais via API | sim | sim | sim | sim |
| WhatsApp técnico | sim | não | não | não |
| Equipe e configurações | sim | não | não | não |

FINANCEIRO não herda presença, agenda, vendas, configurações ou funções de personal/recepção. RECEPCAO não herda caixa ou despesas. PERSONAL é direcionado para `/frequencia` quando tenta abrir o Dashboard.

## Páginas e redirects

As regras de página estão em `lib/auth/capabilities.ts` e são aplicadas pelo middleware após a validação criptográfica da sessão. Acesso não autorizado a uma página redireciona para a primeira rota segura do papel:

- ADMIN, FINANCEIRO e RECEPCAO: `/dashboard`;
- PERSONAL: `/frequencia`.

APIs nunca redirecionam: sessão ausente recebe `401`; capability ausente recebe `403`.

## Menu

Os grupos e itens ficam em `lib/navigation.ts`. Cada item declara `label`, `href`, `icon` e `capability`. O shell filtra essa estrutura pelas capabilities efetivas, sem duplicar regras de papel.

Não são mostradas rotas futuras ou inexistentes. Equipe e WhatsApp continuam dentro de Configurações nesta fase.

## Compatibilidade e evolução futura

`requireRole` e `hasRole` permanecem somente como wrappers de compatibilidade; as rotas atuais foram migradas para `requireCapability`. O wrapper legado também deixou de usar hierarquia numérica.

As capabilities são derivadas do papel em código e não exigem migration. Permissões customizadas por usuário ou academia poderão ser persistidas numa evolução futura.

A página atual de Relatórios ainda reúne dados financeiros e operacionais. Por compatibilidade, o menu da página exige `reports.financial`; FINANCEIRO também recebe leitura operacional necessária para que o carregamento agregado não falhe. A separação visual por seção fica para o redesign de Relatórios.
