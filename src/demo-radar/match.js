// Demo Radar - derived match data and per-time lookups on top of the model built by extract.js.
// Pure functions (no DOM), so the UI stays thin and the logic can run under node --test.
import { COD1_MAPS, COD2_RADARS, COD4_MINIMAPS } from './maps.js';
import { killWeaponText, weaponLabel } from './format.js';

export const MAP_IMAGE_BASE = '/images/demo-radar/';

/** Snapshot index at (or just before) absolute demo time T. */
export const idxAt = (m, T) => {
    let low = 0;
    let high = m.n - 1;

    if (T <= m.time[0]) {
        return 0;
    }

    if (T >= m.time[high]) {
        return high;
    }

    while (low < high) {
        const mid = (low + high + 1) >> 1;

        if (m.time[mid] <= T) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    return low;
};

/** Index of the round running at T (rounds are sorted by start), -1 before the first. */
export const currentRoundIdx = (m, T) => {
    let index = -1;

    for (let i = 0; i < m.rounds.length; i++) {
        if (T >= m.rounds[i].start) {
            index = i;
        }
    }

    return index;
};

/** [from, to] of the playable range in ms since the demo start: the whole demo or one round. */
export const rangeBounds = (m, range) => {
    if (range >= 0) {
        const round = m.rounds[range];

        return [round.start - m.t0, round.end - m.t0];
    }

    return [0, m.t1 - m.t0];
};

/** zPAM radar calibration for a CoD2 demo (with or without the _fix suffix), null otherwise. */
export const cod2Radar = (m) => {
    if (m.meta.game !== 'cod2') {
        return null;
    }

    const name = (m.meta.map || '').toLowerCase();

    return COD2_RADARS[name] || COD2_RADARS[name.replace(/_fix$/, '')] || COD2_RADARS[name + '_fix'] || null;
};

/** Rendered CoD1 radar ({ name, x0, y1, span }) for the demo's map, or null. */
export const cod1Map = (m) => {
    if (m.meta.game !== 'cod1') {
        return null;
    }

    const name = (m.meta.map || '').toLowerCase();

    return COD1_MAPS[name] ? { name, ...COD1_MAPS[name] } : null;
};

/** URL of the overhead image for the demo's map, null when there is none. */
export const mapImageUrl = (m) => {
    if (m.meta.game === 'cod2') {
        const radar = cod2Radar(m);

        return radar ? `${MAP_IMAGE_BASE}cod2/${radar.img}.webp` : null;
    }

    // CoD1 shares map names with CoD4 remakes, never fall through to those images
    if (m.meta.game === 'cod1') {
        const map = cod1Map(m);

        return map ? `${MAP_IMAGE_BASE}cod1/${map.name}.png` : null;
    }

    const candidates = [];

    if (m.meta.minimap) {
        candidates.push(m.meta.minimap.material.toLowerCase());
    }

    if (m.meta.map) {
        candidates.push('compass_map_' + m.meta.map.toLowerCase(), m.meta.map.toLowerCase() + '_compass');
    }

    const name = candidates.find((candidate) => COD4_MINIMAPS.has(candidate));

    return name ? `${MAP_IMAGE_BASE}${name}.webp` : null;
};

/**
 * World -> normalised map coordinates (0..1 over the map image). `orient` is 'auto' or a forced rotation in
 * degrees ('0', '90', '180', '270').
 */
export const setupMapping = (m, orient = 'auto') => {
    const minimap = m.meta.minimap;
    const radar = cod2Radar(m);
    const cod1 = cod1Map(m);
    const mode = orient;
    m.imgRot = 0;

    // image-based mapping, shown rotated by `rot` degrees
    const useImage = (A, rot) => {
        const r = ((Math.round(rot / 90) % 4) + 4) % 4;

        for (let i = 0; i < r; i++) {
            // rotate 90 degrees about the image centre: (u, v) -> (1 - v, u)
            A = { ax: -A.bx, ay: -A.by, ac: 1 - A.bc, bx: A.ax, by: A.ay, bc: A.ac };
        }

        m.imgRot = r * 90;
        m.map = A;
    };

    if (radar) {
        // CoD2x radar: texture u = (x*scale + ox) / 100, v = (100 - y*scale + oy) / 100
        const k = radar.scale / 100;
        useImage({ ax: k, ay: 0, ac: radar.ox / 100, bx: 0, by: -k, bc: 1 + radar.oy / 100 }, mode === 'auto' ? radar.rot : +mode);
    } else if (cod1) {
        // rendered from the bsp, north up: u = (x - x0) / span, v = (y1 - y) / span
        const k = 1 / cod1.span;
        useImage({ ax: k, ay: 0, ac: -cod1.x0 * k, bx: 0, by: -k, bc: cod1.y1 * k }, mode === 'auto' ? 0 : +mode);
    } else if (minimap) {
        const [ux, uy] = minimap.ul;
        const [lx, ly] = minimap.lr;
        const useY = mode === 'auto' ? (ux > lx) === (uy > ly) : mode === '0' || mode === '180';

        if (useY) {
            m.map = { ax: 0, ay: 1 / (ly - uy), ac: -uy / (ly - uy), bx: 1 / (lx - ux), by: 0, bc: -ux / (lx - ux) };
        } else {
            m.map = { ax: 1 / (lx - ux), ay: 0, ac: -ux / (lx - ux), bx: 0, by: 1 / (ly - uy), bc: -uy / (ly - uy) };
        }

        if (mode === '90' || mode === '270' || mode === '0' || mode === '180') {
            // explicit orientation: rebuild from northyaw
            const th = (+mode) * Math.PI / 180;
            const nx = Math.cos(th);
            const ny = Math.sin(th);
            const ex = ny;
            const ey = -nx;
            const du = (lx - ux) * ex + (ly - uy) * ey;
            const dv = -((lx - ux) * nx + (ly - uy) * ny);
            m.map = { ax: ex / du, ay: ey / du, ac: -(ux * ex + uy * ey) / du, bx: -nx / dv, by: -ny / dv, bc: (ux * nx + uy * ny) / dv };
        }
    } else {
        // no minimap info: square box around everything players visited
        let minX = 1e9;
        let minY = 1e9;
        let maxX = -1e9;
        let maxY = -1e9;

        for (let k = 0; k < m.n; k += 5) {
            for (let s = 0; s < m.players.length; s++) {
                const o = k * m.maxSlots + s;

                if (!m.st[o]) {
                    continue;
                }

                const x = m.pos[o * 3];
                const y = m.pos[o * 3 + 1];
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }

        const size = Math.max(maxX - minX, maxY - minY) * 1.15 || 1000;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        m.map = { ax: 1 / size, ay: 0, ac: 0.5 - cx / size, bx: 0, by: -1 / size, bc: 0.5 + cy / size };
    }

    const M = m.map;
    m.toN = (x, y) => [M.ax * x + M.ay * y + M.ac, M.bx * x + M.by * y + M.bc];
    m.dirN = (yawDeg) => {
        const a = yawDeg * Math.PI / 180;
        const u = M.ax * Math.cos(a) + M.ay * Math.sin(a);
        const v = M.bx * Math.cos(a) + M.by * Math.sin(a);
        const length = Math.hypot(u, v) || 1;

        return [u / length, v / length];
    };
    m.unitsToN = Math.hypot(M.ax, M.ay);

    // content bounds for "fit"
    let minU = 1;
    let minV = 1;
    let maxU = 0;
    let maxV = 0;

    for (let k = 0; k < m.n; k += 10) {
        for (let s = 0; s < m.players.length; s++) {
            const o = k * m.maxSlots + s;

            if (m.st[o] !== 1) {
                continue;
            }

            const [u, v] = m.toN(m.pos[o * 3], m.pos[o * 3 + 1]);
            minU = Math.min(minU, u);
            maxU = Math.max(maxU, u);
            minV = Math.min(minV, v);
            maxV = Math.max(maxV, v);
        }
    }

    m.bounds = maxU > minU ? { minU, minV, maxU, maxV } : { minU: 0, minV: 0, maxU: 1, maxV: 1 };
    m._density = null;
};

/**
 * Adds the data the viewer needs on top of the parsed model: player lookups, who played each round, the
 * attacking squad, why a round ended (`why` = { key } for a known reason or { text } for the game's own), and
 * the world -> map mapping.
 */
export const prepareMatch = (m, orient = 'auto') => {
    m.squadOf = new Int8Array(64).fill(-1);
    m.byCn = {};

    for (const p of m.players) {
        m.squadOf[p.cn] = p.squad;
        m.byCn[p.cn] = p;
    }

    m.shots.sort((a, b) => a.t - b.t);
    m.grenades.sort((a, b) => a.t0 - b.t0);

    for (const g of m.grenades) {
        g.squad = g.thrower >= 0 ? m.squadOf[g.thrower] : -1;
    }

    // players that actually spawned in each round (subs / spectators sit in a team without spawning)
    for (const r of m.rounds) {
        r.active = new Set();
        const k0 = idxAt(m, r.start);
        const k1 = idxAt(m, r.end);

        for (let k = k0; k <= k1; k += 4) {
            for (const p of m.players) {
                if (m.st[k * m.maxSlots + p.slot] === 1) {
                    r.active.add(p.cn);
                }
            }
        }

        // moment everyone has spawned (used when jumping to a round)
        r.spawn = r.start;

        for (let k = k0; k <= k1 && m.time[k] < r.start + 4000; k++) {
            let alive = 0;

            for (const p of m.players) {
                if (m.st[k * m.maxSlots + p.slot] === 1) {
                    alive++;
                }
            }

            if (alive >= r.active.size) {
                r.spawn = m.time[k];
                break;
            }
        }
    }

    // attacking squad per round (SD): side of whoever handles the bomb
    let reference = null;

    for (const r of m.rounds) {
        const event = m.bombEvents.find((e) => e.t >= r.start && e.t < r.end && e.cn >= 0 && (e.type === 'pickup' || e.type === 'plant'));
        r.attackSquad = event ? m.squadOf[event.cn] : -1;

        if (r.attackSquad >= 0 && !reference) {
            reference = r;
        }
    }

    for (const r of m.rounds) {
        if (r.attackSquad < 0 && reference) {
            r.attackSquad = r.swapped === reference.swapped ? reference.attackSquad : 1 - reference.attackSquad;
        }

        const events = m.bombEvents.filter((e) => e.t >= r.start && e.t <= r.decided + 500);
        const plant = events.find((e) => e.type === 'plant');
        const defuse = events.find((e) => e.type === 'defuse');
        const gameReason = r.reason ? { text: r.reason } : null;

        if (r.winnerSquad < 0) {
            r.why = gameReason;
        } else if (defuse) {
            r.why = { key: 'bombDefused' };
        } else if (plant && r.winnerSquad === r.attackSquad) {
            r.why = { key: 'targetDestroyed' };
        } else {
            const losers = [...r.active].filter((cn) => m.squadOf[cn] === 1 - r.winnerSquad);
            const dead = new Set(m.kills.filter((k) => k.t >= r.start && k.t <= r.decided + 500).map((k) => k.victim));
            const wiped = losers.length && losers.every((cn) => dead.has(cn));

            if (wiped) {
                r.why = { key: r.attackSquad === r.winnerSquad ? 'defenceEliminated' : 'attackEliminated' };
            } else {
                r.why = gameReason || { key: 'timeExpired' };
            }
        }

        r.plant = plant || null;
        r.defuse = defuse || null;
    }

    setupMapping(m, orient);

    return m;
};

/** 'attack' / 'defence' for a squad in a round, '' when unknown. */
export const sideOf = (round, squad) => {
    if (!round || round.attackSquad < 0) {
        return '';
    }

    return round.attackSquad === squad ? 'attack' : 'defence';
};

/** Every player's state at T, positions and yaw interpolated between snapshots. */
export const statesAt = (m, T) => {
    const k = idxAt(m, T);
    const K = m.maxSlots;
    const k2 = Math.min(k + 1, m.n - 1);
    const dt = m.time[k2] - m.time[k];
    const f = dt > 0 && dt < 500 ? Math.min(1, Math.max(0, (T - m.time[k]) / dt)) : 0;
    const states = [];

    for (const p of m.players) {
        const o = k * K + p.slot;
        const o2 = k2 * K + p.slot;
        const st = m.st[o];

        if (!st) {
            states.push({ p, st: 0 });
            continue;
        }

        let x = m.pos[o * 3];
        let y = m.pos[o * 3 + 1];
        let yaw = m.pos[o * 3 + 2];

        if (f && m.st[o2] === st) {
            const x2 = m.pos[o2 * 3];
            const y2 = m.pos[o2 * 3 + 1];

            if (Math.abs(x2 - x) + Math.abs(y2 - y) < 300) {
                x += (x2 - x) * f;
                y += (y2 - y) * f;
                let dYaw = m.pos[o2 * 3 + 2] - yaw;
                dYaw = ((dYaw + 540) % 360) - 180;
                yaw += dYaw * f;
            }
        }

        states.push({ p, st, x, y, yaw, wpn: m.wpn[o], pov: m.pov[k] === p.cn });
    }

    return { k, states };
};

/** Weapon in hand; while it is 0 (spawning, switching) the last one held recently. */
export const weaponAt = (m, k, slot) => {
    for (let j = k; j >= 0 && j > k - 150; j--) {
        const o = j * m.maxSlots + slot;

        if (m.st[o] !== 1) {
            break;
        }

        if (m.wpn[o]) {
            return m.wpn[o];
        }
    }

    return 0;
};

export const teamOfAt = (m, cn, T) => {
    let team = 0;

    for (const event of m.teamTimeline) {
        if (event.t > T) {
            break;
        }

        if (event.cn === cn) {
            team = event.team;
        }
    }

    return team;
};

/** Whether a player took part in the round (or, outside rounds, sits in a playing team). */
export const isActive = (m, cn, round, T) => {
    if (round && round.active.size) {
        return round.active.has(cn);
    }

    const team = teamOfAt(m, cn, T);

    return team === 1 || team === 2;
};

/** Kills that count for stats: no knife rounds, no warmup. */
const countedKills = (m) => m.kills.filter((k) => !k.knifeRound && k.round >= 0);

/** Live K/D per client up to T (team kills subtract a kill), as { cn: [kills, deaths] }. */
export const killsDeathsUntil = (m, T) => {
    const kd = {};

    for (const kill of m.kills) {
        if (kill.t > T) {
            break;
        }

        if (kill.knifeRound || kill.round < 0) {
            continue;
        }

        kd[kill.victim] = kd[kill.victim] || [0, 0];
        kd[kill.victim][1]++;

        if (kill.attacker >= 0 && kill.attacker !== kill.victim) {
            kd[kill.attacker] = kd[kill.attacker] || [0, 0];
            kd[kill.attacker][0] += m.squadOf[kill.attacker] === m.squadOf[kill.victim] ? -1 : 1;
        }
    }

    return kd;
};

/**
 * Everything the HUD and side panel show at T: round, score, alive counts, per-team player rows and the
 * round's kill feed.
 */
export const panelAt = (m, T, selected = -1) => {
    const { k, states } = statesAt(m, T);
    const ri = currentRoundIdx(m, T);
    const round = ri >= 0 ? m.rounds[ri] : null;
    const alive = [0, 0];
    const total = [0, 0];
    const stateByCn = {};

    for (const s of states) {
        stateByCn[s.p.cn] = s;

        if (s.p.squad < 0 || !isActive(m, s.p.cn, round, T)) {
            continue;
        }

        total[s.p.squad]++;

        if (s.st === 1) {
            alive[s.p.squad]++;
        }
    }

    const kd = killsDeathsUntil(m, T);
    const decided = Boolean(round && T >= round.decided && round.winnerSquad >= 0);
    const previousScore = ri > 0 ? m.rounds[ri - 1].scoreSquad : [0, 0];
    const score = round ? (decided ? round.scoreSquad : previousScore) : [0, 0];
    const roundTime = round ? T - round.start : 0;
    const povCn = m.pov[k];

    let status = 'inProgress';

    if (!round) {
        status = 'beforeFirstRound';
    } else if (decided) {
        status = 'won';
    } else if (roundTime < 5000 && !round.knife) {
        status = 'stratTime';
    }

    const teams = [0, 1].map((squad) => ({
        squad,
        name: m.squads[squad].name,
        score: score[squad],
        side: sideOf(round, squad),
        alive: alive[squad],
        total: total[squad],
        players: m.players
            .filter((p) => p.squad === squad && isActive(m, p.cn, round, T))
            .map((p) => {
                const state = stateByCn[p.cn];
                const isAlive = Boolean(state && state.st === 1);
                const isPov = povCn === p.cn;
                const [kills, deaths] = kd[p.cn] || [0, 0];

                return {
                    cn: p.cn,
                    name: p.name,
                    squad,
                    alive: isAlive,
                    pov: isPov,
                    weapon: (isAlive && weaponLabel(m.weapons[weaponAt(m, k, p.slot) - 1])) || '',
                    kills,
                    deaths,
                    // health and ammo are only recorded for the player the demo is following
                    hp: isPov ? m.hp[k] : (isAlive ? null : 0),
                    clip: isPov && isAlive ? m.clip[k] : null,
                    ammo: isPov && isAlive ? m.ammo[k] : null,
                    selected: selected === p.cn,
                };
            }),
    }));

    const roundKills = round
        ? m.kills.filter((kill) => kill.t >= round.start && kill.t < round.end && kill.t <= T).map((kill) => {
            const attacker = kill.attacker >= 0 && kill.attacker !== kill.victim ? m.byCn[kill.attacker] : null;
            const victim = m.byCn[kill.victim];

            return {
                t: kill.t,
                time: kill.t - round.start,
                attacker: attacker ? { name: attacker.name, squad: attacker.squad } : null,
                victim: { name: victim ? victim.name : '#' + kill.victim, squad: victim ? victim.squad : -1 },
                weapon: killWeaponText(kill),
                headshot: Boolean(kill.headshot),
            };
        })
        : [];

    return {
        k, ri, round, decided, score, roundTime, status, teams, roundKills,
        winnerName: decided ? m.squads[round.winnerSquad].name : '',
        // throttles UI updates: the panel only changes when one of these does
        key: [ri, decided, alive.join(','), selected, k >> 2, povCn >= 0 ? m.hp[k] : -1].join('|'),
    };
};

/** Scoreboard rows per squad for the stats tables under the viewer. */
export const scoreboard = (m) => {
    const kills = countedKills(m);

    return [0, 1].map((squad) => ({
        squad,
        name: m.squads[squad].name,
        wins: m.squads[squad].wins,
        rows: m.players
            .filter((p) => p.squad === squad)
            .map((p) => {
                const frags = kills.filter((k) => k.attacker === p.cn && k.victim !== p.cn && m.squadOf[k.victim] !== squad);
                const deaths = kills.filter((k) => k.victim === p.cn).length;
                const headshots = frags.filter((k) => k.headshot).length;
                const entries = m.rounds.filter((r) => {
                    const first = kills.find((k) => k.t >= r.start && k.t < r.end && k.attacker >= 0 && k.attacker !== k.victim);

                    return first && first.attacker === p.cn;
                }).length;
                const grenades = m.grenades.filter((g) => g.thrower === p.cn).length;

                return {
                    cn: p.cn,
                    name: p.name,
                    kills: frags.length,
                    deaths,
                    diff: frags.length - deaths,
                    kd: (frags.length / Math.max(1, deaths)).toFixed(2),
                    headshotPercent: frags.length ? Math.round(headshots / frags.length * 100) : 0,
                    entries,
                    grenades,
                };
            })
            .filter((row) => row.kills || row.deaths || row.grenades)
            .sort((a, b) => b.kills - a.kills),
    }));
};

/** Whole-demo numbers for one player (the player popover). */
export const playerSummary = (m, cn) => {
    const player = m.byCn[cn];
    const kills = countedKills(m);
    const frags = kills.filter((k) => k.attacker === cn && k.victim !== cn && m.squadOf[k.victim] !== player.squad);
    const deaths = kills.filter((k) => k.victim === cn).length;
    const headshots = frags.filter((k) => k.headshot).length;
    const byWeapon = {};

    for (const kill of frags) {
        const weapon = killWeaponText(kill);
        byWeapon[weapon] = (byWeapon[weapon] || 0) + 1;
    }

    const grenades = m.grenades.filter((g) => g.thrower === cn);

    return {
        cn,
        name: player.name,
        squad: player.squad,
        kills: frags.length,
        deaths,
        kd: (frags.length / Math.max(1, deaths)).toFixed(2),
        headshots,
        headshotPercent: frags.length ? Math.round(headshots / frags.length * 100) : 0,
        frags: grenades.filter((g) => g.type === 'frag').length,
        flashes: grenades.filter((g) => g.type === 'flash').length,
        smokes: grenades.filter((g) => g.type === 'smoke').length,
        shots: m.shots.filter((s) => s.cn === cn).length,
        weapons: Object.entries(byWeapon).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    };
};

/** Counters next to the timeline lane toggles. */
export const laneCounts = (m) => ({
    rounds: m.rounds.filter((r) => !r.knife).length,
    kills: m.kills.filter((k) => k.attacker >= 0 || k.mod !== 'suicide').length,
    grenades: m.grenades.filter((g) => g.type !== 'smoke').length,
    smokes: m.grenades.filter((g) => g.type === 'smoke').length,
    bomb: m.bombEvents.filter((e) => e.type === 'plant' || e.type === 'defuse').length,
});

/** Start of the first real round (after a knife round) in ms since the demo start. */
export const firstRoundStart = (m) => {
    const first = m.rounds.find((r) => !r.knife) || m.rounds[0];

    return first ? first.spawn - m.t0 : 0;
};

/**
 * Round to jump to from T: d = +1 next, -1 previous (restarting the current one first when it is more than 3 s
 * in).
 */
export const roundJumpTarget = (m, T, d) => {
    let index = currentRoundIdx(m, T);

    if (d < 0 && index >= 0 && T - m.rounds[index].spawn > 3000) {
        index += 1;
    }

    return Math.min(Math.max(index + d, 0), m.rounds.length - 1);
};
