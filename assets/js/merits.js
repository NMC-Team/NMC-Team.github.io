import { boot, $, esc, fmt, fmtCompact, sum, mean, roleBadge, memberCell, memberMatches, renderIssues, setMetric, guarded } from './common.js';
import { loadData } from './data.js';

await boot('merits');

let state = null;

async function load(fresh = false) {
    const data = await guarded(() => loadData(['members'], { fresh }));
    if (!data) return;
    state = data;
    renderIssues(data.issues);
    renderMetrics();
    renderTable();
}

function renderMetrics() {
    const { members, roster } = state;
    if (!members.length) {
        setMetric('mTotal', '—', 'No members yet');
        setMetric('mTop', '—', 'No members yet');
        setMetric('mAvg', '—', 'No members yet');
        setMetric('mRoster', `0 / ${roster.size}`, 'Add rows to data/members.csv');
        return;
    }

    const scored = members.filter(m => m.merits != null);
    const weeklyTracked = members.filter(m => m.weekly != null);
    const total = sum(scored.map(m => m.merits));
    const weekly = sum(weeklyTracked.map(m => m.weekly));
    const top = scored.reduce((a, b) => (b.merits > a.merits ? b : a), null);
    const onRoster = members.filter(m => roster.has(m.id)).length;

    setMetric('mTotal', scored.length ? fmtCompact(total) : '—', weeklyTracked.length ? `▲ +${fmtCompact(weekly)} this week` : 'Not supplied by the current CoD API', 'text-emerald');
    setMetric('mTop', top ? top.name : '—', top ? `${fmtCompact(top.merits)} total merits` : 'Merit data not supplied by the current CoD API', 'text-gold');
    setMetric('mAvg', scored.length ? fmtCompact(mean(scored.map(m => m.merits))) : '—', scored.length ? `Across ${scored.length} tracked members` : 'Merit data not supplied by the current CoD API');
    setMetric('mRoster', `${onRoster} / ${roster.size}`, roster.size ? `${Math.round((onRoster / roster.size) * 100)}% of roster IDs have data` : 'No roster IDs configured');
}

function renderTable() {
    const { members } = state;
    const body = $('#leaderboardBody');
    const query = $('#memberSearch').value;
    const role = $('#roleFilter').value;
    const sort = $('#sortSelect').value;

    // Rank is always by merits, so #1 means "most merits" even when sorting by something else.
    const rank = new Map([...members].sort((a, b) => (b.merits ?? -Infinity) - (a.merits ?? -Infinity)).map((m, i) => [m.id, i + 1]));

    const rows = members
        .filter(m => memberMatches(m, query) && (role === 'ALL' || m.role === role))
        .sort((a, b) => ({
            'merits-desc': (b.merits ?? -Infinity) - (a.merits ?? -Infinity),
            'merits-asc': (a.merits ?? Infinity) - (b.merits ?? Infinity),
            'power-desc': b.power - a.power,
            'weekly-desc': (b.weekly ?? -Infinity) - (a.weekly ?? -Infinity),
            'name-asc': a.name.localeCompare(b.name),
        }[sort]));

    if (!rows.length) {
        body.innerHTML = `<tr><td colspan="6" class="empty-row">${members.length ? 'No members match your filters.' : 'No members found. Add rows to <code>data/members.csv</code>.'}</td></tr>`;
        return;
    }

    body.innerHTML = rows.map(m => {
        const r = rank.get(m.id) ?? null;
        return `<tr>
            <td class="rank-num ${r && r <= 3 ? 'top-' + r : ''}">${r ? '#' + r : '—'}</td>
            <td>${memberCell(m)}</td>
            <td>${roleBadge(m.role)}</td>
            <td class="num-cell">${fmt(m.power)}</td>
            <td class="num-cell merit-highlight">${m.merits == null ? '—' : fmt(m.merits)}</td>
            <td class="num-cell weekly-gain">${m.weekly == null ? '—' : '+' + fmt(m.weekly)}</td>
        </tr>`;
    }).join('');
}

['input', 'change'].forEach(evt => {
    $('#memberSearch').addEventListener(evt, () => state && renderTable());
    $('#roleFilter').addEventListener(evt, () => state && renderTable());
    $('#sortSelect').addEventListener(evt, () => state && renderTable());
});

$('#syncBtn').addEventListener('click', async () => {
    const btn = $('#syncBtn'), label = btn.querySelector('span');
    btn.disabled = true; label.textContent = 'Reloading…';
    await load(true);
    btn.disabled = false; label.textContent = 'Reload data';
    const d = new Date();
    $('#syncNote').textContent = `Reloaded ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
});

await load();
