FROM node:20-slim

# Install helm + kubectl (using binaries, no apk needed)
RUN apt-get update && apt-get install -y curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install kubectl
RUN curl -LO "https://dl.k8s.io/release/v1.29.0/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/

# Install helm
RUN curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./
COPY tsconfig.json ./

# Install deps (including pg)
RUN npm install

# Copy source
COPY src ./src

# Build TS
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
