"""Health check endpoint"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/")
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint
    
    Returns basic service status.
    For more detailed health checks, use /health/detailed
    """
    return {"status": "healthy", "service": "nba-api-bridge"}


@router.get("/detailed")
async def detailed_health_check() -> Dict[str, Any]:
    """
    Detailed health check endpoint
    
    Verifies:
    - Redis connection
    - nba_api library availability
    - Endpoint imports
    """
    health: Dict[str, Any] = {
        "status": "healthy",
        "service": "nba-api-bridge",
        "checks": {}
    }
    
    all_healthy = True
    
    # Check Redis connection
    try:
        from app.utils.redis_client import get_redis_client
        redis_client = get_redis_client()
        redis_client.ping()
        health["checks"]["redis"] = {"status": "healthy", "connected": True}
    except Exception as e:
        health["checks"]["redis"] = {"status": "unhealthy", "error": str(e)}
        all_healthy = False
    
    # Check nba_api library availability
    try:
        import nba_api.stats.endpoints as stats_endpoints
        # Check for key endpoints
        endpoints_found = []
        endpoints_missing = []
        
        for endpoint_name in ['BoxScoreSummaryV2', 'PlayByPlayV2', 'ScoreboardV2']:
            if hasattr(stats_endpoints, endpoint_name):
                endpoints_found.append(endpoint_name)
            else:
                endpoints_missing.append(endpoint_name)
        
        health["checks"]["nba_api"] = {
            "status": "healthy" if not endpoints_missing else "degraded",
            "endpoints_found": endpoints_found,
            "endpoints_missing": endpoints_missing
        }
        
        if endpoints_missing:
            all_healthy = False
    except Exception as e:
        health["checks"]["nba_api"] = {"status": "unhealthy", "error": str(e)}
        all_healthy = False
    
    # Check live endpoints
    try:
        from nba_api.live.nba.endpoints import scoreboard
        health["checks"]["nba_api_live"] = {"status": "healthy", "available": True}
    except Exception as e:
        health["checks"]["nba_api_live"] = {"status": "degraded", "error": str(e)}
        # Live endpoints are optional, so don't fail health check
    
    if not all_healthy:
        health["status"] = "degraded"
    
    return health
