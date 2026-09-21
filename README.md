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
## Call of Dragons live data

The dashboard can connect directly to the official Call of Dragons game-tools API. Click **Connect CoD** in the site header and complete the official passport login. The returned JWT is stored only in the current browser's local storage; no token is committed to GitHub.

The captured official role-list API currently supplies live role name, power, avatar, server, and last-active time. The existing `data/members.csv`, `data/growth.csv`, and `data/wars.csv` files remain available for NMC-only fields that are not present in that response.

The live role endpoint used by the site is:

```text
https://plat-cod-gametools-global-api.farlightgames.com/api/pup/role_list
```

It is called with the `app_id` and `app_uid` contained in the authenticated Call of Dragons JWT.

