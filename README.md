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
