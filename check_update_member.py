"""Validate current members and identify migration candidates."""
from __future__ import annotations

from typing import Iterable

REQUIRED_FIELDS = ("id", "name", "power")


def validate_members(members: Iterable[dict]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for index, member in enumerate(members, start=1):
        missing = [field for field in REQUIRED_FIELDS if not member.get(field)]
        if missing:
            errors.append(f"member {index}: missing {', '.join(missing)}")
        member_id = str(member.get("id", ""))
        if member_id in seen:
            errors.append(f"member {index}: duplicate id {member_id}")
        seen.add(member_id)
    return errors


def find_migrations(members: Iterable[dict], power_threshold: int = 30_000_000) -> list[dict]:
    """Return members whose power crosses the migration-review threshold."""
    return [member for member in members if int(member.get("power", 0)) >= power_threshold]
