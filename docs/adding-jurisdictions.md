# Adding a jurisdiction

Adding a whole country (or subnational jurisdiction not already covered) is a larger contribution than adding a single obligation. Expect review.

## Prerequisites

- You have a working knowledge of cyber incident reporting in the target jurisdiction, or access to legal counsel who does.
- You can cite primary sources (legislation, official regulator guidance) for every obligation.
- You've read [docs/data-schema.md](data-schema.md) and [docs/adding-obligations.md](adding-obligations.md).

## Steps

### 1. Open a tracking issue first

Title: `Add jurisdiction: {country}`

Include:
- Proposed jurisdiction code (ISO 3166-1 alpha-2; subnational as ISO 3166-2 where relevant).
- A rough list of the reporting schemes you plan to cover.
- Any jurisdiction-specific taxonomy decisions (sector IDs, entity type IDs).
- Whether the work will be split across multiple PRs.

Wait for feedback before investing significant time. Structural decisions made on day one are expensive to undo.

### 2. Create the directory

```
data/{jurisdiction}/
  obligations.json
```

Subnational obligations (e.g. Australian states, US states) live in the same file as national obligations for that country, distinguished by the `jurisdiction` field (`AU-NSW` inside `data/au/obligations.json`).

### 3. Decide the sector and entity-type taxonomy

Each jurisdiction gets its own `sectors` and `entity_types` maps. Don't try to harmonise across jurisdictions — regulatory categories don't translate cleanly (UK NIS2 "essential entities" is not the same as Australia's SOCI critical infrastructure sectors).

Keep IDs stable and short. Convention: three-digit numeric strings (`"395"`, `"400"`) to match the Australian dataset's existing style, or short codes (`"fs"`, `"health"`) — pick one per jurisdiction and be consistent.

### 4. Populate `obligations`

One obligation per distinct reporting pathway. If one event triggers two reports to the same regulator under two different statutes, that's two obligations.

### 5. Dataset metadata

Set at least:
- `schema_version` (match the current schema)
- `last_updated` (today)
- `jurisdiction_coverage` (include every code present)
- `disclaimer` (adapt to local legal context)
- `source_notes` (how you compiled it)

### 6. Validate

```bash
python -c "
import json
from jsonschema import Draft202012Validator
schema = json.load(open('data/schema.json'))
data = json.load(open('data/{jurisdiction}/obligations.json'))
errors = list(Draft202012Validator(schema).iter_errors(data))
assert not errors, errors
print('OK')
"
```

### 7. Open the PR

Reference the tracking issue. Expect multiple review rounds.

## What "done" looks like for a first jurisdiction PR

- All mandatory reporting obligations in scope for the jurisdiction are included.
- Every obligation cites a primary source and validates against the schema.
- The `sectors` and `entity_types` taxonomy is documented in the PR description.
- An entry is added to the top-level `README.md` or docs index listing the new jurisdiction.
