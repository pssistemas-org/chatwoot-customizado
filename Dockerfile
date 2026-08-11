FROM ghcr.io/railwayapp-templates/chatwoot:Community

# Download da logo customizada
ADD https://pschapeco.com.br/img/favicon.svg /app/public/brand-assets/logo.svg
ADD https://pschapeco.com.br/img/favicon.svg /app/public/brand-assets/logo_dark.svg
ADD https://pschapeco.com.br/img/favicon.svg /app/public/brand-assets/logo_thumbnail.svg

# Sobrescreve TODOS os favicons com o SVG da PS Chapecó
ADD https://pschapeco.com.br/img/favicon.svg /app/public/favicon.svg
ADD https://pschapeco.com.br/img/favicon.svg /app/public/favicon-16x16.png
ADD https://pschapeco.com.br/img/favicon.svg /app/public/favicon-32x32.png
ADD https://pschapeco.com.br/img/favicon.svg /app/public/favicon-96x96.png
ADD https://pschapeco.com.br/img/favicon.svg /app/public/favicon-512x512.png
ADD https://pschapeco.com.br/img/favicon.svg /app/public/favicon-badge-16x16.png
ADD https://pschapeco.com.br/img/favicon.svg /app/public/favicon-badge-32x32.png
ADD https://pschapeco.com.br/img/favicon.svg /app/public/favicon-badge-96x96.png

# Permissões corretas
RUN chmod 644 /app/public/brand-assets/logo*.svg /app/public/favicon*
