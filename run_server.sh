#!/bin/bash
# Helper script to run skill_manager server using python venv

PROJECT_DIR="/Users/apple/Documents/Google Antigravity/ai-skill-engine"
cd "$PROJECT_DIR"

if [ ! -d "venv" ]; then
    echo "Creating python virtual environment..."
    python3 -m venv venv
    ./venv/bin/pip install -r backend/requirements.txt
fi

echo "Activating virtual environment..."
source venv/bin/activate

# Automatically load .env if present
if [ -f .env ]; then
    echo "Loading environment variables from .env file..."
    set -a
    source .env
    set +a
fi

if [ -z "$GEMINI_API_KEY" ] && [ -z "$OPENAI_API_KEY" ] && [ -z "$LLM_API_KEY" ]; then
    echo "WARNING: Neither GEMINI_API_KEY nor OPENAI_API_KEY is set in your environment."
    echo "Please set GEMINI_API_KEY in your .env file or run: export GEMINI_API_KEY='your-key'"
fi

# Build frontend
echo "Building frontend..."
cd "$PROJECT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi
npm run build
cd "$PROJECT_DIR"

echo "Initializing Database..."
cd "$PROJECT_DIR/backend"
../venv/bin/python -c "from database import init_db; init_db()"

echo "Starting Skill Manager Server on http://localhost:2704 ..."
../venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 2704 --reload
