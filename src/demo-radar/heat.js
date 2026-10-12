// Demo Radar - heatmaps: which points go in (positions, kill/death spots, grenades, smokes, shots) and the
// blurred, colour-mapped grid. Pure (returns RGBA pixels), the renderer turns them into a canvas.
import { currentRoundIdx, idxAt, rangeBounds } from './match.js';

export const HEAT_SIZE = 512;

export const HEAT_TYPES = ['off', 'presence', 'kills', 'deaths', 'grenades', 'smokes', 'shots'];

const buildLut = () => {
    const stops = [[0, [0, 0, 0, 0]], [0.12, [40, 60, 200, 90]], [0.3, [0, 170, 230, 150]], [0.5, [40, 220, 90, 180]], [0.7, [250, 230, 40, 205]], [0.88, [255, 120, 20, 225]], [1, [235, 30, 30, 240]]];
    const lut = new Uint8ClampedArray(256 * 4);

    for (let i = 0; i < 256; i++) {
        const x = i / 255;
        let j = 0;

        while (j < stops.length - 2 && x > stops[j + 1][0]) {
            j++;
        }

        const [a, ca] = stops[j];
        const [b, cb] = stops[j + 1];
        const f = (x - a) / (b - a);

        for (let c = 0; c < 4; c++) {
            lut[i * 4 + c] = ca[c] + (cb[c] - ca[c]) * f;
        }
    }

    return lut;
};

const LUT = buildLut();

/**
 * Normalised map points for a heatmap.
 *
 * @param {object} heat { type, team: 'all'|'0'|'1', side: 'all'|'att'|'def', player: cn or -1 }
 * @param {number} range round index or -1 for the whole demo
 */
export const heatPoints = (m, heat, range) => {
    const points = [];
    const [a, b] = rangeBounds(m, range);
    const A = m.t0 + a;
    const B = m.t0 + b;

    const teamOk = (cn) => {
        if (cn < 0 || cn >= 64) {
            return false;
        }

        if (heat.player >= 0 && cn !== heat.player) {
            return false;
        }

        return heat.team === 'all' || String(m.squadOf[cn]) === heat.team;
    };
    const sideOk = (cn, t) => {
        if (heat.side === 'all') {
            return true;
        }

        const ri = currentRoundIdx(m, t);

        if (ri < 0) {
            return false;
        }

        const round = m.rounds[ri];

        if (round.attackSquad < 0) {
            return true;
        }

        const attacking = m.squadOf[cn] === round.attackSquad;

        return heat.side === 'att' ? attacking : !attacking;
    };
    const inRounds = (t) => {
        const ri = currentRoundIdx(m, t);

        return ri >= 0 && !m.rounds[ri].knife && t <= m.rounds[ri].end;
    };

    if (heat.type === 'presence') {
        const k0 = idxAt(m, A);
        const k1 = idxAt(m, B);

        for (let k = k0; k <= k1; k += 4) {
            const t = m.time[k];

            if (!inRounds(t)) {
                continue;
            }

            for (const p of m.players) {
                const o = k * m.maxSlots + p.slot;

                if (m.st[o] !== 1 || !teamOk(p.cn) || !sideOk(p.cn, t)) {
                    continue;
                }

                points.push(m.toN(m.pos[o * 3], m.pos[o * 3 + 1]));
            }
        }
    } else if (heat.type === 'kills' || heat.type === 'deaths') {
        for (const k of m.kills) {
            if (k.t < A || k.t > B || k.knifeRound) {
                continue;
            }

            if (heat.type === 'kills') {
                if (k.attacker < 0 || k.attacker === k.victim || k.ax == null || !teamOk(k.attacker) || !sideOk(k.attacker, k.t)) {
                    continue;
                }

                points.push(m.toN(k.ax, k.ay));
            } else {
                if (k.vx == null || !teamOk(k.victim) || !sideOk(k.victim, k.t)) {
                    continue;
                }

                points.push(m.toN(k.vx, k.vy));
            }
        }
    } else if (heat.type === 'grenades' || heat.type === 'smokes') {
        for (const g of m.grenades) {
            if (g.t1 < A || g.t0 > B) {
                continue;
            }

            if ((heat.type === 'smokes') !== (g.type === 'smoke')) {
                continue;
            }

            if ((heat.team !== 'all' || heat.player >= 0) && !teamOk(g.thrower)) {
                continue;
            }

            if (g.thrower >= 0 && !sideOk(g.thrower, g.t0)) {
                continue;
            }

            if (!inRounds(g.t0)) {
                continue;
            }

            points.push(m.toN(g.x, g.y));
        }
    } else if (heat.type === 'shots') {
        for (const s of m.shots) {
            if (s.t < A || s.t > B || !teamOk(s.cn) || !sideOk(s.cn, s.t) || !inRounds(s.t)) {
                continue;
            }

            points.push(m.toN(s.x, s.y));
        }
    }

    return points;
};

/**
 * Blurred, colour-mapped heat grid around the map content.
 *
 * @returns {{ rgba: Uint8ClampedArray, size: number, box: { u0: number, v0: number, span: number }, count: number }}
 */
export const heatImage = (m, points, { radius, gain }) => {
    const N = HEAT_SIZE;
    // work in a window around the content so small maps get detail
    const bounds = m.bounds;
    const pad = 0.08;
    const u0 = bounds.minU - (bounds.maxU - bounds.minU) * pad;
    const v0 = bounds.minV - (bounds.maxV - bounds.minV) * pad;
    const span = Math.max(bounds.maxU - bounds.minU, bounds.maxV - bounds.minV) * (1 + 2 * pad);
    const grid = new Float32Array(N * N);

    for (const [u, v] of points) {
        const x = Math.floor((u - u0) / span * N);
        const y = Math.floor((v - v0) / span * N);

        if (x >= 0 && y >= 0 && x < N && y < N) {
            grid[y * N + x] += 1;
        }
    }

    // separable gaussian blur
    const R = Math.max(2, Math.round(radius * N / 512));
    const sigma = R / 2.2;
    const kernel = new Float32Array(2 * R + 1);

    for (let i = -R; i <= R; i++) {
        kernel[i + R] = Math.exp(-(i * i) / (2 * sigma * sigma));
    }

    const tmp = new Float32Array(N * N);

    for (let y = 0; y < N; y++) {
        const row = y * N;

        for (let x = 0; x < N; x++) {
            let sum = 0;

            for (let i = -R; i <= R; i++) {
                const xx = x + i;

                if (xx >= 0 && xx < N) {
                    sum += grid[row + xx] * kernel[i + R];
                }
            }

            tmp[row + x] = sum;
        }
    }

    let max = 0;
    const values = [];

    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            let sum = 0;

            for (let i = -R; i <= R; i++) {
                const yy = y + i;

                if (yy >= 0 && yy < N) {
                    sum += tmp[yy * N + x] * kernel[i + R];
                }
            }

            grid[y * N + x] = sum;
            max = Math.max(max, sum);

            if (sum > 0) {
                values.push(sum);
            }
        }
    }

    // normalise on a high percentile so a single hotspot does not wash everything out
    values.sort((a, b) => a - b);
    const reference = values.length ? values[Math.floor(values.length * 0.995)] || max : 1;
    const gainFactor = gain / 10;
    const rgba = new Uint8ClampedArray(N * N * 4);

    for (let i = 0; i < N * N; i++) {
        if (!grid[i]) {
            continue;
        }

        const value = Math.min(1, Math.pow(grid[i] / reference, 0.75) * gainFactor);
        const li = Math.round(value * 255) * 4;
        rgba[i * 4] = LUT[li];
        rgba[i * 4 + 1] = LUT[li + 1];
        rgba[i * 4 + 2] = LUT[li + 2];
        rgba[i * 4 + 3] = LUT[li + 3];
    }

    return { rgba, size: N, box: { u0, v0, span }, count: points.length };
};

/** Grey movement-density background for maps without an image. */
export const densityImage = (m) => {
    const N = 512;
    const grid = new Float32Array(N * N);

    for (let k = 0; k < m.n; k += 2) {
        for (const p of m.players) {
            const o = k * m.maxSlots + p.slot;

            if (m.st[o] !== 1) {
                continue;
            }

            const [u, v] = m.toN(m.pos[o * 3], m.pos[o * 3 + 1]);
            const x = Math.floor(u * N);
            const y = Math.floor(v * N);

            if (x >= 1 && y >= 1 && x < N - 1 && y < N - 1) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        grid[(y + dy) * N + x + dx] += 1;
                    }
                }
            }
        }
    }

    const rgba = new Uint8ClampedArray(N * N * 4);

    for (let i = 0; i < N * N; i++) {
        if (grid[i]) {
            const value = Math.min(1, Math.log1p(grid[i]) / 4);
            rgba[i * 4] = 70 + 60 * value;
            rgba[i * 4 + 1] = 78 + 62 * value;
            rgba[i * 4 + 2] = 92 + 60 * value;
            rgba[i * 4 + 3] = 255;
        }
    }

    return { rgba, size: N };
};
