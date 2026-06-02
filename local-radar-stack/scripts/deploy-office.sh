#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo "Missing .env file in $(pwd)."
  echo "Create it from .env.server.example before deploying."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed on this server."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is not installed (docker compose)."
  exit 1
fi

echo "Pulling latest base images..."
docker compose -f docker-compose.yml -f docker-compose.server.yml pull

echo "Building and starting stack..."
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d --build --remove-orphans

echo
echo "Deployment complete. Service status:"
docker compose -f docker-compose.yml -f docker-compose.server.yml ps

echo
echo "Useful checks:"
echo "  docker compose -f docker-compose.yml -f docker-compose.server.yml logs -f backend"
echo "  docker compose -f docker-compose.yml -f docker-compose.server.yml logs -f mqtt"