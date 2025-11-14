"""Game endpoints - matches Sportradar API format"""

from fastapi import APIRouter, HTTPException, Header, Response
from typing import Optional
from app.services.nba_api_client import NBAApiClient
from app.services.transformers import (
    transform_boxscore_to_summary,
    transform_playbyplay_to_pbp
)
from app.utils.game_id_mapper import is_nba_game_id, nba_game_id_to_uuid
from app.utils.etag import calculate_etag
from app.utils.redis_client import get_nba_game_id_from_uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
nba_client = NBAApiClient()

@router.get("/{game_id}/summary")
async def get_game_summary(
    game_id: str,
    if_none_match: Optional[str] = Header(None, alias="If-None-Match"),
    response: Response = None
):
    """
    Get game summary/boxscore
    
    Matches Sportradar API endpoint structure EXACTLY:
    GET /games/{game_id}/summary
    
    Accepts UUID (from schedule) or NBA.com numeric game ID.
    Returns Sportradar-compatible format.
    """
    try:
        # Determine if input is UUID or numeric NBA.com ID
        if is_nba_game_id(game_id):
            # Input is numeric NBA.com ID
            nba_game_id = game_id
            game_uuid = nba_game_id_to_uuid(game_id)
        else:
            # Input is UUID - look up numeric ID from Redis
            game_uuid = game_id
            nba_game_id = get_nba_game_id_from_uuid(game_id)
            
            if not nba_game_id:
                raise HTTPException(
                    status_code=404,
                    detail=f"Game ID {game_id} not found in cache. Game may not be in today's schedule."
                )
        
        boxscore_data = nba_client.get_game_summary(nba_game_id)
        
        summary = transform_boxscore_to_summary(boxscore_data, game_uuid)
        
        # Calculate ETag
        etag = calculate_etag(summary)
        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = "max-age=60"  # 1 minute cache for live games
        
        # Handle conditional request
        if if_none_match and if_none_match == etag:
            return Response(status_code=304)
        
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching game summary: {str(e)}")

@router.get("/{game_id}/pbp")
async def get_play_by_play(
    game_id: str,
    if_none_match: Optional[str] = Header(None, alias="If-None-Match"),
    response: Response = None
):
    """
    Get play-by-play data
    
    Matches Sportradar API endpoint structure EXACTLY:
    GET /games/{game_id}/pbp
    
    Returns Sportradar-compatible format.
    """
    try:
        # Determine if input is UUID or numeric NBA.com ID
        if is_nba_game_id(game_id):
            # Input is numeric NBA.com ID
            nba_game_id = game_id
            game_uuid = nba_game_id_to_uuid(game_id)
        else:
            # Input is UUID - look up numeric ID from Redis
            game_uuid = game_id
            nba_game_id = get_nba_game_id_from_uuid(game_id)
            
            if not nba_game_id:
                raise HTTPException(
                    status_code=404,
                    detail=f"Game ID {game_id} not found in cache. Game may not be in today's schedule."
                )
        
        pbp_data = nba_client.get_play_by_play(nba_game_id)
        
        # Log the raw data structure for debugging
        logger.debug(f"Raw PBP data structure for game {game_id}: keys={list(pbp_data.keys()) if isinstance(pbp_data, dict) else 'not a dict'}")
        if isinstance(pbp_data, dict) and 'game' in pbp_data:
            game_data = pbp_data['game']
            logger.debug(f"Game data type: {type(game_data)}, keys={list(game_data.keys()) if isinstance(game_data, dict) else 'not a dict'}")
            if isinstance(game_data, dict) and 'actions' in game_data:
                actions = game_data['actions']
                logger.debug(f"Actions type: {type(actions)}, length: {len(actions) if isinstance(actions, (list, dict)) else 'N/A'}")
        
        pbp = transform_playbyplay_to_pbp(pbp_data, game_uuid)
        
        # Log if no play-by-play data is available (game may not have started)
        if not pbp.get('events'):
            logger.warning(f"No play-by-play events found for game {game_id} after transformation. Raw data keys: {list(pbp_data.keys()) if isinstance(pbp_data, dict) else 'not a dict'}")
        
        # Calculate ETag
        etag = calculate_etag(pbp)
        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = "max-age=30"  # 30 second cache for live play-by-play
        
        # Handle conditional request
        if if_none_match and if_none_match == etag:
            return Response(status_code=304)
        
        return pbp
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching play-by-play: {str(e)}")

