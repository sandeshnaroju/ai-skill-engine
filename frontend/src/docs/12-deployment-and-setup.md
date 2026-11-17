# 📦 Self-Hosting & Deployment Guide

AI Skill Engine is distributed as a lightweight, production-ready container on Docker Hub. You can deploy it on any cloud server, VM, or local machine in under 60 seconds.

---

## 1. Quick Launch (One Command)

### Step 1: Generate an Encryption Key
Generate a 32-byte Fernet key to encrypt all stored credentials (LLM keys, SMTP passwords, database connections):
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### Step 2: Run with Docker
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
  -e WHITELISTED_EMAILS="admin@example.com,@mycompany.com" \
  --restart unless-stopped \
  sandeshnaroju/ai-skill-engine:latest
```

Open **`http://localhost:2704`** in your browser.

> 🔒 **Registration Whitelisting**: If you are deploying on a publicly accessible server, pass `-e WHITELISTED_EMAILS="alice@gmail.com,@mycompany.com"` to restrict registration. Anyone not matching will be blocked with `HTTP 403 Forbidden`.

---

## 2. Docker Compose (with PostgreSQL)

For production deployments with PostgreSQL:

```yaml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ai_user
      POSTGRES_PASSWORD: secretpassword
      POSTGRES_DB: ai_skill_engine
    volumes:
      - pgdata:/var/lib/postgresql/data

  app:
    image: sandeshnaroju/ai-skill-engine:latest
    restart: unless-stopped
    ports:
      - "2704:2704"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./sandbox:/app/sandbox
    environment:
      - DATABASE_URL=postgresql://ai_user:secretpassword@db:5432/ai_skill_engine
      - ENCRYPTION_SECRET_KEY=YOUR_GENERATED_FERNET_KEY
      - HOST_SANDBOX_DIR=${PWD}/sandbox
    depends_on:
      - db

volumes:
  pgdata:
```

Run with:
```bash
docker compose up -d
```

---

## 3. Configuring LLM Providers

AI Skill Engine connects to all major foundation models:

- **Google Gemini**: Set `GEMINI_API_KEY` in `.env` or add your key via the **Tenants & Keys** dashboard.
- **OpenAI / ChatGPT**: Set `OPENAI_API_KEY`.
- **Anthropic Claude**: Set `ANTHROPIC_API_KEY`.
- **xAI Grok**: Set `GROK_API_KEY`.
- **Local Ollama**: Set `OLLAMA_BASE_URL="http://host.docker.internal:11434"`.

---

## 4. Environment Variables Reference

| Variable | Required | Description |
| :--- | :--- | :--- |
| `ENCRYPTION_SECRET_KEY` | **Yes** | 32-byte Fernet key used to encrypt API credentials in the database. |
| `WHITELISTED_EMAILS` | No | Comma-separated list of allowed emails or domain wildcards (e.g. `admin@co.com,@company.com`). Restricts public registration. |
| `DATABASE_URL` | No | Defaults to `sqlite:////app/skill_manager.db`. Use PostgreSQL for production. |
| `HOST_SANDBOX_DIR` | No | Host path mounted to `/app/sandbox` for Python execution containers. |
| `PORT` | No | Default `2704`. |
| `STORAGE_PROVIDER` | No | Storage backend for artifacts: `local`, `azure_blob`, or `aws_s3`. |
| `SMTP_HOST` / `SMTP_PORT`| No | SMTP credentials for automated email skills. |
