// Call of Duty 2 .dm_1 demo parser (protocol 115-119), based on voron00/CoD2rev_Server msg code.
// CoD1 (1.5) uses the same message layout with Quake 3 command numbers and its own netfield tables
// (reversed from cod_lnxded: MSG_ReadDeltaPlayerstate / MSG_ReadDeltaField), so both are built from here.
// Same interface as DemoParser (CoD4) so extract.js can use either.
import { COD2_TABLES } from './tables_cod2.js';
import { COD1_TABLES } from './tables_cod1.js';

const g = { COD2_TABLES, COD1_TABLES };

const VARIANTS = {
  cod2: { game: 'cod2', tables: 'COD2_TABLES', protocol: 118, svc: { nop: 0, gamestate: 1, configstring: 2, baseline: 3, serverCommand: 4, snapshot: 6, eof: 7 }, signedShort: false, signExtend: true },
  // svc_* as in Quake 3; MSG_ReadShort is signed and MSG_ReadDeltaField does not sign-extend negative bit counts
  cod1: { game: 'cod1', tables: 'COD1_TABLES', protocol: 6, svc: { nop: 1, gamestate: 2, configstring: 3, baseline: 4, serverCommand: 5, snapshot: 7, eof: 8 }, signedShort: true, signExtend: false },
};

// Q3 Huffman tree, whole-message compression (same in CoD1 and CoD2)
const INTERNAL_NODE = 257;
const HUFF = g.COD2_TABLES;
const HL = Int32Array.from(HUFF.huffL), HR = Int32Array.from(HUFF.huffR), HS = Int32Array.from(HUFF.huffS);
function huffDecompress(inBuf, inStart, inLen, out, outStart) {
  const lenBits = inLen * 8;
  let off = 0, i = outStart;
  const max = out.length;
  while (off < lenBits && i < max) {
    let n = 0;
    while (n >= 0 && HS[n] === INTERNAL_NODE) {
      const bit = (inBuf[inStart + (off >> 3)] >> (off & 7)) & 1;
      off++;
      n = bit ? HR[n] : HL[n];
    }
    out[i++] = n < 0 ? 0 : HS[n];
  }
  return i;
}

function build(V) {
  const T = g[V.tables];
  const SVC = V.svc, SIGNED_SHORT = V.signedShort, SIGN_EXTEND = V.signExtend;

  const PACKET_BACKUP = 32, PACKET_MASK = 31;
  const MAX_PARSE_ENTITIES = 2048, MAX_PARSE_CLIENTS = 2048;
  const MAX_CONFIGSTRINGS = 2048;
  const FLOAT_INT_BIAS = 1 << 12, HUDELEM_COORD_BIAS = 1 << 9;

  const ES_INTS = T.sizes.es / 4, CS_INTS = T.sizes.cs / 4, PS_INTS = T.sizes.ps / 4;
  const HUD_INTS = T.sizes.hud / 4, OBJ_INTS = T.sizes.obj / 4;
  const PS_STATS = T.sizes.psStats / 4, PS_AMMO = T.sizes.psAmmo / 4, PS_AMMOCLIP = T.sizes.psAmmoclip / 4;
  const PS_OBJ = T.sizes.psObjective / 4, PS_HUD = T.sizes.psHud / 4, PS_HUD_ARCH = T.sizes.psHudArch / 4;

  function makeState(n) {
    const buf = new ArrayBuffer(n * 4);
    return { i: new Int32Array(buf), f: new Float32Array(buf), b: new Uint8Array(buf) };
  }

  const EF = {}; for (const f of T.entityStateFields) EF[f[0]] = f[1];
  const PSF = {}; for (const f of T.playerStateFields) PSF[f[0]] = f[1];
  const CSF = {}; for (const f of T.clientStateFields) CSF[f[0]] = f[1];
  // Same keys as the CoD4 parser exposes
  const ES = {
    number: 0, eType: 1, eFlags: 2, trType: EF['pos.trType'], trTime: EF['pos.trTime'], trDuration: EF['pos.trDuration'],
    x: EF['pos.trBase[0]'], y: EF['pos.trBase[1]'], z: EF['pos.trBase[2]'],
    dx: EF['pos.trDelta[0]'], dy: EF['pos.trDelta[1]'], dz: EF['pos.trDelta[2]'],
    pitch: EF['apos.trBase[0]'], yaw: EF['apos.trBase[1]'], weapon: EF['weapon'], clientNum: EF['clientNum'],
    otherEntityNum: EF['otherEntityNum'], attackerEntityNum: EF['attackerEntityNum'], eventParm: EF['eventParm'],
    eventSequence: EF['eventSequence'], events: EF['events[0]'], eventParms: EF['eventParms[0]'], index: EF['index'],
    groundEntityNum: EF['groundEntityNum'], legsAnim: EF['legsAnim'], torsoAnim: EF['torsoAnim'], leanf: EF['leanf'],
  };
  const PSX = Object.assign({}, PSF, { ClientNum: PSF.clientNum });
  const CSX = Object.assign({}, CSF, { netname: CSF['name[0]'] });

  class Msg {
    constructor(buf, len) { this.buf = buf; this.cur = len; this.rc = 0; this.bit = 0; this.over = false; }
    readBit() {
      const o = this.bit & 7;
      if (!o) {
        if (this.rc >= this.cur) { this.over = true; return -1; }
        this.bit = 8 * this.rc; this.rc++;
      }
      const v = (this.buf[this.bit >> 3] >> o) & 1;
      this.bit++;
      return v;
    }
    readBits(n) {
      let r = 0;
      for (let i = 0; i < n; i++) { const b = this.readBit(); if (b < 0) return r; r |= b << i; }
      return r;
    }
    readByte() { if (this.rc + 1 > this.cur) { this.over = true; return -1; } return this.buf[this.rc++]; }
    readShort() { // unsigned in CoD2, signed in CoD1
      if (this.rc + 2 > this.cur) { this.over = true; return 0; }
      const v = this.buf[this.rc] | (this.buf[this.rc + 1] << 8); this.rc += 2;
      return SIGNED_SHORT ? (v << 16) >> 16 : v;
    }
    readLong() {
      if (this.rc + 4 > this.cur) { this.over = true; return 0; }
      const b = this.buf, p = this.rc; this.rc += 4;
      return b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24);
    }
    readString() {
      let s = '';
      for (;;) { const c = this.readByte(); if (c <= 0) break; s += String.fromCharCode(c); }
      return s;
    }
    readValue(bits) {
      const ab = Math.abs(bits);
      let v = (ab & 7) ? this.readBits(ab & 7) : 0;
      for (let j = ab & 7; j < ab; j += 8) v |= this.readByte() << j;
      if (SIGN_EXTEND && bits < 0 && ((v >> (ab - 1)) & 1)) v |= ~((1 << ab) - 1);
      return v;
    }
  }


  // generic field (entities, clients, hud elems, objectives)
  function readDeltaField(msg, from, fb, to, tb, field) {
    const fi = fb + field[1], ti = tb + field[1], bits = field[2];
    if (!msg.readBit()) { to.i[ti] = from.i[fi]; return; }
    if (bits === 0) {
      if (!msg.readBit()) { to.i[ti] = 0; return; }
      if (msg.readBit() === 0) { const tr = msg.readBits(5); to.f[ti] = 32 * msg.readByte() + tr - FLOAT_INT_BIAS; }
      else to.i[ti] = msg.readLong();
    } else if (bits === -99) {
      if (!msg.readBit()) { to.i[ti] = 0; return; }
      if (msg.readBit() === 0) { const tr = msg.readBits(2); to.f[ti] = 4 * msg.readByte() + tr - HUDELEM_COORD_BIAS; }
      else to.i[ti] = msg.readLong();
    } else if (bits === -100) {
      if (!msg.readBit()) { to.i[ti] = 0; return; }
      to.f[ti] = msg.readShort() * (360 / 65536);
    } else {
      if (!msg.readBit()) { to.i[ti] = 0; return; }
      to.i[ti] = msg.readValue(bits);
    }
  }

  class Cod2Parser {
    constructor(data, cb) {
      this.data = data; this.pos = 0; this.cb = cb || {};
      this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      this.protocol = V.protocol; this.game = V.game;
      this.configStrings = new Array(MAX_CONFIGSTRINGS).fill('');
      this.clientNames = []; for (let i = 0; i < 64; i++) this.clientNames.push({ name: '', clan: '' });
      this.baselines = []; for (let i = 0; i < 1024; i++) this.baselines.push(makeState(ES_INTS));
      this.parseEntities = []; for (let i = 0; i < MAX_PARSE_ENTITIES; i++) this.parseEntities.push(makeState(ES_INTS));
      this.parseClients = []; for (let i = 0; i < MAX_PARSE_CLIENTS; i++) this.parseClients.push(makeState(CS_INTS));
      this.snapshots = []; for (let i = 0; i < PACKET_BACKUP; i++) this.snapshots.push(this.newSnap());
      this.nullES = makeState(ES_INTS); this.nullCS = makeState(CS_INTS); this.nullPS = makeState(PS_INTS);
      this.oldSnap = this.newSnap(); this.cur = this.newSnap();
      this.parseEntitiesNum = 0; this.parseClientsNum = 0; this.snapMessageNum = 0;
      this.clientNum = 0; this.ended = false; this.statsBits = 6;
      this.uncompressed = new Uint8Array(0x20000);
    }
    newSnap() {
      return { valid: false, snapFlags: 0, serverTime: 0, messageNum: 0, deltaNum: 0, ps: makeState(PS_INTS), numEntities: 0, parseEntitiesNum: 0, numClients: 0, parseClientsNum: 0 };
    }
    copySnap(d, s) {
      d.valid = s.valid; d.snapFlags = s.snapFlags; d.serverTime = s.serverTime; d.messageNum = s.messageNum; d.deltaNum = s.deltaNum;
      d.ps.i.set(s.ps.i); d.numEntities = s.numEntities; d.parseEntitiesNum = s.parseEntitiesNum; d.numClients = s.numClients; d.parseClientsNum = s.parseClientsNum;
    }

    parse() { while (this.pos < this.data.length && !this.ended) this.step(); }

    step() {
      const dv = this.dv;
      if (this.pos + 8 > this.data.length) { this.ended = true; return; }
      const seq = dv.getInt32(this.pos, true), len = dv.getInt32(this.pos + 4, true);
      this.pos += 8;
      if (seq === -1 || len < 4 || this.pos + len > this.data.length) { this.ended = true; return; }
      // first 4 bytes (reliable acknowledge) are not compressed
      const buf = this.uncompressed;
      buf[0] = this.data[this.pos]; buf[1] = this.data[this.pos + 1]; buf[2] = this.data[this.pos + 2]; buf[3] = this.data[this.pos + 3];
      const outLen = huffDecompress(this.data, this.pos + 4, len - 4, buf, 4);
      this.pos += len;
      const msg = new Msg(buf, outLen);
      msg.readLong();
      this.msgSeq = seq;
      for (;;) {
        if (msg.rc > msg.cur || msg.over) break;
        const cmd = msg.readByte();
        if (cmd === SVC.eof || cmd === -1) break;
        if (cmd === SVC.gamestate) this.parseGamestate(msg);
        else if (cmd === SVC.serverCommand) this.parseCommandString(msg);
        else if (cmd === SVC.snapshot) this.parseSnapshot(msg);
        else if (cmd === SVC.nop) continue;
        else break;
      }
    }

    setConfigString(idx, s) {
      if (idx < 0 || idx >= MAX_CONFIGSTRINGS) return;
      this.configStrings[idx] = s;
      if (idx === 0) {
        const m = /\\protocol\\(\d+)/i.exec(s);
        if (m) { this.protocol = +m[1]; this.statsBits = V.game === 'cod2' && this.protocol === 119 ? 5 : 6; }
      }
    }

    parseGamestate(msg) {
      this.parseEntitiesNum = 0; this.parseClientsNum = 0;
      this.configStrings.fill('');
      for (const b of this.baselines) b.i.fill(0);
      for (const s of this.snapshots) s.valid = false;
      msg.readLong();
      for (;;) {
        const cmd = msg.readByte();
        if (cmd === SVC.eof || cmd === -1) break;
        if (cmd === SVC.configstring) {
          const idx = msg.readShort() & 0xffff;
          this.setConfigString(idx, msg.readString());
        } else if (cmd === SVC.baseline) {
          const num = msg.readBits(10);
          if (num < 0 || num >= 1024) { msg.over = true; return; }
          this.nullES.i.fill(0);
          this.readDeltaEntity(msg, this.nullES, this.baselines[num], num);
        } else break;
      }
      this.clientNum = msg.readLong();
      msg.readLong();
      if (this.cb.gamestate) this.cb.gamestate(this);
    }

    parseCommandString(msg) {
      const seq = msg.readLong();
      const s = msg.readString();
      // configstring updates: d <index> <string>
      if (s.charCodeAt(0) === 100 && s.charCodeAt(1) === 32) {
        const sp = s.indexOf(' ', 2);
        const idx = parseInt(s.slice(2, sp < 0 ? undefined : sp), 10);
        if (idx >= 0) this.setConfigString(idx, sp < 0 ? '' : s.slice(sp + 1));
      }
      if (this.cb.serverCommand) this.cb.serverCommand(s, seq, this);
    }

    // true = removed
    readDeltaStruct(msg, from, to, number, fields) {
      if (msg.readBit() === 1) return true;
      if (msg.readBit() === 0) { to.i.set(from.i.subarray(0, Math.min(fields.length + 1, from.i.length))); to.i[0] = number; return false; }
      const lc = msg.readByte();
      if (lc > fields.length || lc < 0) { msg.over = true; return false; }
      to.i[0] = number;
      for (let i = 0; i < lc; i++) readDeltaField(msg, from, 0, to, 0, fields[i]);
      for (let i = lc; i < fields.length; i++) { const o = fields[i][1]; to.i[o] = from.i[o]; }
      return false;
    }
    readDeltaEntity(msg, from, to, number) { return this.readDeltaStruct(msg, from, to, number, T.entityStateFields); }

    parseSnapshot(msg) {
      const cur = this.cur;
      cur.valid = false;
      cur.serverTime = msg.readLong();
      cur.messageNum = this.msgSeq;
      const deltaNum = msg.readByte();
      cur.deltaNum = !deltaNum ? -1 : cur.messageNum - deltaNum;
      cur.snapFlags = msg.readByte();
      const old = this.oldSnap;
      old.valid = false; old.numEntities = 0; old.numClients = 0;
      if (cur.deltaNum > 0) {
        const s = this.snapshots[cur.deltaNum & PACKET_MASK];
        if (!s.valid || s.messageNum !== cur.deltaNum || this.parseEntitiesNum - s.parseEntitiesNum > MAX_PARSE_ENTITIES - 128) {
          msg.over = true; return;
        }
        this.copySnap(old, s);
      }
      cur.valid = true;
      this.readDeltaPlayerState(msg, old.valid ? old.ps : this.nullPS, cur.ps);
      this.parsePacketEntities(msg, old, cur);
      this.parsePacketClients(msg, old, cur);
      if (msg.over) return;
      let o = this.snapMessageNum + 1;
      if (cur.messageNum - o >= PACKET_BACKUP) o = cur.messageNum - (PACKET_BACKUP - 1);
      for (; o < cur.messageNum; o++) this.snapshots[o & PACKET_MASK].valid = false;
      this.snapMessageNum = cur.messageNum;
      this.copySnap(this.snapshots[cur.messageNum & PACKET_MASK], cur);
      // names live in the client states
      for (const c of this.snapClients(cur)) {
        const cn = c.i[0];
        if (cn < 0 || cn >= 64) continue;
        let name = '';
        for (let k = 0; k < 32; k++) { const ch = c.b[CSF['name[0]'] * 4 + k]; if (!ch) break; name += String.fromCharCode(ch); }
        if (name && this.clientNames[cn].name !== name) { this.clientNames[cn].name = name; if (this.cb.clientName) this.cb.clientName(cn, this.clientNames[cn]); }
      }
      if (this.cb.snapshot) this.cb.snapshot(cur, this);
    }

    snapEntities(snap) {
      const out = [];
      for (let k = 0; k < snap.numEntities; k++) out.push(this.parseEntities[(snap.parseEntitiesNum + k) & (MAX_PARSE_ENTITIES - 1)]);
      return out;
    }
    snapClients(snap) {
      const out = [];
      for (let k = 0; k < snap.numClients; k++) out.push(this.parseClients[(snap.parseClientsNum + k) & (MAX_PARSE_CLIENTS - 1)]);
      return out;
    }

    parsePacketEntities(msg, from, to) {
      to.parseEntitiesNum = this.parseEntitiesNum; to.numEntities = 0;
      const PE = this.parseEntities, M = MAX_PARSE_ENTITIES - 1;
      let oldindex = 0, oldstate = null, oldnum = 99999;
      if (from.numEntities > 0) { oldstate = PE[from.parseEntitiesNum & M]; oldnum = oldstate.i[0]; }
      const advance = () => {
        if (++oldindex < from.numEntities) { oldstate = PE[(oldindex + from.parseEntitiesNum) & M]; oldnum = oldstate.i[0]; } else oldnum = 99999;
      };
      const delta = (num, base) => {
        const slot = PE[this.parseEntitiesNum & M];
        if (!this.readDeltaEntity(msg, base, slot, num)) { this.parseEntitiesNum++; to.numEntities++; }
      };
      const copyOld = () => { PE[this.parseEntitiesNum++ & M].i.set(oldstate.i); to.numEntities++; };
      while (!msg.over) {
        const newnum = msg.readBits(10);
        if (newnum === 1023 || msg.over) break;
        while (oldnum < newnum) { copyOld(); advance(); }
        if (oldnum === newnum) { delta(newnum, oldstate); advance(); }
        else delta(newnum, this.baselines[newnum]);
      }
      while (oldnum !== 99999 && !msg.over) { copyOld(); advance(); }
    }

    parsePacketClients(msg, from, to) {
      to.parseClientsNum = this.parseClientsNum; to.numClients = 0;
      const PC = this.parseClients, M = MAX_PARSE_CLIENTS - 1;
      let oldindex = 0, oldstate = null, oldnum = 99999;
      if (from.numClients > 0) { oldstate = PC[from.parseClientsNum & M]; oldnum = oldstate.i[0]; }
      const advance = () => {
        if (++oldindex < from.numClients) { oldstate = PC[(oldindex + from.parseClientsNum) & M]; oldnum = oldstate.i[0]; } else oldnum = 99999;
      };
      const copyOld = () => { PC[this.parseClientsNum++ & M].i.set(oldstate.i); to.numClients++; };
      const delta = (num, base) => {
        const slot = PC[this.parseClientsNum & M];
        if (!this.readDeltaStruct(msg, base, slot, num, T.clientStateFields)) { this.parseClientsNum++; to.numClients++; }
      };
      while (!msg.over && msg.readBit() === 1) {
        const newnum = msg.readBits(6);
        while (oldnum < newnum) { copyOld(); advance(); }
        if (oldnum === newnum) { delta(newnum, oldstate); advance(); }
        else { this.nullCS.i.fill(0); delta(newnum, this.nullCS); }
      }
      while (oldnum !== 99999 && !msg.over) { copyOld(); advance(); }
    }

    readDeltaPlayerState(msg, from, to) {
      to.i.set(from.i);
      const fields = T.playerStateFields;
      const lc = msg.readByte();
      if (lc < 0 || lc > fields.length) { msg.over = true; return; }
      for (let i = 0; i < lc; i++) {
        const ti = fields[i][1], bits = fields[i][2];
        if (!msg.readBit()) continue;
        if (bits === 0) {
          if (msg.readBit() === 0) { const tr = msg.readBits(5); to.f[ti] = 32 * msg.readByte() + tr - FLOAT_INT_BIAS; }
          else to.i[ti] = msg.readLong();
        } else if (bits === -100) {
          if (!msg.readBit()) { to.i[ti] = 0; continue; }
          to.f[ti] = msg.readShort() * (360 / 65536);
        } else to.i[ti] = msg.readValue(bits);
      }
      if (msg.readBit()) {
        const b = msg.readBits(this.statsBits);
        const S = PS_STATS;
        if (b & 1) to.i[S] = msg.readShort();
        if (b & 2) to.i[S + 1] = msg.readShort();
        if (b & 4) to.i[S + 2] = msg.readShort();
        if (b & 8) to.i[S + 3] = msg.readBits(6);
        if (this.statsBits === 6) {
          if (b & 16) to.i[S + 4] = msg.readShort();
          if (b & 32) to.i[S + 5] = msg.readByte();
        } else if (b & 16) to.i[S + 4] = msg.readByte();
      }
      if (msg.readBit()) {
        for (let j = 0; j < 4; j++) if (msg.readBit()) {
          const bits = msg.readShort();
          for (let i = 0; i < 16; i++) if (bits & (1 << i)) to.i[PS_AMMO + i + j * 16] = msg.readShort();
        }
      }
      for (let j = 0; j < 4; j++) if (msg.readBit()) {
        const bits = msg.readShort();
        for (let i = 0; i < 16; i++) if (bits & (1 << i)) to.i[PS_AMMOCLIP + i + j * 16] = msg.readShort();
      }
      if (msg.readBit()) {
        for (let n = 0; n < 16; n++) {
          const base = PS_OBJ + n * OBJ_INTS;
          to.i[base] = msg.readBits(3);
          if (msg.readBit()) for (const f of T.objectiveFields) readDeltaField(msg, from, base, to, base, f);
          else for (const f of T.objectiveFields) to.i[base + f[1]] = from.i[base + f[1]];
        }
      }
      if (msg.readBit()) {
        this.readDeltaHudElems(msg, from, to, PS_HUD_ARCH);
        this.readDeltaHudElems(msg, from, to, PS_HUD);
      }
    }
    readDeltaHudElems(msg, from, to, base) {
      const inuse = msg.readBits(5);
      const F = T.hudElemFields;
      for (let i = 0; i < inuse; i++) {
        const lc = msg.readBits(5);
        const b = base + i * HUD_INTS;
        let j = 0;
        for (; j <= lc && j < F.length; j++) readDeltaField(msg, from, b, to, b, F[j]);
        for (; j < F.length; j++) to.i[b + F[j][1]] = from.i[b + F[j][1]];
      }
      for (let k = inuse; k < 31; k++) {
        const b = base + k * HUD_INTS;
        if (to.i[b + F.find((f) => f[0] === 'type')[1]]) to.i.fill(0, b, b + HUD_INTS);
      }
    }
  }

  // detect: CoD4 demos start with a record-type byte (0/1/2), CoD2 with a 32-bit sequence number
  Cod2Parser.looksLike = (data) => {
    if (data.length < 12) return false;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const len = dv.getInt32(4, true);
    return data[0] > 2 || (len > 4 && len < 0x20000 && dv.getInt32(0, true) > 0 && 8 + len <= data.length && data[0] !== 0);
  };
  Cod2Parser.ES = ES; Cod2Parser.PSF = PSX; Cod2Parser.CSF = CSX;
  Cod2Parser.PS_STATS = PS_STATS; Cod2Parser.PS_AMMO = PS_AMMO; Cod2Parser.PS_AMMOCLIP = PS_AMMOCLIP;
  Cod2Parser.PS_OBJ = PS_OBJ; Cod2Parser.OBJ_INTS = OBJ_INTS;
  Cod2Parser.OBJ_FIELDS = { x: 1, y: 2, entNum: 4, teamNum: 5, icon: 6 };
  return Cod2Parser;
}

// CoD1 and CoD2 frame demos identically; the first command of the first message tells them apart
// (svc_gamestate is 2 in CoD1, 1 in CoD2).
function sniffGame(data) {
  if (data.length < 13) return '';
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const len = dv.getInt32(4, true);
  if (len < 5 || 8 + len > data.length) return '';
  const out = new Uint8Array(8);
  huffDecompress(data, 12, Math.min(len - 4, 16), out, 0);
  return out[0] === 2 ? 'cod1' : out[0] === 1 ? 'cod2' : '';
}

export const Cod2Parser = build(VARIANTS.cod2);
export const Cod1Parser = build(VARIANTS.cod1);
export { sniffGame as sniffCodGame };
