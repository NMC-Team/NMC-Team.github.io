import { boot, $, esc, mean, renderIssues, setMetric, guarded } from './common.js';
import { loadData } from './data.js';

const { config } = await boot('growth');

const AVG = '__AVG__';
const W = 1000, H = 340, PAD = { l: 64, r: 64, t: 30, b: 44 };
const GW = W - PAD.l - PAD.r, GH = H - PAD.t - PAD.b;

/** Picks a tidy axis maximum: 4 grid rows, each a "nice" step (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ). */
function niceMax(v) {
    if (v <= 0) return 4;
    const raw = v / 4;
    const exp = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / exp;
    const step = ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(s => f <= s + 1e-9) ?? 10) * exp;
    return step * 4;
}
const tick = v => String(+v.toFixed(2));

const data = await guarded(() => loadData(['growth']));
if (data) {
    renderIssues(data.issues);
    const { members, growth } = data;
    const pool = members.filter(m => growth[m.id]).sort((a, b) => b.merits - a.merits);

    if (!pool.length) {
        setMetric('gPower', '—', 'No growth data yet');
        setMetric('gMerits', '—', 'No growth data yet');
        setMetric('gAvg', '—', 'No growth data yet');
        setMetric('gPhase', '—', 'No growth data yet');
        $('#growthEmpty').innerHTML = `<div class="state-box"><strong>No growth history yet</strong>Add weekly rows to <code>data/growth.csv</code> (columns: <code>id, week, power_m, merits_m</code>).</div>`;
    } else {
        $('#growthApp').hidden = false;
        $('#seasonName').textContent = config.season.name;

        const maxWeek = Math.max(...pool.flatMap(m => Object.keys(growth[m.id]).map(Number)), config.season.weeks.length);
        const weeks = Array.from({ length: maxWeek }, (_, i) => ({
            label: config.season.weeks[i]?.label ?? `Week ${i + 1}`,
            phase: config.season.weeks[i]?.phase ?? '—',
        }));

        $('#memberSelect').innerHTML =
            `<option value="${AVG}">Average of ${pool.length} tracked member${pool.length === 1 ? '' : 's'}</option>` +
            pool.map(m => `<option value="${esc(m.id)}">${esc(m.title ? `${m.name} (${m.title})` : m.name)}</option>`).join('');

        /** Returns [{power, merits} | null] indexed by week-1. */
        function series(key) {
            if (key !== AVG) return weeks.map((_, i) => growth[key][i + 1] ?? null);
            return weeks.map((_, i) => {
                const pts = pool.map(m => growth[m.id][i + 1]).filter(Boolean);
                return pts.length ? { power: mean(pts.map(p => p.power)), merits: mean(pts.map(p => p.merits)) } : null;
            });
        }

        /** Builds SVG path segments, breaking the line wherever a week has no data. */
        function linePath(pts) {
            let d = '', pen = false;
            for (const p of pts) {
                if (!p) { pen = false; continue; }
                d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
                pen = true;
            }
            return d.trim();
        }

        function render() {
            const key = $('#memberSelect').value, mode = $('#viewMode').value;
            const s = series(key);
            const filled = s.map((p, i) => (p ? { ...p, i } : null)).filter(Boolean);
            const first = filled[0], last = filled[filled.length - 1];

            // ---- Metrics
            const spanWeeks = last.i - first.i;
            setMetric('gPower', `${last.power.toFixed(1)}M`, `+${(last.power - first.power).toFixed(1)}M since ${weeks[first.i].label}`, 'text-cyan');
            setMetric('gMerits', `${last.merits.toFixed(1)}M`, `+${(last.merits - first.merits).toFixed(1)}M since ${weeks[first.i].label}`, 'text-gold');
            setMetric('gAvg', spanWeeks ? `${(last.power - first.power) / spanWeeks >= 0 ? '+' : ''}${((last.power - first.power) / spanWeeks).toFixed(1)}M` : '—', 'Power per week, start to latest', 'text-emerald');
            setMetric('gPhase', weeks[last.i].label, weeks[last.i].phase);

            $('#legPower').style.display = mode === 'MERITS' ? 'none' : 'flex';
            $('#legMerits').style.display = mode === 'POWER' ? 'none' : 'flex';

            // ---- Scales
            const showP = mode !== 'MERITS', showM = mode !== 'POWER';
            const maxP = niceMax(Math.max(...filled.map(p => p.power)));
            const maxM = niceMax(Math.max(...filled.map(p => p.merits)));
            const xAt = i => PAD.l + (weeks.length > 1 ? (GW / (weeks.length - 1)) * i : GW / 2);
            const yP = v => PAD.t + GH - (v / maxP) * GH;
            const yM = v => PAD.t + GH - (v / maxM) * GH;

            let svg = '';
            // Horizontal grid + axis ticks
            for (let g = 0; g <= 4; g++) {
                const y = PAD.t + (GH / 4) * g;
                svg += `<line x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}" stroke="rgba(255,255,255,0.05)"/>`;
                const frac = 1 - g / 4;
                if (showP) svg += `<text class="chart-text chart-text-power" x="${PAD.l - 10}" y="${y + 4}" text-anchor="end">${tick(maxP * frac)}M</text>`;
                if (showM) svg += `<text class="chart-text chart-text-merits" x="${showP ? W - PAD.r + 10 : PAD.l - 10}" y="${y + 4}" text-anchor="${showP ? 'start' : 'end'}">${tick(maxM * frac)}M</text>`;
            }
            // Vertical guides + week labels
            weeks.forEach((w, i) => {
                const x = xAt(i);
                svg += `<line x1="${x}" y1="${PAD.t}" x2="${x}" y2="${H - PAD.b}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3,3"/>`;
                svg += `<text class="chart-text" x="${x}" y="${H - 14}" text-anchor="middle">${esc(w.label)}</text>`;
            });

            const pts = f => s.map((p, i) => (p ? { x: xAt(i), y: f(p) } : null));

            if (showP) {
                const P = pts(p => yP(p.power));
                const solid = P.filter(Boolean);
                if (solid.length > 1) svg += `<path d="M${solid[0].x} ${PAD.t + GH} ${solid.map(p => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} L${solid[solid.length - 1].x} ${PAD.t + GH} Z" fill="rgba(6,182,212,0.1)"/>`;
                svg += `<path d="${linePath(P)}" fill="none" stroke="var(--accent-cyan)" stroke-width="3" stroke-linejoin="round"/>`;
                s.forEach((p, i) => { if (p) svg += `<circle cx="${xAt(i)}" cy="${yP(p.power).toFixed(1)}" r="4.5" fill="var(--accent-cyan)" stroke="#080a0f" stroke-width="1.5"><title>${esc(weeks[i].label)} · ${esc(weeks[i].phase)} — Power ${p.power.toFixed(1)}M</title></circle>`; });
            }
            if (showM) {
                const M = pts(p => yM(p.merits));
                svg += `<path d="${linePath(M)}" fill="none" stroke="var(--accent-gold)" stroke-width="2.5" stroke-linejoin="round" ${showP ? 'stroke-dasharray="5,4"' : ''}/>`;
                s.forEach((p, i) => { if (p) svg += `<circle cx="${xAt(i)}" cy="${yM(p.merits).toFixed(1)}" r="4.5" fill="var(--accent-gold)" stroke="#080a0f" stroke-width="1.5"><title>${esc(weeks[i].label)} · ${esc(weeks[i].phase)} — Merits ${p.merits.toFixed(2)}M</title></circle>`; });
            }
            $('#timelineSvg').innerHTML = svg;

            // ---- Log table
            let prev = null;
            $('#logTableBody').innerHTML = weeks.map((w, i) => {
                const p = s[i];
                if (!p) { prev = null; return `<tr><td style="font-weight:600">${esc(w.label)}</td><td class="text-muted">${esc(w.phase)}</td><td colspan="4" class="text-muted">No data</td></tr>`; }
                const delta = (cur, before, digits) => {
                    if (!before) return '<span class="text-muted">—</span>';
                    const d = cur - before;
                    return `<span class="${d >= 0 ? 'text-emerald' : 'text-rose'}" style="font-weight:700">${d >= 0 ? '+' : ''}${d.toFixed(digits)}M</span>`;
                };
                const row = `<tr>
                    <td style="font-weight:600">${esc(w.label)}</td>
                    <td class="text-muted">${esc(w.phase)}</td>
                    <td class="num-cell text-cyan">${p.power.toFixed(1)}M</td>
                    <td class="num-cell text-gold">${p.merits.toFixed(2)}M</td>
                    <td class="num-cell">${delta(p.power, prev?.power, 1)}</td>
                    <td class="num-cell">${delta(p.merits, prev?.merits, 2)}</td>
                </tr>`;
                prev = p;
                return row;
            }).join('');
        }

        $('#memberSelect').addEventListener('change', render);
        $('#viewMode').addEventListener('change', render);
        render();
    }
}
