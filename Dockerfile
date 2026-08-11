FROM ghcr.io/railwayapp-templates/chatwoot:Community

# Download da logo customizada
ADD https://pschapeco.com.br/img/favicon.svg /app/public/brand-assets/logo.svg
ADD https://pschapeco.com.br/img/favicon.svg /app/public/brand-assets/logo_dark.svg
ADD https://pschapeco.com.br/img/favicon.svg /app/public/brand-assets/logo_thumbnail.svg

# Download do favicon
ADD https://pschapeco.com.br/img/favicon.svg /app/public/favicon.svg

# Permissões corretas
RUN chmod 644 /app/public/brand-assets/logo*.svg /app/public/favicon.svg
