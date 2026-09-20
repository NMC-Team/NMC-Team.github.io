import { boot, $, $$, fmtCompact, fmt, sum, setMetric } from './common.js';
import { loadData } from './data.js';

await boot('home');

/* Module search ---------------------------------------------------------- */
const input = $('#searchInput');
const cards = $$('#cardsGrid .card');
const count = $('#moduleCount');
const none = $('#noResults');

input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    let visible = 0;
    for (const card of cards) {
        const hay = `${card.querySelector('h2').textContent} ${card.querySelector('p').textContent} ${card.dataset.keywords || ''}`.toLowerCase();
        const show = !q || hay.includes(q);
        card.hidden = !show;
        card.style.display = show ? '' : 'none';
        if (show) visible++;
    }
    count.textContent = `Showing ${visible} module${visible === 1 ? '' : 's'}`;
    none.hidden = visible !== 0;
});

/* Snapshot metrics ------------------------------------------------------- */
try {
    const { members, wars, roster, config } = await loadData(['members', 'wars']);
    const { metPct } = config.kpi;
    const onTarget = members.filter(m => m.quota > 0 && (m.merits / m.quota) * 100 >= metPct).length;
    const withQuota = members.filter(m => m.quota > 0).length;
    const wins = wars.filter(w => w.outcome === 'VICTORY').length;

    setMetric('sMembers', fmt(members.length), `${fmt(roster.size)} governor IDs on the roster`);
    setMetric('sMerits', fmtCompact(sum(members.map(m => m.merits))), `+${fmtCompact(sum(members.map(m => m.weekly)))} this week`, 'text-cyan');
    setMetric('sKpi', withQuota ? `${Math.round((onTarget / withQuota) * 100)}%` : '—', `${onTarget} of ${withQuota} at ${metPct}%+ of quota`, 'text-emerald');
    setMetric('sWars', String(wars.length), `${wins} won · ${wars.length - wins} lost`, 'text-gold');
} catch (err) {
    // Module pages show the detailed error; on the home page just hide the strip.
    console.error(err);
    $('#snapshot').hidden = true;
}
