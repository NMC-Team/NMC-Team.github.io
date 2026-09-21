"""Central configuration and API/token access for the NMC update pipeline."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
MEMBERS_FILE = ROOT / "nmc-member.json"
TOKENS_FILE = Path(os.getenv("NMC_TOKENS_FILE", ROOT / "all-apis-tokens.json"))


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def get_api_tokens() -> dict[str, str]:
    """Return API tokens from the configured token file or environment.

    Secrets are deliberately not committed. Set ``NMC_API_TOKEN`` for the
    member service, or point ``NMC_TOKENS_FILE`` at a private JSON file.
    """
    tokens = _read_json(TOKENS_FILE, {})
    if not isinstance(tokens, dict):
        raise ValueError(f"Token file must contain an object: {TOKENS_FILE}")
    env_token = os.getenv("NMC_API_TOKEN")
    if env_token:
        tokens["nmc"] = env_token
    return {str(key): str(value) for key, value in tokens.items() if value}


def get_members() -> list[dict[str, Any]]:
    members = _read_json(MEMBERS_FILE, [])
    if not isinstance(members, list):
        raise ValueError(f"Member data must contain a list: {MEMBERS_FILE}")
    return members


def save_members(members: list[dict[str, Any]]) -> None:
    with MEMBERS_FILE.open("w", encoding="utf-8") as stream:
        json.dump(members, stream, indent=2)
        stream.write("\n")
