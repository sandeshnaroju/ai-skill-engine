# Stage 1: Build the React frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

# Leverage Docker cache for node_modules
COPY frontend/package*.json ./
RUN npm ci --no-audit

# Build production assets
COPY frontend/ ./
ENV NODE_ENV=production
RUN npm run build

# Stage 2: Set up the Python backend
FROM python:3.10-slim
WORKDIR /app

# Configure Python runtime environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/backend

# Install Docker CLI + Node.js 20 LTS (for stdio MCP server support via npx)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    lsb-release \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Pre-create standard sandbox directory, and copy skills folder directly into the image
RUN mkdir -p /app/sandbox
COPY skills/ ./skills

# Copy and install backend requirements
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend application code
COPY backend/ ./backend

# Copy production frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose backend port
EXPOSE 2704

CMD ["sh", "-c", "python -c 'from database import init_db; init_db()' && uvicorn backend.main:app --host 0.0.0.0 --port 2704 --workers 2"]
