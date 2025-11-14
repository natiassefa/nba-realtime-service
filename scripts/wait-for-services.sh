#!/bin/bash
# Wait for services to be ready before starting the application

set -e

# Extract Redis host/port from REDIS_URL or use defaults
REDIS_URL=${REDIS_URL:-redis://redis:6379}
REDIS_HOST=$(echo $REDIS_URL | sed -E 's|redis://([^:]+):?([0-9]+)?.*|\1|')
REDIS_PORT=$(echo $REDIS_URL | sed -E 's|redis://([^:]+):?([0-9]+)?.*|\2|')
REDIS_HOST=${REDIS_HOST:-redis}
REDIS_PORT=${REDIS_PORT:-6379}

# Extract Kafka brokers from KAFKA_BROKERS or use default
KAFKA_BROKERS=${KAFKA_BROKERS:-redpanda:9092}

# Extract DB host/port from DB_HOST/DB_PORT or use defaults
DB_HOST=${DB_HOST:-postgres}
DB_PORT=${DB_PORT:-5432}

# Python bridge URL
PYTHON_BRIDGE_URL=${NBA_API_BRIDGE_URL:-http://localhost:8000}

MAX_RETRIES=30
RETRY_DELAY=2

echo "Waiting for services to be ready..."

# Wait for Redis
echo "Waiting for Redis at ${REDIS_HOST}:${REDIS_PORT}..."
RETRIES=0
until nc -z ${REDIS_HOST} ${REDIS_PORT} 2>/dev/null || [ $RETRIES -eq $MAX_RETRIES ]; do
  RETRIES=$((RETRIES + 1))
  echo "  Redis not ready, retrying ($RETRIES/$MAX_RETRIES)..."
  sleep $RETRY_DELAY
done
if [ $RETRIES -eq $MAX_RETRIES ]; then
  echo "ERROR: Redis failed to become ready after $MAX_RETRIES attempts"
  exit 1
fi
echo "✓ Redis is ready"

# Wait for Kafka/Redpanda
# Parse comma-separated brokers (bash-compatible)
IFS=',' read -ra BROKERS <<< "$KAFKA_BROKERS"
for broker in "${BROKERS[@]}"; do
  # Parse host:port
  IFS=':' read -ra ADDR <<< "$broker"
  KAFKA_HOST=${ADDR[0]}
  KAFKA_PORT=${ADDR[1]:-9092}
  echo "Waiting for Kafka at ${KAFKA_HOST}:${KAFKA_PORT}..."
  RETRIES=0
  until nc -z ${KAFKA_HOST} ${KAFKA_PORT} 2>/dev/null || [ $RETRIES -eq $MAX_RETRIES ]; do
    RETRIES=$((RETRIES + 1))
    echo "  Kafka not ready, retrying ($RETRIES/$MAX_RETRIES)..."
    sleep $RETRY_DELAY
  done
  if [ $RETRIES -eq $MAX_RETRIES ]; then
    echo "ERROR: Kafka failed to become ready after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "✓ Kafka is ready"
done

# Wait for PostgreSQL
echo "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
RETRIES=0
until nc -z ${DB_HOST} ${DB_PORT} 2>/dev/null || [ $RETRIES -eq $MAX_RETRIES ]; do
  RETRIES=$((RETRIES + 1))
  echo "  PostgreSQL not ready, retrying ($RETRIES/$MAX_RETRIES)..."
  sleep $RETRY_DELAY
done
if [ $RETRIES -eq $MAX_RETRIES ]; then
  echo "ERROR: PostgreSQL failed to become ready after $MAX_RETRIES attempts"
  exit 1
fi
echo "✓ PostgreSQL is ready"

# Wait for Python bridge service (if running in same container, give it a moment)
echo "Waiting for Python bridge service at ${PYTHON_BRIDGE_URL}..."
RETRIES=0
until curl -f -s ${PYTHON_BRIDGE_URL}/health >/dev/null 2>&1 || [ $RETRIES -eq $MAX_RETRIES ]; do
  RETRIES=$((RETRIES + 1))
  echo "  Python bridge not ready, retrying ($RETRIES/$MAX_RETRIES)..."
  sleep $RETRY_DELAY
done
if [ $RETRIES -eq $MAX_RETRIES ]; then
  echo "WARNING: Python bridge service not ready, but continuing..."
else
  echo "✓ Python bridge service is ready"
fi

echo "All services are ready!"

