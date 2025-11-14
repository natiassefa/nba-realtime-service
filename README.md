# NBA Realtime Service (nba_api)

Production-grade Node TypeScript service that polls NBA.com APIs via `nba_api` Python library for live games, caches state in Redis, honors TTL and ETag, and publishes update events to Kafka-compatible brokers (Redpanda via KafkaJS).

## Features
- Polls Game Summary and Play-by-Play for in-progress NBA games using `nba_api` Python library
- Python HTTP bridge service runs in same container, wrapping `nba_api`
- Honors Cache-Control max-age and ETag to reduce requests
- Stores current game state and ETags in Redis
- Emits Kafka messages for every detected change
- Persists game data to PostgreSQL for long-term storage and historical queries
- Kafka consumer handles dual persistence (Redis cache + PostgreSQL database)
- Graceful shutdown and structured logs

## Prerequisites
- Node 20+
- Python 3.11+ (for bridge service)
- Docker & Docker Compose (for Redis + Redpanda + PostgreSQL)

## Quick Start

### Start Everything with Docker Compose

```bash
# Start all services (Redis, Redpanda/Kafka, PostgreSQL, and NBA service)
docker compose up -d

# View logs
docker compose logs -f nba-realtime-service

# Stop everything
docker compose down
```

This will automatically start services in the correct order:
1. **Redis** on port 6379 (with health check)
2. **Redpanda** (Kafka) on port 9092 (with health check)
3. **PostgreSQL** on port 5433 (with health check)
4. **NBA Realtime Service** (TypeScript + Python bridge) on port 8000
   - Waits for all dependencies to be healthy before starting
   - Includes retry logic to handle temporary connection issues

**Startup Ordering:**
- Docker Compose uses `depends_on` with `service_healthy` conditions
- The NBA service waits for Redis, Redpanda, and PostgreSQL health checks to pass
- A wait script verifies services are ready before starting the Node.js application
- TypeScript code includes additional retry logic for service connections

### Manual Setup (Alternative)

If you prefer to run services separately:

```bash
# 1. Start infrastructure services
docker compose up -d redis redpanda postgres

# 2. Build and run NBA service
docker compose up -d --build nba-realtime-service
```

## Endpoints

The Python bridge service exposes REST endpoints matching Sportradar API format:

- **Schedule**: `GET /schedule/{year}/{month}/{day}`
  - Example: `curl http://localhost:8000/schedule/2025/11/13`
  
- **Game Summary**: `GET /games/{gameId}/summary`
  - Example: `curl http://localhost:8000/games/{uuid}/summary`
  
- **Play-by-Play**: `GET /games/{gameId}/pbp`
  - Example: `curl http://localhost:8000/games/{uuid}/pbp`

- **Health Check**: `GET /health`
  - Example: `curl http://localhost:8000/health`
  
- **Detailed Health Check**: `GET /health/detailed`
  - Verifies Redis connection and nba_api library availability
  - Example: `curl http://localhost:8000/health/detailed`

## Testing

### Test API Endpoints

Run the API test script to verify all endpoints work correctly:

```bash
# Test all endpoints (uses today's schedule) - runs in container
pnpm run test:api

# Test with specific date
docker compose exec -w /app nba-realtime-service python3 python-bridge/test_api.py --date 2025-11-13

# Test with specific game ID
docker compose exec -w /app nba-realtime-service python3 python-bridge/test_api.py --game-id 0b1aed08-59c6-5016-8f8c-ceadb41f7692

# Skip ETag test (faster)
pnpm run test:api:detailed

# If test file was added after container build, copy it first:
docker compose cp python-bridge/test_api.py nba-realtime-service:/app/python-bridge/test_api.py
```

The test script will:
- ✓ Test health endpoint
- ✓ Test schedule endpoint
- ✓ Test game summary endpoint (if games found)
- ✓ Test play-by-play endpoint (if games found)
- ✓ Test ETag conditional request support

### Unit Tests

```bash
# Run TypeScript unit tests
pnpm test

# Run with coverage
pnpm run test:coverage

# Watch mode
pnpm run test:watch
```

## Configuration

Environment variables (set in docker-compose.yml or .env file):

```bash
# NBA API Bridge (runs in same container)
NBA_API_BRIDGE_URL=http://localhost:8000

# Redis
REDIS_URL=redis://redis:6379

# Kafka/Redpanda
KAFKA_BROKERS=redpanda:9092

# PostgreSQL
DB_HOST=postgres
DB_PORT=5432
DB_USER=nba
DB_PASSWORD=nba
DB_NAME=nba
```

## Database Setup

1. Start PostgreSQL:
   ```bash
   docker compose up -d postgres
   ```

2. Run migrations:
   ```bash
   docker compose exec nba-realtime-service npm run migrate
   ```

3. Verify database:
   ```bash
   docker compose exec postgres psql -U nba -d nba -c "\dt"
   ```

## Architecture

- **Python Bridge Service** (`python-bridge/`): FastAPI HTTP service wrapping `nba_api` library
  - Runs on port 8000 inside container
  - Transforms `nba_api` responses to match Sportradar API format
  - Converts NBA.com numeric game IDs to UUIDs using UUID v5
  
- **TypeScript Service**: Polls Python bridge service for NBA data
  - Uses same HTTP client interface as before
  - Publishes updates to Kafka
  - Persists to Redis and PostgreSQL

- **Infrastructure**:
  - Redis: Caches game state, ETags, and TTLs
  - Redpanda: Kafka-compatible message broker
  - PostgreSQL: Persistent storage for game data

## Development

### Running Locally (without Docker)

```bash
# Install dependencies
npm install
pnpm install

# Install Python dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r python-requirements.txt

# Start Python bridge service
cd python-bridge
uvicorn app.main:app --host 0.0.0.0 --port 8000 &

# Start TypeScript service
cd ..
npm run dev
```

### Building Docker Image

```bash
docker compose build nba-realtime-service
```

## Kafka Topics

- `nba.game.updates` (default): Emits normalized update messages:
```json
{
  "eventType": "summary|pbp|schedule",
  "gameId": "uuid",
  "source": "nba_api",
  "version": "v1",
  "fetchedAt": "2025-11-13T20:15:12.345Z",
  "hash": "sha256-of-payload",
  "payload": { "...raw json..." }
}
```

## Redis Keys

- `etag:summary:{gameId}`
- `etag:pbp:{gameId}`
- `ttl:summary:{gameId}`
- `ttl:pbp:{gameId}`
- `game:summary:{gameId}` (stringified JSON, short TTL for in-progress)
- `game:pbp:{gameId}`
- `schedule:{dateISO}` (24h TTL)
- `schedule:games:{dateISO}` (set of game IDs)

## Database Schema

- `games` - Game metadata (teams, status, scheduled time)
- `schedules` - Daily schedule data
- `game_summaries` - Game summary snapshots with versioning
- `play_by_play` - Play-by-play snapshots with versioning

## Game ID Mapping

NBA.com uses numeric game IDs (e.g., "0022300123"), but our database uses UUIDs. The Python bridge service converts NBA.com IDs to deterministic UUIDs using UUID v5, ensuring:
- Same NBA.com ID always generates the same UUID
- No mapping table needed
- Compatible with existing UUID-based schema

## Troubleshooting

### Python service not starting
```bash
# Check Python service logs
docker compose logs nba-realtime-service | grep -i python

# Test Python bridge directly
docker compose exec nba-realtime-service curl http://localhost:8000/health
```

### Port 8000 not accessible
Make sure the service is started via docker-compose (not manually):
```bash
docker compose up -d nba-realtime-service
```

### Database connection errors
```bash
# Check PostgreSQL is running
docker compose ps postgres

# Verify connection
docker compose exec postgres psql -U nba -d nba -c "SELECT 1"
```

## Notes

- The Python bridge service runs in the same container as the TypeScript service
- Both services communicate via `localhost:8000` inside the container
- Port 8000 is exposed to host for direct API access
- Make sure your `nba_api` library is up to date: `pip install --upgrade nba_api`
- The service handles both live and historical game data
