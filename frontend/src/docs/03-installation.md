# 📦 Installation & Deployment Guide

This guide covers all deployment options for AI Skill Engine: from zero-clone single-command Docker execution to production Docker Compose stacks, Bare-Metal local installs, and PostgreSQL databases.

---

## 📋 System Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| **CPU** | 2 Cores | 4+ Cores |
| **RAM** | 4 GB | 8 GB+ |
| **Disk** | 10 GB free space | 25 GB+ SSD |
| **OS** | Linux (Ubuntu/Debian/RHEL), macOS, Windows WSL2 | Linux (Ubuntu 22.04 LTS / 24.04 LTS) |
| **Software** | Docker 20.10+ OR Python 3.10+ with Node.js 18+ | Docker Engine with Docker Compose |

---

## 🚀 Option 1: Docker Hub (Zero-Clone Single Command)

The quickest way to run the pre-built, production-compiled image directly from Docker Hub without cloning the codebase.

### 1. Generate an Encryption Key
The engine encrypts stored API keys, SMTP credentials, and cloud secrets using Fernet (AES-128-CBC + HMAC-SHA256). Generate a 32-byte key:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
*(Example output: `j-A2fHiav45IjlHFpEIJkhYGcEEni9bd5KExyEeoovY=`)*

### 2. Run the Container
Execute the following command in your terminal:

```bash
docker run -d \
  --name ai_skill_engine \
  -p 2704:2704 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$(pwd)/sandbox:/app/sandbox" \
  -v "$(pwd)/skill_manager.db:/app/skill_manager.db" \
  -v "$(pwd)/skill_manager.db-wal:/app/skill_manager.db-wal" \
  -v "$(pwd)/skill_manager.db-shm:/app/skill_manager.db-shm" \
  -e HOST_SANDBOX_DIR="$(pwd)/sandbox" \
  -e DATABASE_URL="sqlite:////app/skill_manager.db" \
  -e ENCRYPTION_SECRET_KEY="YOUR_GENERATED_FERNET_KEY" \
  --restart unless-stopped \
  sandeshnaroju/ai-skill-engine:latest
```

### Volume Mount Breakdown:
- `/var/run/docker.sock`: Allows the container to spawn isolated sibling Docker containers for sandboxed Python/shell code execution.
- `$(pwd)/sandbox:/app/sandbox`: Persists generated and uploaded files on your host.
- `$(pwd)/skill_manager.db*`: Persists the SQLite database across container restarts.

Open **http://localhost:2704** in your browser.

---

## 🐳 Option 2: Production Docker Compose (Recommended)

For production deployments, Docker Compose provides automated restart policies, environment file handling, and optional PostgreSQL integration.

### 1. Clone the Repository
```bash
git clone https://github.com/sandeshnaroju/ai-skill-engine.git
cd ai-skill-engine
```

### 2. Configure `.env`
Create a `.env` file in the root directory:
```env
ENCRYPTION_SECRET_KEY=YOUR_GENERATED_FERNET_KEY
DATABASE_URL=postgresql://postgres:postgres_password@db:5432/skill_engine
HOST_SANDBOX_DIR=/app/sandbox
PORT=2704

# Optional: SMTP Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_SENDER=no-reply@yourcompany.com
```

### 3. Production `docker-compose.yml`
```yaml
version: '3.8'

services:
  app:
    image: sandeshnaroju/ai-skill-engine:latest
    container_name: ai_skill_engine
    restart: always
    ports:
      - "${PORT:-2704}:2704"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./sandbox:/app/sandbox
      - ./skills:/app/skills
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:15-alpine
    container_name: ai_skill_engine_db
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres_password
      POSTGRES_DB: skill_engine
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d skill_engine"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### 4. Start Stack
```bash
docker compose up -d
```
To view logs: `docker compose logs -f app`

---

## 💻 Option 3: Bare-Metal Setup (Development / Non-Docker)

If you prefer running directly on your host operating system without Docker:

### 1. Clone and Prepare
```bash
git clone https://github.com/sandeshnaroju/ai-skill-engine.git
cd ai-skill-engine
```

### 2. Setup Python Backend
```bash
python3 -m venv venv
source venv/bin/activate    # On Windows: venv\Scripts\activate

cd backend
pip install --upgrade pip
pip install -r requirements.txt
cd ..
```

### 3. Build React Frontend
```bash
cd frontend
npm install
npm run build
cd ..
```

### 4. Configure Environment
Export required environment variables:
```bash
export ENCRYPTION_SECRET_KEY="YOUR_GENERATED_FERNET_KEY"
export DATABASE_URL="sqlite:///skill_manager.db"
```

### 5. Launch the Server
```bash
./run_server.sh
# or manually via uvicorn:
cd backend && uvicorn main:app --host 0.0.0.0 --port 2704 --reload
```

---

## 🌐 Reverse Proxy Configuration (Nginx / SSL)

In production, place AI Skill Engine behind an SSL reverse proxy (Nginx or Caddy) with proper Server-Sent Events (SSE) streaming support:

### Nginx Example (`/etc/nginx/sites-available/ai-engine.conf`):
```nginx
server {
    listen 80;
    server_name ai-engine.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ai-engine.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/ai-engine.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ai-engine.yourdomain.com/privkey.pem;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:2704;
        proxy_http_version 1.1;

        # Crucial for SSE & Live Canvas streaming
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Generous timeout for long-running agentic tool execution (up to 10 mins)
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

---

## 🔄 Updating to the Latest Version

### With Docker Hub:
```bash
docker pull sandeshnaroju/ai-skill-engine:latest
docker stop ai_skill_engine
docker rm ai_skill_engine
# Re-run the docker run or docker compose up -d command
```

### With Git:
```bash
git pull origin main
cd frontend && npm install && npm run build && cd ..
cd backend && pip install -r requirements.txt && cd ..
# Restart server or rebuild local container
```

---

## 🧭 Next Steps

- **[Quickstart Walkthrough](02-quickstart.md)**: Add your first API key and execute code in 5 minutes.
- **[Configuration Reference](16-configuration.md)**: Detailed breakdown of all environment variables.
