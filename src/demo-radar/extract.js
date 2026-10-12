// Turns a parsed CoD4, CoD2 or CoD1 demo into a compact match model for the 2D viewer.
// buildMatch(uint8array, fileName, onProgress) -> Promise<model>
import { DemoParser } from './parser.js';
import { Cod1Parser, Cod2Parser, sniffCodGame } from './parser_cod2.js';

/** Set sync to true to parse in one go (tests, ?sync=1); the default yields to the UI every 2 MB. */
export const parseOptions = { sync: false };

const ET_PLAYER = 1, ET_MISSILE = 4, ET_SCRIPTMOVER = 6, ET_GENERAL = 0;
const MOD_NAMES = ['unknown', 'pistol', 'rifle', 'grenade', 'grenade splash', 'projectile', 'projectile splash',
  'melee', 'headshot', 'crush', 'telefrag', 'falling', 'suicide', 'trigger hurt', 'explosive', 'impact'];
// CoD1 meansOfDeath_t (game.mp.i386.so)
const MOD_NAMES_COD1 = ['unknown', 'pistol', 'rifle', 'grenade', 'grenade splash', 'projectile', 'projectile splash',
  'melee', 'headshot', 'mortar', 'mortar splash', 'kicked', 'grabber', 'dynamite', 'dynamite splash', 'airstrike',
  'water', 'slime', 'lava', 'crush', 'telefrag', 'falling', 'suicide', 'trigger hurt', 'explosive'];

// Per-game numbers: entity event ids, configstring layout, round/bomb conventions
const PROFILES = {
  cod4: {
    game: 'cod4', label: 'CoD4', parser: () => DemoParser, ET_EVENTS: 17, EV_OBITUARY: 66, EV_FIRE: [26, 27],
    PM_NOVIEW: [4, 5], PM_DEAD: [7], CS_MODELS: 830, CS_MATERIALS: 2002, CS_WEAPONS: 2258, roundCmd: 'm',
    bombModel: 'prop_suitcase_bomb', siteModel: 'com_bomb_objective', bombOnlyWhenPlanted: false, hudTexts: [380, 390],
    EF_DEAD: 0x20000, ET_CORPSE: -1, ET_MODELS: [ET_SCRIPTMOVER, ET_GENERAL], mods: MOD_NAMES,
  },
  cod2: {
    game: 'cod2', label: 'CoD2', parser: () => Cod2Parser, ET_EVENTS: 10, EV_OBITUARY: 198, EV_FIRE: [158, 159, 160],
    PM_NOVIEW: [4, 5], PM_DEAD: [6, 7], CS_MODELS: 334, CS_MATERIALS: 1566, CS_WEAPONS: 7, roundCmd: 'n',
    bombModel: 'xmodel/mp_tntbomb', siteModel: '', bombOnlyWhenPlanted: true, hudTexts: [0, 0],
    EF_DEAD: 0x20000, ET_CORPSE: -1, ET_MODELS: [ET_SCRIPTMOVER, ET_GENERAL], mods: MOD_NAMES,
  },
  // CoD1 1.5 (numbers from game.mp.i386.so: ET_EVENTS 12, eventnames[], G_TempEntity). Dead players leave the
  // snapshot and an ET_PLAYER_CORPSE takes their place. Scores come in the 'b' scoreboard command, round ends
  // as 'c "SD_..."' center prints, and the planted bomb is a script model that only exists while planted.
  cod1: {
    game: 'cod1', label: 'CoD1', parser: () => Cod1Parser, ET_EVENTS: 12, EV_OBITUARY: 201, EV_FIRE: [159, 160, 161, 168],
    PM_NOVIEW: [4, 5], PM_DEAD: [6, 7], CS_MODELS: 268, CS_MATERIALS: 1500, CS_WEAPONS: 7, roundCmd: 'n',
    bombModel: 'xmodel/mp_bomb1_defuse', siteModel: '', bombOnlyWhenPlanted: true, hudTexts: [0, 0],
    EF_DEAD: 0, ET_CORPSE: 2, ET_MODELS: [8, ET_GENERAL], mods: MOD_NAMES_COD1, scoreboardScores: true, centerPrints: true, plantFromModel: true,
  },
};
let P = PROFILES.cod4, DP, ES, PSF, CSF;
function useProfile(name) {
  P = PROFILES[name]; DP = P.parser(); ES = DP.ES; PSF = DP.PSF; CSF = DP.CSF;
}
function detectGame(data) {
  if (data.length >= 16) {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const seq = dv.getInt32(0, true), len = dv.getInt32(4, true);
    if (len > 4 && len < 0x40000 && 8 + len + 8 <= data.length) {
      const d = dv.getInt32(8 + len, true) - seq;
      if (d >= 1 && d <= 64) return sniffCodGame(data) || 'cod2';
    }
  }
  return 'cod4';
}
const MAX_SLOTS = 32;
const SMOKE_DURATION = 25000;
// CoD1 SD center prints (localized string names) used as round-end reasons
const CENTER_TEXTS = {
  SD_AXISHAVEBEENELIMINATED: 'Axis have been eliminated', SD_ALLIESHAVEBEENELIMINATED: 'Allies have been eliminated',
  SD_EXPLOSIVESDEFUSED: 'Explosives defused', SD_EXPLOSIVESPLANTED: 'Explosives planted', SD_TIMEHASEXPIRED: 'Time has expired',
  SD_ALLIEDMISSIONACCOMPLISHED: 'Allies destroyed the target', SD_AXISMISSIONACCOMPLISHED: 'Axis destroyed the target',
  SD_ROUNDDRAW: 'Round draw',
};

const stripColors = (s) => (s || '').replace(/\^[0-9a-zA-Z:;=<>?@]/g, '').replace(/[\x00-\x1f]/g, '');

function infoValue(info, key) {
  const parts = (info || '').split('\\');
  for (let i = 1; i < parts.length - 1; i += 2) if (parts[i].toLowerCase() === key.toLowerCase()) return parts[i + 1];
  return '';
}

function weaponClass(name) {
  if (!name) return 'other';
  if (/frag|grenade_short|stielhandgranate/.test(name)) return 'frag';
  if (/smoke/.test(name)) return 'smoke';
  if (/flash/.test(name)) return 'flash';
  if (/concussion/.test(name)) return 'stun';
  if (/^gl_|_gl_/.test(name)) return 'gl';
  if (/c4/.test(name)) return 'c4';
  if (/claymore/.test(name)) return 'claymore';
  return 'other';
}

class Builder {
  constructor(fileName) {
    this.fileName = fileName;
    this.cap = 4096; this.n = 0;
    this.time = new Int32Array(this.cap);
    this.pos = new Float32Array(this.cap * MAX_SLOTS * 3);   // x, y, yaw
    this.st = new Uint8Array(this.cap * MAX_SLOTS);          // 0 absent, 1 alive, 2 corpse
    this.wpn = new Uint8Array(this.cap * MAX_SLOTS);
    this.pov = new Int8Array(this.cap);
    this.hp = new Int16Array(this.cap);
    this.clip = new Int16Array(this.cap);
    this.ammo = new Int16Array(this.cap);
    this.bomb = new Float32Array(this.cap * 2);
    this.bombSt = new Uint8Array(this.cap);                 // 0 unknown/carried, 1 on ground, 2 planted
    this.slotOf = new Int8Array(64).fill(-1);
    this.slots = [];
    this.kills = []; this.shots = []; this.chat = []; this.bombEvents = []; this.roundMarks = []; this.scoreEvents = [];
    this.texts = []; this.teamTimeline = [];
    this.grenades = []; this.liveMissiles = new Map();
    this.seenObits = new Map();
    this.lastPos = new Array(64).fill(null);
    this.lastEvSeq = new Int32Array(1024).fill(-1);
    this.lastPsEvSeq = -1; this.lastPsClient = -1;
    this.sites = new Map();
    this.objectives = [];
    this.teams = new Int8Array(64);
    this.curTime = 0;
    this.planted = false;
    this.bombCarrier = -1;
    this.firstSnapTime = 0;
    this.lastScore = { 1: -1, 2: -1 };
  }

  grow() {
    const nc = this.cap * 2;
    const re = (A, k) => { const b = new A.constructor(nc * k); b.set(A); return b; };
    this.time = re(this.time, 1); this.pos = re(this.pos, MAX_SLOTS * 3); this.st = re(this.st, MAX_SLOTS);
    this.wpn = re(this.wpn, MAX_SLOTS); this.pov = re(this.pov, 1); this.hp = re(this.hp, 1); this.clip = re(this.clip, 1);
    this.ammo = re(this.ammo, 1); this.bomb = re(this.bomb, 2); this.bombSt = re(this.bombSt, 1);
    this.cap = nc;
  }

  slot(cn) {
    if (cn < 0 || cn >= 64) return -1;
    let s = this.slotOf[cn];
    if (s < 0) {
      if (this.slots.length >= MAX_SLOTS) return -1;
      s = this.slots.length; this.slotOf[cn] = s; this.slots.push(cn);
    }
    return s;
  }

  onServerCommand(s, p) {
    const t = this.curTime;
    const c = s.charAt(0);
    if (c === P.roundCmd && s.length === 1) { this.roundMarks.push(t); this.planted = false; this.bombCarrier = -1; }
    else if ((c === 'G' || c === 'H') && s.charAt(1) === ' ') this.scoreEvents.push({ t, team: c === 'G' ? 1 : 2, score: parseInt(s.slice(2), 10) || 0 });
    else if (c === 'b' && P.scoreboardScores) {
      // b <numScores> <axis score> <allies score> <per client...>
      const a = s.split(' ', 4);
      for (const team of [1, 2]) {
        const score = parseInt(a[team + 1], 10);
        if (Number.isNaN(score) || this.lastScore[team] === score) continue;
        this.lastScore[team] = score;
        this.scoreEvents.push({ t, team, score });
      }
    } else if (c === 'c' && P.centerPrints && s.charAt(1) === ' ') {
      const m = /^c "([A-Z0-9_]+)"/.exec(s.replace(/[\x00-\x1f]/g, '')); // localized names end with \x15
      if (!m) return;
      const text = CENTER_TEXTS[m[1]] || m[1].replace(/^[A-Z]+_/, '').toLowerCase();
      const prev = this.texts[this.texts.length - 1];
      if (!prev || prev.text !== text || t - prev.t > 1500) this.texts.push({ t, idx: -1, text });
      if (m[1] === 'SD_EXPLOSIVESDEFUSED') this.bombEvent(t, 'defuse', '', p);
    }
    else if (c === 'h' || c === 'i') {
      const m = /^[hi] "(.*)"$/.exec(s);
      if (m) this.chat.push({ t, text: stripColors(m[1]).trim() });
    } else if (c === 'f') {
      const m = /^f "MP_EXPLOSIVES_?(PLANTED|DEFUSED|RECOVERED|DROPPED)(?:_BY)?(.*)"$/.exec(s);
      if (m) {
        const name = stripColors(m[2]).trim();
        const type = { PLANTED: 'plant', DEFUSED: 'defuse', RECOVERED: 'pickup', DROPPED: 'drop' }[m[1]];
        this.bombEvent(t, type, name, p);
      }
    } else if (c === 'd') {
      const m = /^d (\d+) (.*)$/.exec(s);
      if (m) {
        const idx = +m[1];
        if (idx >= P.hudTexts[0] && idx < P.hudTexts[1]) {
          const txt = stripColors(m[2]).trim();
          if (txt) this.texts.push({ t, idx, text: txt });
        }
      }
    }
  }

  bombEvent(t, type, name, p, x, y) {
    const prev = this.bombEvents[this.bombEvents.length - 1];
    if (prev && prev.type === type && t - prev.t < 1500) return; // sent twice
    const cn = name ? this.findClient(p, name) : -1;
    const lp = cn >= 0 ? this.lastPos[cn] : null;
    this.bombEvents.push({ t, type, name, cn, x: x !== undefined ? x : lp ? lp[0] : 0, y: y !== undefined ? y : lp ? lp[1] : 0 });
    if (type === 'plant') this.planted = true;
    if (type === 'defuse') this.planted = false;
    if (type === 'pickup') this.bombCarrier = cn;
    if (type === 'drop' || type === 'plant') this.bombCarrier = -1;
  }

  findClient(p, name) {
    const n = name.toLowerCase();
    for (let i = 0; i < 64; i++) {
      const c = p.clientNames[i];
      if (!c.name) continue;
      const a = stripColors(c.name).toLowerCase();
      const b = stripColors((c.clan ? c.clan + ' ' : '') + c.name).toLowerCase();
      if (a === n || b === n) return i;
    }
    for (let i = 0; i < 64; i++) {
      const c = p.clientNames[i];
      if (c.name && n.endsWith(stripColors(c.name).toLowerCase())) return i;
    }
    return -1;
  }

  onSnapshot(snap, p) {
    const t = snap.serverTime;
    if (this.n && t <= this.time[this.n - 1]) return; // duplicate / out of order
    if (!this.firstSnapTime) this.firstSnapTime = t;
    this.curTime = t;
    if (this.n >= this.cap) this.grow();
    const k = this.n++;
    this.time[k] = t;
    const base = k * MAX_SLOTS;

    // Clients / teams
    const clients = p.snapClients(snap);
    for (const c of clients) {
      const cn = c.i[0];
      const team = c.i[CSF.team];
      if (cn >= 0 && cn < 64 && this.teams[cn] !== team) {
        this.teams[cn] = team;
        this.teamTimeline.push({ t, cn, team });
        this.slot(cn);
      }
    }

    const ents = p.snapEntities(snap);
    const present = new Set();
    const corpses = [];
    let bombSeen = false;
    for (const e of ents) {
      const et = e.i[1];
      if (et === ET_PLAYER) {
        const cn = e.i[ES.clientNum];
        const s = this.slot(cn);
        if (s < 0) continue;
        const o = (base + s);
        const dead = (e.i[ES.eFlags] & P.EF_DEAD) !== 0;
        this.pos[o * 3] = e.f[ES.x]; this.pos[o * 3 + 1] = e.f[ES.y]; this.pos[o * 3 + 2] = e.f[ES.yaw];
        this.st[o] = dead ? 2 : 1;
        this.wpn[o] = e.i[ES.weapon];
        if (!dead) this.lastPos[cn] = [e.f[ES.x], e.f[ES.y]];
        present.add(cn);
        this.entityEvents(e, cn, t);
      } else if (et === P.ET_CORPSE) {
        corpses.push(e);
      } else if (et === ET_MISSILE) {
        this.trackMissile(e, t, p);
      } else if (P.ET_MODELS.includes(et)) {
        const model = p.configStrings[P.CS_MODELS + e.i[ES.index]] || '';
        if (model === P.bombModel) {
          bombSeen = true;
          if (P.plantFromModel && !this.planted) this.bombEvent(t, 'plant', '', p, e.f[ES.x], e.f[ES.y]);
          this.bomb[k * 2] = e.f[ES.x]; this.bomb[k * 2 + 1] = e.f[ES.y];
          this.bombSt[k] = this.planted || P.bombOnlyWhenPlanted ? 2 : 1;
        } else if (P.siteModel && model === P.siteModel) {
          const key = Math.round(e.f[ES.x] / 64) + ':' + Math.round(e.f[ES.y] / 64);
          if (!this.sites.has(key)) this.sites.set(key, { x: e.f[ES.x], y: e.f[ES.y] });
        }
      } else if (et >= P.ET_EVENTS) {
        const ev = et - P.ET_EVENTS;
        if (ev === P.EV_OBITUARY) this.obituary(e, t, p);
      }
    }
    // corpses (CoD1): the player entity is gone, show the body where it lies
    for (const e of corpses) {
      const cn = e.i[ES.clientNum];
      if (present.has(cn) || cn < 0 || cn >= 64) continue;
      const s = this.slot(cn);
      if (s < 0) continue;
      const o = base + s;
      this.pos[o * 3] = e.f[ES.x]; this.pos[o * 3 + 1] = e.f[ES.y]; this.pos[o * 3 + 2] = e.f[ES.yaw];
      this.st[o] = 2; this.wpn[o] = 0;
      present.add(cn);
    }
    if (!bombSeen) {
      this.bombSt[k] = 0;
      if (this.bombCarrier >= 0 && this.lastPos[this.bombCarrier]) {
        this.bomb[k * 2] = this.lastPos[this.bombCarrier][0]; this.bomb[k * 2 + 1] = this.lastPos[this.bombCarrier][1];
      }
    }

    // POV player from playerstate
    const ps = snap.ps;
    const pm = ps.i[PSF.pm_type];
    const pcn = ps.i[PSF.ClientNum];
    this.pov[k] = -1;
    if (!P.PM_NOVIEW.includes(pm) && pcn >= 0 && pcn < 64 && !present.has(pcn)) {
      const s = this.slot(pcn);
      if (s >= 0) {
        const o = base + s;
        const dead = P.PM_DEAD.includes(pm) || (ps.i[PSF.eFlags] & P.EF_DEAD) !== 0;
        this.pos[o * 3] = ps.f[PSF['origin[0]']]; this.pos[o * 3 + 1] = ps.f[PSF['origin[1]']]; this.pos[o * 3 + 2] = ps.f[PSF['viewangles[1]']];
        this.st[o] = dead ? 2 : 1;
        const w = ps.i[PSF.weapon];
        this.wpn[o] = w;
        if (!dead) this.lastPos[pcn] = [this.pos[o * 3], this.pos[o * 3 + 1]];
        this.pov[k] = pcn;
        this.hp[k] = ps.i[DP.PS_STATS];
        this.clip[k] = w < 128 ? ps.i[DP.PS_AMMOCLIP + w] : 0;
        this.ammo[k] = w < 128 ? ps.i[DP.PS_AMMO + w] : 0;
        // shots from playerstate events
        const seq = ps.i[PSF.eventSequence];
        if (this.lastPsClient === pcn && this.lastPsEvSeq >= 0 && seq !== this.lastPsEvSeq && seq - this.lastPsEvSeq < 8 && seq > this.lastPsEvSeq) {
          for (let q = this.lastPsEvSeq; q < seq; q++) {
            const ev = ps.i[PSF['events[0]'] + (q & 3)];
            if (P.EV_FIRE.includes(ev) && !dead) this.shots.push({ t, cn: pcn, x: this.pos[o * 3], y: this.pos[o * 3 + 1], yaw: this.pos[o * 3 + 2] });
          }
        }
        this.lastPsEvSeq = seq; this.lastPsClient = pcn;
      }
    }

    // objectives (bomb site labels)
    if (!this.objectives.length || (k % 200) === 0) {
      for (let n = 0; n < 16; n++) {
        const b = DP.PS_OBJ + n * DP.OBJ_INTS;
        if (!ps.i[b]) continue;
        const icon = ps.i[b + 6];
        const mat = (p.configStrings[P.CS_MATERIALS + icon] || '').replace(/\.(tga|dds|jpg)$/i, '');
        const m = /(?:_|objective|point_)([ab])$/i.exec(mat);
        if (m) this.objectives.push({ x: ps.f[b + 1], y: ps.f[b + 2], label: m[1].toUpperCase() });
      }
    }

    // finish missiles that disappeared
    for (const [num, gr] of this.liveMissiles) {
      if (gr.lastSeen !== t) { this.finishMissile(gr); this.liveMissiles.delete(num); }
    }
  }

  entityEvents(e, cn, t) {
    const num = e.i[0];
    const seq = e.i[ES.eventSequence];
    const last = this.lastEvSeq[num];
    this.lastEvSeq[num] = seq;
    if (last < 0 || seq === last) return;
    let d = (seq - last) & 255;
    if (d > 4) d = 4;
    for (let q = seq - d; q < seq; q++) {
      const ev = e.i[ES.events + (q & 3)];
      if (P.EV_FIRE.includes(ev)) this.shots.push({ t, cn, x: e.f[ES.x], y: e.f[ES.y], yaw: e.f[ES.yaw] });
    }
  }

  obituary(e, t, p) {
    const num = e.i[0];
    const victim = e.i[ES.otherEntityNum], attacker = e.i[ES.attackerEntityNum], parm = e.i[ES.eventParm];
    const key = victim + ':' + attacker + ':' + parm;
    const prev = this.seenObits.get(num);
    if (prev && prev.key === key && t - prev.t < 3000) { prev.t = t; return; }
    this.seenObits.set(num, { key, t });
    let weapon = '', mod = '';
    if (parm & 0x80) mod = P.mods[parm & 0x7f] || 'unknown';
    else weapon = this.weaponName(p, parm);
    const vp = victim < 64 ? this.lastPos[victim] : null;
    const ap = attacker < 64 ? this.lastPos[attacker] : null;
    this.kills.push({
      t, victim, attacker: attacker < 64 ? attacker : -1, weapon, mod, headshot: mod === 'headshot',
      vx: vp ? vp[0] : null, vy: vp ? vp[1] : null, ax: ap ? ap[0] : null, ay: ap ? ap[1] : null,
    });
    // when the killer used a weapon with the headshot flag, fall back to the weapon in their hands
    if (mod === 'headshot' || mod === 'melee') {
      const k = this.kills[this.kills.length - 1];
      const s = attacker < 64 ? this.slotOf[attacker] : -1;
      if (s >= 0 && this.n) k.weapon = this.weaponName(p, this.wpn[(this.n - 1) * MAX_SLOTS + s]);
    }
  }

  weaponName(p, idx) {
    if (!this.weaponList || this.weaponList.length < idx) this.weaponList = (p.configStrings[P.CS_WEAPONS] || '').split(' ');
    return this.weaponList[idx - 1] || (idx ? '#' + idx : '');
  }

  trackMissile(e, t, p) {
    const num = e.i[0];
    let gr = this.liveMissiles.get(num);
    const w = e.i[ES.weapon];
    if (gr && gr.weaponIdx !== w) { this.finishMissile(gr); this.liveMissiles.delete(num); gr = null; }
    // trajectory position at time t
    let x = e.f[ES.x], y = e.f[ES.y], z = e.f[ES.z];
    const tr = e.i[ES.trType];
    if (tr === 2 || tr === 3 || tr === 5) {
      const dt = Math.max(0, (t - e.i[ES.trTime]) / 1000);
      x += e.f[ES.dx] * dt; y += e.f[ES.dy] * dt; z += e.f[ES.dz] * dt - (tr === 5 ? 400 * dt * dt : 0);
    }
    if (!gr) {
      const name = this.weaponName(p, w);
      gr = { weaponIdx: w, weapon: name, type: weaponClass(name), t0: t, t1: t, path: [], thrower: this.nearestPlayer(x, y, t), lastSeen: t };
      this.liveMissiles.set(num, gr);
    }
    gr.lastSeen = t; gr.t1 = t;
    const last = gr.path[gr.path.length - 1];
    if (!last || Math.abs(last[1] - x) + Math.abs(last[2] - y) > 4) gr.path.push([t, x, y]);
  }

  nearestPlayer(x, y, t) {
    let best = -1, bd = 160 * 160;
    for (let cn = 0; cn < 64; cn++) {
      const lp = this.lastPos[cn];
      if (!lp) continue;
      const d = (lp[0] - x) ** 2 + (lp[1] - y) ** 2;
      if (d < bd) { bd = d; best = cn; }
    }
    return best;
  }

  finishMissile(gr) {
    if (!gr.path.length) return;
    const end = gr.path[gr.path.length - 1];
    gr.x = end[1]; gr.y = end[2];
    if (gr.type === 'smoke') gr.cloudEnd = gr.t1 + SMOKE_DURATION;
    delete gr.lastSeen; delete gr.weaponIdx;
    this.grenades.push(gr);
  }

  finalize(p) {
    for (const gr of this.liveMissiles.values()) this.finishMissile(gr);
    this.liveMissiles.clear();
    const n = this.n;
    const t0 = n ? this.time[0] : 0, t1 = n ? this.time[n - 1] : 0;

    // plant / defuse without a name (CoD2, CoD1): closest living player to the bomb at that moment
    for (const ev of this.bombEvents) {
      if (ev.cn >= 0) continue;
      let k = 0; while (k < n - 1 && this.time[k] < ev.t) k++;
      let bx = null, by = null;
      for (let j = k; j < Math.min(n, k + 40); j++) if (this.bombSt[j] === 2) { bx = this.bomb[j * 2]; by = this.bomb[j * 2 + 1]; break; }
      if (bx === null && ev.type === 'defuse') for (let j = k; j > Math.max(0, k - 40); j--) if (this.bombSt[j] === 2) { bx = this.bomb[j * 2]; by = this.bomb[j * 2 + 1]; break; }
      if (bx === null) continue;
      let best = -1, bd = 250 * 250;
      this.slots.forEach((cn, slot) => {
        const o = k * MAX_SLOTS + slot;
        if (this.st[o] !== 1) return;
        const d = (this.pos[o * 3] - bx) ** 2 + (this.pos[o * 3 + 1] - by) ** 2;
        if (d < bd) { bd = d; best = cn; }
      });
      ev.cn = best; ev.x = bx; ev.y = by;
      if (best >= 0) ev.name = stripColors(p.clientNames[best].name) || ('player ' + best);
    }

    // ---- rounds
    const marks = this.roundMarks.filter((t) => t >= t0);
    const segs = [];
    for (let i = 0; i < marks.length; i++) segs.push({ start: marks[i], end: i + 1 < marks.length ? marks[i + 1] : t1 });
    // round winners: the side whose score goes up while the round is running
    const cur = { 1: 0, 2: 0 };
    const winners = new Map();
    // CoD1 sends the scoreboard only now and then (often well into the next round): take the winner from the
    // round-end center print, with the attacking team number from whoever plants the bomb
    if (P.centerPrints) {
      const teamOf = (cn, t) => {
        let team = 0;
        for (const e of this.teamTimeline) { if (e.t > t) break; if (e.cn === cn) team = e.team; }
        return team;
      };
      const votes = { 1: 0, 2: 0 };
      for (const ev of this.bombEvents) if (ev.type === 'plant' && ev.cn >= 0) { const tm = teamOf(ev.cn, ev.t); if (tm === 1 || tm === 2) votes[tm]++; }
      const attackTeam = votes[1] || votes[2] ? (votes[1] >= votes[2] ? 1 : 2) : 0;
      for (const s of segs) {
        const txt = this.texts.find((x) => x.t >= s.start + 1500 && x.t < s.end);
        let side = 0;
        if (txt && /^(axis have been eliminated|allies destroyed)/i.test(txt.text)) side = 2;
        else if (txt && /^(allies have been eliminated|axis destroyed)/i.test(txt.text)) side = 1;
        else if (attackTeam && txt && /defused|time has expired/i.test(txt.text)) side = 3 - attackTeam;
        else if (attackTeam && !txt && this.bombEvents.some((ev) => ev.type === 'plant' && ev.t >= s.start && ev.t < s.end)) side = attackTeam;
        if (side) winners.set(s, { side, t: txt ? txt.t : s.end });
      }
    }
    for (const e of P.centerPrints ? [] : this.scoreEvents) {
      if (e.score > cur[e.team]) {
        const s = segs.find((s) => e.t >= s.start + 1500 && e.t < s.end);
        if (s && !winners.has(s)) winners.set(s, { side: e.team, t: e.t });
      }
      cur[e.team] = e.score;
    }
    const rounds = [];
    for (const s of segs) {
      const kills = this.kills.filter((k) => k.t >= s.start && k.t < s.end && k.attacker !== k.victim && k.attacker >= 0);
      const w = winners.get(s);
      const winnerSide = w ? w.side : 0, endT = w ? w.t : s.end;
      const knife = this.texts.some((x) => x.t >= s.start - 200 && x.t < s.start + 2000 && /^knife round$/i.test(x.text));
      const reasonT = this.texts.filter((x) => x.t >= endT - 200 && x.t < s.end && /eliminated|destroyed|defused|time|forfeit/i.test(x.text));
      const reason = reasonT.length ? reasonT[0].text : '';
      if (!kills.length && !winnerSide && (s.end - s.start < 30000 || P.centerPrints)) continue; // warmup / ready-up
      rounds.push({ start: s.start, end: s.end, decided: endT, winnerSide, knife, reason });
    }
    if (!rounds.length && n) rounds.push({ start: t0, end: t1, decided: t1, winnerSide: 0, knife: false, reason: '' });
    let num = 0;
    for (const r of rounds) r.label = r.knife ? 'K' : String(++num);

    // ---- teams / squads
    // A squad is a group of players that is always on the same side; sides swap at half time.
    const teamAt = (cn, t) => {
      let team = 0;
      for (const e of this.teamTimeline) { if (e.t > t) break; if (e.cn === cn) team = e.team; }
      return team;
    };
    const players = this.slots.map((cn, slot) => ({ cn, slot, name: stripColors(p.clientNames[cn].name) || ('player ' + cn), clan: stripColors(p.clientNames[cn].clan) }));
    const samples = rounds.map((r) => [0.35, 0.65, 0.9].map((f) => r.start + (r.end - r.start) * f));
    const teamsOf = players.map((pl) => samples.map((ts) => ts.map((t) => teamAt(pl.cn, t))).flat());
    const playing = (v) => v === 1 || v === 2;
    players.forEach((pl, i) => { pl.squad = teamsOf[i].some(playing) ? null : -1; });
    const relation = (i, j) => {
      let same = 0, diff = 0;
      teamsOf[i].forEach((a, k) => { const b = teamsOf[j][k]; if (playing(a) && playing(b)) { if (a === b) same++; else diff++; } });
      return same + diff ? (same >= diff ? 1 : -1) * (same + diff) : 0;
    };
    // greedy: seed with the most present player, attach the rest by strongest relation
    const order = players.map((_, i) => i).filter((i) => players[i].squad === null)
      .sort((a, b) => teamsOf[b].filter(playing).length - teamsOf[a].filter(playing).length);
    if (order.length) players[order[0]].squad = 0;
    for (let guard = 0; guard < players.length; guard++) {
      let best = null, bw = 0;
      for (const i of order) {
        if (players[i].squad !== null) continue;
        for (const j of order) {
          if (players[j].squad === null || players[j].squad < 0) continue;
          const rel = relation(i, j);
          if (Math.abs(rel) > bw) { bw = Math.abs(rel); best = [i, rel > 0 ? players[j].squad : 1 - players[j].squad]; }
        }
      }
      if (!best) break;
      players[best[0]].squad = best[1];
    }
    for (const pl of players) if (pl.squad === null) {
      // never shared a round with anyone: fall back to team number
      const ev = this.teamTimeline.find((e) => e.cn === pl.cn && playing(e.team));
      pl.squad = ev ? ev.team - 1 : -1;
    }
    // side of squad 0 in each round = majority team of its members
    let baseSide = 0;
    rounds.forEach((r, ri) => {
      let one = 0, two = 0;
      players.forEach((pl, i) => {
        if (pl.squad < 0) return;
        for (const v of teamsOf[i].slice(ri * 3, ri * 3 + 3)) {
          if (!playing(v)) continue;
          const s0 = pl.squad === 0 ? v : 3 - v;
          if (s0 === 1) one++; else two++;
        }
      });
      r.sideOfSquad = one >= two ? [1, 2] : [2, 1];
      if (!baseSide && (one || two)) baseSide = r.sideOfSquad[0];
      r.swapped = baseSide ? r.sideOfSquad[0] !== baseSide : false;
    });
    // squad names
    const squads = [0, 1].map((sq) => {
      const members = players.filter((pl) => pl.squad === sq);
      const clans = {};
      for (const m of members) {
        const tag = m.clan || (m.name.split(/\s+/).length > 1 ? m.name.split(/\s+/)[0] : '');
        if (tag) clans[tag] = (clans[tag] || 0) + 1;
      }
      let best = '', bc = 0;
      for (const [k, v] of Object.entries(clans)) if (v > bc) { best = k; bc = v; }
      return { name: bc >= Math.max(2, members.length / 2) ? best : (sq === 0 ? 'Team A' : 'Team B'), wins: 0 };
    });
    // which squad is on which side each round, winners
    for (const r of rounds) {
      r.winnerSquad = r.winnerSide ? (r.sideOfSquad[0] === r.winnerSide ? 0 : 1) : -1;
      if (r.winnerSquad >= 0 && !r.knife) squads[r.winnerSquad].wins++;
      r.scoreSquad = [squads[0].wins, squads[1].wins];
    }
    const squadOfCn = new Int8Array(64).fill(-1);
    for (const pl of players) squadOfCn[pl.cn] = pl.squad;

    // per-player K/D
    for (const pl of players) { pl.kills = 0; pl.deaths = 0; pl.hs = 0; }
    const byCn = {}; for (const pl of players) byCn[pl.cn] = pl;
    const inRound = (t) => rounds.find((r) => t >= r.start && t < r.end);
    for (const k of this.kills) {
      const r = inRound(k.t);
      k.round = r ? rounds.indexOf(r) : -1;
      k.knifeRound = r ? r.knife : false;
      if (k.knifeRound || k.round < 0) continue;
      if (byCn[k.victim]) byCn[k.victim].deaths++;
      if (k.attacker >= 0 && k.attacker !== k.victim && byCn[k.attacker]) {
        if (squadOfCn[k.attacker] >= 0 && squadOfCn[k.attacker] === squadOfCn[k.victim]) byCn[k.attacker].kills--;
        else byCn[k.attacker].kills++;
        if (k.headshot) byCn[k.attacker].hs++;
      }
    }
    for (const gr of this.grenades) { const r = inRound(gr.t0); gr.round = r ? rounds.indexOf(r) : -1; }

    // bomb sites (CoD2 has no site models: use the objective markers)
    const sites = [];
    if (!this.sites.size) for (const o of this.objectives) {
      const key = Math.round(o.x / 64) + ':' + Math.round(o.y / 64);
      if (!this.sites.has(key)) this.sites.set(key, { x: o.x, y: o.y });
    }
    for (const s of this.sites.values()) {
      let label = '', bd = 1e12;
      for (const o of this.objectives) {
        const d = (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
        if (d < bd && d < 600 * 600) { bd = d; label = o.label; }
      }
      sites.push({ x: s.x, y: s.y, label });
    }
    // merge sites closer than 300 units
    const merged = [];
    for (const s of sites) {
      const m = merged.find((q) => (q.x - s.x) ** 2 + (q.y - s.y) ** 2 < 300 * 300);
      if (m) { if (!m.label) m.label = s.label; } else merged.push({ ...s });
    }
    const used = new Set(merged.map((s) => s.label).filter(Boolean));
    for (const s of merged.filter((q) => !q.label)) {
      if (!used.has('A')) s.label = 'A'; else if (!used.has('B')) s.label = 'B'; else continue;
      used.add(s.label);
    }
    const siteList = merged.filter((q) => q.label);

    // zPAM publishes the team names in serverinfo
    const t1n = stripColors(infoValue(p.configStrings[0], '_match_team1')), t2n = stripColors(infoValue(p.configStrings[0], '_match_team2'));
    if (t1n && t2n) {
      const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
      const affinity = (team, sq) => {
        const tn = norm(team);
        let sc = 0;
        for (const pl of players) if (pl.squad === sq) {
          const nm = norm(pl.name);
          let k = 0; while (k < tn.length && k < nm.length && tn[k] === nm[k]) k++;
          if (k >= 3) sc += k;
        }
        return sc;
      };
      const a = affinity(t1n, 0) + affinity(t2n, 1), b2 = affinity(t1n, 1) + affinity(t2n, 0);
      if (a || b2) { squads[0].name = a >= b2 ? t1n : t2n; squads[1].name = a >= b2 ? t2n : t1n; }
    }

    // minimap
    let minimap = null;
    for (let i = 800; i < 900 && !minimap; i++) {
      const m = /^"([^"]+)"\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(p.configStrings[i] || '');
      if (m) minimap = { material: m[1], ul: [+m[2], +m[3]], lr: [+m[4], +m[5]] };
    }

    const info0 = p.configStrings[0], info1 = p.configStrings[1];
    const mapname = infoValue(info0, 'mapname') || infoValue(info1, 'mapname');
    const model = {
      version: 1,
      meta: {
        game: P.game, gameLabel: P.label, file: this.fileName, map: mapname,
        modLabel: infoValue(info0, '_zpam') ? 'zPAM ' + infoValue(info0, '_zpam') : '', gametype: infoValue(info0, 'g_gametype'),
        hostname: stripColors(infoValue(info0, 'sv_hostname')), mod: infoValue(info0, 'fs_game') || infoValue(info1, 'fs_game'),
        protocol: p.protocol, recorder: p.clientNum, minimap, matchTitle: P.game === 'cod4' ? [stripColors(p.configStrings[380]), stripColors(p.configStrings[381])].filter(Boolean).join(' · ') : [t1n && t2n ? t1n + ' vs ' + t2n : '', infoValue(p.configStrings[0], '_zpam') ? 'zPAM ' + infoValue(p.configStrings[0], '_zpam') : ''].filter(Boolean).join(' · '),
        startDate: infoValue(info0, 'g_mapStartTime'),
      },
      t0, t1, n, maxSlots: MAX_SLOTS,
      time: this.time.slice(0, n), pos: this.pos.slice(0, n * MAX_SLOTS * 3), st: this.st.slice(0, n * MAX_SLOTS),
      wpn: this.wpn.slice(0, n * MAX_SLOTS), pov: this.pov.slice(0, n), hp: this.hp.slice(0, n), clip: this.clip.slice(0, n), ammo: this.ammo.slice(0, n),
      bomb: this.bomb.slice(0, n * 2), bombSt: this.bombSt.slice(0, n),
      players, squads, rounds, kills: this.kills, grenades: this.grenades, shots: this.shots, chat: this.chat,
      bombEvents: this.bombEvents, sites: siteList, weapons: (p.configStrings[P.CS_WEAPONS] || '').split(' '),
      teamTimeline: this.teamTimeline,
    };
    return model;
  }
}

function buildMatch(data, fileName, onProgress) {
  return new Promise((resolve, reject) => {
    useProfile(detectGame(data));
    const b = new Builder(fileName);
    let parser;
    try {
      parser = new DP(data, {
        snapshot: (s, p) => b.onSnapshot(s, p),
        serverCommand: (s, seq, p) => b.onServerCommand(s, p),
      });
    } catch (err) { reject(err); return; }
    let mapName = '';
    parser.cb.gamestate = (p) => {
      const mn = infoValue(p.configStrings[0], 'mapname');
      if (mapName && mn !== mapName && b.n) {
        // the demo continued onto another map: keep only the newest one
        const nb = new Builder(fileName);
        Object.assign(b, nb);
      }
      mapName = mn;
    };
    const step = () => {
      try {
        const until = parseOptions.sync ? Infinity : parser.pos + 2 * 1024 * 1024;
        const len = data.length;
        while (parser.pos < len && !parser.ended && parser.pos < until) parser.step();
        if (onProgress) onProgress(Math.min(1, parser.pos / len));
        if (parser.pos >= len || parser.ended) resolve(b.finalize(parser));
        else setTimeout(step, 0);
      } catch (err) { reject(err); }
    };
    step();
  });
}

export { buildMatch, weaponClass, stripColors };
