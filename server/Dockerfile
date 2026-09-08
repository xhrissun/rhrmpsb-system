# Render deploys this service from this Dockerfile instead of its default
# Node buildpack, specifically to get poppler-utils (for `pdftoppm`) onto
# the image — needed by server/lib/textExtraction.js to rasterize scanned
# PDFs (photo-as-PDF uploads with no text layer) before OCR-ing them.
#
# On Render: set this service's Environment to "Docker" and Dockerfile Path
# to "server/Dockerfile" with Docker Build Context Directory "server" (or
# "." if this Dockerfile is moved to the repo root — paths below assume it
# stays inside server/ and the build context is the server/ directory).

FROM node:18-slim

# poppler-utils provides pdftoppm (PDF -> page images).
# ca-certificates is needed for HTTPS calls this service already makes
# (Google Drive API, tesseract.js's CDN fetch for language data on first OCR).
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so this layer is cached unless package*.json changes.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
# Render sets PORT itself and routes to it; server.js already reads
# process.env.PORT (falling back to 5001 for local/non-Render runs).
EXPOSE 5001

CMD ["node", "server.js"]
