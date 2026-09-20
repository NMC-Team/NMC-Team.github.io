/* ==========================================================================
   common.js — site chrome (header/footer/nav), clock, formatting helpers.
   Edit SITE and PAGES below to rename the site or add/remove sections.
   ========================================================================== */

import { ROOT, loadConfig, DataError } from './data.js';

export const SITE = {
    tag: 'NMC',
    title: 'Alliance Hub',
    alliance: 'No Mercy',
    kingdom: 820,
};

// `path` is relative to the site root. Every page is a folder with an index.html.
export const PAGES = [
    { key: 'home',   label: 'Home',    path: '' },
    { key: 'merits', label: 'Merits',  path: 'merits/' },
    { key: 'kpi',    label: 'KPI',     path: 'kpi/' },
    { key: 'spider', label: 'Spider',  path: 'spider/' },
    { key: 'growth', label: 'Growth',  path: 'growth/' },
    { key: 'war',    label: 'War P&L', path: 'war-pl/' },
];

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---- Formatting -------------------------------------------------------- */

/** Escapes text before it goes into innerHTML. Always use on data from CSV files. */
export function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

export const fmt = n => Math.round(n).toLocaleString('en-US');

/** 1_480_000 -> "1.48M", 148_500_000 -> "148.5M", 12_345 -> "12.3K" */
export function fmtCompact(n) {
    const abs = Math.abs(n);
    const trim = s => s.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
    if (abs >= 1e9) return trim((n / 1e9).toFixed(2)) + 'B';
    if (abs >= 1e6) return trim((n / 1e6).toFixed(abs >= 1e7 ? 1 : 2)) + 'M';
    if (abs >= 1e3) return trim((n / 1e3).toFixed(1)) + 'K';
    return String(Math.round(n));
}

export const initial = name => (String(name).trim().charAt(0) || '?').toUpperCase();
export const sum = arr => arr.reduce((a, b) => a + b, 0);
export const mean = arr => (arr.length ? sum(arr) / arr.length : 0);

export function roleBadge(role) {
    const cls = ['R5', 'R4', 'R3', 'R2', 'R1'].includes(role) ? `role-${role.toLowerCase()}` : 'role-other';
    return `<span class="role-badge ${cls}">${esc(role || '—')}</span>`;
}

/** Avatar + name + governor ID, used in every member table. */
export function memberCell(m) {
    return `<div class="player-info">
        <div class="player-avatar" aria-hidden="true">${esc(initial(m.name))}</div>
        <div><span class="player-name">${esc(m.name)}</span><span class="player-id">${esc(m.id)}</span></div>
    </div>`;
}

export function memberMatches(m, query) {
    const q = query.toLowerCase().trim();
    return !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.title.toLowerCase().includes(q);
}

/* ---- Chrome ------------------------------------------------------------ */

const ICON_MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

function link(page, active) {
    const href = new URL(page.path, ROOT).href;
    return `<a href="${href}"${page.key === active ? ' class="active" aria-current="page"' : ''}>${esc(page.label)}</a>`;
}

export function mountChrome(active) {
    const header = $('#site-header');
    if (header) {
        header.innerHTML = `
        <div class="nav-container">
            <a href="${new URL('', ROOT).href}" class="brand" aria-label="${esc(SITE.title)} home">
                <span class="brand-badge">${esc(SITE.tag)}</span>
                <span class="brand-title">${esc(SITE.title)}</span>
            </a>
            <nav class="nav-links" id="navLinks" aria-label="Main">${PAGES.map(p => link(p, active)).join('')}</nav>
            <div class="nav-right">
                <div class="utc-clock" title="Server time (UTC)"><span class="utc-dot"></span><span id="utcTime">UTC --:--</span></div>
                <button class="nav-toggle" id="navToggle" type="button" aria-label="Toggle menu" aria-expanded="false" aria-controls="navLinks">${ICON_MENU}</button>
            </div>
        </div>`;

        const toggle = $('#navToggle'), nav = $('#navLinks');
        toggle.addEventListener('click', () => {
            const open = nav.classList.toggle('open');
            toggle.setAttribute('aria-expanded', String(open));
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
        });
    }

    const footer = $('#site-footer');
    if (footer) {
        footer.innerHTML = `
        <div class="footer-content">
            <div><strong>${esc(SITE.alliance)} ${esc(SITE.title)}</strong> — Kingdom ${SITE.kingdom}</div>
            <div class="footer-links">${PAGES.map(p => link(p, null)).join('')}</div>
        </div>`;
    }

    startClock();
}

function startClock() {
    const el = $('#utcTime');
    if (!el) return;
    const tick = () => {
        const d = new Date();
        el.textContent = `UTC ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    };
    tick();
    setInterval(tick, 1000);
}

/* ---- Page boot & states ------------------------------------------------ */

/** Mounts header/footer, loads config, shows the demo banner if needed. */
export async function boot(active) {
    mountChrome(active);
    try {
        const config = await loadConfig();
        if (config.demo) {
            const banner = document.createElement('div');
            banner.className = 'demo-banner';
            banner.setAttribute('role', 'status');
            banner.innerHTML = 'Showing <strong>sample data</strong>. Replace the files in <code>data/</code> with your own, then set <code>"demo": false</code> in <code>data/config.json</code>.';
            $('#site-header')?.after(banner);
        }
        return { config };
    } catch (err) {
        showError(err);
        throw err;
    }
}

/** Replaces <main>'s content area with an error box. */
export function showError(err, target = $('main')) {
    if (!target) return;
    const msg = err instanceof DataError ? err.message : `Something went wrong: ${err.message}`;
    target.innerHTML = `<div class="state-box state-error" role="alert"><strong>Couldn't load this page</strong>${esc(msg)}</div>`;
}

/** Shows (or clears) the collapsible list of data warnings above a table. */
export function renderIssues(issues, slot = $('#issues')) {
    if (!slot) return;
    if (!issues.length) { slot.innerHTML = ''; return; }
    const shown = issues.slice(0, 25);
    slot.innerHTML = `<details class="issues"><summary>${issues.length} data warning${issues.length === 1 ? '' : 's'} — click to review</summary>
        <ul>${shown.map(i => `<li>${esc(i)}</li>`).join('')}${issues.length > shown.length ? `<li>…and ${issues.length - shown.length} more.</li>` : ''}</ul></details>`;
}

export function setMetric(id, value, sub, colorClass = '') {
    const v = document.getElementById(id + 'Value'), s = document.getElementById(id + 'Sub');
    if (v) { v.textContent = value; v.className = 'metric-value ' + colorClass; }
    if (s && sub !== undefined) s.textContent = sub;
}

/** Wraps an async load so a failure shows the error box instead of a blank page. */
export async function guarded(fn) {
    try { return await fn(); } catch (err) { console.error(err); showError(err); return null; }
}
