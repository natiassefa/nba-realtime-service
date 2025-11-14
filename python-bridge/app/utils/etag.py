"""ETag utilities"""

import hashlib
import json
from typing import Any, Dict

def calculate_etag(data: Dict[str, Any]) -> str:
    """
    Calculate ETag from response data
    
    Args:
        data: Response data dictionary
        
    Returns:
        ETag string (SHA256 hash, quoted format)
    """
    json_str = json.dumps(data, sort_keys=True)
    hash_obj = hashlib.sha256(json_str.encode())
    return f'"{hash_obj.hexdigest()[:16]}"'  # Return quoted ETag (16 chars)

