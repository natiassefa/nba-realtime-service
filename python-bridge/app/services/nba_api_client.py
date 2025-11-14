"""
NBA API Client Service

Wraps nba_api library calls and handles errors.
"""

from datetime import datetime, date, timezone
from typing import Optional, Dict, Any
from nba_api.live.nba.endpoints import scoreboard
from nba_api.stats.endpoints import scoreboardv2
import logging
import pytz

logger = logging.getLogger(__name__)

class NBAApiClient:
    """Client for NBA.com APIs via nba_api library"""
    
    def get_scoreboard(self, game_date: Optional[date] = None) -> Dict[str, Any]:
        """
        Get scoreboard for a specific date
        
        Args:
            game_date: Date to get scoreboard for (defaults to today)
            
        Returns:
            Dictionary with scoreboard data
        """
        try:
            # Use Eastern Time for date comparison (NBA schedules use ET)
            # This ensures "today" matches NBA's definition of today
            eastern_tz = pytz.timezone('America/New_York')
            today_eastern = datetime.now(eastern_tz).date()
            
            if game_date is None or game_date == today_eastern:
                # Use live endpoint for today
                scoreboard_obj = scoreboard.ScoreBoard()
                try:
                    return scoreboard_obj.get_dict()
                except (KeyError, AttributeError) as e:
                    # Handle case where nba_api tries to access missing resultSets (e.g., 'WinProbability')
                    # Fall back to accessing the raw data structure
                    logger.warning(f"get_dict() failed with {type(e).__name__} ({e}), trying alternative data access")
                    try:
                        # Try accessing result_sets attribute directly and build dict manually
                        if hasattr(scoreboard_obj, 'result_sets') and scoreboard_obj.result_sets:
                            # Build dictionary from result_sets
                            result_sets_list = []
                            for rs in scoreboard_obj.result_sets:
                                result_sets_list.append({
                                    'name': rs.name if hasattr(rs, 'name') else '',
                                    'headers': rs.headers if hasattr(rs, 'headers') else [],
                                    'rowSet': rs.data if hasattr(rs, 'data') else rs.rowSet if hasattr(rs, 'rowSet') else []
                                })
                            return {'resultSets': result_sets_list}
                        # Try accessing JSON directly
                        elif hasattr(scoreboard_obj, 'json'):
                            import json
                            return json.loads(scoreboard_obj.json)
                        elif hasattr(scoreboard_obj, 'get_json'):
                            import json
                            return json.loads(scoreboard_obj.get_json())
                        else:
                            raise ValueError("Could not find alternative data access method")
                    except Exception as fallback_error:
                        logger.error(f"Fallback data access also failed: {fallback_error}")
                        raise KeyError(f"Could not access scoreboard data. Original error: {e}")
            else:
                # Use stats endpoint for historical dates
                scoreboard_obj = scoreboardv2.ScoreboardV2(
                    game_date=game_date.strftime('%m/%d/%Y')
                )
                try:
                    return scoreboard_obj.get_dict()
                except (KeyError, AttributeError) as e:
                    # Handle case where nba_api tries to access missing resultSets
                    logger.warning(f"get_dict() failed with {type(e).__name__} ({e}), trying alternative data access")
                    try:
                        # Try accessing result_sets attribute directly and build dict manually
                        if hasattr(scoreboard_obj, 'result_sets') and scoreboard_obj.result_sets:
                            # Build dictionary from result_sets
                            result_sets_list = []
                            for rs in scoreboard_obj.result_sets:
                                result_sets_list.append({
                                    'name': rs.name if hasattr(rs, 'name') else '',
                                    'headers': rs.headers if hasattr(rs, 'headers') else [],
                                    'rowSet': rs.data if hasattr(rs, 'data') else rs.rowSet if hasattr(rs, 'rowSet') else []
                                })
                            return {'resultSets': result_sets_list}
                        # Try accessing JSON directly
                        elif hasattr(scoreboard_obj, 'json'):
                            import json
                            return json.loads(scoreboard_obj.json)
                        elif hasattr(scoreboard_obj, 'get_json'):
                            import json
                            return json.loads(scoreboard_obj.get_json())
                        else:
                            raise ValueError("Could not find alternative data access method")
                    except Exception as fallback_error:
                        logger.error(f"Fallback data access also failed: {fallback_error}")
                        raise KeyError(f"Could not access scoreboard data. Original error: {e}")
        except Exception as e:
            logger.error(f"Error fetching scoreboard: {e}")
            raise
    
    def get_game_summary(self, game_id: str) -> Dict[str, Any]:
        """
        Get game summary/boxscore
        
        Uses live scoreboard endpoint first to hydrate game summaries with rich data
        (scores, team stats, game leaders, period scores, etc.)
        
        Args:
            game_id: NBA.com game ID (numeric string)
            
        Returns:
            Dictionary with game summary data
        """
        try:
            # Try live scoreboard endpoint first (for today's games)
            # This provides rich game data including scores, team stats, game leaders, etc.
            # See: https://github.com/swar/nba_api/blob/master/docs/nba_api/live/endpoints/scoreboard.md
            try:
                from nba_api.live.nba.endpoints import scoreboard
                eastern_tz = pytz.timezone('America/New_York')
                today_eastern = datetime.now(eastern_tz).date()
                
                scoreboard_obj = scoreboard.ScoreBoard()
                
                # Try accessing games via the documented property first
                games_data = None
                try:
                    if hasattr(scoreboard_obj, 'games'):
                        games_obj = scoreboard_obj.games
                        if hasattr(games_obj, 'get_dict'):
                            games_data = games_obj.get_dict()
                        elif hasattr(games_obj, 'get_json'):
                            import json
                            games_data = json.loads(games_obj.get_json())
                except Exception as e:
                    logger.debug(f"Accessing games property failed: {e}")
                
                # Fallback to full get_dict() if games property doesn't work
                scoreboard_data = None
                if not games_data:
                    try:
                        scoreboard_data = scoreboard_obj.get_dict()
                    except (KeyError, AttributeError) as e:
                        logger.debug(f"Scoreboard get_dict() failed: {e}, trying JSON")
                        import json
                        if hasattr(scoreboard_obj, 'json'):
                            scoreboard_data = json.loads(scoreboard_obj.json)
                        elif hasattr(scoreboard_obj, 'get_json'):
                            scoreboard_data = json.loads(scoreboard_obj.get_json())
                
                # Extract games array from either source
                games = None
                scoreboard_info = None
                
                if games_data:
                    # If we got games directly from the property
                    if isinstance(games_data, list):
                        games = games_data
                    elif isinstance(games_data, dict) and 'games' in games_data:
                        games = games_data['games']
                elif scoreboard_data:
                    # Extract from full scoreboard structure
                    if scoreboard_data.get('scoreboard'):
                        scoreboard_info = scoreboard_data['scoreboard']
                        games = scoreboard_info.get('games')
                    elif scoreboard_data.get('games'):
                        games = scoreboard_data['games']
                
                # Find the specific game
                if games:
                    for game in games:
                        if str(game.get('gameId', '')) == game_id:
                            logger.debug(f"Found game {game_id} in live scoreboard")
                            # Get scoreboard date if available
                            game_date = None
                            if scoreboard_info:
                                game_date = scoreboard_info.get('gameDate')
                            elif hasattr(scoreboard_obj, 'score_board_date'):
                                game_date = scoreboard_obj.score_board_date
                            
                            # Return game data in a format that can be transformed
                            # Wrap it to indicate it's from live scoreboard
                            result = {
                                '_source': 'live_scoreboard',
                                'game': game
                            }
                            if scoreboard_info:
                                result['scoreboard'] = scoreboard_info
                            if game_date:
                                result['gameDate'] = game_date
                            return result
                    
                    logger.debug(f"Game {game_id} not found in live scoreboard (checked {len(games)} games)")
                else:
                    logger.debug(f"No games found in live scoreboard response")
            except (ImportError, AttributeError) as e:
                logger.debug(f"Live scoreboard import failed: {e}")
            except Exception as e:
                logger.debug(f"Live scoreboard failed: {e}")
            
            # Try live boxscore endpoint (for in-progress games)
            try:
                from nba_api.live.nba.endpoints import boxscore as live_boxscore
                boxscore_data = live_boxscore.BoxScore(game_id=game_id)
                return boxscore_data.get_dict()
            except (ImportError, AttributeError) as e:
                logger.debug(f"Live boxscore import failed: {e}")
            except Exception as e:
                logger.debug(f"Live boxscore failed: {e}")
            
            # Try BoxScoreSummaryV2 from stats endpoints (this is the main boxscore endpoint)
            try:
                from nba_api.stats.endpoints import BoxScoreSummaryV2
                boxscore_data = BoxScoreSummaryV2(game_id=game_id)
                return boxscore_data.get_dict()
            except (ImportError, AttributeError) as e:
                logger.debug(f"BoxScoreSummaryV2 import failed: {e}")
            except Exception as e:
                logger.debug(f"BoxScoreSummaryV2 failed: {e}")
            
            # Fallback: Try other boxscore endpoints
            try:
                import nba_api.stats.endpoints as stats_endpoints
                # Try other boxscore endpoints as fallback
                for class_name in ['BoxScoreTraditionalV2', 'BoxScoreV2', 'BoxScore']:
                    if hasattr(stats_endpoints, class_name):
                        try:
                            BoxScoreClass = getattr(stats_endpoints, class_name)
                            boxscore_data = BoxScoreClass(game_id=game_id)
                            return boxscore_data.get_dict()
                        except Exception as e:
                            logger.debug(f"Failed to use {class_name}: {e}")
                            continue
            except Exception as e:
                logger.debug(f"Stats boxscore fallback failed: {e}")
            
            # If all attempts fail, raise informative error
            raise ImportError(
                "Could not import boxscore endpoints from nba_api. "
                "Tried: live scoreboard, live boxscore, BoxScoreSummaryV2, BoxScoreTraditionalV2, BoxScoreV2, BoxScore."
            )
        except Exception as e:
            logger.error(f"Error fetching game summary: {e}")
            raise
    
    def get_play_by_play(self, game_id: str) -> Dict[str, Any]:
        """
        Get play-by-play data
        
        Args:
            game_id: NBA.com game ID (numeric string)
            
        Returns:
            Dictionary with play-by-play data
        """
        result = None
        
        try:
            # Try live endpoint first (for in-progress games)
            try:
                from nba_api.live.nba.endpoints import playbyplay as live_pbp
                import json
                pbp_obj = live_pbp.PlayByPlay(game_id=game_id)
                
                # Try get_dict() first
                try:
                    result = pbp_obj.get_dict()
                    logger.debug(f"Live endpoint get_dict() returned keys: {list(result.keys()) if isinstance(result, dict) else 'not a dict'}")
                except Exception as dict_error:
                    logger.debug(f"get_dict() failed: {dict_error}, trying JSON")
                    result = None
                
                # If get_dict() doesn't work or returns unexpected structure, try JSON
                if not result or not isinstance(result, dict):
                    try:
                        if hasattr(pbp_obj, 'json'):
                            result = json.loads(pbp_obj.json)
                        elif hasattr(pbp_obj, 'get_json'):
                            result = json.loads(pbp_obj.get_json())
                        logger.debug(f"Live endpoint JSON returned keys: {list(result.keys()) if isinstance(result, dict) else 'not a dict'}")
                    except Exception as json_error:
                        logger.debug(f"JSON access failed: {json_error}")
                
                # Live endpoint uses 'game.actions' structure, not 'resultSets'
                if result and isinstance(result, dict):
                    # Check various possible structures
                    actions = None
                    if result.get('game') and isinstance(result['game'], dict):
                        actions = result['game'].get('actions')
                    elif result.get('actions'):
                        actions = result['actions']
                    
                    if actions and isinstance(actions, list) and len(actions) > 0:
                        logger.debug(f"Got play-by-play data from live endpoint for game {game_id} ({len(actions)} actions)")
                        return result
                    else:
                        logger.debug(f"Live play-by-play endpoint returned empty or invalid actions for game {game_id}. Actions type: {type(actions)}, length: {len(actions) if isinstance(actions, (list, dict)) else 'N/A'}")
                else:
                    logger.debug(f"Live play-by-play endpoint returned invalid result for game {game_id}")
            except (ImportError, AttributeError) as e:
                logger.debug(f"Live play-by-play import failed: {e}")
            except Exception as e:
                logger.debug(f"Live play-by-play failed: {e}")
            
            # Try PlayByPlayV2 with all periods (0 means all periods)
            try:
                from nba_api.stats.endpoints import PlayByPlayV2
                # Try with StartPeriod=0, EndPeriod=0 (all periods)
                pbp_data = PlayByPlayV2(game_id=game_id, start_period=0, end_period=0)
                result = pbp_data.get_dict()
                # Check if we got actual data
                if result and result.get('resultSets'):
                    for rs in result.get('resultSets', []):
                        if rs.get('name') == 'PlayByPlay' and rs.get('rowSet'):
                            logger.debug(f"Got play-by-play data from PlayByPlayV2 for game {game_id}")
                            return result
                logger.debug(f"PlayByPlayV2 returned empty data for game {game_id}, trying with period 1-4")
            except (ImportError, AttributeError) as e:
                logger.debug(f"PlayByPlayV2 import failed: {e}")
            except Exception as e:
                logger.debug(f"PlayByPlayV2 failed: {e}")
            
            # Try PlayByPlayV2 with periods 1-4 explicitly
            try:
                from nba_api.stats.endpoints import PlayByPlayV2
                pbp_data = PlayByPlayV2(game_id=game_id, start_period=1, end_period=4)
                result = pbp_data.get_dict()
                if result and result.get('resultSets'):
                    for rs in result.get('resultSets', []):
                        if rs.get('name') == 'PlayByPlay' and rs.get('rowSet'):
                            logger.debug(f"Got play-by-play data from PlayByPlayV2 (periods 1-4) for game {game_id}")
                            return result
            except Exception as e:
                logger.debug(f"PlayByPlayV2 (periods 1-4) failed: {e}")
            
            # Fallback: Try PlayByPlay
            try:
                from nba_api.stats.endpoints import PlayByPlay
                pbp_data = PlayByPlay(game_id=game_id)
                result = pbp_data.get_dict()
                if result and result.get('resultSets'):
                    for rs in result.get('resultSets', []):
                        if rs.get('name') == 'PlayByPlay' and rs.get('rowSet'):
                            logger.debug(f"Got play-by-play data from PlayByPlay for game {game_id}")
                            return result
            except (ImportError, AttributeError) as e:
                logger.debug(f"PlayByPlay import failed: {e}")
            except Exception as e:
                logger.debug(f"PlayByPlay failed: {e}")
            
            # If all attempts return empty data, return the last result (even if empty)
            # This allows the endpoint to return a valid response structure
            if result:
                logger.warning(f"All play-by-play endpoints returned empty data for game {game_id}")
                return result
            
            # If all attempts fail, raise informative error
            raise ImportError(
                "Could not import play-by-play endpoints from nba_api. "
                "Tried: live PlayByPlay, PlayByPlayV2 (all periods), PlayByPlayV2 (periods 1-4), PlayByPlay."
            )
        except Exception as e:
            logger.error(f"Error fetching play-by-play: {e}")
            raise

