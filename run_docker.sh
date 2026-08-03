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
fi

# Build and start services in detached mode
docker compose up --build -d

echo "🚀 AI Skill Engine container stack started successfully!"
echo "Dashboard UI & APIs are available at: http://localhost:8080"
echo "To view logs, run: docker compose logs -f"
echo "To stop the stack, run: docker compose down"
