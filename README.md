# NBA Realtime Service


A production-grade Node.js/TypeScript service that polls NBA.com APIs via the `nba_api` Python library for live game data. The service intelligently caches state in Redis using ETags and TTLs, detects changes through content hashing, and publishes update events to Kafka-compatible brokers (Redpanda) for downstream consumption.

## Overview

The NBA Realtime Service is a critical component of the NBA applications ecosystem that:

- **Polls** Game Summary and Play-by-Play data for in-progress NBA games
- **Caches** game state, ETags, and TTLs in Redis to minimize API calls
- **Detects** changes by comparing SHA256 hashes of payloads
- **Publishes** Kafka messages only when actual changes are detected
- **Persists** game data to PostgreSQL for long-term storage and historical queries
- **Honors** HTTP Cache-Control headers and ETags to respect API rate limits


## Features
- 🔄 **Intelligent Polling**: Uses ETag-based conditional requests and Cache-Control TTLs to minimize API calls
- 🐍 **Python Bridge**: FastAPI HTTP service wrapping `nba_api` library, runs in same container
- 📦 **Kafka Integration**: Publishes normalized update messages to Kafka/Redpanda
- 💾 **Dual Persistence**: Kafka consumer handles both Redis cache and PostgreSQL database writes
- 🎯 **Change Detection**: SHA256 hash comparison ensures only actual changes trigger updates
- ⏱️ **TTL Scheduling**: Dynamic polling intervals based on Cache-Control max-age headers
- 🛡️ **Graceful Shutdown**: Proper cleanup of connections and resources
- 📊 **Structured Logging**: Pino-based logging with JSON output
- 🔍 **Health Checks**: Comprehensive health endpoints for monitoring

## Architecture

```
┌─────────────────┐
│  NBA.com APIs   │
│  (via nba_api)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Python Bridge   │  ← FastAPI service (port 8000)
│  (nba_api lib)  │     Transforms to Sportradar format
└────────┬────────┘     Converts NBA.com IDs → UUIDs
         │
         ▼
┌─────────────────┐
│ TypeScript      │  ← Main polling service
│ Service         │     - Fetches schedules
└────────┬────────┘     - Polls game data
         │              - Manages ETags/TTLs
         │              - Detects changes
         │              - Publishes to Kafka
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐  ┌─────────┐
│ Redis │  │  Kafka  │
│ Cache │  │(Redpanda)│
└───────┘  └────┬────┘
                │
                ▼
         ┌──────────────┐
         │  Consumer    │  ← Persistence consumer
         │  (Dual Write)│     Writes to Redis + PostgreSQL
         └──────┬───────┘
                │
         ┌──────┴──────┐
         ▼             ▼
    ┌─────────┐   ┌──────────┐
    │  Redis  │   │PostgreSQL│
    │ (Cache) │   │(Storage) │
    └─────────┘   └──────────┘
```


## Prerequisites
- **Node.js** 20+
- **Python** 3.11+ (for bridge service)
- **Docker** & **Docker Compose** (for Redis + Redpanda + PostgreSQL)
- **pnpm** (package manager)


## Quick Start

### Start Everything with Docker Compose

The easiest way to get started is using Docker Compose, which sets up all required services:

```bash
# Start all services (Redis, Redpanda/Kafka, PostgreSQL, and NBA service)
docker compose up -d

# View logs
docker compose logs -f nba-realtime-service

# Stop everything
docker compose down
```

This automatically starts services in the correct order:

1. **Redis** on port 6379 (with health check)
2. **Redpanda** (Kafka) on port 9092 (with health check)
3. **PostgreSQL** on port 5433 (with health check)
4. **Redpanda Console** on port 8080 (web UI for viewing Kafka topics)
5. **NBA Realtime Service** (TypeScript + Python bridge) on port 8000

   - Waits for all dependencies to be healthy before starting
   - Includes retry logic to handle temporary connection issues

**Service Health Checks:**

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

## API Endpoints


The Python bridge service exposes REST endpoints matching Sportradar API format:

### Schedule

```bash
GET /schedule/{year}/{month}/{day}
```

Example:

```bash
curl http://localhost:8000/schedule/2025/11/13
```


Returns a list of games scheduled for the specified date.

### Game Summary


```bash
GET /games/{gameId}/summary
```


Example:

```bash
curl http://localhost:8000/games/{uuid}/summary

```


Returns current game statistics, scores, and status.


### Play-by-Play


```bash
GET /games/{gameId}/pbp
```


Example:

```bash
curl http://localhost:8000/games/{uuid}/pbp
```

Returns detailed play-by-play events for the game.


### Health Checks


**Basic Health:**

```bash
GET /health
curl http://localhost:8000/health

```


**Detailed Health:**

```bash
GET /health/detailed
curl http://localhost:8000/health/detailed
```

Verifies Redis connection and `nba_api` library availability.

## Configuration

Environment variables (set in `docker-compose.yml` or `.env` file):


```bash
# NBA API Bridge (runs in same container)
NBA_API_BRIDGE_URL=http://localhost:8000

# Redis
REDIS_URL=redis://redis:6379

# Kafka/Redpanda
KAFKA_BROKERS=redpanda:9092

# PostgreSQL
DB_HOST=postgres
DB_PORT=5432 # Internal Docker port (exposed as 5433 on host)

DB_USER=nba
DB_PASSWORD=nba
DB_NAME=nba

# Polling Configuration (optional)

POLLING_BASE_INTERVAL_MS=5000 # Base polling interval in milliseconds
POLLING_SCHEDULE_DATE=2025-11-13 # Override date (defaults to today in ET)


```

## Database Setup

1. Start PostgreSQL:
   ```bash
   docker compose up -d postgres
   ```

2. Run migrations:
   ```bash
docker compose exec nba-realtime-service pnpm run migrate

   ```

3. Verify database:
   ```bash
   docker compose exec postgres psql -U nba -d nba -c "\dt"
   ```

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


## Development

### Running Locally (without Docker)

```bash
# Install Node.js dependencies

pnpm install

# Install Python dependencies
python3 -m venv venv
source venv/bin/activate # On Windows: venv\Scripts\activate

pip install -r python-requirements.txt

# Start Python bridge service
cd python-bridge
uvicorn app.main:app --host 0.0.0.0 --port 8000 &

# Start TypeScript service (in another terminal)

cd ..
pnpm run dev

```

### Building Docker Image

```bash
docker compose build nba-realtime-service
```

## How It Works

### Polling Mechanism

1. **Schedule Discovery**: Service fetches today's schedule (in Eastern Time) to discover active games
2. **Parallel Polling**: Each game has two independent polling loops:
   - **Summary**: Game statistics, scores, status
   - **Play-by-Play**: Detailed event-by-event actions
3. **ETag Optimization**: Uses `If-None-Match` headers to avoid downloading unchanged data
4. **TTL Scheduling**: Calculates next poll time based on `Cache-Control: max-age` headers
5. **Change Detection**: Compares SHA256 hashes of payloads to detect actual changes
6. **Kafka Publishing**: Only publishes messages when data actually changes

### Change Detection Flow

```
1. Fetch data with ETag → 304 Not Modified? → Skip
2. Parse Cache-Control → Calculate next poll delay
3. Calculate SHA256 hash of payload
4. Compare with previous hash (from Redis)
5. Hash changed? → Publish to Kafka → Update Redis cache
6. Hash unchanged? → Skip publishing → Update TTL only
```

### Persistence Consumer

A Kafka consumer listens to game update messages and performs dual writes:

1. **Redis**: Updates cache with latest game state (for fast access)
2. **PostgreSQL**: Persists game data for historical queries and analytics

This ensures both real-time performance and long-term data retention.

## Kafka Topics

### `nba.game.updates` (default topic)

Emits normalized update messages when game data changes:

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

### Viewing Messages

Access Redpanda Console at [http://localhost:8080](http://localhost:8080) to:

- Browse topics and messages
- View message payloads
- Monitor consumer groups
- Inspect topic configurations

## Redis Keys

The service uses the following Redis key patterns:

- `etag:summary:{gameId}` - ETag for game summary endpoint
- `etag:pbp:{gameId}` - ETag for play-by-play endpoint
- `ttl:summary:{gameId}` - TTL value for summary polling
- `ttl:pbp:{gameId}` - TTL value for pbp polling
- `game:summary:{gameId}` - Cached game summary (stringified JSON)
- `game:pbp:{gameId}` - Cached play-by-play data
- `schedule:{dateISO}` - Cached schedule data (24h TTL)
- `schedule:games:{dateISO}` - Set of game IDs for a date


## Database Schema

The PostgreSQL database stores:

- **`games`** - Game metadata (teams, status, scheduled time, venue)
- **`schedules`** - Daily schedule data
- **`game_summaries`** - Game summary snapshots with versioning
- **`play_by_play`** - Play-by-play snapshots with versioning

All tables support versioning to track changes over time.


## Game ID Mapping

NBA.com uses numeric game IDs (e.g., `"0022300123"`), but our database uses UUIDs. The Python bridge service converts NBA.com IDs to deterministic UUIDs using **UUID v5**, ensuring:

- Same NBA.com ID always generates the same UUID
- No mapping table needed
- Compatible with existing UUID-based schema
- Deterministic and reproducible

## Project Structure

```
nba-realtime-service/
├── src/
│   ├── bus/                    # Kafka producer and consumers
│   │   ├── consumers/
│   │   │   └── persistenceConsumer.ts
│   │   └── kafkaProducer.ts
│   ├── cache/                  # Redis client and key utilities
│   │   ├── keys.ts
│   │   └── redisClient.ts
│   ├── core/                   # Core configuration and logging
│   │   ├── config.ts
│   │   ├── constants.ts
│   │   └── logger.ts
│   ├── db/                     # Database client and repositories
│   │   ├── client.ts
│   │   ├── migrate.ts
│   │   ├── migrations/
│   │   ├── repositories/
│   │   └── types.ts
│   ├── http/                   # HTTP client for NBA API bridge
│   │   └── nbaApiClient.ts
│   ├── models/                 # Data models
│   │   └── messages.ts
│   ├── services/               # Main service logic
│   │   ├── app.ts              # Application orchestration
│   │   ├── gamePoller.ts       # Game polling logic
│   │   └── scheduleService.ts  # Schedule fetching
│   ├── types/                  # TypeScript type definitions
│   │   └── api.ts
│   └── util/                   # Utility functions
│       ├── gameIdMapper.ts
│       ├── hash.ts
│       ├── http.ts
│       ├── ttlScheduler.ts
│       ├── validation.ts
│       └── waitForServices.ts
├── python-bridge/              # Python FastAPI service
│   └── app/
│       ├── endpoints/          # API endpoints
│       ├── services/           # Business logic
│       └── utils/              # Utility functions
├── __tests__/                  # Unit tests
├── docker-compose.yml          # Local development infrastructure
├── Dockerfile                  # Container build configuration
└── package.json
```


## Troubleshooting

### Python service not starting

```bash
# Check Python service logs
docker compose logs nba-realtime-service | grep -i python

# Test Python bridge directly
docker compose exec nba-realtime-service curl http://localhost:8000/health
# Check if Python dependencies are installed

docker compose exec nba-realtime-service pip list | grep nba-api

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

# Check migrations

docker compose exec nba-realtime-service pnpm run migrate
```

```

```

```



### Redis connection issues

```bash
# Check Redis is running
docker compose ps redis

# Test Redis connection
docker compose exec redis redis-cli ping
```

```


### Kafka/Redpanda issues

```bash
# Check Redpanda is running
docker compose ps redpanda

# View Redpanda logs
docker compose logs redpanda

# Access Redpanda Console
# Open http://localhost:8080 in browser
```

## Notes

- The Python bridge service runs in the same container as the TypeScript service
- Both services communicate via `localhost:8000` inside the container
- Port 8000 is exposed to host for direct API access
- Make sure your `nba_api` library is up to date: `pip install --upgrade nba_api`
- The service handles both live and historical game data
- Schedule dates use Eastern Time (ET/EDT) to match NBA scheduling
- Polling intervals adapt dynamically based on Cache-Control headers
- Only actual data changes trigger Kafka messages (hash-based detection)

## Related Projects

- [nba-api-service](../nba-api-service/) - REST API and WebSocket server for clients
- [nba-client-app](../nba-client-app/) - Next.js web application for viewing games

## License

Private project - see repository for details.

