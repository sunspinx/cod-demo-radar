// Decoder for CoD4 .iwi textures (version 6). Supports ARGB32, RGB24, A8L8, A8, DXT1, DXT3, DXT5.
// decodeIWI(Uint8Array) -> { width, height, rgba: Uint8ClampedArray }

function rgb565(c, out, o) {
  out[o] = ((c >> 11) & 31) * 255 / 31;
  out[o + 1] = ((c >> 5) & 63) * 255 / 63;
  out[o + 2] = (c & 31) * 255 / 31;
}

// Decode one 4x4 colour block (DXT1 style) into 16 RGBA texels
function colorBlock(d, p, px, dxt1) {
  const c0 = d[p] | (d[p + 1] << 8), c1 = d[p + 2] | (d[p + 3] << 8);
  const pal = new Uint8Array(16);
  rgb565(c0, pal, 0); rgb565(c1, pal, 4);
  pal[3] = pal[7] = 255;
  if (c0 > c1 || !dxt1) {
    for (let k = 0; k < 3; k++) {
      pal[8 + k] = (2 * pal[k] + pal[4 + k]) / 3;
      pal[12 + k] = (pal[k] + 2 * pal[4 + k]) / 3;
    }
    pal[11] = pal[15] = 255;
  } else {
    for (let k = 0; k < 3; k++) pal[8 + k] = (pal[k] + pal[4 + k]) / 2;
    pal[11] = 255;
    pal[12] = pal[13] = pal[14] = pal[15] = 0;
  }
  const bits = d[p + 4] | (d[p + 5] << 8) | (d[p + 6] << 16) | (d[p + 7] << 24);
  for (let i = 0; i < 16; i++) {
    const idx = (bits >>> (2 * i)) & 3;
    px[i * 4] = pal[idx * 4]; px[i * 4 + 1] = pal[idx * 4 + 1]; px[i * 4 + 2] = pal[idx * 4 + 2]; px[i * 4 + 3] = pal[idx * 4 + 3];
  }
}

function decodeDXT(d, off, w, h, fmt) {
  const out = new Uint8ClampedArray(w * h * 4);
  const px = new Uint8Array(64);
  const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
  const bsize = fmt === 'dxt1' ? 8 : 16;
  let p = off;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++, p += bsize) {
      const cp = fmt === 'dxt1' ? p : p + 8;
      colorBlock(d, cp, px, fmt === 'dxt1');
      if (fmt === 'dxt3') {
        for (let i = 0; i < 16; i++) {
          const a = (d[p + (i >> 1)] >> ((i & 1) * 4)) & 15;
          px[i * 4 + 3] = a * 17;
        }
      } else if (fmt === 'dxt5') {
        const a0 = d[p], a1 = d[p + 1];
        const at = [a0, a1];
        if (a0 > a1) for (let k = 1; k < 7; k++) at.push(((7 - k) * a0 + k * a1) / 7);
        else { for (let k = 1; k < 5; k++) at.push(((5 - k) * a0 + k * a1) / 5); at.push(0, 255); }
        // 48 bits of 3-bit indices
        let lo = d[p + 2] | (d[p + 3] << 8) | (d[p + 4] << 16);
        let hi = d[p + 5] | (d[p + 6] << 8) | (d[p + 7] << 16);
        for (let i = 0; i < 16; i++) {
          const v = i < 8 ? (lo >> (3 * i)) & 7 : (hi >> (3 * (i - 8))) & 7;
          px[i * 4 + 3] = at[v];
        }
      }
      for (let y = 0; y < 4; y++) {
        const yy = by * 4 + y;
        if (yy >= h) break;
        for (let x = 0; x < 4; x++) {
          const xx = bx * 4 + x;
          if (xx >= w) break;
          const o = (yy * w + xx) * 4, s = (y * 4 + x) * 4;
          out[o] = px[s]; out[o + 1] = px[s + 1]; out[o + 2] = px[s + 2]; out[o + 3] = px[s + 3];
        }
      }
    }
  }
  return out;
}

function decodeIWI(d) {
  if (d[0] !== 0x49 || d[1] !== 0x57 || d[2] !== 0x69) throw new Error('Not an IWI file');
  const version = d[3];
  if (version !== 6 && version !== 5) throw new Error('Unsupported IWI version ' + version);
  const fmtCode = d[4];
  const w = d[6] | (d[7] << 8), h = d[8] | (d[9] << 8);
  let size, fmt;
  switch (fmtCode) {
    case 1: fmt = 'argb'; size = w * h * 4; break;
    case 2: fmt = 'rgb'; size = w * h * 3; break;
    case 3: fmt = 'al'; size = w * h * 2; break;
    case 4: fmt = 'a'; size = w * h; break;
    case 0x0B: fmt = 'dxt1'; size = Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 8; break;
    case 0x0C: fmt = 'dxt3'; size = Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 16; break;
    case 0x0D: fmt = 'dxt5'; size = Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 16; break;
    default: throw new Error('Unsupported IWI format ' + fmtCode);
  }
  // The largest mip level is stored last
  const off = d.length - size;
  if (off < 28) throw new Error('Truncated IWI');
  let rgba;
  if (fmt.startsWith('dxt')) rgba = decodeDXT(d, off, w, h, fmt);
  else {
    rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, p = off; i < w * h; i++) {
      const o = i * 4;
      if (fmt === 'argb') { rgba[o + 2] = d[p++]; rgba[o + 1] = d[p++]; rgba[o] = d[p++]; rgba[o + 3] = d[p++]; }
      else if (fmt === 'rgb') { rgba[o + 2] = d[p++]; rgba[o + 1] = d[p++]; rgba[o] = d[p++]; rgba[o + 3] = 255; }
      else if (fmt === 'al') { rgba[o] = rgba[o + 1] = rgba[o + 2] = d[p++]; rgba[o + 3] = d[p++]; }
      else { rgba[o] = rgba[o + 1] = rgba[o + 2] = 255; rgba[o + 3] = d[p++]; }
    }
  }
  return { width: w, height: h, rgba };
}

export { decodeIWI };
