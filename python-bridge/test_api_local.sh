#!/bin/bash
# Test script wrapper that works both locally and in container

# Check if running in container (has /app directory)
if [ -d "/app" ]; then
    # Running in container
    BASE_URL="${NBA_API_BRIDGE_URL:-http://localhost:8000}"
    python3 python-bridge/test_api.py --base-url "$BASE_URL" "$@"
else
    # Running locally - try to use container or install requests
    if command -v docker &> /dev/null && docker compose ps nba-realtime-service &> /dev/null; then
        echo "Running tests in container..."
        docker compose exec nba-realtime-service python3 python-bridge/test_api.py "$@"
    else
        echo "Error: Either run this in the container or install requests:"
        echo "  pip3 install requests"
        echo ""
        echo "Or start the container and run:"
        echo "  docker compose exec nba-realtime-service python3 python-bridge/test_api.py"
        exit 1
    fi
fi

