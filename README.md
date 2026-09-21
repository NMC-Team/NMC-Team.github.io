# NMC member update pipeline

This repository now contains the Python member-update pipeline represented by the supplied flow diagram. The previous sample dashboard data has been removed from the active data source.

## Flow

- `config.py` reads private API tokens and member storage.
- `dates_update.py` requests the current NMC members.
- `migration_update.py` reviews members at or above 30M power.
- `check_update_member.py` validates IDs, names, power, and duplicates.
- `main.py` runs the complete validation/update command.
- `nmc-member.json` is the live member data file and starts empty.

## Run

```bash
export NMC_MEMBERS_URL="https://your-member-service.example/api/members"
export NMC_API_TOKEN="your-token"
python3 main.py --update
python3 main.py
```

No API token is committed. Use environment variables or a private `all-apis-tokens.json` file, which is ignored by Git.
