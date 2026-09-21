"""Fetch the current NMC member list from the configured service."""
from __future__ import annotations

import json
import os
from urllib.request import Request, urlopen

from config import get_api_tokens, save_members

API_URL = os.getenv("NMC_MEMBERS_URL", "")


def fetch_members() -> list[dict]:
    if not API_URL:
        raise RuntimeError("Set NMC_MEMBERS_URL before requesting members")
    token = get_api_tokens().get("nmc")
    if not token:
        raise RuntimeError("Set NMC_API_TOKEN or configure all-apis-tokens.json")
    request = Request(API_URL, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    with urlopen(request, timeout=30) as response:  # noqa: S310 - URL is operator-configured
        payload = json.loads(response.read().decode("utf-8"))
    members = payload.get("members", payload) if isinstance(payload, dict) else payload
    if not isinstance(members, list):
        raise ValueError("Member API response must be a list or an object with a members list")
    return members


def update_members() -> list[dict]:
    members = fetch_members()
    save_members(members)
    return members


if __name__ == "__main__":
    print(f"Updated {len(update_members())} members")
