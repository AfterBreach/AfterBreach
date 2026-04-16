/* ==================================================================
   AfterBreach — single-page selector + results
   ================================================================== */

'use strict';

/* ---- Load dataset ---- */

const DATA = (() => {
    const node = document.getElementById('obligations-data');
    try { return JSON.parse(node.textContent); }
    catch (e) { console.error('Failed to parse obligations data', e); return null; }
})();

const OBLIGATIONS     = DATA ? DATA.obligations : [];
const SECTORS         = DATA ? DATA.sectors     : {};
const SCENARIO_LABELS = DATA ? (DATA.scenarios || {}) : {};
const FLAG_LABELS     = DATA ? (DATA.flags     || {}) : {};

/* ---- Profile → data bridge ----------------------------------------

   Frontend user-profile flags map to two different data dimensions:
     1. ACSC portal entity types (ASX, Critical infrastructure, Foreign
        investor) — captured as applies_to_entity_types in the data.
     2. User flag keys (APRA, AFS, Telco, etc.) — captured as
        applies_to_flags in the data.

   This lookup tells us which flag → entity-type-id. Everything else
   lives in the data itself.
   ------------------------------------------------------------------ */

const FLAG_TO_ENTITY_TYPE = {
    asx:     '392',
    ci:      '393',
    foreign: '394'
};

const MODE_CAPTIONS = {
    plan: {
        label: 'Planning',
        text:  'See every obligation that could apply to your profile.'
    },
    incident: {
        label: 'Incident',
        text:  'Toggle the scenarios that have occurred to reveal triggered obligations.'
    }
};

/* ---- Dataset summary stats (dashboard numbers) ---- */

const SUMMARY = (() => {
    const byType = { Mandatory: 0, Voluntary: 0, Recommended: 0 };
    const regulators = new Set();
    for (const ob of OBLIGATIONS) {
        if (byType[ob.obligation_type] !== undefined) byType[ob.obligation_type] += 1;
        const r = ob.regulator || '';
        if (!r || r === 'N/A (contractual)' || r.startsWith('Relevant ')) continue;
        // Split compound entries ("OAIC + ASD's ACSC", "NOPTA / NOPSEMA") so each
        // distinct agency is counted once across the dataset.
        r.split(/\s*\+\s*|\s*\/\s*/).forEach(part => {
            const trimmed = part.trim();
            if (trimmed) regulators.add(trimmed);
        });
    }
    return {
        total:       OBLIGATIONS.length,
        mandatory:   byType.Mandatory,
        // Voluntary + Recommended grouped as "Recommended" for the dashboard.
        recommended: byType.Voluntary + byType.Recommended,
        regulators:  regulators.size
    };
})();

/* ---- Filter state ---- */

const filters = {
    mode:      'plan',           // 'plan' | 'incident'
    sector:    'any',            // 'any' | 'public' | 'private'
    state:     null,             // 'NSW' | 'VIC' | ... | null
    turnover:  'any',            // 'any' | 'above' | 'below'
    industry:  'all',            // sector ID string | 'all'
    flags:     new Set(),        // 'asx','ci','apra','afs','telco','mhr','cdr','foreign','clearing'
    scenarios: new Set(),        // 'personal-data','ransom-paid','health-records','critical-ops','material-securities','cdr-data'
    sort:      'urgency'         // 'urgency' | 'name' | 'regulator' | 'type'
};

/* ---- Matching ---- */

function obligationMatches(ob, f) {

    // Public-sector-only obligations
    if (ob.public_sector_only && f.sector === 'private') return false;

    // State-territory obligations
    if (ob.state_territory) {
        if (f.sector === 'private') return false;
        if (f.state && f.state !== ob.state_territory) return false;
        // If sector === 'public' but no state selected: keep (ambiguous shows as conditional)
    }

    // Turnover gating (data-driven via turnover_min_aud)
    if (f.turnover === 'below' && ob.turnover_min_aud != null && ob.turnover_min_aud > 0) {
        return false;
    }

    // Industry / sector
    if (f.industry !== 'all') {
        const sectors = ob.applies_to_sectors || [];
        if (!sectors.includes('all') && !sectors.includes(f.industry)) return false;
    }

    // Entity-type gating (ACSC portal types: ASX / CI / Foreign)
    if (ob.applies_to_entity_types && ob.applies_to_entity_types.length > 0) {
        const userEntities = [];
        for (const [flag, et] of Object.entries(FLAG_TO_ENTITY_TYPE)) {
            if (f.flags.has(flag)) userEntities.push(et);
        }
        const match = ob.applies_to_entity_types.some(et => userEntities.includes(et));
        if (!match) return false;
    }

    // Flag gating (applies_to_flags — data-driven)
    const flagReqs = ob.applies_to_flags || [];
    if (flagReqs.length > 0) {
        const match = flagReqs.some(flag => f.flags.has(flag));
        if (!match) return false;
    }

    // Incident-mode scenario gating (data-driven via obligation.scenarios).
    // In incident mode, a scenario-tagged obligation only shows when at least
    // one of its scenarios is toggled on. Non-scenario obligations always pass.
    if (f.mode === 'incident') {
        const sc = ob.scenarios || [];
        if (sc.length > 0) {
            const active = sc.some(s => f.scenarios.has(s));
            if (!active) return false;
        }
    }

    return true;
}

/* ---- Sort ---- */

const TYPE_ORDER = { Mandatory: 0, Voluntary: 1, Recommended: 2 };

function sortObligations(list, key) {
    const copy = list.slice();
    if (key === 'urgency') {
        copy.sort((a, b) =>
            a.timeframe_sort_hours - b.timeframe_sort_hours ||
            (TYPE_ORDER[a.obligation_type] ?? 99) - (TYPE_ORDER[b.obligation_type] ?? 99) ||
            a.obligation_name.localeCompare(b.obligation_name)
        );
    } else if (key === 'name') {
        copy.sort((a, b) => a.obligation_name.localeCompare(b.obligation_name));
    } else if (key === 'regulator') {
        copy.sort((a, b) => a.regulator.localeCompare(b.regulator));
    } else if (key === 'type') {
        copy.sort((a, b) =>
            (TYPE_ORDER[a.obligation_type] ?? 99) - (TYPE_ORDER[b.obligation_type] ?? 99) ||
            a.timeframe_sort_hours - b.timeframe_sort_hours
        );
    }
    return copy;
}

/* ---- Format helpers ---- */

function formatDeadline(hours) {
    // Returns { num, unit, caption, urgent }
    if (hours < 24) {
        return { num: String(hours).padStart(2, '0'), unit: 'H', caption: 'within', urgent: hours <= 4 };
    }
    if (hours <= 72) {
        return { num: String(hours), unit: 'H', caption: 'within', urgent: false };
    }
    const days = Math.round(hours / 24);
    return { num: String(days).padStart(2, '0'), unit: 'D', caption: 'within', urgent: false };
}

function cleanUrl(url) {
    if (!url) return null;
    // Some links in the dataset use drupal entity references — skip those.
    if (url.startsWith('entity:')) return null;
    return url;
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ---- Render: single obligation row ---- */

function renderObligation(ob, idx) {
    const li = document.createElement('li');
    li.className = 'obligation';
    li.dataset.id = ob.id;
    li.dataset.open = 'false';
    li.style.animationDelay = Math.min(idx * 18, 360) + 'ms';

    const dl = formatDeadline(ob.timeframe_sort_hours);
    const typeClass = ob.obligation_type.toLowerCase();

    // Build the scenario tag string ("if personal data is compromised")
    // from the obligation's scenarios array, using the dataset's labels.
    let scenarioTag = null;
    if (filters.mode === 'plan' && ob.scenarios && ob.scenarios.length > 0) {
        const labels = ob.scenarios.map(s => {
            const label = SCENARIO_LABELS[s];
            if (!label) return s;
            // Turn "Personal data was compromised" → "if personal data is compromised"
            return 'if ' + label.charAt(0).toLowerCase() + label.slice(1)
                .replace(/ was /g, ' is ')
                .replace(/ were /g, ' is ');
        });
        scenarioTag = labels.join(' · ');
    }

    const basis = ob.legislative_basis
        ? ob.legislative_basis.split(';')[0].trim()
        : '';

    const notInForce = ob.not_yet_in_force
        ? `<span class="oblig-not-in-force">Commences ${escapeHtml(ob.commencement_date || '')}</span>`
        : '';

    li.innerHTML = `
        <div class="oblig-deadline ${dl.urgent ? 'is-urgent' : ''}">
            <div class="deadline-num">${dl.num}<span class="unit">${dl.unit}</span></div>
            <div class="deadline-caption">${escapeHtml(dl.caption)}</div>
        </div>

        <div class="oblig-content">
            <h3 class="oblig-name">${escapeHtml(ob.obligation_name)}</h3>
            <div class="oblig-meta">
                <span class="regulator">${escapeHtml(ob.regulator)}</span>
                <span class="sep">·</span>
                <span class="basis">${escapeHtml(basis)}</span>
                ${ob.jurisdiction !== 'AU' ? `<span class="sep">·</span><strong>${escapeHtml(ob.jurisdiction)}</strong>` : ''}
                ${scenarioTag ? `<span class="scenario">${escapeHtml(scenarioTag)}</span>` : ''}
            </div>
        </div>

        <div class="oblig-aside">
            <span class="oblig-badge ${typeClass}">${escapeHtml(ob.obligation_type)}</span>
            ${notInForce}
            <button class="oblig-expand" type="button" aria-expanded="false">
                Open <span class="caret"></span>
            </button>
        </div>
    `;

    li.querySelector('.oblig-expand').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleObligation(li, ob);
    });

    return li;
}

function renderDetails(ob) {
    const details = document.createElement('div');
    details.className = 'oblig-details';

    const htr = ob.how_to_report || {};
    const url = cleanUrl(htr.url);
    const urlHost = url ? new URL(url).hostname.replace(/^www\./, '') : null;

    const links = (ob.learn_more_links || [])
        .filter(l => cleanUrl(l.url))
        .map(l => `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.text)}</a>`)
        .join('');

    const verifiedDate = ob.last_verified ? ob.last_verified.replace(/-/g, '·') : '';

    details.innerHTML = `
        <div class="details-main">

            <section class="details-section">
                <div class="details-label">Description</div>
                <p class="details-body">${escapeHtml(ob.description || '')}</p>
            </section>

            <section class="details-section">
                <div class="details-label">Trigger</div>
                <p class="details-sub">${escapeHtml(ob.trigger_condition || '')}</p>
            </section>

            <section class="details-section">
                <div class="details-label">Who applies</div>
                <p class="details-sub">${escapeHtml(ob.who_applies_to || '')}</p>
            </section>

            ${links ? `
              <section class="details-section">
                <div class="details-label">Learn more</div>
                <div class="details-links">${links}</div>
              </section>` : ''}

        </div>

        <aside class="details-side">

            <div class="side-block">
                <div class="side-label">Timeframe</div>
                <div class="side-value">${escapeHtml(ob.timeframe || '')}</div>
            </div>

            <div class="side-block">
                <div class="side-label">Method</div>
                <div class="side-value">${escapeHtml(htr.method || '—')}</div>
            </div>

            ${url ? `
              <div class="side-block">
                <div class="side-label">Report at</div>
                <div class="side-value"><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(urlHost)}</a></div>
              </div>` : ''}

            ${htr.phone ? `
              <div class="side-block">
                <div class="side-label">Phone</div>
                <div class="side-value">${escapeHtml(htr.phone)}</div>
              </div>` : ''}

            ${htr.email ? `
              <div class="side-block">
                <div class="side-label">Email</div>
                <div class="side-value"><a href="mailto:${escapeHtml(htr.email)}">${escapeHtml(htr.email)}</a></div>
              </div>` : ''}

            <div class="side-block">
                <div class="side-label">Legislative basis</div>
                <div class="side-value">${escapeHtml(ob.legislative_basis || '—')}</div>
            </div>

            ${ob.penalty ? `
              <div class="side-block">
                <div class="side-label">Penalty</div>
                <div class="side-penalty">${escapeHtml(ob.penalty)}</div>
              </div>` : ''}

            <div class="provenance">
                <span class="verified">● VERIFIED ${escapeHtml(verifiedDate)}</span><br>
                ${escapeHtml(ob.source || '')}
                ${ob.acsc_hash ? `<br><span style="color:var(--ink-low)">hash · ${escapeHtml(ob.acsc_hash)}</span>` : ''}
            </div>

        </aside>
    `;

    return details;
}

function toggleObligation(li, ob) {
    const open = li.dataset.open === 'true';
    const btn = li.querySelector('.oblig-expand');
    const caret = btn.querySelector('.caret');

    if (open) {
        const drawer = li.querySelector('.oblig-details');
        if (drawer) drawer.remove();
        li.dataset.open = 'false';
        btn.setAttribute('aria-expanded', 'false');
        btn.firstChild.textContent = 'Open ';
    } else {
        li.appendChild(renderDetails(ob));
        li.dataset.open = 'true';
        btn.setAttribute('aria-expanded', 'true');
        btn.firstChild.textContent = 'Close ';
    }
    // keep the caret element
    if (caret && !btn.contains(caret)) btn.appendChild(caret);
}

/* ---- Render: full list ---- */

function renderList() {
    const list = document.getElementById('obligation-list');
    const filtered = OBLIGATIONS.filter(ob => obligationMatches(ob, filters));
    const sorted = sortObligations(filtered, filters.sort);

    list.innerHTML = '';

    if (sorted.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty-state';
        li.innerHTML = `
            <h3>No obligations match this profile.</h3>
            <p>Loosen your filters or reset — the intersection of your selections currently excludes every obligation in the dataset.</p>
        `;
        list.appendChild(li);
    } else {
        const frag = document.createDocumentFragment();
        sorted.forEach((ob, idx) => frag.appendChild(renderObligation(ob, idx)));
        list.appendChild(frag);
    }

    updateCount(sorted.length);
}

/* ---- Count animation ---- */

let countAnim = null;

function updateCount(n) {
    const el = document.getElementById('count-main');
    const start = parseInt(el.textContent, 10) || 0;
    const end = n;
    if (start === end) return;

    if (countAnim) cancelAnimationFrame(countAnim);

    const duration = 420;
    const t0 = performance.now();

    function step(now) {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        const v = Math.round(start + (end - start) * eased);
        el.textContent = String(v);
        if (p < 1) countAnim = requestAnimationFrame(step);
    }
    countAnim = requestAnimationFrame(step);
}

/* ---- Profile controls wiring ---- */

function setSegmented(field, value) {
    filters[field] = value;
    document.querySelectorAll(`.seg[data-field="${field}"]`).forEach(btn => {
        const active = btn.dataset.value === value;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
}

function setIndustry(value) {
    filters.industry = value;
    document.querySelectorAll('.chip-industry').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.value === value);
    });
}

function setState(value) {
    filters.state = value;
    document.querySelectorAll('.chip-state').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.value === value);
    });
}

function setStateChipsEnabled(enabled) {
    document.querySelectorAll('.chip-state').forEach(btn => {
        btn.disabled = !enabled;
        if (!enabled) btn.classList.remove('is-active');
    });
    const row = document.querySelector('[data-filter="state"]');
    if (row) row.style.opacity = enabled ? '1' : '0.55';
}

function setMode(mode) {
    filters.mode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        const active = btn.dataset.mode === mode;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    // Drive CSS that shows/hides the scenario row.
    document.body.dataset.mode = mode;

    // Update the count banner wording.
    const countLabel = document.getElementById('count-mode');
    if (countLabel) countLabel.textContent = mode === 'incident' ? 'Responding' : 'Exploring';

    // Update the descriptive caption next to the toggle.
    const caption = MODE_CAPTIONS[mode];
    if (caption) {
        const labelEl = document.querySelector('.mode-caption-label');
        const textEl  = document.querySelector('.mode-caption-text');
        if (labelEl) labelEl.textContent = caption.label;
        if (textEl)  textEl.textContent  = caption.text;
    }
}

function resetAll() {
    setSegmented('sector', 'any');
    setSegmented('turnover', 'any');
    setIndustry('all');
    setState(null);
    setStateChipsEnabled(false);
    filters.flags.clear();
    filters.scenarios.clear();
    document.querySelectorAll('.flag-chip input').forEach(cb => cb.checked = false);
    document.querySelectorAll('.scenario-chip input').forEach(cb => cb.checked = false);
    setMode('plan');
    document.getElementById('sort-select').value = 'urgency';
    filters.sort = 'urgency';
    renderList();
}

/* ---- Wire up events ---- */

function init() {

    // Segmented controls (sector, turnover)
    document.querySelectorAll('.seg').forEach(btn => {
        btn.addEventListener('click', () => {
            const field = btn.dataset.field;
            const value = btn.dataset.value;
            setSegmented(field, value);

            // Sector side-effects
            if (field === 'sector') {
                if (value === 'public') {
                    setStateChipsEnabled(true);
                } else {
                    setStateChipsEnabled(false);
                    setState(null);
                }
            }

            renderList();
        });
    });

    // State chips
    document.querySelectorAll('.chip-state').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            const next = filters.state === btn.dataset.value ? null : btn.dataset.value;
            setState(next);
            renderList();
        });
    });

    // Industry chips
    document.querySelectorAll('.chip-industry').forEach(btn => {
        btn.addEventListener('click', () => {
            setIndustry(btn.dataset.value);
            renderList();
        });
    });

    // Status flag chips
    document.querySelectorAll('.flag-chip input').forEach(cb => {
        cb.addEventListener('change', () => {
            const flag = cb.dataset.flag;
            if (cb.checked) filters.flags.add(flag);
            else             filters.flags.delete(flag);
            renderList();
        });
    });

    // Scenario chips (incident mode)
    document.querySelectorAll('.scenario-chip input').forEach(cb => {
        cb.addEventListener('change', () => {
            const scenario = cb.dataset.scenario;
            if (cb.checked) filters.scenarios.add(scenario);
            else             filters.scenarios.delete(scenario);
            renderList();
        });
    });

    // Mode toggle
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setMode(btn.dataset.mode);
            renderList();
        });
    });

    // Sort
    const sortSel = document.getElementById('sort-select');
    sortSel.addEventListener('change', () => {
        filters.sort = sortSel.value;
        renderList();
    });

    // Reset
    document.getElementById('reset-btn').addEventListener('click', resetAll);

    // Defaults
    setSegmented('sector', 'any');
    setSegmented('turnover', 'any');
    setStateChipsEnabled(false);
    setMode('plan');

    // Fill summary numbers from the dataset (hero stats + topbar)
    renderSummary();

    // Initial render
    renderList();
}

function renderSummary() {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set('sum-total',       SUMMARY.total);
    set('sum-mandatory',   SUMMARY.mandatory);
    set('sum-recommended', SUMMARY.recommended);
    set('sum-regulators',  SUMMARY.regulators);
    set('topbar-count',    SUMMARY.total);
    set('topbar-version',  'V' + (DATA && DATA.schema_version ? DATA.schema_version : '—'));
    if (DATA && DATA.last_updated) {
        set('topbar-date', DATA.last_updated.replace(/-/g, '·'));
    }
    set('count-total', SUMMARY.total);
}

document.addEventListener('DOMContentLoaded', init);
