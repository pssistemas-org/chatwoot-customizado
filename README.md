# Bz Chanport (Chatwoot Customizado) - PS Chapecó

Repositório customizado do Chatwoot para PS Chapecó, rebrandeado para "Bz Chanport", com logos e branding personalizados.

## Como usar

Este repositório contém um Dockerfile que herda da imagem padrão do Chatwoot (upstream) e adiciona customizações de branding, renomeando toda a interface visível ao usuário de "Chatwoot" para "Bz Chanport" através da variável de ambiente `INSTALLATION_NAME`.

## Customizações atuais

- Nome da aplicação (`INSTALLATION_NAME`): Bz Chanport
- Logo: https://pschapeco.com.br/img/favicon.svg

## Como customizar

### Mudar logos
Edite o `Dockerfile` e altere a URL da logo:
```dockerfile
ADD https://sua-nova-logo.svg /app/public/brand-assets/logo.svg

## Kanban de conversas

Página em `/kanban/index.html` (arquivos em `kanban/`), servida pelo próprio Chatwoot e com o botão **Kanban** no menu lateral.

- Colunas = etiquetas da conta (mais uma coluna "Sem etiqueta"). Escolha quais aparecem em **Colunas**.
- Cards = conversas, filtráveis por caixa de entrada, status e busca.
- Arrastar um card troca a etiqueta de etapa da conversa (usa a API do Chatwoot com a sessão já logada).
- Não cria tabela nem altera o banco. Para remover: apague as 3 últimas instruções do Dockerfile e a pasta `kanban/`.

### Filtros e visualizações no Kanban
O botão **Filtros** abre o mesmo conjunto de filtros avançados do Chatwoot (status, prioridade, agente, caixa de entrada, time, contato, identificador, campanha, rótulos, idioma, país, link de referência, criado em, última atividade e atributos personalizados), com E/OU entre as linhas. **Visualizações** salva/carrega/exclui combinações usando as *pastas* do Chatwoot (`custom_filters`), então elas aparecem também na tela de conversas.

### Seleção em massa e menu de ações
Clique com o botão direito em um card para o mesmo menu das conversas (não lida, resolver/reabrir, pendente, adiar, prioridade, etiqueta, agente, time, abrir em nova aba, copiar link, excluir). Para várias: use a caixinha no avatar, Ctrl/Cmd/Shift+clique, a caixinha do cabeçalho da coluna ou "Selecionar todas" na barra inferior; o menu e o arrastar valem para toda a seleção. Esc limpa a seleção.

## Chat da equipe
Chat interno (conversas privadas e grupos) dentro do Chatwoot, no menu lateral logo abaixo do Kanban.

- **Tela**: `teamchat/` (estática, servida em `/teamchat`, mesmo domínio do Chatwoot).
- **Servidor**: `chat-server/` (Node + Postgres), serviço separado na Railway. Usa o login do Chatwoot (confere a sessão em `/api/v1/profile` e a lista de agentes da conta) e guarda tudo no schema `teamchat` do Postgres (pode ser o mesmo do Chatwoot; as tabelas do Chatwoot não são tocadas). Tempo real por SSE.
- **Recursos**: mensagens diretas e grupos, não lidas com contador no menu, imagens e arquivos (até 8 MB), responder/editar/apagar, som e notificação do navegador.

- **Áudio**: botão de microfone no campo de mensagem (grava até 5 min; o navegador pede permissão) e player nas mensagens.
- **Cards**: no clipe, "Conversa do Chatwoot" / "Contato do Chatwoot" anexa um card com botão *Abrir*. No Kanban, botão direito → "Compartilhar no chat da equipe".
- **Encaminhar**: ícone de seta na mensagem, para várias conversas/pessoas de uma vez.
- **Menções**: em grupos, digite `@` para escolher alguém (ou `@todos`); a pessoa vê o nome destacado, o marcador `@` na lista e a notificação diz "Mencionou você".

Variáveis do serviço do chat (`chat-server`): `DATABASE_URL` (referência ao Postgres), `CHATWOOT_URL` (endereço público do Chatwoot), opcional `ALLOWED_ORIGIN` (várias separadas por vírgula; padrão = `CHATWOOT_URL`).
Variável do serviço do Chatwoot: `CHAT_API_URL` (endereço público do serviço do chat, usado no build da tela).
