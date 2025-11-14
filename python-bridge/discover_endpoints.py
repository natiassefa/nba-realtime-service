#!/usr/bin/env python3
"""
Helper script to discover available nba_api endpoints
Run this in the container to see what endpoints are available
"""

try:
    import nba_api.stats.endpoints as stats_endpoints
    print("Available stats endpoints:")
    endpoints = [x for x in dir(stats_endpoints) if not x.startswith('_')]
    for ep in sorted(endpoints):
        if 'box' in ep.lower() or 'play' in ep.lower() or 'score' in ep.lower():
            print(f"  - {ep}")
except ImportError as e:
    print(f"Error importing stats endpoints: {e}")

try:
    import nba_api.live.nba.endpoints as live_endpoints
    print("\nAvailable live endpoints:")
    endpoints = [x for x in dir(live_endpoints) if not x.startswith('_')]
    for ep in sorted(endpoints):
        print(f"  - {ep}")
except ImportError as e:
    print(f"Error importing live endpoints: {e}")

