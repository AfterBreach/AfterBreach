# ACSC portal enumeration

This directory holds the audit trail for extracting obligations from the ACSC Single Reporting Portal at `cyber.gov.au`.

## Expected contents (not yet committed)

- `enumerate_acsc.py` — Python script that queries the ACSC portal's Drupal AJAX endpoint across all sector × entity-type × ransomware filter combinations (89 queries at 1.5s delay, ~2 minutes).
- `acsc_obligations_full.json` — raw deduplicated obligations extracted by the script.
- `acsc_enumeration_report.txt` — human-readable summary of which queries surfaced which obligations.

## Portal details

- **Endpoint:** `https://www.cyber.gov.au/views/ajax`
- **Method:** GET with Drupal AJAX parameters
- **View:** `single_reporting_portal`, display `block_1`
- **Filter params:**
  - `field_sector[]=<sector_id>` (repeatable for multi-select)
  - `field_sector_type[]=<entity_type_id>`
  - `ransomware_payment_made[]=492`
- **Response:** JSON array of Drupal AJAX commands; HTML content is in `insert` commands.
- Two result sections per response: `relevant` (filtered matches) and `other` (everything else, with `srp-XXX` CSS classes that reveal which sector/entity-type triggers each obligation).

## Taxonomy IDs

See [../obligations.json](../obligations.json) `sectors` and `entity_types` for the current ID → name mapping.

## Re-scraping

The portal should be re-enumerated periodically to catch new obligations or changes. When the enumeration script is added, re-running it and diffing the output against `acsc_obligations_full.json` reveals portal changes.
