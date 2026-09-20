/* ==========================================================================
   data.js — loads and validates everything in /data.
   No dependencies, no build step. Pages call loadData([...]) and get clean
   objects back plus a list of human-readable `issues` for any bad rows.
   ========================================================================== */

// Site root, computed from this file's own URL (assets/js/data.js -> ../../).
// Works at https://user.github.io/repo/, at a custom domain, and on localhost.
export const ROOT = new URL('../../', import.meta.url);

export class DataError extends Error {}

/* ---- Fetching ---------------------------------------------------------- */

async function fetchText(path, fresh = false) {
    const url = new URL(path, ROOT);
    if (fresh) url.searchParams.set('t', Date.now());
    let res;
    try {
        res = await fetch(url, { cache: fresh ? 'reload' : 'no-cache' });
    } catch {
        const hint = location.protocol === 'file:'
            ? ' Browsers block file:// requests — run a local server (see README) or view the deployed site.'
            : ' Check your connection.';
        throw new DataError(`Could not load ${path}.${hint}`);
    }
    if (!res.ok) throw new DataError(`Could not load ${path} (HTTP ${res.status}). Is the file in the data/ folder?`);
    return res.text();
}

/* ---- CSV parsing ------------------------------------------------------- */

/** Parses CSV text into an array of row arrays. Handles quotes, CRLF, BOM. */
export function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') inQuotes = false;
            else field += c;
        } else if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            rows.push(row); row = [];
        } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
}

/** Parses CSV into objects keyed by lower-cased header. `line` = 1-based file line. */
function csvToObjects(text) {
    const rows = parseCSV(text);
    if (!rows.length) return [];
    const header = rows[0].map(h => h.trim().toLowerCase());
    const out = [];
    rows.slice(1).forEach((cells, i) => {
        if (cells.every(c => c.trim() === '')) return; // skip blank lines
        const obj = { line: i + 2 };
        header.forEach((h, j) => { obj[h] = (cells[j] ?? '').trim(); });
        out.push(obj);
    });
    return out;
}

/** '1,234' -> 1234, '' -> null, 'abc' -> null */
function toNum(v) {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = Number(String(v).replace(/[,_\s]/g, ''));
    return Number.isFinite(n) ? n : null;
}

/* ---- Individual loaders ------------------------------------------------ */

const NUMERIC_MEMBER_FIELDS = ['power', 'merits', 'weekly', 'quota', 'kd'];
export const SPIDER_KEYS = ['offense', 'survivability', 'rally', 'merit', 'mobility', 'activity'];

function buildMembers(text, roster, config, issues) {
    const members = [];
    const seen = new Set();
    for (const r of csvToObjects(text)) {
        const where = `members.csv line ${r.line}`;
        if (!r.id) { issues.push(`${where}: missing "id" — row skipped.`); continue; }
        if (seen.has(r.id)) { issues.push(`${where}: duplicate id ${r.id} — row skipped.`); continue; }
        seen.add(r.id);

        const m = {
            id: r.id,
            name: r.name || r.id,
            role: (r.role || '').toUpperCase(),
            title: r.title || '',
            spider: null,
        };
        if (!r.name) issues.push(`${where}: id ${r.id} has no name — showing the ID instead.`);

        for (const f of NUMERIC_MEMBER_FIELDS) {
            const n = toNum(r[f]);
            if (n === null) issues.push(`${where} (${m.name}): "${f}" is empty or not a number — using 0.`);
            m[f] = n ?? 0;
        }

        const spiderVals = SPIDER_KEYS.map(k => toNum(r[k]));
        const given = spiderVals.filter(v => v !== null).length;
        if (given === SPIDER_KEYS.length) {
            m.spider = {};
            SPIDER_KEYS.forEach((k, i) => { m.spider[k] = Math.max(0, Math.min(100, spiderVals[i])); });
        } else if (given > 0) {
            issues.push(`${where} (${m.name}): only ${given} of ${SPIDER_KEYS.length} radar scores filled in — needs all six, so they are ignored.`);
        }

        if (!config.demo && !roster.has(m.id)) {
            issues.push(`${where}: id ${m.id} (${m.name}) is not in data/roster.json.`);
        }
        members.push(m);
    }
    return members;
}

function buildGrowth(text, members, issues) {
    const known = new Set(members.map(m => m.id));
    const byId = {};
    for (const r of csvToObjects(text)) {
        const where = `growth.csv line ${r.line}`;
        const week = toNum(r.week), power = toNum(r.power_m), merits = toNum(r.merits_m);
        if (!r.id || week === null || !Number.isInteger(week) || week < 1) {
            issues.push(`${where}: needs an id and a whole-number week starting at 1 — row skipped.`); continue;
        }
        if (power === null || merits === null) {
            issues.push(`${where}: "power_m" and "merits_m" must both be numbers — row skipped.`); continue;
        }
        if (!known.has(r.id)) { issues.push(`${where}: id ${r.id} is not in members.csv — row skipped.`); continue; }
        (byId[r.id] ||= {})[week] = { power, merits };
    }
    return byId; // { id: { [week]: {power, merits} } }
}

const WAR_TYPES = ['RALLY', 'GARRISON', 'FIELD'];
const WAR_OUTCOMES = ['VICTORY', 'DEFEAT'];

function buildWars(text, issues) {
    const wars = [];
    for (const r of csvToObjects(text)) {
        const where = `wars.csv line ${r.line}`;
        if (!r.title) { issues.push(`${where}: missing "title" — row skipped.`); continue; }
        const w = {
            title: r.title,
            date: r.date,
            type: (r.type || '').toUpperCase(),
            outcome: (r.outcome || '').toUpperCase(),
        };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date)) issues.push(`${where} (${w.title}): date should look like 2026-02-14.`);
        if (!WAR_TYPES.includes(w.type)) issues.push(`${where} (${w.title}): type "${r.type}" should be one of ${WAR_TYPES.join(', ')}.`);
        if (!WAR_OUTCOMES.includes(w.outcome)) issues.push(`${where} (${w.title}): outcome "${r.outcome}" should be VICTORY or DEFEAT.`);
        for (const [key, col, def] of [['kills', 'kills', 0], ['deaths', 'deaths', 0], ['rssM', 'rss_m', 0], ['ratio', 'trade_ratio', 0], ['speedupDays', 'speedup_days', 0]]) {
            const n = toNum(r[col]);
            if (n === null && col !== 'speedup_days') issues.push(`${where} (${w.title}): "${col}" is empty or not a number — using 0.`);
            w[key] = n ?? def;
        }
        wars.push(w);
    }
    return wars.sort((a, b) => b.date.localeCompare(a.date));
}

/* ---- Public API -------------------------------------------------------- */

export async function loadConfig(fresh = false) {
    const config = JSON.parse(await fetchText('data/config.json', fresh));
    config.demo = config.demo === true;
    config.kpi = { exceedingPct: 120, metPct: 90, kdTarget: 2.5, ...(config.kpi || {}) };
    config.season = { name: 'Season', weeks: [], ...(config.season || {}) };
    return config;
}

/**
 * loadData(['members', 'growth', 'wars'], { fresh })
 * Always returns { config, roster (Set of ids), issues: string[] } plus what you asked for.
 * Asking for 'growth' also loads 'members' (needed to validate ids).
 */
export async function loadData(want = [], { fresh = false } = {}) {
    const issues = [];
    const needMembers = want.includes('members') || want.includes('growth');

    const [config, rosterRaw, membersText, growthText, warsText] = await Promise.all([
        loadConfig(fresh),
        fetchText('data/roster.json', fresh),
        needMembers ? fetchText('data/members.csv', fresh) : null,
        want.includes('growth') ? fetchText('data/growth.csv', fresh) : null,
        want.includes('wars') ? fetchText('data/wars.csv', fresh) : null,
    ]);

    let rosterList;
    try { rosterList = JSON.parse(rosterRaw); } catch { throw new DataError('data/roster.json is not valid JSON.'); }
    if (!Array.isArray(rosterList)) throw new DataError('data/roster.json must be a list of governor IDs, e.g. ["123", "456"].');
    const roster = new Set(rosterList.map(String));

    const out = { config, roster, issues };
    if (needMembers) out.members = buildMembers(membersText, roster, config, issues);
    if (growthText !== null) out.growth = buildGrowth(growthText, out.members, issues);
    if (warsText !== null) out.wars = buildWars(warsText, issues);
    return out;
}
