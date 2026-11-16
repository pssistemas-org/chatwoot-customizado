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
