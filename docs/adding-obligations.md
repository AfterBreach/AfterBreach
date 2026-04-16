# Adding an obligation

## Before you start

- Confirm the obligation isn't already in the dataset. Search `data/*/obligations.json` for the regulator name and legislation.
- Make sure it qualifies. We include obligations that are:
  - **Cyber-specific** (a generic AML/fraud obligation doesn't qualify unless there's a cyber-specific pathway).
  - **Concrete** (has a deadline, a form, a phone number — not just a governance framework).
  - **Established in law or official guidance** (not consultant opinion).

## Steps

### 1. Choose an ID

Convention: `{jurisdiction}-{regulator-or-scheme}-{trigger}`, lowercase, hyphen-separated.

Examples: `au-ndb`, `au-vic-ovic-incident`, `au-apra-cps-234-incident`.

IDs are permanent. Never rename one after it ships.

### 2. Draft the obligation

Fill in every required field from the [schema](data-schema.md). Use verbatim source wording for `obligation_name`, `who_applies_to`, and `description`. Paraphrase only where you must.

For `timeframe_sort_hours`, use the **tightest** applicable deadline when an obligation has tiered timeframes (e.g. "immediately reportable" + "72 hours for routine" → use the immediate value).

For `applies_to_sectors` and `applies_to_entity_types`, use `["all"]` or `[]` if the obligation isn't scoped by the jurisdiction's sector/entity-type taxonomy.

Set `last_verified` to today. Set `source` to the primary reference you consulted.

### 3. Update dataset metadata

- Bump `last_updated` to today.
- If you're adding a new jurisdiction code, add it to `jurisdiction_coverage`.
- If `data_provenance.total` (or similar counts) exists, keep them accurate.

### 4. Validate

```bash
pip install jsonschema
python -c "
import json
from jsonschema import Draft202012Validator
schema = json.load(open('data/schema.json'))
data = json.load(open('data/au/obligations.json'))
errors = list(Draft202012Validator(schema).iter_errors(data))
assert not errors, errors
print('OK')
"
```

### 5. Open a PR

Title: `Add {jurisdiction} {obligation name}`

Body:
- One-sentence summary of the obligation.
- Link to the primary source (regulator page, legislation, standard).
- Anything non-obvious about why this is in scope.

## Common pitfalls

- **Using "all" when you mean "multiple".** `applies_to_sectors: ["all"]` means truly sector-agnostic. If the obligation applies to, say, financial + health + telco but not defence, list them individually.
- **Ransom-payment obligations.** `requires_ransom_payment: true` is specifically for obligations triggered by *making* a ransom payment (e.g. Cyber Security Act 2024). Obligations that merely *mention* ransomware as a scenario example should leave it false.
- **Penalties as arrays.** `penalty` is a single string. If there are multiple penalty tiers, describe them in one sentence.
- **Dates in URLs or descriptions.** If the regulator's URL contains a year or a version number (e.g. `guidance-v3`), the link will break. Prefer a stable landing page.
- **Verbatim wording with typos.** If the source has a typo, copy it faithfully and add `[sic]` if you must. Don't silently "fix" official text.
