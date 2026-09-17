# ⚙️ Configuration & Environment Settings

AI Skill Engine is designed around the principle that **runtime infrastructure belongs in the admin dashboard**, while **system-level boots belong in environment variables**.

---

## 📋 System Environment Variables

| Variable | Required | Default | Description | Example |
|---|---|---|---|---|
| `ENCRYPTION_SECRET_KEY` | **Yes** | — | 32-byte base64 Fernet key used to encrypt stored LLM keys, cloud storage credentials, and SMTP passwords. | `j-A2fHiav45IjlHFpEIJkhYGcEEni9bd5KExyEeoovY=` |
| `DATABASE_URL` | No | `sqlite:///skill_manager.db` | SQLAlchemy connection URI. Supports SQLite (with WAL) and PostgreSQL. | `postgresql://user:pass@localhost:5432/dbname` |
| `HOST_SANDBOX_DIR` | No | `$(pwd)/sandbox` | Host directory path mounted into the container for local Docker sandbox execution. | `/var/lib/ai-engine/sandbox` |
| `PORT` | No | `2704` | Port on which the FastAPI application and React dashboard serve HTTP traffic. | `2704` |
| `SMTP_HOST` | No | — | Hostname of the default SMTP server for sending one-time login codes. | `smtp.gmail.com` |
| `SMTP_PORT` | No | `587` | Port for SMTP email delivery (typically 587 for STARTTLS or 465 for SSL). | `587` |
| `SMTP_USERNAME` | No | — | Username or email address for the SMTP server. | `notifications@yourcompany.com` |
| `SMTP_PASSWORD` | No | — | Password or application-specific password for the SMTP server. | `your-smtp-password` |
| `SMTP_SENDER` | No | `SMTP_USERNAME` | The `From:` header email address shown to recipients. | `no-reply@yourcompany.com` |

---

## 🔑 Generating the `ENCRYPTION_SECRET_KEY`

Secrets stored in the database (such as third-party API keys, AWS credentials, and Azure connection strings) are encrypted using **Fernet symmetric encryption** (AES-128-CBC with HMAC-SHA256).

Generate a secure key before starting the server:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

> ⚠️ **Critical Backup Notice**: If you lose or alter this key, previously stored API keys and cloud storage passwords in the database cannot be decrypted. Store this key in your secure secret manager.

---

## 🏢 Per-Tenant Dashboard Configurations

Everything below is managed **per-tenant** in the dashboard and stored securely in the database:

### 1. LLM Model Configurations & Custom Billing Rates
In **Tenants & Keys** (`/tenants`), click **Manage** on a tenant to register models:
- **Provider**: `gemini`, `openai`, `openrouter`, `prochat`, or `custom`
- **Model Identifier**: e.g. `gemini-2.5-flash`, `gpt-4o`, `claude-3-5-sonnet`
- **API Key**: Upstream provider key
- **Custom Token Pricing**:
  - `Input Cost / 1M Tokens`: e.g. `$0.15`
  - `Output Cost / 1M Tokens`: e.g. `$0.60`
  - Allows SaaS owners and resellers to calculate exact customer usage costs.

### 2. Cloud Storage Providers
In **Storage Settings** (`/storage`), select your active storage backend:
- **Local Disk**: Default server directory (`sandbox/`).
- **Azure Blob Storage**: Provide `Container Name`, `Account Name`, and `Account Key`.
- **AWS S3**: Provide `Bucket Name`, `Region`, `Access Key ID`, `Secret Access Key`, and optional `Custom Endpoint URL` (for MinIO, Cloudflare R2, or DigitalOcean Spaces).

### 3. Outbound Email (SMTP)
In **Email Configuration** (`/email-config`), set tenant-specific SMTP servers so the agent's `email` skill can send reports or notifications from the client's verified domain.

---

## 🧭 Next Steps

- **[Skills & MCP Servers](skills-and-mcp.md)**: Explore the SKILL.md format and AI skill generation.
- **[Installation Guide](installation.md)**: Production deployment options.
