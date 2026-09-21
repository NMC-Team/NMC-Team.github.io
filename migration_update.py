"""Coordinate the member migration/update request."""
from __future__ import annotations

from check_update_member import find_migrations
from dates_update import update_members

POWER_THRESHOLD = 30_000_000


def migration_update() -> list[dict]:
    before = update_members()
    migrations = find_migrations(before, power_threshold=POWER_THRESHOLD)
    if migrations:
        print(f"Members requiring add/remove review: {len(migrations)}")
    return migrations


if __name__ == "__main__":
    migration_update()
