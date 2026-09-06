#!/bin/bash
set -e

DOCKER_IMAGE="sandeshnaroju/ai-skill-engine:latest"

echo "🐳 Starting AI Skill Engine from Docker Hub..."

# Ensure persistent host folders exist so Docker doesn't create them as root
mkdir -p sandbox/uploads sandbox/outputs
touch skill_manager.db

# Ensure configuration file exists
if [ ! -f .env ]; then
    echo "Creating default .env file..."
    echo "GEMINI_API_KEY=" > .env
    echo "# To use PostgreSQL instead of local SQLite, uncomment and configure:" >> .env
    echo "# DATABASE_URL=postgresql://user:password@localhost:5432/dbname" >> .env
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

# Pull the latest image from Docker Hub
echo "Pulling latest image from Docker Hub..."
docker pull "$DOCKER_IMAGE"

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
  "$DOCKER_IMAGE"

echo "🚀 AI Skill Engine started from Docker Hub!"
echo "Dashboard UI & APIs are available at: http://localhost:2704"
echo "To view logs, run: docker logs -f ai_skill_engine"
echo "To stop the container, run: docker stop ai_skill_engine"
