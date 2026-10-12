// Demo Radar - canvas drawing of the 2D map and the timeline lanes. Takes a 2D context and plain scene data;
// owns no state.
import { lowerBound, formatClock } from './format.js';
import { currentRoundIdx, idxAt, rangeBounds, statesAt } from './match.js';

export const TEAM_COLORS = ['#e5484d', '#4c8dff'];
export const TEAM_COLORS_RGB = [[229, 72, 77], [76, 141, 255]];
export const NEUTRAL_COLOR = '#9aa3b5';
export const teamColor = (squad) => (squad >= 0 ? TEAM_COLORS[squad] : NEUTRAL_COLOR);

const SMOKE_RADIUS = 250;
const FRAG_RADIUS = 256;
const FLASH_RADIUS = 180;
const FONT = 'Inter, system-ui, sans-serif';

const roundRect = (c, x, y, w, h, r) => {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
};

export const toScreen = (view, u, v) => [view.ox + u * view.s, view.oy + v * view.s];
export const fromScreen = (view, x, y) => [(x - view.ox) / view.s, (y - view.oy) / view.s];

/** View (scale + offset in device pixels) that fits the players' area into a W x H canvas. */
export const fitView = (m, W, H) => {
    const b = m.bounds;
    const pad = 0.06;
    const bw = (b.maxU - b.minU) * (1 + 2 * pad);
    const bh = (b.maxV - b.minV) * (1 + 2 * pad);
    const s = Math.min(W / bw, H / bh);

    return { s, ox: W / 2 - ((b.minU + b.maxU) / 2) * s, oy: H / 2 - ((b.minV + b.maxV) / 2) * s };
};

/** Zooms by factor f around a screen point (device pixels). */
export const zoomView = (view, f, sx, sy) => {
    const s = Math.min(Math.max(view.s * f, 50), 40000);
    const k = s / view.s;

    return { s, ox: sx - (sx - view.ox) * k, oy: sy - (sy - view.oy) * k };
};

/** Living player closest to a screen point (within 14 px), or null. */
export const hitPlayer = (m, view, T, sx, sy, dpr) => {
    const { states } = statesAt(m, T);
    let best = null;
    let bestDistance = (14 * dpr) ** 2;

    for (const s of states) {
        if (s.st !== 1) {
            continue;
        }

        const [u, v] = m.toN(s.x, s.y);
        const [x, y] = toScreen(view, u, v);
        const distance = (x - sx) ** 2 + (y - sy) ** 2;

        if (distance < bestDistance) {
            bestDistance = distance;
            best = { cn: s.p.cn, s };
        }
    }

    return best;
};

/**
 * Draws one frame of the map.
 *
 * @param {object} scene { m, T, view, dpr, layers, heatOn, showPlayers, showGrenades, selected, mapImage,
 *                         background, heat: { canvas, box } | null, strokes }
 */
export const drawMap = (ctx, scene) => {
    const { m, T, view: v, dpr: d, layers } = scene;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07080b';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;

    if (layers.mapImage) {
        if (scene.mapImage) {
            if (m.imgRot) {
                ctx.save();
                ctx.translate(v.ox + v.s / 2, v.oy + v.s / 2);
                ctx.rotate(m.imgRot * Math.PI / 180);
                ctx.drawImage(scene.mapImage, -v.s / 2, -v.s / 2, v.s, v.s);
                ctx.restore();
            } else {
                ctx.drawImage(scene.mapImage, v.ox, v.oy, v.s, v.s);
            }

            // darken so players, smokes and heat stand out
            ctx.fillStyle = scene.heatOn ? 'rgba(7,8,11,0.55)' : 'rgba(7,8,11,0.38)';
            ctx.fillRect(v.ox, v.oy, v.s, v.s);
        } else if (scene.background) {
            ctx.drawImage(scene.background, v.ox, v.oy, v.s, v.s);
        }
    }

    if (scene.heatOn && scene.heat) {
        const box = scene.heat.box;
        const [x0, y0] = toScreen(v, box.u0, box.v0);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(scene.heat.canvas, x0, y0, box.span * v.s, box.span * v.s);
        ctx.globalAlpha = 1;
    }

    const ri = currentRoundIdx(m, T);
    const round = ri >= 0 ? m.rounds[ri] : null;
    const roundStart = round ? round.start : m.t0;
    const scaleR = (r) => r * m.unitsToN * v.s;
    const P = (x, y) => {
        const [a, b] = m.toN(x, y);

        return toScreen(v, a, b);
    };
    const showPlayers = scene.showPlayers;

    // bomb sites
    if (layers.bomb) {
        for (const site of m.sites) {
            const [x, y] = P(site.x, site.y);
            const size = 13 * d;
            ctx.fillStyle = '#8f1d2c';
            ctx.strokeStyle = '#d24a5a';
            ctx.lineWidth = d;
            roundRect(ctx, x - size, y - size, size * 2, size * 2, 3 * d);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = `700 ${13 * d}px ${FONT}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(site.label || '?', x, y + 0.5 * d);
        }
    }

    // grenades: smoke clouds and flight paths
    if (scene.showGrenades) {
        for (const g of m.grenades) {
            if (g.t0 > T) {
                break;
            }

            const end = g.type === 'smoke' ? g.cloudEnd : g.t1 + 800;

            if (T > end) {
                continue;
            }

            if (T < g.t1) {
                // in flight
                const color = g.type === 'smoke' ? '#cfd6e2' : g.type === 'flash' ? '#f4f0b0' : '#ff8a3d';
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.65;
                ctx.lineWidth = 1.2 * d;
                ctx.setLineDash([3 * d, 3 * d]);
                ctx.beginPath();
                let current = null;

                for (let i = 0; i < g.path.length; i++) {
                    const [t, x, y] = g.path[i];

                    if (t > T) {
                        if (i > 0) {
                            const [tp, xp, yp] = g.path[i - 1];
                            const f = (T - tp) / (t - tp);
                            current = [xp + (x - xp) * f, yp + (y - yp) * f];
                            const [sx, sy] = P(current[0], current[1]);
                            ctx.lineTo(sx, sy);
                        }

                        break;
                    }

                    const [sx, sy] = P(x, y);

                    if (i === 0) {
                        ctx.moveTo(sx, sy);
                    } else {
                        ctx.lineTo(sx, sy);
                    }

                    current = [x, y];
                }

                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;

                if (current) {
                    const [sx, sy] = P(current[0], current[1]);
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(sx, sy, 3 * d, 0, 7);
                    ctx.fill();
                    ctx.strokeStyle = '#000a';
                    ctx.lineWidth = d;
                    ctx.stroke();
                }
            } else if (g.type === 'smoke') {
                const age = T - g.t1;
                const life = g.cloudEnd - g.t1;
                const alpha = Math.min(1, age / 2000) * Math.min(1, (life - age) / 4000);
                const [sx, sy] = P(g.x, g.y);
                const r = scaleR(SMOKE_RADIUS) * Math.min(1, 0.4 + age / 2500);
                const gradient = ctx.createRadialGradient(sx, sy, r * 0.1, sx, sy, r);
                gradient.addColorStop(0, `rgba(215,222,232,${0.75 * alpha})`);
                gradient.addColorStop(0.7, `rgba(190,198,210,${0.55 * alpha})`);
                gradient.addColorStop(1, 'rgba(180,188,200,0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(sx, sy, r, 0, 7);
                ctx.fill();
            } else {
                const age = (T - g.t1) / 800;
                const [sx, sy] = P(g.x, g.y);
                const r = scaleR(g.type === 'flash' ? FLASH_RADIUS : FRAG_RADIUS) * (0.3 + 0.7 * age);
                ctx.strokeStyle = g.type === 'flash' ? `rgba(255,255,220,${1 - age})` : `rgba(255,120,40,${1 - age})`;
                ctx.lineWidth = 2 * d;
                ctx.beginPath();
                ctx.arc(sx, sy, r, 0, 7);
                ctx.stroke();
                ctx.fillStyle = g.type === 'flash' ? `rgba(255,255,230,${0.25 * (1 - age)})` : `rgba(255,110,30,${0.18 * (1 - age)})`;
                ctx.fill();
            }
        }
    }

    // death markers for this round
    if (layers.deaths && round) {
        for (const kill of m.kills) {
            if (kill.t < roundStart) {
                continue;
            }

            if (kill.t > T) {
                break;
            }

            if (kill.vx == null) {
                continue;
            }

            const [x, y] = P(kill.vx, kill.vy);
            const s = 4 * d;
            ctx.strokeStyle = teamColor(m.squadOf[kill.victim]);
            ctx.globalAlpha = 0.75;
            ctx.lineWidth = 2 * d;
            ctx.beginPath();
            ctx.moveTo(x - s, y - s);
            ctx.lineTo(x + s, y + s);
            ctx.moveTo(x + s, y - s);
            ctx.lineTo(x - s, y + s);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    // kill lines
    if (layers.killLines) {
        const from = lowerBound(m.kills, T - 3000, 't');

        for (let i = from; i < m.kills.length && m.kills[i].t <= T; i++) {
            const kill = m.kills[i];

            if (kill.ax == null || kill.vx == null || kill.attacker === kill.victim) {
                continue;
            }

            const alpha = 1 - (T - kill.t) / 3000;
            const [x1, y1] = P(kill.ax, kill.ay);
            const [x2, y2] = P(kill.vx, kill.vy);
            const squad = m.squadOf[kill.attacker];
            const c = squad >= 0 ? TEAM_COLORS_RGB[squad] : [200, 200, 200];
            ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.85 * alpha})`;
            ctx.lineWidth = 1.6 * d;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.fillStyle = `rgba(255,70,70,${alpha})`;
            ctx.beginPath();
            ctx.arc(x2, y2, 5 * d * (1.2 - alpha * 0.4), 0, 7);
            ctx.fill();
        }
    }

    // bomb
    if (layers.bomb) {
        const k = idxAt(m, T);
        const st = m.bombSt[k];
        const bx = m.bomb[k * 2];
        const by = m.bomb[k * 2 + 1];

        if ((bx || by) && round && T < round.end) {
            const [x, y] = P(bx, by);

            if (st === 2) {
                const pulse = 0.5 + 0.5 * Math.sin(T / 160);
                ctx.fillStyle = `rgba(240,160,32,${0.25 + 0.3 * pulse})`;
                ctx.beginPath();
                ctx.arc(x, y, (10 + 6 * pulse) * d, 0, 7);
                ctx.fill();
            }

            if (st !== 0) {
                ctx.fillStyle = '#f0a020';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = d;
                ctx.beginPath();
                ctx.moveTo(x, y - 6 * d);
                ctx.lineTo(x + 6 * d, y);
                ctx.lineTo(x, y + 6 * d);
                ctx.lineTo(x - 6 * d, y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        }
    }

    const { states, k } = statesAt(m, T);

    // trails
    if (layers.trails && showPlayers) {
        for (const s of states) {
            if (s.st !== 1) {
                continue;
            }

            ctx.strokeStyle = teamColor(s.p.squad);
            ctx.lineWidth = 1.4 * d;
            let previous = null;

            for (let j = Math.max(0, k - 100); j <= k; j += 2) {
                const o = j * m.maxSlots + s.p.slot;

                if (m.st[o] !== 1 || m.time[j] < roundStart) {
                    previous = null;
                    continue;
                }

                const [x, y] = P(m.pos[o * 3], m.pos[o * 3 + 1]);

                if (previous && Math.abs(previous[0] - x) + Math.abs(previous[1] - y) < 80 * d) {
                    ctx.globalAlpha = 0.6 * (1 - (k - j) / 100);
                    ctx.beginPath();
                    ctx.moveTo(previous[0], previous[1]);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                }

                previous = [x, y];
            }
        }

        ctx.globalAlpha = 1;
    }

    // shots
    if (layers.shots && showPlayers) {
        const from = lowerBound(m.shots, T - 140, 't');

        for (let i = from; i < m.shots.length && m.shots[i].t <= T; i++) {
            const shot = m.shots[i];
            const s = states.find((q) => q.p.cn === shot.cn);

            if (!s || s.st !== 1) {
                continue;
            }

            const [x, y] = P(s.x, s.y);
            const [du, dv] = m.dirN(s.yaw);
            const L = 70 * d;
            const gradient = ctx.createLinearGradient(x, y, x + du * L, y + dv * L);
            gradient.addColorStop(0, 'rgba(255,230,140,0.95)');
            gradient.addColorStop(1, 'rgba(255,200,80,0)');
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 1.6 * d;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + du * L, y + dv * L);
            ctx.stroke();
        }
    }

    // players
    if (showPlayers) {
        const r = Math.min(7, Math.max(4, v.s / 220)) * d;
        const labels = [];

        for (const s of states) {
            if (s.st !== 1) {
                continue;
            }

            const [x, y] = P(s.x, s.y);
            const squad = s.p.squad;

            if (layers.cones) {
                const [du, dv] = m.dirN(s.yaw);
                const angle = Math.atan2(dv, du);
                const L = r * 4.2;
                const gradient = ctx.createRadialGradient(x, y, r, x, y, L);
                const c = squad >= 0 ? TEAM_COLORS_RGB[squad] : [154, 163, 181];
                gradient.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.45)`);
                gradient.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.arc(x, y, L, angle - 0.45, angle + 0.45);
                ctx.closePath();
                ctx.fill();
            }

            const selected = scene.selected === s.p.cn;

            if (selected) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2 * d;
                ctx.beginPath();
                ctx.arc(x, y, r + 4 * d, 0, 7);
                ctx.stroke();
            }

            ctx.fillStyle = teamColor(squad);
            ctx.strokeStyle = '#0b0d12';
            ctx.lineWidth = 1.5 * d;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 7);
            ctx.fill();
            ctx.stroke();

            if (s.pov) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = d;
                ctx.beginPath();
                ctx.arc(x, y, r * 0.45, 0, 7);
                ctx.stroke();
            }

            // bomb carrier
            if (layers.bomb && m.bombSt[k] === 0 && round && T < round.end) {
                const bx = m.bomb[k * 2];
                const by = m.bomb[k * 2 + 1];

                if ((bx || by) && Math.abs(bx - s.x) + Math.abs(by - s.y) < 80) {
                    ctx.fillStyle = '#f0a020';
                    ctx.beginPath();
                    ctx.arc(x + r, y - r, 3 * d, 0, 7);
                    ctx.fill();
                }
            }

            if (layers.names || selected) {
                labels.push([x, y - r - 4 * d, s.p.name, selected]);
            }
        }

        // name tags
        ctx.font = `600 ${10 * d}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        for (const [x, y, name, selected] of labels) {
            const w = ctx.measureText(name).width + 8 * d;
            ctx.fillStyle = selected ? '#ffffffee' : '#0b0d12cc';
            roundRect(ctx, x - w / 2, y - 13 * d, w, 13 * d, 3 * d);
            ctx.fill();
            ctx.fillStyle = selected ? '#0b0d12' : '#e9edf5';
            ctx.fillText(name, x, y - 1.5 * d);
        }
    }

    // drawings
    if (scene.strokes.length) {
        ctx.strokeStyle = '#ffd34d';
        ctx.lineWidth = 2.5 * d;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        for (const stroke of scene.strokes) {
            ctx.beginPath();
            stroke.forEach(([u, vv], i) => {
                const [x, y] = toScreen(v, u, vv);

                if (i) {
                    ctx.lineTo(x, y);
                } else {
                    ctx.moveTo(x, y);
                }
            });
            ctx.stroke();
        }
    }
};

export const LANES = ['rounds', 'kills', 'grenades', 'smokes', 'bomb'];
export const LANE_HEIGHT = 18;
export const RULER_HEIGHT = 20;
export const LABEL_WIDTH = 84;

/** CSS height of the timeline for the given number of visible lanes. */
export const timelineHeight = (laneCount) => RULER_HEIGHT + laneCount * LANE_HEIGHT + 6;

/** Fraction (0..1) of the range under a CSS x position on the timeline. */
export const timelineFraction = (x, width) => Math.min(1, Math.max(0, (x - LABEL_WIDTH) / (width - 6 - LABEL_WIDTH)));

/**
 * Draws the timeline (ruler, lanes, playhead).
 *
 * @param {object} scene { m, t (ms since start), range, lanes: string[], labels: { lane: text }, dpr }
 */
export const drawTimeline = (ctx, scene) => {
    const { m, range, lanes, labels, dpr: d } = scene;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(d, d);
    const w = W / d;
    const [a, b] = rangeBounds(m, range);
    const x0 = LABEL_WIDTH;
    const x1 = w - 6;
    const X = (t) => x0 + (t - m.t0 - a) / (b - a) * (x1 - x0);

    // ruler
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const span = b - a;
    const steps = [5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000];
    const step = steps.find((s) => span / s <= (x1 - x0) / 80) || 600000;

    for (let t = Math.ceil(a / step) * step; t <= b; t += step) {
        const x = X(m.t0 + t);
        ctx.fillStyle = '#5d6577';
        ctx.fillText(formatClock(t), x, 9);
        ctx.fillStyle = '#1c2230';
        ctx.fillRect(x, RULER_HEIGHT - 4, 1, H);
    }

    lanes.forEach((lane, i) => {
        const y = RULER_HEIGHT + i * LANE_HEIGHT;
        ctx.fillStyle = '#8a93a6';
        ctx.textAlign = 'left';
        ctx.font = `11px ${FONT}`;
        ctx.fillText(labels[lane] || lane, 6, y + LANE_HEIGHT / 2);
        ctx.fillStyle = '#0d1016';
        ctx.fillRect(x0, y + 2, x1 - x0, LANE_HEIGHT - 4);
        const yc = y + LANE_HEIGHT / 2;

        if (lane === 'rounds') {
            m.rounds.forEach((r, ri) => {
                const xa = Math.max(x0, X(r.start));
                const xb = Math.min(x1, X(r.end));

                if (xb < x0 || xa > x1) {
                    return;
                }

                ctx.fillStyle = r.knife ? '#20242f' : (ri % 2 ? '#1a1f2b' : '#161a24');
                ctx.fillRect(xa + 1, y + 2, Math.max(1, xb - xa - 2), LANE_HEIGHT - 4);

                if (r.winnerSquad >= 0) {
                    ctx.fillStyle = TEAM_COLORS[r.winnerSquad];
                    ctx.fillRect(xa + 1, y + LANE_HEIGHT - 4, Math.max(1, xb - xa - 2), 2);
                }

                ctx.fillStyle = '#c7cede';
                ctx.textAlign = 'center';
                ctx.font = `600 10px ${FONT}`;

                if (xb - xa > 12) {
                    ctx.fillText(r.label, (xa + xb) / 2, yc);
                }
            });
        } else if (lane === 'kills') {
            for (const kill of m.kills) {
                if (kill.attacker === kill.victim || kill.attacker < 0) {
                    continue;
                }

                const x = X(kill.t);

                if (x < x0 || x > x1) {
                    continue;
                }

                ctx.fillStyle = teamColor(m.squadOf[kill.attacker]);
                ctx.globalAlpha = 0.85;
                ctx.fillRect(x - 1, y + 4, 2, LANE_HEIGHT - 8);
            }
        } else if (lane === 'grenades') {
            for (const g of m.grenades) {
                if (g.type === 'smoke') {
                    continue;
                }

                const x = X(g.t1);

                if (x < x0 || x > x1) {
                    continue;
                }

                ctx.fillStyle = g.type === 'flash' ? '#e9e3a0' : g.squad >= 0 ? TEAM_COLORS[g.squad] : '#ff8a3d';
                ctx.globalAlpha = 0.7;
                ctx.fillRect(x - 1, y + 5, 2, LANE_HEIGHT - 10);
            }
        } else if (lane === 'smokes') {
            for (const g of m.grenades) {
                if (g.type !== 'smoke') {
                    continue;
                }

                const xa = Math.max(x0, X(g.t1));
                const xb = Math.min(x1, X(g.cloudEnd));

                if (xb < x0 || xa > x1) {
                    continue;
                }

                ctx.fillStyle = g.squad >= 0 ? TEAM_COLORS[g.squad] : '#aab';
                ctx.globalAlpha = 0.45;
                ctx.fillRect(xa, y + 5, Math.max(2, xb - xa), LANE_HEIGHT - 10);
            }
        } else if (lane === 'bomb') {
            for (const r of m.rounds) {
                if (!r.plant) {
                    continue;
                }

                const end = r.defuse ? r.defuse.t : Math.min(r.end, r.decided + 500);
                const xa = Math.max(x0, X(r.plant.t));
                const xb = Math.min(x1, X(end));

                if (xb < x0 || xa > x1) {
                    continue;
                }

                ctx.fillStyle = '#f0a020';
                ctx.globalAlpha = 0.85;
                ctx.fillRect(xa, y + 4, Math.max(2, xb - xa), LANE_HEIGHT - 8);

                if (r.defuse) {
                    ctx.fillStyle = '#2fbf71';
                    ctx.fillRect(xb - 2, y + 3, 3, LANE_HEIGHT - 6);
                }
            }
        }

        ctx.globalAlpha = 1;
    });

    // playhead (brand cyan)
    const px = X(m.t0 + scene.t);
    ctx.fillStyle = '#28a5c0';
    ctx.fillRect(px - 0.5, 4, 1.5, H / d - 4);
    ctx.beginPath();
    ctx.arc(px, 5, 4, 0, 7);
    ctx.fill();
};
