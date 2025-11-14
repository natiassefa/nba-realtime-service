"""Schedule endpoint - matches Sportradar API format"""

from fastapi import APIRouter, HTTPException, Header, Response
from datetime import datetime, date
from typing import Optional
from app.services.nba_api_client import NBAApiClient
from app.services.transformers import transform_scoreboard_to_schedule
from app.utils.etag import calculate_etag

router = APIRouter()
nba_client = NBAApiClient()

@router.get("/{year}/{month}/{day}")
async def get_schedule(
    year: int,
    month: int,
    day: int,
    if_none_match: Optional[str] = Header(None, alias="If-None-Match"),
    response: Response = None
):
    """
    Get NBA schedule for a specific date
    
    Matches Sportradar API endpoint structure EXACTLY:
    GET /schedule/{year}/{month}/{day}
    
    Returns Sportradar-compatible format:
    {
        "date": "YYYY-MM-DD",
        "games": [
            {
                "id": "uuid",
                "status": "scheduled|inprogress|closed",
                "home": { "name": "...", "alias": "...", "id": "..." },
                "away": { "name": "...", "alias": "...", "id": "..." }
            }
        ]
    }
    """
    try:
        game_date = date(year, month, day)
        scoreboard_data = nba_client.get_scoreboard(game_date)
        
        # Transform to Sportradar format
        date_str = f"{year}-{month:02d}-{day:02d}"
        schedule = transform_scoreboard_to_schedule(scoreboard_data, date_str)
        
        # Calculate ETag for conditional requests
        etag = calculate_etag(schedule)
        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = "max-age=3600"  # 1 hour cache
        
        # Handle conditional request (304 Not Modified)
        if if_none_match and if_none_match == etag:
            return Response(status_code=304)
        
        return schedule
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching schedule: {str(e)}")

