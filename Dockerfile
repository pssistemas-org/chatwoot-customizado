FROM ghcr.io/railwayapp-templates/chatwoot:Community

# Download da logo customizada
ADD https://pschapeco.com.br/img/favicon.svg /app/public/brand-assets/logo.svg
ADD https://pschapeco.com.br/img/favicon.svg /app/public/brand-assets/logo_dark.svg
ADD https://pschapeco.com.br/img/favicon.svg /app/public/brand-assets/logo_thumbnail.svg

# Download e conversão do favicon
ADD https://pschapeco.com.br/img/favicon.svg /tmp/favicon.svg

# Instala ImageMagick para converter SVG em PNG
RUN apt-get update && apt-get install -y imagemagick && rm -rf /var/lib/apt/lists/*

# Converte SVG em PNG para diferentes tamanhos
RUN convert /tmp/favicon.svg -resize 16x16 /app/public/favicon-16x16.png
RUN convert /tmp/favicon.svg -resize 32x32 /app/public/favicon-32x32.png
RUN convert /tmp/favicon.svg -resize 96x96 /app/public/favicon-96x96.png
RUN convert /tmp/favicon.svg -resize 512x512 /app/public/favicon-512x512.png

# Permissões corretas
RUN chmod 644 /app/public/brand-assets/logo*.svg /app/public/favicon-*.png
