"""
Game ID Mapper Utility

Maps NBA.com numeric game IDs to deterministic UUIDs using UUID v5.
This ensures consistent UUID generation for the same NBA.com game ID.
Matches the TypeScript implementation exactly.
"""

import uuid
from typing import Optional

# Namespace UUID for NBA game IDs - MUST match TypeScript implementation
NBA_GAME_ID_NAMESPACE = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')


def nba_game_id_to_uuid(nba_game_id: str) -> str:
    """
    Generates a deterministic UUID v5 from NBA.com numeric game ID
    
    Args:
        nba_game_id: NBA.com numeric game ID (e.g., "0022300123")
        
    Returns:
        UUID string (e.g., "a1b2c3d4-e5f6-5678-9abc-def012345678")
    """
    normalized_id = str(nba_game_id).strip()
    
    if not normalized_id:
        raise ValueError('NBA game ID cannot be empty')
    
    # Use Python's uuid.uuid5 which implements UUID v5
    game_uuid = uuid.uuid5(NBA_GAME_ID_NAMESPACE, normalized_id)
    
    return str(game_uuid)


def is_valid_uuid(uuid_string: str) -> bool:
    """Validates if a string is a valid UUID format"""
    try:
        uuid.UUID(uuid_string)
        return True
    except (ValueError, AttributeError):
        return False


def is_nba_game_id(game_id: str) -> bool:
    """
    Checks if a string looks like an NBA.com numeric game ID
    
    NBA.com game IDs are typically 10-digit strings (e.g., "0022300123")
    """
    return bool(game_id and game_id.isdigit() and len(game_id) == 10)

