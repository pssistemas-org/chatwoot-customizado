# Chatwoot Customizado - PS Chapecó

Repositório customizado do Chatwoot para PS Chapecó com logos e branding personalizados.

## Como usar

Este repositório contém um Dockerfile que herda da imagem padrão do Chatwoot e adiciona customizações.

## Customizações atuais

- Logo: https://pschapeco.com.br/img/favicon.svg

## Como customizar

### Mudar logos
Edite o `Dockerfile` e altere a URL da logo:
```dockerfile
ADD https://sua-nova-logo.svg /app/public/brand-assets/logo.svg
