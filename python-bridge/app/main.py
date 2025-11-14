"""
NBA API Bridge Service

HTTP service that wraps nba_api library and exposes REST endpoints
matching Sportradar API format exactly.
Runs in the same container as the TypeScript service.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.endpoints import health, schedule, games

app = FastAPI(
    title="NBA API Bridge",
    description="Bridge service wrapping nba_api - matches Sportradar format",
    version="1.0.0"
)

# Enable CORS for localhost communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(schedule.router, prefix="/schedule", tags=["schedule"])
app.include_router(games.router, prefix="/games", tags=["games"])

# Health check at root for convenience
@app.get("/health")
async def root_health():
    return {"status": "healthy", "service": "nba-api-bridge"}

@app.get("/")
async def root():
    return {"service": "nba-api-bridge", "status": "running"}

