# Data schema

The canonical schema is [`data/schema.json`](../data/schema.json) (JSON Schema, draft 2020-12). This page is a human-readable companion — when the two disagree, the JSON Schema wins.

## File layout

One dataset file per jurisdiction:

```
data/
  schema.json              # Shared schema for all jurisdiction files
  au/obligations.json      # Australia
  nz/obligations.json      # New Zealand (future)
  uk/obligations.json      # United Kingdom (future)
  eu/obligations.json      # European Union (future)
```

Each file is a single JSON object with dataset metadata at the top level and an `obligations` array.

## Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | string | yes | Semver (`"1.0.0"`). Bump on breaking schema changes. |
| `last_updated` | date | yes | ISO 8601 date (`YYYY-MM-DD`) of the most recent change to the file. |
| `jurisdiction_coverage` | string[] | yes | Jurisdiction codes present. Match `obligations[].jurisdiction` values. |
| `data_provenance` | object | no | Free-form provenance info (counts, methodology). |
| `source_notes` | string | no | Prose describing how the dataset was compiled. |
| `disclaimer` | string | no | Legal disclaimer shown alongside the data. |
| `sectors` | object | no | Map of sector-ID → human name (jurisdiction-specific). |
| `entity_types` | object | no | Map of entity-type-ID → human name (jurisdiction-specific). |
| `obligations` | object[] | yes | The obligations themselves. |

## Jurisdiction codes

ISO 3166-style. Country-level uses ISO 3166-1 alpha-2 (`AU`, `NZ`, `GB`); subnational uses ISO 3166-2 (`AU-NSW`, `US-CA`).

## Obligation fields

### Required on every obligation

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique, stable, lowercase-hyphenated, jurisdiction-namespaced (`au-soci-ci-incident`). Never rename once published. |
| `jurisdiction` | string | Jurisdiction code (see above). |
| `obligation_name` | string | Full name. Prefer verbatim source wording. |
| `obligation_type` | enum | `Mandatory` \| `Voluntary` \| `Recommended`. |
| `regulator` | string | Clean name of the regulator or recipient body. |
| `who_applies_to` | string | Who's covered. Prefer verbatim source wording. |
| `trigger_condition` | string | What activates the obligation. |
| `timeframe` | string | Human-readable deadline (`"Within 72 hours of becoming aware"`). |
| `timeframe_sort_hours` | number | Numeric deadline for sorting. For tiered deadlines, use the tightest. |
| `how_to_report` | object | Reporting mechanism (see below). |
| `legislative_basis` | string | Act, section, regulation, or standard. |
| `description` | string | Full description. Prefer verbatim source wording. |
| `penalty` | string \| null | Penalty for non-compliance, or null. |
| `learn_more_links` | object[] | `{ text, url }` entries pointing to official guidance. |
| `applies_to_sectors` | string[] | Sector IDs, or `["all"]`. Must match keys in top-level `sectors` (or the literal `"all"`). |
| `applies_to_entity_types` | string[] | Entity-type IDs. Empty array means no restriction. |
| `requires_ransom_payment` | boolean | True only if the obligation is triggered by making a ransom payment. |
| `last_verified` | date | ISO date you last checked the source. |
| `source` | string | Primary source citation. |

### `how_to_report` subfields

| Field | Type | Notes |
|---|---|---|
| `method` | string | Short mechanism description (`"Online form"`, `"Phone"`). Required. |
| `url` | string \| null | Primary reporting URL. |
| `url_secondary` | string \| null | Optional; for dual-report obligations. |
| `url_users` | string \| null | Optional; separate form for end-users. |
| `phone` | string \| null | Phone number. |
| `email` | string \| null | Email address. |

### Optional fields (state/territory and future-dated obligations)

| Field | Type | Notes |
|---|---|---|
| `state_territory` | string | Subdivision code (`"NSW"`, `"VIC"`). Omit for national obligations. |
| `public_sector_only` | boolean | True if applies only to government entities. |
| `commencement_date` | date | ISO date the obligation commences. Required if `not_yet_in_force` is true. |
| `not_yet_in_force` | boolean | True if legislated but not yet active. |
| `acsc_hash` | string \| null | Hash linking back to an ACSC portal entry. Null if not sourced from ACSC. Australia-specific. |

## Versioning

`schema_version` is semver.

- **Patch** (1.0.x): clarifications, doc changes, additional constraints that existing data already satisfies.
- **Minor** (1.x.0): new optional fields, new enum values.
- **Major** (x.0.0): required-field changes, breaking type changes, renames.

Bumping the major version requires migrating all existing jurisdiction datasets in the same PR.
