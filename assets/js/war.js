import { boot, $, esc, fmt, fmtCompact, sum, renderIssues, setMetric, guarded } from './common.js';
import { loadData } from './data.js';

await boot('war');

const TYPE_BADGE = {
    RALLY: ['type-rally', 'Rally Attack'],
    GARRISON: ['type-garrison', 'Garrison Def'],
    FIELD: ['type-field', 'Open Field'],
};

const fmtRss = m => (m >= 1000 ? `${(m / 1000).toFixed(2).replace(/\.?0+$/, '')}B` : `${fmt(m)}M`);

const data = await guarded(() => loadData(['wars']));
if (data) {
    const { wars } = data;
    renderIssues(data.issues);

    const kills = sum(wars.map(w => w.kills));
    const deaths = sum(wars.map(w => w.deaths));
    const rss = sum(wars.map(w => w.rssM));
    // Weighted by RSS spent so a huge battle counts for more than a skirmish.
    const ratio = rss ? sum(wars.map(w => w.ratio * w.rssM)) / rss : 0;
    const speedups = sum(wars.map(w => w.speedupDays));

    setMetric('wKills', fmtCompact(kills), `Across ${wars.length} engagement${wars.length === 1 ? '' : 's'}`, 'text-emerald');
    setMetric('wDeaths', fmtCompact(deaths), `${deaths ? (kills / deaths).toFixed(1) : '—'} kills per alliance death`, 'text-rose');
    setMetric('wRatio', wars.length ? `${ratio.toFixed(2)} : 1` : '—', 'Weighted by resources spent', 'text-cyan');
    setMetric('wSpeed', `${fmt(speedups)} Days`, `${fmtRss(rss)} RSS spent in total`);

    const render = () => {
        const body = $('#warBody');
        const q = $('#warSearch').value.toLowerCase().trim();
        const type = $('#typeFilter').value, outcome = $('#outcomeFilter').value;

        const rows = wars.filter(w =>
            (!q || w.title.toLowerCase().includes(q)) &&
            (type === 'ALL' || w.type === type) &&
            (outcome === 'ALL' || w.outcome === outcome));

        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="7" class="empty-row">${wars.length ? 'No battles match your filters.' : 'No battles logged yet. Add rows to <code>data/wars.csv</code>.'}</td></tr>`;
            return;
        }

        body.innerHTML = rows.map(w => {
            const [cls, label] = TYPE_BADGE[w.type] || ['type-field', w.type || 'Unknown'];
            const win = w.outcome === 'VICTORY';
            return `<tr>
                <td><div class="battle-info"><span class="battle-title">${esc(w.title)}</span><span class="battle-date">${esc(w.date)}</span></div></td>
                <td><span class="badge-type ${cls}">${esc(label)}</span></td>
                <td class="num-cell text-emerald">${fmt(w.kills)}</td>
                <td class="num-cell text-rose">${fmt(w.deaths)}</td>
                <td class="num-cell">${fmtRss(w.rssM)}</td>
                <td class="num-cell text-cyan">${w.ratio.toFixed(2)}</td>
                <td><span class="outcome-badge ${win ? 'outcome-victory' : 'outcome-defeat'}">${win ? 'Victory' : 'Defeat'}</span></td>
            </tr>`;
        }).join('');
    };

    $('#warSearch').addEventListener('input', render);
    $('#typeFilter').addEventListener('change', render);
    $('#outcomeFilter').addEventListener('change', render);
    render();
}
