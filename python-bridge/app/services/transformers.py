"""
Response Transformers

Transform nba_api responses to match Sportradar API format EXACTLY.
This ensures compatibility with existing TypeScript code.
"""

from datetime import datetime
from typing import Dict, Any, List, Optional
import logging
from app.utils.game_id_mapper import nba_game_id_to_uuid

logger = logging.getLogger(__name__)


def transform_scoreboard_to_schedule(scoreboard_data: Dict[str, Any], game_date: str) -> Dict[str, Any]:
    """
    Transform nba_api scoreboard response to Sportradar schedule format
    
    Handles two formats:
    1. Live scoreboard: {'meta': ..., 'scoreboard': {'gameDate': '...', 'games': [...]}}
       See: https://github.com/swar/nba_api/blob/master/docs/nba_api/live/endpoints/scoreboard.md
    2. Stats scoreboard: {'resultSets': [...]}
    
    Sportradar Schedule Format:
    {
        "date": "2025-01-08",
        "games": [
            {
                "id": "uuid-string",
                "status": "scheduled|inprogress|closed",
                "home": {
                    "name": "Team Name",
                    "alias": "TLA",
                    "id": "team-id"
                },
                "away": {
                    "name": "Team Name",
                    "alias": "TLA",
                    "id": "team-id"
                }
            }
        ]
    }
    
    Args:
        scoreboard_data: Raw scoreboard data from nba_api
        game_date: Date in YYYY-MM-DD format (fallback if scoreboard doesn't provide date)
        
    Returns:
        Schedule object matching Sportradar format exactly
    """
    games = []
    
    # Check if this is live scoreboard format (has 'scoreboard' key with 'games')
    if 'scoreboard' in scoreboard_data and 'games' in scoreboard_data['scoreboard']:
        # Live scoreboard format - use gameDate from scoreboard if available
        scoreboard_info = scoreboard_data['scoreboard']
        if scoreboard_info.get('gameDate'):
            # Use the date from the scoreboard response (more accurate)
            game_date = scoreboard_info['gameDate']
            logger.debug(f"Using gameDate from scoreboard: {game_date}")
        
        nba_games = scoreboard_info['games']
        
        for nba_game in nba_games:
            nba_game_id = str(nba_game.get('gameId', ''))
            if not nba_game_id:
                continue
            
            # Convert NBA.com game ID to UUID
            game_uuid = nba_game_id_to_uuid(nba_game_id)
            
            # Map game status (pass period/clock/gameStatus for better detection)
            game_status_text = nba_game.get('gameStatusText', 'Scheduled')
            game_status_code = nba_game.get('gameStatus')
            period = nba_game.get('period')
            clock = nba_game.get('gameClock')
            status = _map_game_status(game_status_text, game_status_code, period, clock)
            
            # Extract team data - include all available fields from live scoreboard
            home_team_data = nba_game.get('homeTeam', {})
            away_team_data = nba_game.get('awayTeam', {})
            
            # Build team name from city + name (e.g., "Cleveland Cavaliers")
            home_team_name = f"{home_team_data.get('teamCity', '')} {home_team_data.get('teamName', '')}".strip()
            away_team_name = f"{away_team_data.get('teamCity', '')} {away_team_data.get('teamName', '')}".strip()
            
            game = {
                "id": game_uuid,
                "nba_game_id": nba_game_id,  # Store original numeric ID for reverse lookup
                "status": status,
                "home": {
                    "id": str(home_team_data.get('teamId', '')),
                    "name": home_team_name,
                    "alias": home_team_data.get('teamTricode', ''),
                    # Additional fields from live scoreboard
                    "city": home_team_data.get('teamCity', ''),
                    "team_name": home_team_data.get('teamName', ''),
                    "score": home_team_data.get('score'),
                    "wins": home_team_data.get('wins'),
                    "losses": home_team_data.get('losses'),
                    "timeouts_remaining": home_team_data.get('timeoutsRemaining'),
                    "in_bonus": home_team_data.get('inBonus'),
                    "periods": home_team_data.get('periods', [])
                },
                "away": {
                    "id": str(away_team_data.get('teamId', '')),
                    "name": away_team_name,
                    "alias": away_team_data.get('teamTricode', ''),
                    # Additional fields from live scoreboard
                    "city": away_team_data.get('teamCity', ''),
                    "team_name": away_team_data.get('teamName', ''),
                    "score": away_team_data.get('score'),
                    "wins": away_team_data.get('wins'),
                    "losses": away_team_data.get('losses'),
                    "timeouts_remaining": away_team_data.get('timeoutsRemaining'),
                    "in_bonus": away_team_data.get('inBonus'),
                    "periods": away_team_data.get('periods', [])
                }
            }
            
            # Add scheduled time if available (prefer gameEt for Eastern Time, fallback to gameTimeUTC)
            game_time = nba_game.get('gameEt') or nba_game.get('gameTimeUTC')
            if game_time:
                try:
                    scheduled_time = _parse_nba_date(game_time)
                    if scheduled_time:
                        game["scheduled"] = scheduled_time
                except Exception as e:
                    logger.debug(f"Could not parse scheduled time: {e}")
            
            # Add period information if available (for in-progress games)
            if nba_game.get('period'):
                game["period"] = nba_game.get('period')
            if nba_game.get('gameClock'):
                game["clock"] = nba_game.get('gameClock')
            
            games.append(game)
    
    # Check if this is stats scoreboard format (has 'resultSets')
    elif 'resultSets' in scoreboard_data:
        # Stats scoreboard format (ScoreboardV2)
        result_sets = scoreboard_data.get('resultSets', [])
        
        # Find the GameHeader resultSet (contains game metadata)
        game_header = None
        for rs in result_sets:
            if rs.get('name') == 'GameHeader':
                game_header = rs.get('rowSet', [])
                break
        
        if not game_header:
            logger.warning("No GameHeader found in scoreboard data")
            return {"date": game_date, "games": []}
        
        # Process each game
        for game_row in game_header:
            # Extract game data (column order from nba_api)
            nba_game_id = str(game_row[0]) if len(game_row) > 0 else None
            game_date_est = game_row[1] if len(game_row) > 1 else None
            game_status_text = game_row[4] if len(game_row) > 4 else "Scheduled"
            home_team_id = str(game_row[6]) if len(game_row) > 6 else None
            visitor_team_id = str(game_row[7]) if len(game_row) > 7 else None
            
            if not nba_game_id:
                continue
            
            # Convert NBA.com game ID to UUID
            game_uuid = nba_game_id_to_uuid(nba_game_id)
            
            # Map game status
            status = _map_game_status(game_status_text)
            
            # Get team names and aliases from LineScore resultSet
            home_team, away_team = _extract_teams_from_scoreboard(
                scoreboard_data, home_team_id, visitor_team_id
            )
            
            game = {
                "id": game_uuid,
                "nba_game_id": nba_game_id,  # Store original numeric ID for reverse lookup
                "status": status,
                "home": {
                    "id": str(home_team_id) if home_team_id else None,
                    "name": home_team.get("name", ""),
                    "alias": home_team.get("alias", "")
                },
                "away": {
                    "id": str(visitor_team_id) if visitor_team_id else None,
                    "name": away_team.get("name", ""),
                    "alias": away_team.get("alias", "")
                }
            }
            
            # Add scheduled time if available
            if game_date_est:
                try:
                    scheduled_time = _parse_nba_date(game_date_est)
                    if scheduled_time:
                        game["scheduled"] = scheduled_time
                except Exception as e:
                    logger.debug(f"Could not parse scheduled time: {e}")
            
            games.append(game)
    else:
        logger.warning(f"Unknown scoreboard format. Keys: {list(scoreboard_data.keys())}")
        return {"date": game_date, "games": []}
    
    return {
        "date": game_date,
        "games": games
    }


def _extract_teams_from_scoreboard(
    scoreboard_data: Dict[str, Any], 
    home_team_id: Optional[str], 
    visitor_team_id: Optional[str]
) -> tuple:
    """Extract team names and aliases from scoreboard LineScore"""
    home_team = {"name": "", "alias": ""}
    away_team = {"name": "", "alias": ""}
    
    result_sets = scoreboard_data.get('resultSets', [])
    line_score = None
    
    for rs in result_sets:
        if rs.get('name') == 'LineScore':
            line_score = rs.get('rowSet', [])
            break
    
    if not line_score:
        return home_team, away_team
    
    # LineScore columns: GAME_ID, TEAM_ID, TEAM_ABBREVIATION, TEAM_NAME, etc.
    for row in line_score:
        team_id = str(row[1]) if len(row) > 1 else None
        team_abbrev = row[2] if len(row) > 2 else ""
        team_name = row[3] if len(row) > 3 else ""
        
        if team_id == home_team_id:
            home_team = {"name": team_name, "alias": team_abbrev}
        elif team_id == visitor_team_id:
            away_team = {"name": team_name, "alias": team_abbrev}
    
    return home_team, away_team


def _map_game_status(status_text: str, game_status: Optional[int] = None, period: Optional[int] = None, clock: Optional[str] = None) -> str:
    """
    Map NBA.com status text to Sportradar status format
    
    Args:
        status_text: Game status text (e.g., "Final", "Q1 1:42", "7:00 pm ET")
        game_status: Game status code (1=scheduled, 2=in progress, 3=final)
        period: Current period number (if game is in progress)
        clock: Game clock (if game is in progress)
    
    Returns:
        Status string: "scheduled", "inprogress", "closed", "postponed", or "delayed"
    """
    
    # Prioritize game_status code (most reliable indicator)
    if game_status == 2:
        # gameStatus 2 = in progress (e.g., "Q1 1:42", "Q1 4:45")
        return "inprogress"
    if game_status == 3:
        # gameStatus 3 = final/closed (e.g., "Final")
        return "closed"
    
    # Fall back to parsing status text if game_status is not provided
    status_text_lower = status_text.lower() if status_text else ""
    
    # Check for common status patterns in text
    if "final" in status_text_lower:
        return "closed"
    elif "live" in status_text_lower or "in progress" in status_text_lower:
        return "inprogress"
    elif "postponed" in status_text_lower:
        return "postponed"
    elif "delayed" in status_text_lower:
        return "delayed"
    elif "pm" in status_text_lower or "am" in status_text_lower or "et" in status_text_lower:
        # Time string like "7:00 pm ET" means scheduled
        return "scheduled"
    
    # Check if game is in progress based on period/clock
    if period is not None and clock:
        # Game has period and clock, so it's in progress
        return "inprogress"
    
    # Default fallback: scheduled
    return "scheduled"
    



def _parse_nba_date(date_str: str) -> Optional[str]:
    """
    Parse NBA.com date format to ISO format
    
    Handles formats:
    - "2025-11-14T00:00:00Z" (UTC)
    - "2025-01-08T00:00:00" (no timezone)
    - "2025-01-15T19:30:00ET" (Eastern Time - from live scoreboard gameEt)
    """
    try:
        # Handle ET suffix (Eastern Time) - convert to UTC offset
        if date_str.endswith('ET'):
            # Remove ET suffix and parse as Eastern Time
            date_str_clean = date_str[:-2]
            dt = datetime.fromisoformat(date_str_clean)
            # Assume ET means EST/EDT (UTC-5 or UTC-4)
            # For simplicity, we'll return as-is and let the client handle timezone
            # Or we could use pytz to convert, but ISO format without timezone is acceptable
            return dt.isoformat()
        # Handle Z suffix (UTC)
        elif date_str.endswith('Z'):
            dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            return dt.isoformat()
        # No timezone suffix
        else:
            dt = datetime.fromisoformat(date_str)
            return dt.isoformat()
    except Exception as e:
        logger.debug(f"Could not parse date '{date_str}': {e}")
        return None


def transform_boxscore_to_summary(boxscore_data: Dict[str, Any], game_id: str) -> Dict[str, Any]:
    """
    Transform nba_api boxscore to Sportradar summary format
    
    Handles multiple formats:
    1. Live scoreboard: {'_source': 'live_scoreboard', 'game': {...}, 'scoreboard': {...}}
       See: https://github.com/swar/nba_api/blob/master/docs/nba_api/live/endpoints/scoreboard.md
    2. Live boxscore: {'meta': ..., 'game': {...}}
    3. Stats boxscore: {'resultSets': [...]}
    
    Sportradar Summary Format:
    {
        "id": "uuid-string",
        "status": "inprogress|closed",
        "home": { ... team data ... },
        "away": { ... team data ... },
        ... other fields ...
    }
    
    Args:
        boxscore_data: Raw boxscore data from nba_api
        game_id: Game UUID (already converted)
        
    Returns:
        Summary object matching Sportradar format
    """
    summary = {
        "id": game_id,  # Already UUID format
        "status": "inprogress",  # Default, will update from data
        "home": {},
        "away": {}
    }
    
    # Check if this is from live scoreboard (hydrated with rich data)
    if boxscore_data.get('_source') == 'live_scoreboard' and boxscore_data.get('game'):
        game = boxscore_data['game']
        
        # Map game status (pass period/clock/gameStatus for better detection)
        game_status_text = game.get('gameStatusText', '')
        game_status_code = game.get('gameStatus')
        period = game.get('period')
        clock = game.get('gameClock')
        summary['status'] = _map_game_status(game_status_text, game_status_code, period, clock)
        
        # Extract home team data - include all available fields from live scoreboard
        home_team = game.get('homeTeam', {})
        summary['home'] = {
            "id": str(home_team.get('teamId', '')),
            "name": f"{home_team.get('teamCity', '')} {home_team.get('teamName', '')}".strip(),
            "alias": home_team.get('teamTricode', ''),
            # Separate city and team name fields
            "city": home_team.get('teamCity', ''),
            "team_name": home_team.get('teamName', ''),
            # Game stats
            "score": home_team.get('score'),
            "wins": home_team.get('wins'),
            "losses": home_team.get('losses'),
            "timeouts_remaining": home_team.get('timeoutsRemaining'),
            "in_bonus": home_team.get('inBonus'),
            # Period-by-period scores
            "periods": home_team.get('periods', [])
        }
        
        # Extract away team data - include all available fields from live scoreboard
        away_team = game.get('awayTeam', {})
        summary['away'] = {
            "id": str(away_team.get('teamId', '')),
            "name": f"{away_team.get('teamCity', '')} {away_team.get('teamName', '')}".strip(),
            "alias": away_team.get('teamTricode', ''),
            # Separate city and team name fields
            "city": away_team.get('teamCity', ''),
            "team_name": away_team.get('teamName', ''),
            # Game stats
            "score": away_team.get('score'),
            "wins": away_team.get('wins'),
            "losses": away_team.get('losses'),
            "timeouts_remaining": away_team.get('timeoutsRemaining'),
            "in_bonus": away_team.get('inBonus'),
            # Period-by-period scores
            "periods": away_team.get('periods', [])
        }
        
        # Add game-level information
        if game.get('period'):
            summary['period'] = game.get('period')
        if game.get('gameClock'):
            summary['clock'] = game.get('gameClock')
        if game.get('gameStatus'):
            summary['game_status'] = game.get('gameStatus')
        
        # Add game leaders if available
        game_leaders = game.get('gameLeaders', {})
        if game_leaders:
            summary['leaders'] = {
                "home": game_leaders.get('homeLeaders', {}),
                "away": game_leaders.get('awayLeaders', {})
            }
        
        return summary
    
    # Check if this is live boxscore format
    if boxscore_data.get('game') and not boxscore_data.get('_source'):
        # Live boxscore format - similar structure to live scoreboard
        game = boxscore_data['game']
        # Similar transformation as above
        # (Implementation can be expanded based on actual live boxscore structure)
        summary['status'] = _map_game_status(game.get('gameStatusText', ''))
        # Extract team data from live boxscore format
        # ... (similar to above)
        return summary
    
    # Stats boxscore format (resultSets)
    result_sets = boxscore_data.get('resultSets', [])
    
    # Find GameSummary resultSet
    game_summary = None
    for rs in result_sets:
        if rs.get('name') == 'GameSummary':
            game_summary = rs.get('rowSet', [])
            break
    
    if game_summary and len(game_summary) > 0:
        # Extract data from GameSummary rowSet
        # Column order varies by endpoint - this is a simplified version
        # Expand based on actual nba_api response structure
        pass
    
    return summary


def transform_playbyplay_to_pbp(pbp_data: Dict[str, Any], game_id: str) -> Dict[str, Any]:
    """
    Transform nba_api play-by-play to Sportradar pbp format
    
    Handles two formats:
    1. Live endpoint: {'meta': ..., 'game': {'gameId': ..., 'actions': [...]}}
    2. Stats endpoint: {'resultSets': [{'name': 'PlayByPlay', 'rowSet': [...]}]}
    
    Sportradar PBP Format:
    {
        "id": "uuid-string",
        "sequence": 0,
        "events": [ ... ]
    }
    
    Args:
        pbp_data: Raw play-by-play data from nba_api
        game_id: Game UUID (already converted)
        
    Returns:
        Play-by-play object matching Sportradar format
    """
    events = []
    
    # Log the structure we received for debugging
    logger.debug(f"Transform PBP - data keys: {list(pbp_data.keys()) if isinstance(pbp_data, dict) else 'not a dict'}")
    
    # Check if this is live endpoint format (has 'game.actions')
    # nba_api might return it as 'game' or directly as 'actions' or nested differently
    actions = None
    
    # Try different possible structures
    if pbp_data.get('game') and isinstance(pbp_data['game'], dict):
        if pbp_data['game'].get('actions'):
            actions = pbp_data['game']['actions']
            logger.debug(f"Found actions in pbp_data['game']['actions']: {len(actions) if actions else 0} actions")
    elif pbp_data.get('actions'):
        # Maybe actions are at the top level
        actions = pbp_data['actions']
        logger.debug(f"Found actions in pbp_data['actions']: {len(actions) if actions else 0} actions")
    elif 'game' in pbp_data:
        # Check if game is a list or has different structure
        game_data = pbp_data.get('game')
        if isinstance(game_data, list) and len(game_data) > 0:
            game_data = game_data[0]
        if isinstance(game_data, dict) and game_data.get('actions'):
            actions = game_data['actions']
            logger.debug(f"Found actions in nested game structure: {len(actions) if actions else 0} actions")
    
    if actions:
        # Live endpoint format: actions are already objects
        if not isinstance(actions, list):
            logger.warning(f"Actions is not a list: {type(actions)}")
            actions = []
        
        for idx, action in enumerate(actions):
            if not isinstance(action, dict):
                logger.warning(f"Action at index {idx} is not a dict: {type(action)}")
                continue
                
            event = {
                "sequence": idx + 1,
                "event_num": action.get('actionNumber', idx + 1),
                "action_type": action.get('actionType', ''),
                "period": action.get('period', 0),
                "clock": action.get('clock', ''),
                "description": action.get('description', ''),
                "score_home": action.get('scoreHome', ''),
                "score_away": action.get('scoreAway', ''),
                "team_id": action.get('teamId'),
                "team_tricode": action.get('teamTricode', ''),
                "player_name": action.get('playerName', ''),
                "player_name_i": action.get('playerNameI', ''),
                # Include all action fields for completeness
                **{k: v for k, v in action.items() if k not in ['actionNumber', 'actionType', 'period', 'clock', 'description', 'scoreHome', 'scoreAway', 'teamId', 'teamTricode', 'playerName', 'playerNameI']}
            }
            events.append(event)
    
    # Check if this is stats endpoint format (has 'resultSets')
    elif pbp_data.get('resultSets'):
        result_sets = pbp_data.get('resultSets', [])
        logger.debug(f"Found resultSets format: {len(result_sets)} result sets")
        
        # Find PlayByPlay resultSet
        pbp_rows = None
        for rs in result_sets:
            if rs.get('name') == 'PlayByPlay':
                pbp_rows = rs.get('rowSet', [])
                logger.debug(f"Found PlayByPlay resultSet with {len(pbp_rows) if pbp_rows else 0} rows")
                break
        
        if pbp_rows:
            # Transform each play-by-play event
            # Column order: GAME_ID, EVENTNUM, EVENTMSGTYPE, EVENTMSGACTIONTYPE, etc.
            for idx, row in enumerate(pbp_rows):
                event = {
                    "sequence": idx + 1,
                    "event_num": row[1] if len(row) > 1 else idx + 1,
                    # Map other event fields as needed
                }
                events.append(event)
    else:
        logger.warning(f"Unknown PBP data structure. Top-level keys: {list(pbp_data.keys()) if isinstance(pbp_data, dict) else 'not a dict'}")
    
    logger.debug(f"Transformed {len(events)} events for game {game_id}")
    
    return {
        "id": game_id,  # Already UUID format
        "sequence": len(events),
        "events": events
    }

