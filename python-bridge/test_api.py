#!/usr/bin/env python3
"""
Test script for NBA API Bridge

Tests all endpoints to verify they work correctly before deployment.
Run this script to validate the API is working properly.

Usage:
    python3 test_api.py [--base-url http://localhost:8000]
    
Note: This script requires the 'requests' library.
If running locally, install with: pip3 install requests
Or run in container: docker compose exec nba-realtime-service python3 python-bridge/test_api.py
"""

import sys
import argparse
import json
from datetime import date, timedelta, datetime
from typing import Dict, Any, Optional

try:
    import requests
except ImportError:
    print("Error: 'requests' module not found.")
    print("Install with: pip3 install requests")
    print("Or run in container: docker compose exec nba-realtime-service python3 python-bridge/test_api.py")
    sys.exit(1)

try:
    import pytz
except ImportError:
    pytz = None
    print("Warning: pytz not available, using local time for date calculations")


def test_health(base_url: str) -> bool:
    """Test health check endpoint"""
    print("Testing health endpoint...")
    try:
        response = requests.get(f"{base_url}/health", timeout=5)
        if response.status_code == 200:
            print(f"✓ Health check passed: {response.json()}")
            return True
        else:
            print(f"✗ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"✗ Health check failed: {e}")
        return False


def get_today_eastern() -> date:
    """Get today's date in Eastern Time (matches NBA schedule timezone)"""
    if pytz:
        eastern_tz = pytz.timezone('America/New_York')
        return datetime.now(eastern_tz).date()
    else:
        # Fallback to local time if pytz not available
        return date.today()


def test_schedule(base_url: str, test_date: Optional[date] = None) -> Optional[Dict[str, Any]]:
    """Test schedule endpoint and return schedule data"""
    if test_date is None:
        test_date = get_today_eastern()
    
    print(f"Testing schedule endpoint for {test_date}...")
    try:
        url = f"{base_url}/schedule/{test_date.year}/{test_date.month}/{test_date.day}"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            schedule = response.json()
            game_count = len(schedule.get('games', []))
            print(f"✓ Schedule endpoint passed: Found {game_count} games")
            
            # Check if games have required fields
            if game_count > 0:
                first_game = schedule['games'][0]
                required_fields = ['id', 'status', 'home', 'away']
                missing_fields = [f for f in required_fields if f not in first_game]
                if missing_fields:
                    print(f"⚠ Warning: First game missing fields: {missing_fields}")
                else:
                    print(f"✓ First game has all required fields")
                
                # Check if nba_game_id is present (for reverse lookup)
                if 'nba_game_id' in first_game:
                    print(f"✓ Games include nba_game_id for reverse lookup")
                else:
                    print(f"⚠ Warning: Games missing nba_game_id field")
            
            return schedule
        elif response.status_code == 304:
            print("✓ Schedule endpoint returned 304 Not Modified (cached)")
            return None
        else:
            print(f"✗ Schedule endpoint failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"✗ Schedule endpoint failed: {e}")
        return None


def test_game_summary(base_url: str, game_id: str, is_uuid: bool = True) -> bool:
    """Test game summary endpoint"""
    print(f"Testing game summary endpoint for game_id: {game_id[:20]}...")
    try:
        url = f"{base_url}/games/{game_id}/summary"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            summary = response.json()
            required_fields = ['id', 'status', 'home', 'away']
            missing_fields = [f for f in required_fields if f not in summary]
            if missing_fields:
                print(f"✗ Summary missing required fields: {missing_fields}")
                return False
            else:
                print(f"✓ Game summary endpoint passed")
                return True
        elif response.status_code == 304:
            print("✓ Game summary returned 304 Not Modified (cached)")
            return True
        elif response.status_code == 404:
            print(f"⚠ Game summary returned 404 - game may not exist or not in cache")
            return False
        else:
            print(f"✗ Game summary endpoint failed: {response.status_code}")
            print(f"  Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"✗ Game summary endpoint failed: {e}")
        return False


def test_play_by_play(base_url: str, game_id: str, is_uuid: bool = True) -> bool:
    """Test play-by-play endpoint"""
    print(f"Testing play-by-play endpoint for game_id: {game_id[:20]}...")
    try:
        url = f"{base_url}/games/{game_id}/pbp"
        print(f"  Request URL: {url}")
        response = requests.get(url, timeout=10)
        print(f"  Response status: {response.status_code}")
        
        if response.status_code == 200:
            pbp = response.json()
            print(f"  Response keys: {list(pbp.keys())}")
            required_fields = ['id', 'events']
            missing_fields = [f for f in required_fields if f not in pbp]
            if missing_fields:
                print(f"✗ Play-by-play missing required fields: {missing_fields}")
                print(f"  Full response: {pbp}")
                return False
            else:
                event_count = len(pbp.get('events', []))
                print(f"Play-by-play data: {pbp}")
                print(f"✓ Play-by-play endpoint passed: Found {event_count} events")
                if event_count == 0:
                    print(f"  ⚠ Warning: No events found in play-by-play data")
                return True
        elif response.status_code == 304:
            print("✓ Play-by-play returned 304 Not Modified (cached)")
            return True
        elif response.status_code == 404:
            print(f"⚠ Play-by-play returned 404 - game may not exist or not in cache")
            print(f"  Response: {response.text[:500]}")
            return False
        else:
            print(f"✗ Play-by-play endpoint failed: {response.status_code}")
            print(f"  Response: {response.text[:500]}")
            try:
                error_detail = response.json()
                print(f"  Error detail: {error_detail}")
            except:
                pass
            return False
    except Exception as e:
        print(f"✗ Play-by-play endpoint failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_etag_support(base_url: str, game_id: str) -> bool:
    """Test ETag conditional request support"""
    print(f"Testing ETag support for game_id: {game_id[:20]}...")
    try:
        # First request to get ETag
        url = f"{base_url}/games/{game_id}/summary"
        response1 = requests.get(url, timeout=10)
        
        if response1.status_code != 200:
            print(f"⚠ Cannot test ETag: initial request returned {response1.status_code}")
            return False
        
        etag = response1.headers.get('ETag')
        if not etag:
            print(f"⚠ No ETag header in response")
            return False
        
        print(f"✓ Got ETag: {etag[:20]}...")
        
        # Second request with If-None-Match header
        headers = {'If-None-Match': etag}
        response2 = requests.get(url, headers=headers, timeout=10)
        
        if response2.status_code == 304:
            print(f"✓ ETag conditional request works (304 Not Modified)")
            return True
        else:
            print(f"⚠ ETag conditional request returned {response2.status_code} (expected 304)")
            return False
    except Exception as e:
        print(f"✗ ETag test failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Test NBA API Bridge endpoints')
    parser.add_argument(
        '--base-url',
        default='http://localhost:8000',
        help='Base URL for the API (default: http://localhost:8000)'
    )
    parser.add_argument(
        '--date',
        help='Date to test schedule (YYYY-MM-DD, defaults to today in Eastern Time)'
    )
    parser.add_argument(
        '--game-id',
        help='Specific game ID (UUID) to test summary/pbp endpoints'
    )
    parser.add_argument(
        '--skip-etag',
        action='store_true',
        help='Skip ETag conditional request test'
    )
    
    args = parser.parse_args()
    
    print(f"Testing NBA API Bridge at {args.base_url}\n")
    print("=" * 60)
    
    results = {
        'health': False,
        'schedule': False,
        'summary': False,
        'pbp': False,
        'etag': False
    }
    
    # Test health
    results['health'] = test_health(args.base_url)
    print()
    
    if not results['health']:
        print("✗ Health check failed. Stopping tests.")
        sys.exit(1)
    
    # Test schedule
    test_date = None
    if args.date:
        try:
            test_date = date.fromisoformat(args.date)
        except ValueError:
            print(f"✗ Invalid date format: {args.date}. Use YYYY-MM-DD")
            sys.exit(1)
    
    schedule = test_schedule(args.base_url, test_date)
    results['schedule'] = schedule is not None
    print()
    
    # Test game endpoints if we have a game ID
    game_id = args.game_id
    if not game_id and schedule and schedule.get('games'):
        # Use first game from schedule
        game_id = schedule['games'][0]['id']
        print(f"Using first game from schedule: {game_id[:20]}...\n")
    
    if game_id:
        # Test summary
        results['summary'] = test_game_summary(args.base_url, game_id)
        print()
        
        # Test play-by-play
        results['pbp'] = test_play_by_play(args.base_url, game_id)
        print()
        
        # Test ETag support
        if not args.skip_etag:
            results['etag'] = test_etag_support(args.base_url, game_id)
            print()
    
    # Summary
    print("=" * 60)
    print("Test Summary:")
    print(f"  Health Check: {'✓' if results['health'] else '✗'}")
    print(f"  Schedule: {'✓' if results['schedule'] else '✗'}")
    print(f"  Game Summary: {'✓' if results['summary'] else '⚠' if game_id else '⊘'}")
    print(f"  Play-by-Play: {'✓' if results['pbp'] else '⚠' if game_id else '⊘'}")
    print(f"  ETag Support: {'✓' if results['etag'] else '⚠' if game_id and not args.skip_etag else '⊘'}")
    
    # Exit code
    critical_tests = ['health', 'schedule']
    if all(results[test] for test in critical_tests):
        print("\n✓ All critical tests passed!")
        sys.exit(0)
    else:
        print("\n✗ Some critical tests failed!")
        sys.exit(1)


if __name__ == '__main__':
    main()

