import { boot, $, esc, mean, renderIssues, guarded } from './common.js';
import { loadData, SPIDER_KEYS } from './data.js';

await boot('spider');

const LABELS = {
    offense: ['Offense', 'Offense Output'],
    survivability: ['Survivability', 'Survivability & K/D'],
    rally: ['Rally Leadership', 'Rally Leadership'],
    merit: ['Merit Velocity', 'Merit Velocity'],
    mobility: ['Field Mobility', 'Field Mobility'],
    activity: ['Activity Rate', 'Activity Rate'],
};
const AVG = '__AVG__';
const CX = 220, CY = 220, R = 140;

const data = await guarded(() => loadData(['members']));
if (data) {
    renderIssues(data.issues);
    const pool = data.members.filter(m => m.spider).sort((a, b) => b.merits - a.merits);

    if (!pool.length) {
        $('#spiderEmpty').innerHTML = `<div class="state-box"><strong>No radar scores yet</strong>Fill in all six score columns (<code>${SPIDER_KEYS.join(', ')}</code>, each 0–100) for at least one member in <code>data/members.csv</code>.</div>`;
    } else {
        $('#spiderApp').hidden = false;

        const avgStats = Object.fromEntries(SPIDER_KEYS.map(k => [k, Math.round(mean(pool.map(m => m.spider[k])))]));
        const avgLabel = `Average of ${pool.length} tracked member${pool.length === 1 ? '' : 's'}`;
        const label = m => (m.title ? `${m.name} (${m.title})` : m.name);

        const memberOptions = pool.map(m => `<option value="${esc(m.id)}">${esc(label(m))}</option>`).join('');
        $('#p1Select').innerHTML = memberOptions;
        $('#p2Select').innerHTML = `<option value="${AVG}">${esc(avgLabel)}</option>${memberOptions}`;

        const lookup = key => key === AVG
            ? { name: 'Average', stats: avgStats, isAvg: true }
            : (m => ({ name: m.name, stats: m.spider, isAvg: false }))(pool.find(x => x.id === key));

        const point = (i, pct) => {
            const a = (Math.PI * 2 / SPIDER_KEYS.length) * i - Math.PI / 2;
            const r = (pct / 100) * R;
            return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
        };
        const poly = pts => pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

        function render() {
            const p1 = lookup($('#p1Select').value), p2 = lookup($('#p2Select').value);
            const n = SPIDER_KEYS.length;

            let svg = '';
            // Grid rings
            for (const level of [20, 40, 60, 80, 100]) {
                svg += `<polygon points="${poly(SPIDER_KEYS.map((_, i) => point(i, level)))}" fill="${level === 100 ? 'rgba(255,255,255,0.02)' : 'none'}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
            }
            // Axes + labels
            SPIDER_KEYS.forEach((k, i) => {
                const o = point(i, 100), l = point(i, 120);
                svg += `<line x1="${CX}" y1="${CY}" x2="${o.x.toFixed(1)}" y2="${o.y.toFixed(1)}" stroke="rgba(255,255,255,0.1)"/>`;
                svg += `<text class="chart-text" x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${LABELS[k][0]}</text>`;
            });

            const c1 = SPIDER_KEYS.map((k, i) => point(i, p1.stats[k]));
            const c2 = SPIDER_KEYS.map((k, i) => point(i, p2.stats[k]));

            svg += `<polygon points="${poly(c2)}" fill="rgba(245,158,11,0.15)" stroke="var(--accent-gold)" stroke-width="2" ${p2.isAvg ? 'stroke-dasharray="4,4"' : ''}/>`;
            svg += `<polygon points="${poly(c1)}" fill="rgba(6,182,212,0.2)" stroke="var(--accent-cyan)" stroke-width="2.5"/>`;
            c2.forEach((c, i) => { svg += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="var(--accent-gold)"><title>${esc(p2.name)} — ${LABELS[SPIDER_KEYS[i]][0]}: ${p2.stats[SPIDER_KEYS[i]]}</title></circle>`; });
            c1.forEach((c, i) => { svg += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4" fill="var(--accent-cyan)" stroke="#080a0f" stroke-width="1.5"><title>${esc(p1.name)} — ${LABELS[SPIDER_KEYS[i]][0]}: ${p1.stats[SPIDER_KEYS[i]]}</title></circle>`; });
            $('#radarSvg').innerHTML = svg;

            // Breakdown bars
            const p2Name = p2.isAvg ? 'Average' : p2.name;
            let totalDiff = 0;
            $('#statBarsContainer').innerHTML = SPIDER_KEYS.map(k => {
                const v1 = p1.stats[k], v2 = p2.stats[k], diff = v1 - v2;
                totalDiff += diff;
                const delta = `<span class="delta-badge ${diff >= 0 ? 'delta-pos' : 'delta-neg'}">${diff >= 0 ? '+' : ''}${diff}</span>`;
                return `<div class="stat-item">
                    <div class="stat-header">
                        <span class="stat-name">${LABELS[k][1]}</span>
                        <div class="stat-values">
                            <span style="color:var(--accent-cyan);font-weight:700">${esc(p1.name)}: ${v1}</span>
                            <span style="color:var(--text-dim);margin:0 4px">|</span>
                            <span style="color:var(--accent-gold)">${esc(p2Name)}: ${v2}</span>${delta}
                        </div>
                    </div>
                    <div class="bar-stack">
                        <div class="bar-container"><div class="bar-fill bar-fill-1" style="width:${v1}%"></div></div>
                        <div class="bar-container"><div class="bar-fill bar-fill-2" style="width:${v2}%"></div></div>
                    </div>
                </div>`;
            }).join('');

            const avgDiff = totalDiff / n;
            const diffEl = $('#diffLabel');
            diffEl.textContent = `${avgDiff >= 0 ? '+' : ''}${avgDiff.toFixed(1)} avg difference`;
            diffEl.className = 'panel-note ' + (avgDiff >= 0 ? 'text-emerald' : 'text-rose');
        }

        $('#p1Select').addEventListener('change', render);
        $('#p2Select').addEventListener('change', render);
        // Default view: top member vs. the tracked average.
        $('#p2Select').value = AVG;
        render();
    }
}
