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

const OBLIGATIONS = DATA ? DATA.obligations : [];
const SECTORS = DATA ? DATA.sectors : {};

/* ---- Domain rules ---------------------------------------------------

   Mapping from user-facing regulatory flags to the dataset's
   entity-type IDs and to obligations that are only meaningful when
   the user has explicitly ticked a flag.
   ------------------------------------------------------------------ */

const FLAG_TO_ENTITY_TYPE = {
    asx: '392',
    ci: '393',
    foreign: '394'
};

// Obligations hidden unless the matching flag is ticked.
// These are narrowly-scoped obligations where default display would
// over-report (e.g. APRA obligations for non-banks).
const FLAG_GATED = {
    'au-apra-incident':                    'apra',
    'au-apra-weakness':                    'apra',
    'au-apra-cps230-operational-risk':     'apra',
    'au-apra-cps230-critical-disruption':  'apra',
    'au-asic-reportable':                  'afs',
    'au-telco-cyber':                      'telco',
    'au-my-health-record':                 'mhr',
    'au-my-health-record-state':           'mhr',
    'au-cdr-security':                     'cdr',
    'au-cdr-breach':                       'cdr',
    'au-rba-financial-stability':          'clearing'
};

// Obligations hidden when turnover < $3M (Privacy Act small-business
// exemption + Cyber Security Act 2024 reporting-entity threshold).
const TURNOVER_GATED = new Set(['au-ndb', 'au-ransomware']);

// Human scenario tags shown on rows in planning mode.
const SCENARIO = {
    'au-ndb':                              'if personal data is compromised',
    'au-ransomware':                       'if a ransom payment is made',
    'au-cdr-security':                     'if CDR data is affected',
    'au-cdr-breach':                       'if CDR data is affected',
    'au-my-health-record':                 'if My Health Record data is affected',
    'au-my-health-record-state':           'if My Health Record data is affected',
    'au-asx-continuous-disclosure':        'if material to securities value',
    'au-apra-cps230-critical-disruption':  'if critical operations disrupted',
    'au-ssba-cyber':                       'if SSBAs are affected',
    'au-tga-therapeutic':                  'if a medical device is impacted',
    'au-soci-ci-incident':                 'if significant impact on CI asset',
    'au-aviation-maritime-cyber':          'if aviation or maritime asset affected'
};

/* ---- Filter state ---- */

const filters = {
    mode:     'plan',           // 'plan' | 'incident'
    sector:   'any',            // 'any' | 'public' | 'private'
    state:    null,             // 'NSW' | 'VIC' | ... | null
    turnover: 'any',            // 'any' | 'above' | 'below'
    industry: 'all',            // sector ID string | 'all'
    flags:    new Set(),        // 'asx','ci','apra','afs','telco','mhr','cdr','foreign','clearing'
    sort:     'urgency'         // 'urgency' | 'name' | 'regulator' | 'type'
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

    // Turnover gating
    if (f.turnover === 'below' && TURNOVER_GATED.has(ob.id)) return false;

    // Industry / sector
    if (f.industry !== 'all') {
        const sectors = ob.applies_to_sectors || [];
        if (!sectors.includes('all') && !sectors.includes(f.industry)) return false;
    }

    // Entity-type flags (ASX / CI / Foreign)
    if (ob.applies_to_entity_types && ob.applies_to_entity_types.length > 0) {
        const userEntities = [];
        if (f.flags.has('asx'))     userEntities.push('392');
        if (f.flags.has('ci'))      userEntities.push('393');
        if (f.flags.has('foreign')) userEntities.push('394');
        const match = ob.applies_to_entity_types.some(et => userEntities.includes(et));
        if (!match) return false;
    }

    // Narrow obligations — require their flag
    const gate = FLAG_GATED[ob.id];
    if (gate && !f.flags.has(gate)) return false;

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
    const scenarioTag = filters.mode === 'plan' ? SCENARIO[ob.id] : null;

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
    document.querySelectorAll('.industry-list button').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.value === value);
    });
}

function setState(value) {
    filters.state = value;
    document.querySelectorAll('.chip[data-field="state"]').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.value === value);
    });
}

function setStateChipsEnabled(enabled) {
    document.querySelectorAll('.chip[data-field="state"]').forEach(btn => {
        btn.disabled = !enabled;
        if (!enabled) btn.classList.remove('is-active');
    });
    const legend = document.querySelector('#group-state legend');
    if (legend) legend.style.opacity = enabled ? '1' : '0.5';
}

function setMode(mode) {
    filters.mode = mode;
    document.querySelectorAll('.mode-btn').forEach(btn => {
        const active = btn.dataset.mode === mode;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const label = document.getElementById('count-mode');
    if (label) label.textContent = mode === 'incident' ? 'Responding' : 'Exploring';
}

function resetAll() {
    setSegmented('sector', 'any');
    setSegmented('turnover', 'any');
    setIndustry('all');
    setState(null);
    setStateChipsEnabled(false);
    filters.flags.clear();
    document.querySelectorAll('.flag input').forEach(cb => cb.checked = false);
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
    document.querySelectorAll('.chip[data-field="state"]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            const next = filters.state === btn.dataset.value ? null : btn.dataset.value;
            setState(next);
            renderList();
        });
    });

    // Industry
    document.querySelectorAll('.industry-list button').forEach(btn => {
        btn.addEventListener('click', () => {
            setIndustry(btn.dataset.value);
            renderList();
        });
    });

    // Flags
    document.querySelectorAll('.flag input').forEach(cb => {
        cb.addEventListener('change', () => {
            const flag = cb.dataset.flag;
            if (cb.checked) filters.flags.add(flag);
            else             filters.flags.delete(flag);
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

    // Initial render
    renderList();
}

document.addEventListener('DOMContentLoaded', init);
