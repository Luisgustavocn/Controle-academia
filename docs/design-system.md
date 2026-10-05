# Design System do Controle Academia

Esta base visual é compartilhada pelo painel atual e pelos próximos ciclos de redesign. Ela não contém regras de negócio e não substitui componentes de feature, consultas ou formulários específicos.

## Tokens

- Cores de branding: `bg`, `ink`, `muted`, `line`, `accent`, `accentDark`, `accentSoft`, `sidebar` e `sidebarLine` continuam vindo da configuração da academia.
- Cores semânticas: `success`, `warning`, `danger` e `info` têm significado fixo e não devem ser substituídas pela cor de marca.
- Espaçamento: `xs`, `sm`, `md`, `lg`, `xl` e `2xl`.
- Radius: use `rounded-ds-sm`, `rounded-ds-md`, `rounded-ds-lg` ou `rounded-ds-xl`. Use círculo apenas para avatar, indicador ou chip.
- Sombras: `shadow-surface-sm` para elevação discreta e `shadow-surface-md` para overlays. Cards não recebem sombra pesada.
- Tipografia: `text-page-title`, `text-section-title`, `text-card-title`, `text-body`, `text-label` e `text-helper`.
- Controles: `sm`, `md` e `lg`; componentes do mesmo tamanho compartilham altura.

## Componentes

- `Button`: ação primária, secundária, outline, ghost ou destrutiva. Use `loading` para bloquear dupla submissão.
- `Input`, `Select`, `FormField`: campos, labels, descrição e erro. Associe ajuda/erro com `aria-describedby`.
- `Checkbox`, `Switch`: checkbox para seleção; switch para preferência imediatamente ativável.
- `Card`: composição com Header, Title, Description, Content e Footer.
- `Badge`: metadado visual. `StatusBadge`: estado de negócio com texto explícito.
- `Dialog`: tarefa modal curta. `Drawer`: navegação mobile, filtros ou detalhes rápidos.
- `DropdownMenu`: ações secundárias; ações destrutivas devem usar `destructive`.
- `Tabs`: alternância entre painéis relacionados; não use como substituto de navegação principal.
- `Tooltip`: apenas informação complementar, nunca conteúdo essencial.
- `Toast`: sucesso, erro, warning ou informação não bloqueante. Erros que impedem a tela devem usar `ErrorState`.
- `ConfirmDialog`: confirmação explícita antes de ação relevante ou destrutiva.
- `EmptyState`, `ErrorState`, `Skeleton`, `LoadingSpinner`: estados previsíveis de tela e ação.
- `Avatar`: imagem com fallback por iniciais.
- `SearchField`, `FilterBar`, `FilterChip`: composição de busca e filtros; debounce pertence à feature.
- `PageHeader`: título, descrição, breadcrumb e ações responsivas.
- `DataTable`: apenas apresentação. Busca, paginação, filtros e API pertencem à feature.
- `Pagination`: página anterior/próxima e contexto do total.
- `ResponsiveList`: fornece representações desktop e mobile sem esconder informação essencial.

## Feedback e overlays

Dialogs e drawers fecham com Escape, mantêm o foco dentro do overlay, restauram o foco de origem e bloqueiam scroll do body. Dropdowns e tabs suportam setas. Toasts usam regiões live e não substituem confirmação destrutiva.

## Responsividade

Parta do mobile. Ação primária deve continuar acessível e textos não podem depender de truncamento para transmitir estado. Em listas densas, combine `DataTable` no desktop com cards via `ResponsiveList` no mobile.

Breakpoints mínimos de validação manual: 390, 768, 1024, 1280 e 1440 px.

## Acessibilidade

- Use `button`, `a`, `input`, `select` e landmarks semânticos.
- Todo controle precisa de nome acessível e foco visível.
- Status não pode depender somente de cor.
- Respeite `prefers-reduced-motion` para animações de loading.
- Tooltip não deve esconder instrução necessária.

## Compatibilidade e migração

As APIs antigas de `Button`, `Input`, `Select`, `Card` e `Badge` foram preservadas. O `CrudModule` continua ativo e será desmontado gradualmente em fases futuras. Alertas e modais específicos de telas de negócio não são migrados nesta fase.

Storybook não foi incluído: o custo de dependências e manutenção não se justifica enquanto a suíte comportamental e a documentação cobrem a base atual.
