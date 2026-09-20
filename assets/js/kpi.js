import { boot, $, fmt, mean, memberCell, memberMatches, renderIssues, setMetric, guarded } from './common.js';
import { loadData } from './data.js';

const { config } = await boot('kpi');
const { exceedingPct, metPct, kdTarget } = config.kpi;

const pctOf = m => (m.merits / m.quota) * 100;
const statusOf = m => {
    const p = pctOf(m);
    return p >= exceedingPct ? 'EXCEEDING' : p >= metPct ? 'MET' : 'BELOW';
};

const data = await guarded(() => loadData(['members']));
if (data) {
    // Members without a quota can't be scored — they're skipped and reported.
    const scored = data.members.filter(m => m.quota > 0);
    const skipped = data.members.length - scored.length;
    if (skipped) data.issues.push(`${skipped} member${skipped === 1 ? ' has' : 's have'} no quota in members.csv and ${skipped === 1 ? 'is' : 'are'} not shown on this page.`);
    renderIssues(data.issues);

    const counts = { EXCEEDING: 0, MET: 0, BELOW: 0 };
    scored.forEach(m => counts[statusOf(m)]++);
    const onTarget = counts.EXCEEDING + counts.MET;
    const avgKd = mean(scored.map(m => m.kd));

    setMetric('kCompliance', scored.length ? `${Math.round((onTarget / scored.length) * 100)}%` : '—',
        `${onTarget} of ${scored.length} members on target (≥ ${metPct}%)`, 'text-emerald');
    setMetric('kKd', scored.length ? avgKd.toFixed(2) : '—', `Target: ≥ ${kdTarget.toFixed(2)}`, !scored.length ? '' : avgKd >= kdTarget ? 'text-emerald' : 'text-rose');
    setMetric('kExceed', String(counts.EXCEEDING), `≥ ${exceedingPct}% quota achievement`, 'text-cyan');
    setMetric('kBelow', String(counts.BELOW), `< ${metPct}% of quota met`, counts.BELOW ? 'text-rose' : '');

    const render = () => {
        const body = $('#kpiBody');
        const query = $('#memberSearch').value, status = $('#statusFilter').value, sort = $('#sortSelect').value;

        const rows = scored
            .filter(m => memberMatches(m, query) && (status === 'ALL' || statusOf(m) === status))
            .sort((a, b) => ({
                'kpi-desc': pctOf(b) - pctOf(a),
                'kpi-asc': pctOf(a) - pctOf(b),
                'kd-desc': b.kd - a.kd,
                'name-asc': a.name.localeCompare(b.name),
            }[sort]));

        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="6" class="empty-row">${scored.length ? 'No members match your filters.' : 'No members with a quota found. Add rows to <code>data/members.csv</code>.'}</td></tr>`;
            return;
        }

        body.innerHTML = rows.map(m => {
            const pct = Math.round(pctOf(m));
            const s = statusOf(m);
            const color = s === 'EXCEEDING' ? 'var(--accent-emerald)' : s === 'MET' ? 'var(--accent-cyan)' : 'var(--accent-rose)';
            const badge = { EXCEEDING: ['status-exceeding', 'Exceeding'], MET: ['status-met', 'Target Met'], BELOW: ['status-below', 'Below Target'] }[s];
            return `<tr>
                <td>${memberCell(m)}</td>
                <td class="num-cell">${fmt(m.quota)}</td>
                <td class="num-cell">${fmt(m.merits)}</td>
                <td class="num-cell ${m.kd >= kdTarget ? '' : 'text-rose'}">${m.kd.toFixed(1)}</td>
                <td><div class="progress-wrapper">
                    <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${Math.min(pct, 100)}%;background:${color}"></div></div>
                    <span class="progress-text" style="color:${color}">${pct}%</span>
                </div></td>
                <td><span class="status-badge ${badge[0]}">${badge[1]}</span></td>
            </tr>`;
        }).join('');
    };

    $('#memberSearch').addEventListener('input', render);
    $('#statusFilter').addEventListener('change', render);
    $('#sortSelect').addEventListener('change', render);
    render();
}
