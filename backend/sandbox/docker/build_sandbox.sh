#!/bin/bash
cd "$(dirname "$0")"
echo "Building custom Docker sandbox image (ai-sandbox-python:latest)..."
docker build -t ai-sandbox-python:latest .
echo "Build complete."
