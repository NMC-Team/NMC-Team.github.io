"""NMC member update pipeline entry point."""
from __future__ import annotations

import argparse
import logging

from check_update_member import validate_members
from config import get_members
from migration_update import migration_update

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the NMC member update flow")
    parser.add_argument("--update", action="store_true", help="fetch and save current members")
    args = parser.parse_args()

    if args.update:
        members = migration_update()
        logging.info("Migration review completed for %d members", len(members))
    else:
        members = get_members()
        logging.info("Loaded %d members from nmc-member.json", len(members))

    errors = validate_members(members)
    if errors:
        for error in errors:
            logging.error(error)
        return 1
    logging.info("Member data is valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
