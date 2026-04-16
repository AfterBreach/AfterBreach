# Contributing to AfterBreach

AfterBreach is a community-maintained dataset of cyber incident reporting obligations. The data is the core artefact — the web app is a viewer on top.

## Ways to contribute

- **Fix stale data.** Contact details change, penalties get updated, commencement dates shift. Each obligation has a `last_verified` date — if you check something and it's still correct, bump the date.
- **Add an obligation.** New legislation, a regulator we missed, a sector-specific scheme. See [docs/adding-obligations.md](docs/adding-obligations.md).
- **Add a jurisdiction.** Whole new country or subnational dataset. See [docs/adding-jurisdictions.md](docs/adding-jurisdictions.md).
- **File an issue** if you find something wrong and can't fix it yourself.

## Ground rules

1. **Cite a primary source.** Every obligation must point to the regulator, legislation, or official guidance that establishes it. No "I heard it at a conference".
2. **Verbatim where possible.** `obligation_name`, `who_applies_to`, and `description` should quote the source directly where there's official wording. Paraphrasing introduces drift.
3. **Validate against the schema.** `data/schema.json` is the source of truth for the data shape. Run the validator (see below) before opening a PR.
4. **One PR, one logical change.** Adding a new obligation is one PR. Bumping three `last_verified` dates on unrelated items is one PR. Restructuring the whole dataset is a conversation first.
5. **No legal advice.** We document obligations; we do not interpret them for specific situations. Keep editorial content factual.

## Validating your changes

```bash
pip install jsonschema
python -c "
import json
from jsonschema import Draft202012Validator
schema = json.load(open('data/schema.json'))
data = json.load(open('data/au/obligations.json'))
Draft202012Validator.check_schema(schema)
errors = list(Draft202012Validator(schema).iter_errors(data))
assert not errors, errors
print('OK')
"
```

## Pull request checklist

- [ ] Dataset still validates against `data/schema.json`
- [ ] `last_verified` is set to the date you checked the source
- [ ] `source` and `learn_more_links` point to the primary regulator or legislation
- [ ] `last_updated` in the dataset metadata is bumped
- [ ] `data_provenance.total` matches the actual obligation count

## What we don't accept

- Obligations without a clear legal or official basis (rumours, consultant advice).
- Obligations that aren't cyber-specific (generic AML reporting, generic director duties).
- PRs that paraphrase official wording without a good reason.
- PRs that add commentary or opinion to `description` fields — keep it factual.

## Code of conduct

Be constructive. Assume good faith. The people compiling reporting obligations in their spare time are volunteers. Reviewers are volunteers too.
