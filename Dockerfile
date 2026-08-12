FROM ghcr.io/railwayapp-templates/chatwoot:Community

# Download da logo customizada
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/brand-assets/logo.svg
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/brand-assets/logo_dark.svg
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/brand-assets/logo_thumbnail.svg

# Sobrescreve TODOS os favicons e ícones com o SVG da PS Chapecó
# Apple touch icons
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/apple-icon-57x57.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/apple-icon-60x60.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/apple-icon-72x72.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/apple-icon-76x76.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/apple-icon-114x114.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/apple-icon-120x120.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/apple-icon-144x144.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/apple-icon-152x152.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/apple-icon-180x180.png

# Android icons
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/android-icon-192x192.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/android-icon-256x256.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/android-icon-384x384.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/android-icon-512x512.png

# Favicon padrão
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/favicon_bzchanport.svg
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/favicon.ico
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/favicon-16x16.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/favicon-32x32.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/favicon-96x96.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/favicon-512x512.png

# Badge favicon
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/favicon-badge-16x16.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/favicon-badge-32x32.png
ADD https://pschapeco.com.br/img/favicon_bzchanport.svg /app/public/favicon-badge-96x96.png

# Permissões corretas
RUN chmod 644 /app/public/brand-assets/logo*.svg /app/public/*icon*.png /app/public/*icon*.svg /app/public/favicon.ico
