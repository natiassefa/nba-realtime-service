"""
Redis Client Utility

Provides Redis client for looking up game metadata.
Used to resolve UUID game IDs back to numeric NBA.com game IDs.
"""

import os
import json
import logging
from typing import Optional, Dict, Any

try:
    import redis
except ImportError:
    redis = None
    logging.warning("redis package not installed. Install with: pip install redis")

logger = logging.getLogger(__name__)

# Redis connection URL from environment or default
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')

# Singleton Redis client instance
_redis_client = None


def get_redis_client():
    """Get or create Redis client singleton"""
    global _redis_client
    
    if _redis_client is None:
        if redis is None:
            raise ImportError("redis package is required. Install with: pip install redis")
        
        try:
            _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
            # Test connection
            _redis_client.ping()
            logger.info(f"Redis client connected to {REDIS_URL}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis at {REDIS_URL}: {e}")
            raise
    
    return _redis_client


def get_game_metadata(game_uuid: str) -> Optional[Dict[str, Any]]:
    """
    Look up game metadata from Redis by UUID
    
    Args:
        game_uuid: Game UUID (e.g., "23c1b90f-1dbe-559f-b598-498878ed17f0")
        
    Returns:
        Game metadata dict with 'nba_game_id' field, or None if not found
    """
    try:
        redis_client = get_redis_client()
        # Redis key format: game:meta:{gameId}
        key = f"game:meta:{game_uuid}"
        metadata_json = redis_client.get(key)
        
        if metadata_json:
            metadata = json.loads(metadata_json)
            logger.debug(f"Found game metadata for UUID {game_uuid}")
            return metadata
        else:
            logger.debug(f"No game metadata found for UUID {game_uuid}")
            return None
    except Exception as e:
        logger.error(f"Error looking up game metadata for {game_uuid}: {e}")
        return None


def get_nba_game_id_from_uuid(game_uuid: str) -> Optional[str]:
    """
    Extract numeric NBA.com game ID from UUID by looking up in Redis
    
    Args:
        game_uuid: Game UUID
        
    Returns:
        Numeric NBA.com game ID (e.g., "0022300123") or None if not found
    """
    metadata = get_game_metadata(game_uuid)
    if metadata and 'nba_game_id' in metadata:
        return metadata['nba_game_id']
    return None

