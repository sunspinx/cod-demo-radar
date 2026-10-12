import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatClock, killWeaponText, lowerBound, weaponLabel } from '../src/demo-radar/format.js';
import {
    cod1Map, cod2Radar, idxAt, laneCounts, mapImageUrl, panelAt, playerSummary, prepareMatch, rangeBounds, roundJumpTarget, scoreboard, setupMapping, sideOf,
} from '../src/demo-radar/match.js';
import { timelineFraction, timelineHeight, zoomView } from '../src/demo-radar/renderer.js';
import { buildMatch, parseOptions } from '../src/demo-radar/extract.js';
import { heatImage, heatPoints } from '../src/demo-radar/heat.js';
import { COD1_MAPS } from '../src/demo-radar/maps.js';

// Real demos are not committed; point these at local files to run the parser tests.
const COD4_DEMO = process.env.DEMO_RADAR_COD4_DEMO || '';
const COD2_DEMO = process.env.DEMO_RADAR_COD2_DEMO || '';
// any CoD1 demo on a map with a rendered radar (e.g. mp_dawnville_x)
const COD1_DEMO = process.env.DEMO_RADAR_COD1_DEMO || '';

const loadDemo = async (file) => {
    parseOptions.sync = true;

    return prepareMatch(await buildMatch(new Uint8Array(fs.readFileSync(file)), path.basename(file)));
};

test('formatClock renders m:ss and clamps negatives', () => {
    assert.equal(formatClock(0), '0:00');
    assert.equal(formatClock(65_400), '1:05');
    assert.equal(formatClock(-3000), '0:00');
});

test('lowerBound finds the first index at or after the target', () => {
    const items = [{ t: 1 }, { t: 3 }, { t: 3 }, { t: 9 }];
    assert.equal(lowerBound(items, 3, 't'), 1);
    assert.equal(lowerBound(items, 10, 't'), 4);
    assert.equal(lowerBound([1, 2, 5], 0), 0);
});

test('weaponLabel maps internal names and attachments', () => {
    assert.equal(weaponLabel('ak47_acog_mp'), 'AK-47 ACOG');
    assert.equal(weaponLabel('m4_silencer_mp'), 'M4A1 SD');
    assert.equal(weaponLabel('kar98k_sniper_mp'), 'Kar98k Scoped');
    assert.equal(weaponLabel('gl_ak47_mp'), 'Grenade launcher');
    assert.equal(weaponLabel('some_new_gun_mp'), 'SOME NEW GUN');
    assert.equal(weaponLabel(''), '');
    assert.equal(killWeaponText({ weapon: '', mod: 'falling' }), 'falling');
    assert.equal(killWeaponText({ weapon: '', mod: '' }), '?');
});

test('map images: CoD4 minimap by material, CoD2 radar with or without _fix, rendered radar for CoD1', () => {
    const cod4 = { meta: { game: 'cod4', map: 'mp_crossfire', minimap: { material: 'compass_map_mp_crossfire' } } };
    assert.equal(mapImageUrl(cod4), '/images/demo-radar/compass_map_mp_crossfire.webp');
    assert.equal(mapImageUrl({ meta: { game: 'cod4', map: 'mp_unknown_custom', minimap: null } }), null);

    const cod2 = { meta: { game: 'cod2', map: 'mp_toujane_fix' } };
    assert.equal(cod2Radar(cod2).img, 'radar_mp_toujane');
    assert.equal(mapImageUrl(cod2), '/images/demo-radar/cod2/radar_mp_toujane.webp');
    assert.equal(mapImageUrl({ meta: { game: 'cod2', map: 'mp_vallente' } }), '/images/demo-radar/cod2/radar_mp_vallente.webp');

    // CoD1 never borrows a CoD4 image of the same name
    assert.equal(mapImageUrl({ meta: { game: 'cod1', map: 'mp_crossfire' } }), null);
    assert.equal(mapImageUrl({ meta: { game: 'cod1', map: 'MP_Toujane' } }), '/images/demo-radar/cod1/mp_toujane.png');
    assert.equal(cod1Map({ meta: { game: 'cod2', map: 'mp_toujane' } }), null);
});

// Map images are not part of this repository (game assets); point this at your images/demo-radar folder.
const IMAGES_DIR = process.env.DEMO_RADAR_IMAGES || '';

test('every rendered CoD1 radar has its image', { skip: !IMAGES_DIR && 'map images not available' }, () => {
    for (const name of Object.keys(COD1_MAPS)) {
        assert.ok(fs.existsSync(path.join(IMAGES_DIR, 'cod1', `${name}.png`)), name);
    }
});

test('CoD1 mapping puts the calibration corners on the image corners, north up', () => {
    const m = { meta: { game: 'cod1', map: 'mp_toujane' }, n: 0, players: [], maxSlots: 0, st: [], pos: [] };
    const { x0, y1, span } = COD1_MAPS.mp_toujane;
    setupMapping(m);
    assert.deepEqual(m.toN(x0, y1), [0, 0]);
    assert.deepEqual(m.toN(x0 + span, y1 - span).map((value) => Math.round(value * 1e9) / 1e9), [1, 1]);
    assert.equal(m.imgRot, 0);

    setupMapping(m, '90');
    assert.equal(m.imgRot, 90);
    assert.deepEqual(m.toN(x0, y1).map((value) => Math.round(value * 1e9) / 1e9), [1, 0]);
});

test('idxAt and rangeBounds work on demo time', () => {
    const m = { n: 4, time: [100, 200, 300, 400], t0: 100, t1: 400, rounds: [{ start: 150, end: 350 }] };
    assert.equal(idxAt(m, 50), 0);
    assert.equal(idxAt(m, 250), 1);
    assert.equal(idxAt(m, 999), 3);
    assert.deepEqual(rangeBounds(m, -1), [0, 300]);
    assert.deepEqual(rangeBounds(m, 0), [50, 250]);
});

test('round jumps restart the current round first when it is more than 3 s in', () => {
    const m = { rounds: [{ start: 0, spawn: 0 }, { start: 10_000, spawn: 10_500 }, { start: 20_000, spawn: 20_500 }] };
    assert.equal(roundJumpTarget(m, 12_000, 1), 2);
    assert.equal(roundJumpTarget(m, 15_000, -1), 1);
    assert.equal(roundJumpTarget(m, 11_000, -1), 0);
    assert.equal(roundJumpTarget(m, 25_000, 1), 2);
});

test('sideOf reports attack or defence once the attacker is known', () => {
    assert.equal(sideOf({ attackSquad: 1 }, 1), 'attack');
    assert.equal(sideOf({ attackSquad: 1 }, 0), 'defence');
    assert.equal(sideOf({ attackSquad: -1 }, 0), '');
    assert.equal(sideOf(null, 0), '');
});

test('zoomView keeps the point under the cursor and clamps the scale', () => {
    const view = zoomView({ s: 1000, ox: 0, oy: 0 }, 2, 100, 100);
    assert.equal(view.s, 2000);
    assert.equal(view.ox, -100);
    assert.equal(zoomView({ s: 60, ox: 0, oy: 0 }, 0.1, 0, 0).s, 50);
});

test('timeline geometry', () => {
    assert.equal(timelineHeight(5), 20 + 5 * 18 + 6);
    assert.equal(timelineFraction(84, 600), 0);
    assert.equal(timelineFraction(10, 600), 0);
    assert.equal(timelineFraction(594, 600), 1);
});

test('parses a CoD4 demo into rounds, kills, panel and stats', { skip: !fs.existsSync(COD4_DEMO) && 'CoD4 demo not available' }, async () => {
    const m = await loadDemo(COD4_DEMO);
    assert.equal(m.meta.game, 'cod4');
    assert.ok(m.n > 1000);
    assert.ok(m.rounds.length >= 10);
    assert.ok(m.kills.length > 50);
    assert.equal(mapImageUrl(m), `/images/demo-radar/${m.meta.minimap.material.toLowerCase()}.webp`);

    const round = m.rounds.find((r) => !r.knife && r.winnerSquad >= 0);
    const panel = panelAt(m, round.decided + 100);
    assert.equal(panel.status, 'won');
    assert.ok(panel.round.why.key || panel.round.why.text);
    assert.equal(panel.teams.length, 2);
    assert.ok(panel.roundKills.length > 0);

    const board = scoreboard(m);
    const totalKills = board.flatMap((team) => team.rows).reduce((sum, row) => sum + row.kills, 0);
    assert.ok(totalKills > 0 && totalKills <= m.kills.length);

    const summary = playerSummary(m, board[0].rows[0].cn);
    assert.equal(summary.kills, board[0].rows[0].kills);
    assert.ok(laneCounts(m).rounds > 0);

    const points = heatPoints(m, { type: 'presence', team: 'all', side: 'all', player: -1 }, -1);
    assert.ok(points.length > 100);
    const image = heatImage(m, points, { radius: 14, gain: 10 });
    assert.equal(image.rgba.length, image.size * image.size * 4);
    assert.ok(image.rgba.some((value) => value > 0));
});

test('parses a CoD2 demo and finds its zPAM radar', { skip: !fs.existsSync(COD2_DEMO) && 'CoD2 demo not available' }, async () => {
    const m = await loadDemo(COD2_DEMO);
    assert.equal(m.meta.game, 'cod2');
    assert.ok(m.players.length > 0);
    assert.ok(cod2Radar(m));
    assert.equal(m.imgRot % 90, 0);
    assert.ok(m.bounds.maxU > m.bounds.minU);
});

test('parses a CoD1 demo and places its players on the rendered radar', { skip: !fs.existsSync(COD1_DEMO) && 'CoD1 demo not available' }, async () => {
    const m = await loadDemo(COD1_DEMO);
    assert.equal(m.meta.game, 'cod1');
    assert.ok(cod1Map(m), `no rendered radar for ${m.meta.map}`);

    // the image frames the playable area, so practically every live position lands on it
    let inside = 0;
    let total = 0;

    for (let k = 0; k < m.n; k += 10) {
        for (let s = 0; s < m.players.length; s++) {
            const o = k * m.maxSlots + s;

            if (m.st[o] !== 1) {
                continue;
            }

            const [u, v] = m.toN(m.pos[o * 3], m.pos[o * 3 + 1]);
            total++;
            inside += u >= 0 && u <= 1 && v >= 0 && v <= 1 ? 1 : 0;
        }
    }

    assert.ok(total > 0);
    assert.ok(inside / total > 0.99, `${inside} of ${total} positions on the image`);
});
