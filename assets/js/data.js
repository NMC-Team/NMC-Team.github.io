/* ========================================================================
   data.js — data access and validation for the NMC dashboard.

   Member data is now hybrid:
   - When connected to Call of Dragons, live role data is fetched from the
     official CoD tools API (name, power, avatar, server, last active time).
   - The existing CSV remains an optional enrichment layer for fields that
     are not provided by the captured role-list API (merits, quota, K/D,
     radar scores, roles/titles, and weekly history).
   - When not connected, the original CSV/JSON files continue to work.
   ======================================================================== */

import { getRoleList, getCodConfig, getToken, isAuthenticated, clearToken, getIdentity } from './cod-api.js';

export const ROOT = new URL('../../', import.meta.url);

export class DataError extends Error {}

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

function csvToObjects(text) {
    const rows = parseCSV(text);
    if (!rows.length) return [];
    const header = rows[0].map(h => h.trim().toLowerCase());
    const out = [];
    rows.slice(1).forEach((cells, i) => {
        if (cells.every(c => c.trim() === '')) return;
        const obj = { line: i + 2 };
        header.forEach((h, j) => { obj[h] = (cells[j] ?? '').trim(); });
        out.push(obj);
    });
    return out;
}

function toNum(v) {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = Number(String(v).replace(/[,_\s]/g, ''));
    return Number.isFinite(n) ? n : null;
}

const NUMERIC_MEMBER_FIELDS = ['power', 'merits', 'weekly', 'quota', 'kd'];
export const SPIDER_KEYS = ['offense', 'survivability', 'rally', 'merit', 'mobility', 'activity'];

function parseManualMembers(text, issues) {
    const byId = new Map();
    for (const r of csvToObjects(text)) {
        const where = `members.csv line ${r.line}`;
        if (!r.id) { issues.push(`${where}: missing "id" — row skipped.`); continue; }
        if (byId.has(r.id)) { issues.push(`${where}: duplicate id ${r.id} — row skipped.`); continue; }
        const manual = {
            id: r.id,
            name: r.name || '',
            role: (r.role || '').toUpperCase(),
            title: r.title || '',
            merits: toNum(r.merits),
            weekly: toNum(r.weekly),
            quota: toNum(r.quota),
            kd: toNum(r.kd),
            spider: null,
        };
        const spiderVals = SPIDER_KEYS.map(k => toNum(r[k]));
        if (spiderVals.every(v => v !== null)) {
            manual.spider = {};
            SPIDER_KEYS.forEach((k, i) => { manual.spider[k] = Math.max(0, Math.min(100, spiderVals[i])); });
        } else if (spiderVals.some(v => v !== null)) {
            issues.push(`${where} (${manual.name || manual.id}): radar data is incomplete — ignored.`);
        }
        for (const f of NUMERIC_MEMBER_FIELDS) {
            const n = toNum(r[f]);
            if (f !== 'power' && n === null && r[f]) issues.push(`${where} (${manual.name || manual.id}): "${f}" is not a number.`);
        }
        byId.set(r.id, manual);
    }
    return byId;
}

function parseManualRoster(raw, issues) {
    try {
        const rosterList = JSON.parse(raw);
        if (!Array.isArray(rosterList)) throw new Error('not an array');
        return new Set(rosterList.map(String));
    } catch {
        issues.push('data/roster.json is not a valid list of governor IDs.');
        return new Set();
    }
}

function liveMemberFromRole(role, manual, kingdom) {
    const liveServer = String(role.serverId ?? '');
    const isTarget = !kingdom || liveServer === String(kingdom);
    if (!isTarget) return null;

    return {
        id: String(role.roleId),
        name: manual?.name || role.roleName || String(role.roleId),
        role: manual?.role || '',
        title: manual?.title || '',
        power: Number(role.power) || 0,
        merits: manual?.merits == null ? null : Number(manual.merits) || 0,
        weekly: manual?.weekly == null ? null : Number(manual.weekly) || 0,
        quota: manual?.quota == null ? null : Number(manual.quota) || 0,
        kd: manual?.kd == null ? null : Number(manual.kd) || 0,
        spider: manual?.spider || null,
        avatar: role.avatar || '',
        avatarFrame: role.avatar_frame || '',
        serverId: liveServer,
        serverName: role.serverName || liveServer,
        lastTime: Number(role.lastTime) || 0,
        live: true,
        manualEnrichment: !!manual,
    };
}

function buildMembersFromApi(apiRoles, manualMap, config, issues) {
    const members = [];
    const seen = new Set();
    const kingdom = config.kingdom ?? config.serverId ?? 820;

    for (const role of apiRoles) {
        const id = String(role?.roleId ?? '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const member = liveMemberFromRole(role, manualMap.get(id), kingdom);
        if (member) members.push(member);
    }

    for (const [id, manual] of manualMap) {
        if (seen.has(id)) continue;
        const m = {
            id,
            name: manual.name || id,
            role: manual.role,
            title: manual.title,
            power: Number(manual.power) || 0,
            merits: Number(manual.merits) || 0,
            weekly: Number(manual.weekly) || 0,
            quota: Number(manual.quota) || 0,
            kd: Number(manual.kd) || 0,
            spider: manual.spider,
            avatar: '',
            avatarFrame: '',
            serverId: '',
            serverName: '',
            lastTime: 0,
            live: false,
            manualEnrichment: false,
        };
        issues.push(`Member ${id} exists in members.csv but was not returned by the live Call of Dragons role list.`);
        members.push(m);
    }

    return members;
}

function buildManualOnlyMembers(text, issues, roster, config) {
    const members = [];
    const target = String(config.kingdom ?? config.serverId ?? '');
    const manualMap = parseManualMembers(text, issues);
    for (const m of manualMap.values()) {
        members.push({
            id: m.id,
            name: m.name || m.id,
            role: m.role,
            title: m.title,
            power: Number(m.power) || 0,
            merits: Number(m.merits) || 0,
            weekly: Number(m.weekly) || 0,
            quota: Number(m.quota) || 0,
            kd: Number(m.kd) || 0,
            spider: m.spider,
            avatar: '', avatarFrame: '', serverId: target, serverName: target,
            lastTime: 0, live: false, manualEnrichment: false,
        });
    }
    return { members, manualMap };
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
        if (!known.has(r.id)) { issues.push(`${where}: id ${r.id} is not in the active member list — row skipped.`); continue; }
        (byId[r.id] ||= {})[week] = { power, merits };
    }
    return byId;
}

const WAR_TYPES = ['RALLY', 'GARRISON', 'FIELD'];
const WAR_OUTCOMES = ['VICTORY', 'DEFEAT'];

function buildWars(text, issues) {
    const wars = [];
    for (const r of csvToObjects(text)) {
        const where = `wars.csv line ${r.line}`;
        if (!r.title) { issues.push(`${where}: missing "title" — row skipped.`); continue; }
        const w = { title: r.title, date: r.date, type: (r.type || '').toUpperCase(), outcome: (r.outcome || '').toUpperCase() };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date)) issues.push(`${where} (${w.title}): date should look like 2026-02-14.`);
        if (!WAR_TYPES.includes(w.type)) issues.push(`${where} (${w.title}): type "${r.type}" should be one of ${WAR_TYPES.join(', ')}.`);
        if (!WAR_OUTCOMES.includes(w.outcome)) issues.push(`${where} (${w.title}): outcome "${w.outcome}" should be VICTORY or DEFEAT.`);
        for (const [key, col, def] of [['kills', 'kills', 0], ['deaths', 'deaths', 0], ['rssM', 'rss_m', 0], ['ratio', 'trade_ratio', 0], ['speedupDays', 'speedup_days', 0]]) {
            const n = toNum(r[col]);
            if (n === null && col !== 'speedup_days') issues.push(`${where} (${w.title}): "${col}" is empty or not a number — using 0.`);
            w[key] = n ?? def;
        }
        wars.push(w);
    }
    return wars.sort((a, b) => b.date.localeCompare(a.date));
}

export async function loadConfig(fresh = false) {
    let config = {};
    try { config = JSON.parse(await fetchText('data/config.json', fresh)); } catch (err) { throw new DataError(err.message); }
    config.demo = config.demo === true;
    config.kingdom = config.kingdom ?? 820;
    config.liveApi = config.liveApi !== false;
    config.kpi = { exceedingPct: 120, metPct: 90, kdTarget: 2.5, ...(config.kpi || {}) };
    config.season = { name: 'Season', weeks: [], ...(config.season || {}) };
    return config;
}

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

    const localRoster = parseManualRoster(rosterRaw, issues);
    const out = {
        config,
        roster: localRoster,
        issues,
        live: false,
        liveRoleCount: 0,
        identity: null,
        codConfig: null,
    };

    if (needMembers) {
        if (config.liveApi && isAuthenticated() && getToken()) {
            const manualMap = parseManualMembers(membersText, issues);
            try {
                const identity = getIdentity();
                const [rolePayload, codConfig] = await Promise.all([
                    getRoleList(),
                    getCodConfig().catch(() => null),
                ]);
                const roles = Array.isArray(rolePayload?.data) ? rolePayload.data : [];
                const liveMembers = buildMembersFromApi(roles, manualMap, config, issues);
                out.members = liveMembers;
                out.live = true;
                out.liveRoleCount = liveMembers.filter(m => m.live).length;
                out.identity = identity;
                out.codConfig = codConfig?.data || null;
                if (!liveMembers.length && localRoster.size) {
                    issues.push(`The connected Call of Dragons account has no roles on Kingdom ${config.kingdom}. Showing local member data instead.`);
                    out.members = buildManualOnlyMembers(membersText, issues, localRoster, config).members;
                    out.live = false;
                }
            } catch (err) {
                if (/login expired|invalid login token/i.test(err.message)) clearToken();
                issues.push(`Live Call of Dragons sync failed: ${err.message}`);
                out.members = buildManualOnlyMembers(membersText, issues, localRoster, config).members;
            }
        } else {
            out.members = buildManualOnlyMembers(membersText, issues, localRoster, config).members;
        }
    }

    if (out.live && out.liveRoleCount && !localRoster.size) {
        out.roster = new Set(out.members.filter(m => m.live).map(m => m.id));
    }

    if (growthText !== null) out.growth = buildGrowth(growthText, out.members, issues);
    if (warsText !== null) out.wars = buildWars(warsText, issues);
    return out;
}
