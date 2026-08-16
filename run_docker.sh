#!/bin/bash
set -e

echo "🐳 Starting AI Skill Engine in Docker..."

# Ensure persistent host folders exist so Docker doesn't create them as root
mkdir -p sandbox/uploads sandbox/outputs skills
touch skill_manager.db

# Ensure configuration file exists
if [ ! -f .env ]; then
    echo "Creating default .env file..."
    echo "GEMINI_API_KEY=" > .env
    echo "# To use PostgreSQL instead of local SQLite, uncomment and configure:" >> .env
    echo "# DATABASE_URL=postgresql://user:password@localhost:5432/dbname" >> .env
    echo "" >> .env
    echo "# Encryption key for securing stored API keys and secrets (REQUIRED)." >> .env
    echo "# Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"" >> .env
    echo "# ENCRYPTION_SECRET_KEY=" >> .env
    echo "" >> .env
    echo "# SMTP Configuration (Optional - used for OTP email verification):" >> .env
    echo "# SMTP_HOST=" >> .env
    echo "# SMTP_PORT=587" >> .env
    echo "# SMTP_USERNAME=" >> .env
    echo "# SMTP_PASSWORD=" >> .env
    echo "# SMTP_SENDER=" >> .env
fi

# Load environment variables from .env if present
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Stop and remove any running container with the same name to prevent conflicts
echo "Cleaning up existing container..."
docker stop ai_skill_engine >/dev/null 2>&1 || true
docker rm ai_skill_engine >/dev/null 2>&1 || true

# Build the Docker image
echo "Building Docker image..."
docker build -t ai-skill-engine-app .

# Start the container
echo "Starting container..."
docker run -d \
  --name ai_skill_engine \
  -p 2704:2704 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$(pwd)/sandbox:/app/sandbox" \
  -v "$(pwd)/skill_manager.db:/app/skill_manager.db" \
  -e HOST_SANDBOX_DIR="$(pwd)/sandbox" \
  -e DATABASE_URL="$DATABASE_URL" \
  -e GEMINI_API_KEY="$GEMINI_API_KEY" \
  -e PROCHAT_API_KEY="$PROCHAT_API_KEY" \
  -e SMTP_HOST="$SMTP_HOST" \
  -e SMTP_PORT="$SMTP_PORT" \
  -e SMTP_USERNAME="$SMTP_USERNAME" \
  -e SMTP_PASSWORD="$SMTP_PASSWORD" \
  -e SMTP_SENDER="$SMTP_SENDER" \
  -e ENCRYPTION_SECRET_KEY="$ENCRYPTION_SECRET_KEY" \
  --restart unless-stopped \
  ai-skill-engine-app

echo "🚀 AI Skill Engine container started successfully!"
echo "Dashboard UI & APIs are available at: http://localhost:2704"
echo "To view logs, run: docker logs -f ai_skill_engine"
echo "To stop the container, run: docker stop ai_skill_engine"
