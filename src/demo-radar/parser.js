// CoD4 / CoD4X .dm_1 demo parser (port of Iswenzz/CoD4-DM1, read-only).
// Usage: const d = new DemoParser(uint8array, callbacks); d.parse();
import { COD4_TABLES } from './tables.js';

const T = COD4_TABLES;

const PACKET_BACKUP = 32, PACKET_MASK = 31;
const MAX_PARSE_ENTITIES = 2048, MAX_PARSE_CLIENTS = 2048;
const MAX_CONFIGSTRINGS = 2 * 2442;
const COD4_PROTOCOL = 1, COD4X_FALLBACK_PROTOCOL = 17;
const INTERNAL_NODE = 257;

const ES_INTS = T.sizes.es / 4;   // 61
const CS_INTS = T.sizes.cs / 4;   // 29
const PS_INTS = T.sizes.ps / 4;   // 3033
const HUD_INTS = T.sizes.hud / 4; // 40
const OBJ_INTS = T.sizes.obj / 4; // 7
const PS_OBJ = T.sizes.psObjective / 4;
const PS_HUD = T.sizes.psHud / 4;
const PS_AMMO = T.sizes.psAmmo / 4;
const PS_AMMOCLIP = T.sizes.psAmmoclip / 4;
const PS_STATS = T.sizes.psStats / 4;
const PS_WEAPONMODELS = T.sizes.psWeaponmodels; // byte offset

// Huffman tree flattened
const HL = Int32Array.from(T.huffL), HR = Int32Array.from(T.huffR), HS = Int32Array.from(T.huffS);

// Scratch for float<->int bit casts
const cvt = new ArrayBuffer(4), cvtI = new Int32Array(cvt), cvtF = new Float32Array(cvt);
const i2f = (i) => { cvtI[0] = i; return cvtF[0]; };
const f2i = (f) => { cvtF[0] = f; return cvtI[0]; };

function minBits(x) { return 32 - Math.clz32(x); }

// A struct backed by an Int32Array with Float32 / Uint8 views on the same memory
function makeState(nInts) {
  const buf = new ArrayBuffer(nInts * 4);
  return { i: new Int32Array(buf), f: new Float32Array(buf), b: new Uint8Array(buf) };
}

const fieldIndex = (list, name) => list.findIndex((f) => f[0] === name);
// entityState int indices (taken from EntityStateFields)
const EF = {};
for (const f of T.List[0]) EF[f[0]] = f[1];
for (const f of T.List[1]) EF[f[0]] = f[1];
const PSF = {};
for (const f of T.PlayerStateFields) PSF[f[0]] = f[1];
const CSF = {};
for (const f of T.ClientStateFields) CSF[f[0]] = f[1];
// number is int 0, eType int 1
const ES = {
  number: 0, eType: 1, eFlags: EF['lerp.eFlags'], trType: EF['lerp.pos.trType'], trTime: EF['lerp.pos.trTime'],
  trDuration: EF['lerp.pos.trDuration'],
  x: EF['lerp.pos.trBase[0]'], y: EF['lerp.pos.trBase[1]'], z: EF['lerp.pos.trBase[2]'],
  dx: EF['lerp.pos.trDelta[0]'], dy: EF['lerp.pos.trDelta[1]'], dz: EF['lerp.pos.trDelta[2]'],
  pitch: EF['lerp.apos.trBase[0]'], yaw: EF['lerp.apos.trBase[1]'], weapon: EF['weapon'], clientNum: EF['ClientNum'],
  otherEntityNum: EF['otherEntityNum'], attackerEntityNum: EF['attackerEntityNum'], eventParm: EF['eventParm'],
  eventSequence: EF['eventSequence'], events: EF['events[0]'], eventParms: EF['eventParms[0]'],
  index: EF['index'], time2: EF['time2'], groundEntityNum: EF['groundEntityNum'], solid: EF['solid'],
  surfType: EF['surfType'], un1: EF['un1'], un2: EF['un2'], legsAnim: EF['legsAnim'], torsoAnim: EF['torsoAnim'],
  weaponModel: EF['weaponModel'], iHeadIcon: EF['iHeadIcon'], iHeadIconTeam: EF['iHeadIconTeam'],
  leanf: EF['lerp.u.player.leanf'], movementDir: EF['lerp.u.player.movementDir'],
};

class Msg {
  constructor(buf, len, protocol) {
    this.buf = buf; this.cur = len; this.rc = 0; this.bit = 0; this.over = false; this.lastRef = -1;
    this.protocol = protocol; this.mapCenter = [0, 0, 0];
  }
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
    for (let i = 0; i < n; i++) {
      if (!(this.bit & 7)) {
        if (this.rc >= this.cur) { this.over = true; return -1; }
        this.bit = 8 * this.rc; this.rc++;
      }
      if ((this.bit >> 3) >= this.cur) return 0;
      r |= ((this.buf[this.bit >> 3] >> (this.bit & 7)) & 1) << i;
      this.bit++;
    }
    return r;
  }
  readByte() {
    if (this.rc + 1 > this.cur) { this.over = true; return -1; }
    return this.buf[this.rc++];
  }
  readShort() {
    if (this.rc + 2 > this.cur) { this.over = true; return -1; }
    const v = this.buf[this.rc] | (this.buf[this.rc + 1] << 8);
    this.rc += 2;
    return (v << 16) >> 16;
  }
  readInt() {
    if (this.rc + 4 > this.cur) { this.over = true; return -1; }
    const b = this.buf, p = this.rc;
    this.rc += 4;
    return b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24);
  }
  readString() {
    let s = '';
    for (;;) {
      const c = this.readByte();
      if (c === -1 || c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  readAngle16() { return this.readShort() * (360.0 / 65536); }
  readEFlags(old) {
    if (this.readBit() === 1) {
      let v = 0;
      for (let i = 0; i < 24; i += 8) v |= this.readByte() << i;
      return v;
    }
    return old ^ (1 << this.readBits(5));
  }
  readOriginFloat(bits, oldValue) {
    if (this.protocol > COD4X_FALLBACK_PROTOCOL) return i2f(this.readInt());
    if (this.readBit()) {
      const coord = Math.trunc(this.mapCenter[bits !== -92 ? 1 : 0] + 0.5);
      return ((Math.trunc(oldValue) - coord + 0x8000) ^ this.readBits(16)) + coord - 0x8000;
    }
    return this.readBits(7) - 64 + oldValue;
  }
  readOriginZFloat(oldValue) {
    if (this.protocol > COD4X_FALLBACK_PROTOCOL) return i2f(this.readInt());
    if (this.readBit()) {
      const coord = Math.trunc(this.mapCenter[2] + 0.5);
      return ((Math.trunc(oldValue) - coord + 0x8000) ^ this.readBits(16)) + coord - 0x8000;
    }
    return this.readBits(7) - 64 + oldValue;
  }
}

function huffDecompress(inBuf, inStart, inLen, out) {
  const lenBits = inLen * 8;
  let off = 0, i = 0;
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

// Read one field (port of Demo::ReadDeltaField). from/to are state objects; base offsets in ints.
function readDeltaField(msg, time, from, fb, to, tb, field, noXor) {
  const idx = field[1], fbits = field[2], hints = field[3];
  const fi = fb + idx, ti = tb + idx;
  const zero = noXor && hints === 3;
  const fromI = zero ? 0 : from.i[fi];
  const fromF = zero ? 0 : from.f[fi];
  const TI = to.i, TF = to.f;

  if (hints !== 2) {
    if (!msg.readBit()) { TI[ti] = fromI; return; }
  }
  if (!fbits) {
    if (!msg.readBit()) { TI[ti] = msg.readBit() << 31; return; }
    if (!msg.readBit()) {
      const b = msg.readBits(5);
      const v = ((32 * msg.readByte() + b) ^ (Math.trunc(fromF) + 4096)) - 4096;
      TF[ti] = v; return;
    }
    TI[ti] = msg.readInt() ^ fromI;
    return;
  }
  switch (fbits) {
    case -89: {
      if (!msg.readBit()) {
        const b = msg.readBits(5);
        const l = (((32 * msg.readByte() + b) ^ (Math.trunc(fromF) + 4096)) - 4096) >>> 0;
        TF[ti] = l; return;
      }
      TI[ti] = msg.readInt() ^ fromI; return;
    }
    case -88: TI[ti] = msg.readInt() ^ fromI; return;
    case -100:
      if (!msg.readBit()) { TF[ti] = 0; return; }
      TF[ti] = msg.readAngle16(); return;
    case -99:
      if (msg.readBit()) {
        if (!msg.readBit()) {
          const b = msg.readBits(4);
          TF[ti] = ((16 * msg.readByte() + b) ^ (Math.trunc(fromF) + 2048)) - 2048; return;
        }
        TI[ti] = msg.readInt() ^ fromI; return;
      }
      TI[ti] = 0; return;
    case -98: TI[ti] = msg.readEFlags(fromI); return;
    case -97:
      if (msg.readBit()) TI[ti] = msg.readInt();
      else TI[ti] = time - msg.readBits(8);
      return;
    case -96: {
      let v;
      if (msg.readBit() === 1) v = 1022;
      else if (msg.readBit() === 1) v = 0;
      else { v = msg.readBits(2); v |= msg.readByte() << 2; }
      TI[ti] = v; return;
    }
    case -95: TI[ti] = 100 * msg.readBits(7); return;
    case -94: case -93: TI[ti] = msg.readByte(); return;
    case -92: case -91: TF[ti] = msg.readOriginFloat(fbits, fromF); return;
    case -90: TF[ti] = msg.readOriginZFloat(fromF); return;
    case -87: TF[ti] = msg.readAngle16(); return;
    case -86: TF[ti] = msg.readBits(5) / 10.0 + 1.399999976158142; return;
    case -85: {
      const tb8 = ti * 4;
      if (msg.readBit()) {
        TI[ti] = fromI;
        to.b[tb8 + 3] = (((fromI >>> 24) & 0xff) !== 0) ? 0 : 0xff;
        return;
      }
      if (!msg.readBit()) {
        to.b[tb8] = msg.readByte(); to.b[tb8 + 1] = msg.readByte(); to.b[tb8 + 2] = msg.readByte();
      }
      to.b[tb8 + 3] = 8 * msg.readBits(5);
      return;
    }
    default: {
      if (!msg.readBit()) { TI[ti] = 0; return; }
      const bits = Math.abs(fbits);
      let bv = bits & 7;
      let t = bv ? msg.readBits(bv) : 0;
      for (; bv < bits; bv += 8) t |= msg.readByte() << bv;
      const mask = bits === 32 ? -1 : (1 << bits) - 1;
      t = t ^ (fromI & mask);
      if (fbits < 0 && ((t >> (bits - 1)) & 1)) t |= ~mask;
      TI[ti] = t;
    }
  }
}

class DemoParser {
  constructor(data, cb) {
    this.data = data; this.pos = 0; this.cb = cb || {};
    this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.protocol = 16;
    this.mapCenter = [0, 0, 0];
    this.configStrings = new Array(MAX_CONFIGSTRINGS).fill('');
    this.clientNames = [];
    for (let i = 0; i < 64; i++) this.clientNames.push({ name: '', clan: '' });
    this.baselines = []; for (let i = 0; i < 1024; i++) this.baselines.push(makeState(ES_INTS));
    this.parseEntities = []; for (let i = 0; i < MAX_PARSE_ENTITIES; i++) this.parseEntities.push(makeState(ES_INTS));
    this.parseClients = []; for (let i = 0; i < MAX_PARSE_CLIENTS; i++) this.parseClients.push(makeState(CS_INTS));
    this.snapshots = []; for (let i = 0; i < PACKET_BACKUP; i++) this.snapshots.push(this.newSnap());
    this.nullES = makeState(ES_INTS); this.nullCS = makeState(CS_INTS); this.nullPS = makeState(PS_INTS);
    this.oldSnap = this.newSnap();
    this.cur = this.newSnap();
    this.parseEntitiesNum = 0; this.parseClientsNum = 0;
    this.snapMessageNum = 0;
    this.serverConfigSequence = 0;
    this.serverCommandSequence = 0;
    this.clientNum = 0;
    this.frames = []; for (let i = 0; i < 256; i++) this.frames.push({ origin: [0, 0, 0], velocity: [0, 0, 0], angles: [0, 0, 0], movementDir: 0, bobCycle: 0, commandTime: 0 });
    this.lastFrameSeq = 0;
    this.gamestateCount = 0;
    this.uncompressed = new Uint8Array(0x20000 * 10);
    this.ended = false;
  }

  newSnap() {
    return { valid: false, snapFlags: 0, serverTime: 0, messageNum: 0, deltaNum: 0, ps: makeState(PS_INTS),
      numEntities: 0, parseEntitiesNum: 0, numClients: 0, parseClientsNum: 0 };
  }
  copySnap(dst, src) {
    dst.valid = src.valid; dst.snapFlags = src.snapFlags; dst.serverTime = src.serverTime; dst.messageNum = src.messageNum;
    dst.deltaNum = src.deltaNum; dst.ps.i.set(src.ps.i); dst.numEntities = src.numEntities;
    dst.parseEntitiesNum = src.parseEntitiesNum; dst.numClients = src.numClients; dst.parseClientsNum = src.parseClientsNum;
  }

  parse() {
    while (this.pos < this.data.length && !this.ended) this.step();
  }

  // Reads one record from the demo file
  step() {
    const type = this.data[this.pos++];
    if (type === 0) this.readMessage();
    else if (type === 1) this.readArchive();
    else if (type === 2) this.readProtocol();
    else this.ended = true;
  }

  readProtocol() {
    this.protocol = this.dv.getUint32(this.pos, true);
    this.pos += 16;
  }

  readArchive() {
    const dv = this.dv, p = this.pos;
    const seq = dv.getInt32(p, true);
    const fr = this.frames[seq & 255];
    fr.origin[0] = dv.getFloat32(p + 4, true); fr.origin[1] = dv.getFloat32(p + 8, true); fr.origin[2] = dv.getFloat32(p + 12, true);
    fr.velocity[0] = dv.getFloat32(p + 16, true); fr.velocity[1] = dv.getFloat32(p + 20, true); fr.velocity[2] = dv.getFloat32(p + 24, true);
    fr.movementDir = dv.getInt32(p + 28, true); fr.bobCycle = dv.getInt32(p + 32, true); fr.commandTime = dv.getInt32(p + 36, true);
    fr.angles[0] = dv.getFloat32(p + 40, true); fr.angles[1] = dv.getFloat32(p + 44, true); fr.angles[2] = dv.getFloat32(p + 48, true);
    this.lastFrameSeq = seq;
    this.pos += 52;
  }

  readMessage() {
    const dv = this.dv;
    const seq = dv.getInt32(this.pos, true);
    if (seq === -1) { this.ended = true; return; }
    let size = dv.getInt32(this.pos + 4, true);
    this.pos += 12; // seq, size, dummy
    size -= 4;
    if (size < 0 || this.pos + size > this.data.length) { this.ended = true; return; }
    const outLen = huffDecompress(this.data, this.pos, size, this.uncompressed);
    this.pos += size;

    const msg = new Msg(this.uncompressed, outLen, this.protocol);
    msg.mapCenter = this.mapCenter;
    this.msgSeq = seq;
    for (;;) {
      if (msg.rc > msg.cur) break;
      const cmd = msg.readByte();
      if (cmd === 7 || cmd === -1) break;
      if (cmd === 1) this.parseGamestate(msg);
      else if (cmd === 4) this.parseCommandString(msg);
      else if (cmd === 6) this.parseSnapshot(msg);
      else if (cmd === 11) this.parseConfigClient(msg);
      else return;
    }
  }

  setConfigString(idx, s) {
    if (idx === 12) {
      const p = s.split(/\s+/).map(Number);
      this.mapCenter[0] = p[0] || 0; this.mapCenter[1] = p[1] || 0; this.mapCenter[2] = p[2] || 0;
    }
    if (idx >= 0 && idx < MAX_CONFIGSTRINGS) {
      this.configStrings[idx] = s;
      if (this.cb.configString) this.cb.configString(idx, s);
    }
  }

  parseGamestate(msg) {
    if (++this.gamestateCount > 1) {
      this.parseEntitiesNum = 0; this.parseClientsNum = 0;
      this.configStrings.fill('');
      for (const b of this.baselines) b.i.fill(0);
    }
    msg.lastRef = -1;
    this.serverCommandSequence = msg.readInt();
    const isX = this.protocol !== COD4_PROTOCOL;
    let idx = -1;
    for (;;) {
      const cmd = msg.readByte();
      if (cmd === 7 || cmd === -1) break;
      if (cmd === 2) {
        let n = isX ? msg.readInt() : msg.readShort();
        if (n < 0 || n >= (isX ? 2 : 1) * MAX_CONFIGSTRINGS) break;
        while (n-- > 0) {
          if (isX) idx = msg.readInt();
          else if (msg.readBit()) idx++;
          else idx = msg.readBits(12);
          const s = msg.readString();
          if (s.length) this.setConfigString(idx, s);
        }
      } else if (cmd === 3) {
        const newnum = this.readEntityIndex(msg, 10);
        if (newnum >= 1024 || newnum < 0) { msg.over = true; return; }
        this.nullES.i.fill(0);
        this.readDeltaEntity(msg, 0, this.nullES, this.baselines[newnum], newnum);
      } else if (cmd === 11 && isX) {
        const cn = msg.readByte();
        if (cn >= 64) break;
        this.clientNames[cn].name = msg.readString();
        this.clientNames[cn].clan = msg.readString();
        if (this.cb.clientName) this.cb.clientName(cn, this.clientNames[cn]);
      } else break;
    }
    if (isX) this.serverConfigSequence = msg.readInt();
    this.clientNum = msg.readInt();
    msg.readInt(); // checksum feed
    if (this.protocol === COD4X_FALLBACK_PROTOCOL + 1) msg.readInt();
    if (this.cb.gamestate) this.cb.gamestate(this);
  }

  parseCommandString(msg) {
    const seq = msg.readInt();
    const s = msg.readString();
    // configstring updates
    if (s.charCodeAt(0) === 100 && s.charCodeAt(1) === 32) {
      const sp = s.indexOf(' ', 2);
      const idx = parseInt(s.slice(2, sp < 0 ? undefined : sp), 10);
      if (idx >= 0 && idx < MAX_CONFIGSTRINGS) this.setConfigString(idx, sp < 0 ? '' : s.slice(sp + 1));
    }
    if (this.cb.serverCommand) this.cb.serverCommand(s, seq, this);
  }

  parseConfigClient(msg) {
    const sequence = msg.readInt();
    if (sequence !== this.serverConfigSequence + 1) {
      msg.readByte(); msg.readString(); msg.readString();
      return;
    }
    this.serverConfigSequence = sequence;
    const cn = msg.readByte();
    const name = msg.readString(), clan = msg.readString();
    if (cn >= 0 && cn < 64) {
      this.clientNames[cn].name = name; this.clientNames[cn].clan = clan;
      if (this.cb.clientName) this.cb.clientName(cn, this.clientNames[cn]);
    }
  }

  readEntityIndex(msg, indexBits) {
    if (msg.readBit()) ++msg.lastRef;
    else if (indexBits !== 10 || msg.readBit()) msg.lastRef = msg.readBits(indexBits);
    else msg.lastRef += msg.readBits(4);
    return msg.lastRef;
  }

  // returns true if entity removed
  readDeltaEntity(msg, time, from, to, number) {
    if (msg.readBit() === 1) return true;
    to.i[0] = number;
    this.readDeltaFields(msg, time, from, to, T.List[0], 0x3D, true);
    return false;
  }
  readDeltaClient(msg, time, from, to, number) {
    if (msg.readBit() === 1) return true;
    to.i[0] = number;
    this.readDeltaFields(msg, time, from, to, T.ClientStateFields, T.ClientStateFields.length, false);
    return false;
  }
  readDeltaFields(msg, time, from, to, fields, lcTotal, isEntity) {
    let numFields = fields.length;
    if (!msg.readBit()) {
      to.i.set(from.i.subarray(0, Math.min(numFields + 1, from.i.length)));
      return;
    }
    const lc = msg.readBits(minBits(lcTotal));
    if (lc > numFields) { msg.over = true; return; }
    readDeltaField(msg, time, from, 0, to, 0, fields[0], false);
    if (isEntity) {
      let et = to.i[fields[0][1]];
      if (et > 17 || et < 0) et = 17;
      fields = T.List[et];
      numFields = fields.length;
    }
    for (let i = 1; i < lc; i++) readDeltaField(msg, time, from, 0, to, 0, fields[i], false);
    for (let i = lc; i < numFields; i++) { const o = fields[i][1]; to.i[o] = from.i[o]; }
  }

  parseSnapshot(msg) {
    const cur = this.cur;
    cur.valid = false;
    cur.serverTime = msg.readInt();
    cur.messageNum = this.msgSeq;
    const deltaNum = msg.readByte();
    cur.deltaNum = !deltaNum ? -1 : cur.messageNum - deltaNum;
    cur.snapFlags = msg.readByte();

    const old = this.oldSnap;
    old.valid = false; old.numEntities = 0; old.numClients = 0; old.parseEntitiesNum = 0; old.parseClientsNum = 0;
    if (cur.deltaNum > 0) {
      const s = this.snapshots[cur.deltaNum & PACKET_MASK];
      if (!s.valid || s.messageNum !== cur.deltaNum ||
        this.parseEntitiesNum - s.parseEntitiesNum > 1920 || this.parseClientsNum - s.parseClientsNum > 1920) {
        msg.rc = msg.cur; msg.over = true;
        return;
      }
      this.copySnap(old, s);
    }
    cur.valid = true;
    this.readDeltaPlayerState(msg, cur.serverTime, old.valid ? old.ps : this.nullPS, cur.ps, true);
    msg.lastRef = -1;
    this.parsePacketEntities(msg, cur.serverTime, old, cur);
    msg.lastRef = -1;
    this.parsePacketClients(msg, cur.serverTime, old, cur);
    if (msg.over) return;

    let oldMessageNum = this.snapMessageNum + 1;
    if (cur.messageNum - oldMessageNum >= PACKET_BACKUP) oldMessageNum = cur.messageNum - (PACKET_BACKUP - 1);
    while (oldMessageNum < cur.messageNum) { this.snapshots[oldMessageNum & PACKET_MASK].valid = false; oldMessageNum++; }
    this.snapMessageNum = cur.messageNum;
    this.copySnap(this.snapshots[this.snapMessageNum & PACKET_MASK], cur);
    if (this.cb.snapshot) this.cb.snapshot(cur, this);
  }

  // Iterate entities of a snapshot
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

  parsePacketEntities(msg, time, from, to) {
    to.parseEntitiesNum = this.parseEntitiesNum;
    to.numEntities = 0;
    const PE = this.parseEntities, M = MAX_PARSE_ENTITIES - 1;
    let oldindex = 0, oldstate = null, oldnum;
    if (from.numEntities > 0) { oldstate = PE[from.parseEntitiesNum & M]; oldnum = oldstate.i[0]; }
    else oldnum = 99999;
    const advance = () => {
      if (++oldindex < from.numEntities) { oldstate = PE[(oldindex + from.parseEntitiesNum) & M]; oldnum = oldstate.i[0]; }
      else oldnum = 99999;
    };
    while (!msg.over) {
      const newnum = this.readEntityIndex(msg, 10);
      if (newnum === 1023) break;
      if (msg.rc > msg.cur || newnum >= 1024 || newnum < 0) { msg.over = true; return; }
      while (oldnum < newnum && !msg.over && oldstate) {
        PE[this.parseEntitiesNum++ & M].i.set(oldstate.i);
        ++to.numEntities;
        advance();
      }
      if (oldnum === newnum) {
        this.deltaEntity(msg, time, to, newnum, oldstate);
        advance();
      } else {
        this.deltaEntity(msg, time, to, newnum, this.baselines[newnum]);
      }
    }
    while (oldnum !== 99999 && !msg.over) {
      PE[this.parseEntitiesNum++ & M].i.set(oldstate.i);
      ++to.numEntities;
      advance();
    }
  }
  deltaEntity(msg, time, frame, newnum, old) {
    const slot = this.parseEntities[this.parseEntitiesNum & (MAX_PARSE_ENTITIES - 1)];
    if (!this.readDeltaEntity(msg, time, old, slot, newnum)) { ++this.parseEntitiesNum; ++frame.numEntities; }
  }

  parsePacketClients(msg, time, from, to) {
    to.parseClientsNum = this.parseClientsNum;
    to.numClients = 0;
    const PC = this.parseClients, M = MAX_PARSE_CLIENTS - 1;
    let oldindex = 0, oldstate = null, oldnum;
    if (from.numClients > 0) { oldstate = PC[from.parseClientsNum & M]; oldnum = oldstate.i[0]; }
    else oldnum = 99999;
    const advance = () => {
      if (++oldindex < from.numClients) { oldstate = PC[(oldindex + from.parseClientsNum) & M]; oldnum = oldstate.i[0]; }
      else oldnum = 99999;
    };
    while (!msg.over && msg.readBit() === 1) {
      const newnum = this.readEntityIndex(msg, 6);
      if (msg.rc > msg.cur || newnum >= 64 || newnum < 0) { msg.over = true; return; }
      while (oldnum < newnum) { this.deltaClient(msg, time, to, oldnum, oldstate, true); advance(); }
      if (oldnum === newnum) { this.deltaClient(msg, time, to, newnum, oldstate, false); advance(); }
      else { this.nullCS.i.fill(0); this.deltaClient(msg, time, to, newnum, this.nullCS, false); }
    }
    while (oldnum !== 99999 && !msg.over) { this.deltaClient(msg, time, to, oldnum, oldstate, true); advance(); }
  }
  deltaClient(msg, time, frame, newnum, old, unchanged) {
    const state = this.parseClients[this.parseClientsNum & (MAX_PARSE_CLIENTS - 1)];
    if (unchanged) state.i.set(old.i);
    else if (this.readDeltaClient(msg, time, old, state, newnum)) return;
    ++this.parseClientsNum; ++frame.numClients;
  }

  readDeltaPlayerState(msg, time, from, to, predictedFieldsIgnoreXor) {
    to.i.set(from.i);
    const readOriginAndVel = msg.readBit() > 0;
    const fields = T.PlayerStateFields;
    const lcf = msg.readBits(minBits(fields.length));
    if (lcf > fields.length || lcf < 0) { msg.over = true; return; }
    for (let i = 0; i < lcf; i++) {
      const noXor = predictedFieldsIgnoreXor && readOriginAndVel && fields[i][3] === 3;
      readDeltaField(msg, time, from, 0, to, 0, fields[i], noXor);
    }
    if (!readOriginAndVel) {
      const fr = this.predictedFrame(to.i[PSF.commandTime]);
      const o = PSF['origin[0]'], v = PSF['velocity[0]'], a = PSF['viewangles[0]'];
      if (fr) {
        for (let k = 0; k < 3; k++) { to.f[o + k] = fr.origin[k]; to.f[v + k] = fr.velocity[k]; to.f[a + k] = fr.angles[k]; }
        to.i[PSF.bobCycle] = fr.bobCycle; to.i[PSF.movementDir] = fr.movementDir;
      } else {
        for (let k = 0; k < 3; k++) { to.i[o + k] = from.i[o + k]; to.i[v + k] = from.i[v + k]; to.i[a + k] = from.i[a + k]; }
        to.i[PSF.bobCycle] = from.i[PSF.bobCycle]; to.i[PSF.movementDir] = from.i[PSF.movementDir];
      }
    }
    // stats
    if (msg.readBit()) {
      const sb = msg.readBits(5);
      if (sb & 1) to.i[PS_STATS] = msg.readShort();
      if (sb & 2) to.i[PS_STATS + 1] = msg.readShort();
      if (sb & 4) to.i[PS_STATS + 2] = msg.readShort();
      if (sb & 8) to.i[PS_STATS + 3] = msg.readBits(6);
      if (sb & 16) to.i[PS_STATS + 4] = msg.readByte();
    }
    // ammo
    if (msg.readBit()) {
      for (let j = 0; j < 4; j++) {
        if (msg.readBit()) {
          const bits = msg.readShort();
          for (let i = 0; i < 16; i++) if (bits & (1 << i)) to.i[PS_AMMO + i + j * 16] = msg.readShort();
        }
      }
    }
    for (let j = 0; j < 8; j++) {
      if (msg.readBit()) {
        const bits = msg.readShort();
        for (let i = 0; i < 16; i++) if (bits & (1 << i)) to.i[PS_AMMOCLIP + i + j * 16] = msg.readShort();
      }
    }
    // objectives
    if (msg.readBit()) {
      for (let n = 0; n < 16; n++) {
        const base = PS_OBJ + n * OBJ_INTS;
        to.i[base] = msg.readBits(3);
        if (msg.readBit()) {
          for (const f of T.ObjectiveFields) readDeltaField(msg, time, from, base, to, base, f, false);
        } else {
          for (let k = 1; k < OBJ_INTS; k++) to.i[base + k] = from.i[base + k];
        }
      }
    }
    // huds (archival then current, as in the reference)
    if (msg.readBit()) {
      this.readDeltaHudElems(msg, time, from, to, PS_HUD + 31 * HUD_INTS);
      this.readDeltaHudElems(msg, time, from, to, PS_HUD);
    }
    if (msg.readBit()) {
      for (let i = 0; i < 128; i++) to.b[PS_WEAPONMODELS + i] = msg.readByte();
    }
  }
  readDeltaHudElems(msg, time, from, to, base) {
    const inuse = msg.readBits(5);
    for (let i = 0; i < inuse; i++) {
      const lc = msg.readBits(6);
      if (lc >= T.HudElemFields.length || lc < 0) { msg.over = true; return; }
      const b = base + i * HUD_INTS;
      for (let y = 0; y <= lc; y++) readDeltaField(msg, time, from, b, to, b, T.HudElemFields[y], false);
    }
    for (let k = inuse; k < 31 && to.i[base + k * HUD_INTS]; k++) to.i.fill(0, base + k * HUD_INTS, base + (k + 1) * HUD_INTS);
  }

  predictedFrame(time) {
    let i = this.lastFrameSeq;
    for (let c = 0; c <= 256; c++, i--) {
      i &= 255;
      if (this.frames[i].commandTime <= time) return this.frames[i];
    }
    return null;
  }
}

DemoParser.ES = ES;
DemoParser.PSF = PSF;
DemoParser.CSF = CSF;
DemoParser.PS_STATS = PS_STATS;
DemoParser.PS_AMMO = PS_AMMO;
DemoParser.PS_AMMOCLIP = PS_AMMOCLIP;
DemoParser.PS_OBJ = PS_OBJ;
DemoParser.OBJ_INTS = OBJ_INTS;
DemoParser.i2f = i2f;
DemoParser.f2i = f2i;

export { DemoParser };
