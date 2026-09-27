// Cuberoot's own encryption engine. Plain JavaScript, no browser crypto.
// Implements exactly the standard algorithms the library has always used, so every
// file encrypted before still opens:
//   SHA-256 (FIPS 180-4), HMAC-SHA-256 (RFC 2104), PBKDF2-HMAC-SHA-256 (RFC 8018),
//   AES-256 (FIPS 197) in GCM mode with a 96-bit IV and 128-bit tag (NIST SP 800-38D).
// It also has its own UTF-8 and Base64 routines.
// The only thing taken from the device is secure randomness (see randomBytes), which
// JavaScript cannot produce on its own; that function works on every page, http or https.

// ============================ UTF-8 ============================
export function utf8Encode(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const d = str.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
      else c = 0xfffd;
    } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

export function utf8Decode(bytes) {
  let s = '';
  const CH = [];
  const flush = () => { s += String.fromCharCode.apply(null, CH); CH.length = 0; };
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let c, n = 0;
    if (b < 0x80) { c = b; n = 1; }
    else if ((b & 0xe0) === 0xc0 && i + 1 < bytes.length) { c = ((b & 31) << 6) | (bytes[i + 1] & 63); n = 2; }
    else if ((b & 0xf0) === 0xe0 && i + 2 < bytes.length) { c = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63); n = 3; }
    else if ((b & 0xf8) === 0xf0 && i + 3 < bytes.length) { c = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63); n = 4; }
    else { c = 0xfffd; n = 1; }
    i += n;
    if (c >= 0x10000) { c -= 0x10000; CH.push(0xd800 + (c >> 10), 0xdc00 + (c & 1023)); }
    else CH.push(c);
    if (CH.length > 8000) flush();
  }
  flush();
  return s;
}

// ============================ Base64 ============================
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64R = new Int16Array(256).fill(-1);
for (let i = 0; i < 64; i++) B64R[B64.charCodeAt(i)] = i;

export function toBase64(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const parts = [];
  let chunk = '';
  let i = 0;
  for (; i + 2 < u.length; i += 3) {
    const n = (u[i] << 16) | (u[i + 1] << 8) | u[i + 2];
    chunk += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    if (chunk.length >= 65536) { parts.push(chunk); chunk = ''; }
  }
  if (i < u.length) {
    const n = (u[i] << 16) | ((i + 1 < u.length ? u[i + 1] : 0) << 8);
    chunk += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < u.length ? B64[(n >> 6) & 63] : '=') + '=';
  }
  parts.push(chunk);
  return parts.join('');
}

export function fromBase64(str) {
  const s = String(str).replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor(s.length * 3 / 4));
  let o = 0, buf = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    buf = (buf << 6) | B64R[s.charCodeAt(i)];
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; }
  }
  return out.subarray(0, o);
}

// ============================ Randomness ============================
export function randomBytes(n) {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') throw new Error('no-random');
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) c.getRandomValues(u.subarray(i, Math.min(n, i + 65536)));
  return u;
}

// ============================ SHA-256 ============================
const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
const IV256 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const W = new Int32Array(64);

// Compress one 64-byte block (given as 16 big-endian words) into state H (Int32Array(8)).
function compress(H, M) {
  for (let t = 0; t < 16; t++) W[t] = M[t];
  for (let t = 16; t < 64; t++) {
    const x = W[t - 15], y = W[t - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
  }
  let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
  for (let t = 0; t < 64; t++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[t] + W[t]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const mj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + mj) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
  H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
}

function sha256From(H0, bytes, prefixLen) {
  // Hash `bytes` continuing from state H0 which already absorbed prefixLen bytes (multiple of 64).
  const H = new Int32Array(H0);
  const total = prefixLen + bytes.length;
  const padLen = ((bytes.length + 9 + 63) & ~63);
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const bits = total * 8;
  const hi = Math.floor(bits / 0x100000000), lo = bits >>> 0;
  buf[padLen - 8] = hi >>> 24; buf[padLen - 7] = hi >>> 16; buf[padLen - 6] = hi >>> 8; buf[padLen - 5] = hi;
  buf[padLen - 4] = lo >>> 24; buf[padLen - 3] = lo >>> 16; buf[padLen - 2] = lo >>> 8; buf[padLen - 1] = lo;
  const M = new Int32Array(16);
  for (let off = 0; off < padLen; off += 64) {
    for (let j = 0; j < 16; j++) {
      const k = off + j * 4;
      M[j] = (buf[k] << 24) | (buf[k + 1] << 16) | (buf[k + 2] << 8) | buf[k + 3];
    }
    compress(H, M);
  }
  return H;
}
function wordsToBytes(H, n = 8) {
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) { out[i * 4] = H[i] >>> 24; out[i * 4 + 1] = H[i] >>> 16; out[i * 4 + 2] = H[i] >>> 8; out[i * 4 + 3] = H[i]; }
  return out;
}

export function sha256(bytes) { return wordsToBytes(sha256From(IV256, bytes, 0)); }

// ============================ HMAC / PBKDF2 ============================
function hmacStates(key) {
  let k = key.length > 64 ? sha256(key) : key;
  const kp = new Uint8Array(64); kp.set(k);
  const ipad = new Int32Array(16), opad = new Int32Array(16);
  for (let j = 0; j < 16; j++) {
    const w = (kp[j * 4] << 24) | (kp[j * 4 + 1] << 16) | (kp[j * 4 + 2] << 8) | kp[j * 4 + 3];
    ipad[j] = w ^ 0x36363636; opad[j] = w ^ 0x5c5c5c5c;
  }
  const inner = new Int32Array(IV256); compress(inner, ipad);
  const outer = new Int32Array(IV256); compress(outer, opad);
  return { inner, outer };
}

export function hmacSha256(key, msg) {
  const { inner, outer } = hmacStates(key);
  const ih = wordsToBytes(sha256From(inner, msg, 64));
  return wordsToBytes(sha256From(outer, ih, 64));
}

// PBKDF2-HMAC-SHA-256 producing 32 bytes (one block), as used for all library keys.
export function pbkdf2Sha256(password, salt, iterations) {
  const { inner, outer } = hmacStates(password);
  const first = new Uint8Array(salt.length + 4);
  first.set(salt); first[salt.length + 3] = 1;
  let U = sha256From(outer, wordsToBytes(sha256From(inner, first, 64)), 64);
  const T = new Int32Array(U);
  // Fast path: every later message is exactly 32 bytes, so each HMAC is two compressions.
  const M = new Int32Array(16);
  const Hs = new Int32Array(8);
  for (let it = 1; it < iterations; it++) {
    // inner: state `inner` + (U || 0x80 || 0.. || len=768 bits)
    for (let j = 0; j < 8; j++) M[j] = U[j];
    M[8] = 0x80000000; M[9] = 0; M[10] = 0; M[11] = 0; M[12] = 0; M[13] = 0; M[14] = 0; M[15] = 768;
    Hs.set(inner); compress(Hs, M);
    for (let j = 0; j < 8; j++) M[j] = Hs[j];
    M[8] = 0x80000000; M[9] = 0; M[10] = 0; M[11] = 0; M[12] = 0; M[13] = 0; M[14] = 0; M[15] = 768;
    const O = new Int32Array(outer); compress(O, M);
    U = O;
    for (let j = 0; j < 8; j++) T[j] ^= U[j];
  }
  return wordsToBytes(T);
}

// ============================ AES-256 ============================
const SBOX = new Uint8Array(256);
const T0 = new Int32Array(256), T1 = new Int32Array(256), T2 = new Int32Array(256), T3 = new Int32Array(256);
(function initTables() {
  const d = new Uint8Array(256), th = new Uint8Array(256);
  for (let i = 0; i < 256; i++) th[(d[i] = (i << 1) ^ ((i >> 7) * 0x11b)) ^ i] = i;
  for (let x = 0, x2, x4, x8, s, xInv = 0; !SBOX[x]; x ^= x2 || 1, xInv = th[xInv] || 1) {
    s = xInv ^ (xInv << 1) ^ (xInv << 2) ^ (xInv << 3) ^ (xInv << 4);
    s = (s >> 8) ^ (s & 255) ^ 0x63;
    SBOX[x] = s;
    x8 = d[x4 = d[x2 = d[x]]];
    const enc = (d[s] * 0x101) ^ (s * 0x1010100);
    T0[x] = (enc << 24) | (enc >>> 8);
    T1[x] = (T0[x] << 24) | (T0[x] >>> 8);
    T2[x] = (T1[x] << 24) | (T1[x] >>> 8);
    T3[x] = (T2[x] << 24) | (T2[x] >>> 8);
  }
})();

function expandKey(key) {
  if (key.length !== 32) throw new Error('AES-256 needs a 32-byte key');
  const w = new Int32Array(60);
  for (let i = 0; i < 8; i++) w[i] = (key[i * 4] << 24) | (key[i * 4 + 1] << 16) | (key[i * 4 + 2] << 8) | key[i * 4 + 3];
  let rcon = 1;
  for (let i = 8; i < 60; i++) {
    let t = w[i - 1];
    if (i % 8 === 0) {
      t = (t << 8) | (t >>> 24);
      t = (SBOX[t >>> 24] << 24) | (SBOX[(t >>> 16) & 255] << 16) | (SBOX[(t >>> 8) & 255] << 8) | SBOX[t & 255];
      t ^= rcon << 24;
      rcon = (rcon << 1) ^ ((rcon >> 7) * 0x11b);
    } else if (i % 8 === 4) {
      t = (SBOX[t >>> 24] << 24) | (SBOX[(t >>> 16) & 255] << 16) | (SBOX[(t >>> 8) & 255] << 8) | SBOX[t & 255];
    }
    w[i] = w[i - 8] ^ t;
  }
  return w;
}

// Encrypt one block given as 4 words; writes the 4 result words into out.
function encryptBlock(w, a0, a1, a2, a3, out) {
  let s0 = a0 ^ w[0], s1 = a1 ^ w[1], s2 = a2 ^ w[2], s3 = a3 ^ w[3];
  let k = 4;
  for (let r = 1; r < 14; r++) {
    const t0 = T0[s0 >>> 24] ^ T1[(s1 >>> 16) & 255] ^ T2[(s2 >>> 8) & 255] ^ T3[s3 & 255] ^ w[k];
    const t1 = T0[s1 >>> 24] ^ T1[(s2 >>> 16) & 255] ^ T2[(s3 >>> 8) & 255] ^ T3[s0 & 255] ^ w[k + 1];
    const t2 = T0[s2 >>> 24] ^ T1[(s3 >>> 16) & 255] ^ T2[(s0 >>> 8) & 255] ^ T3[s1 & 255] ^ w[k + 2];
    const t3 = T0[s3 >>> 24] ^ T1[(s0 >>> 16) & 255] ^ T2[(s1 >>> 8) & 255] ^ T3[s2 & 255] ^ w[k + 3];
    s0 = t0; s1 = t1; s2 = t2; s3 = t3; k += 4;
  }
  out[0] = ((SBOX[s0 >>> 24] << 24) | (SBOX[(s1 >>> 16) & 255] << 16) | (SBOX[(s2 >>> 8) & 255] << 8) | SBOX[s3 & 255]) ^ w[k];
  out[1] = ((SBOX[s1 >>> 24] << 24) | (SBOX[(s2 >>> 16) & 255] << 16) | (SBOX[(s3 >>> 8) & 255] << 8) | SBOX[s0 & 255]) ^ w[k + 1];
  out[2] = ((SBOX[s2 >>> 24] << 24) | (SBOX[(s3 >>> 16) & 255] << 16) | (SBOX[(s0 >>> 8) & 255] << 8) | SBOX[s1 & 255]) ^ w[k + 2];
  out[3] = ((SBOX[s3 >>> 24] << 24) | (SBOX[(s0 >>> 16) & 255] << 16) | (SBOX[(s1 >>> 8) & 255] << 8) | SBOX[s2 & 255]) ^ w[k + 3];
}

// ============================ GHASH (4-bit tables) ============================
const LAST4 = [0x0000, 0x1c20, 0x3840, 0x2460, 0x7080, 0x6ca0, 0x48c0, 0x54e0,
  0xe100, 0xfd20, 0xd940, 0xc560, 0x9180, 0x8da0, 0xa9c0, 0xb5e0];

function ghashTables(h) {
  // h: 4 words of H. Tables hold 16 entries of 4 words each.
  const Tb = new Int32Array(64);
  let a = h[0], b = h[1], c = h[2], d = h[3];
  Tb.set([a, b, c, d], 8 * 4);
  for (let i = 4; i > 0; i >>= 1) {
    const carry = d & 1;
    d = (d >>> 1) | (c << 31); c = (c >>> 1) | (b << 31); b = (b >>> 1) | (a << 31); a = a >>> 1;
    if (carry) a ^= 0xe1000000;
    Tb[i * 4] = a; Tb[i * 4 + 1] = b; Tb[i * 4 + 2] = c; Tb[i * 4 + 3] = d;
  }
  for (let i = 2; i <= 8; i *= 2) {
    for (let j = 1; j < i; j++) {
      for (let q = 0; q < 4; q++) Tb[(i + j) * 4 + q] = Tb[i * 4 + q] ^ Tb[j * 4 + q];
    }
  }
  return Tb;
}

// Y = (Y xor X) * H, where Y and X are 16 bytes; Y is updated in place.
function ghashBlock(Tb, Y) {
  let a = 0, b = 0, c = 0, d = 0;
  for (let i = 15; i >= 0; i--) {
    const x = Y[i];
    const lo = x & 15, hi = x >>> 4;
    if (i !== 15) {
      const rem = d & 15;
      d = (d >>> 4) | (c << 28); c = (c >>> 4) | (b << 28); b = (b >>> 4) | (a << 28); a = a >>> 4;
      a ^= LAST4[rem] << 16;
    }
    a ^= Tb[lo * 4]; b ^= Tb[lo * 4 + 1]; c ^= Tb[lo * 4 + 2]; d ^= Tb[lo * 4 + 3];
    const rem = d & 15;
    d = (d >>> 4) | (c << 28); c = (c >>> 4) | (b << 28); b = (b >>> 4) | (a << 28); a = a >>> 4;
    a ^= LAST4[rem] << 16;
    a ^= Tb[hi * 4]; b ^= Tb[hi * 4 + 1]; c ^= Tb[hi * 4 + 2]; d ^= Tb[hi * 4 + 3];
  }
  Y[0] = a >>> 24; Y[1] = a >>> 16; Y[2] = a >>> 8; Y[3] = a;
  Y[4] = b >>> 24; Y[5] = b >>> 16; Y[6] = b >>> 8; Y[7] = b;
  Y[8] = c >>> 24; Y[9] = c >>> 16; Y[10] = c >>> 8; Y[11] = c;
  Y[12] = d >>> 24; Y[13] = d >>> 16; Y[14] = d >>> 8; Y[15] = d;
}

function ghashData(Tb, Y, data) {
  for (let off = 0; off < data.length; off += 16) {
    const n = Math.min(16, data.length - off);
    for (let i = 0; i < n; i++) Y[i] ^= data[off + i];
    ghashBlock(Tb, Y);
  }
}

// ============================ AES-256-GCM ============================
function gcmCore(key, iv, data, aad, encrypt) {
  if (iv.length !== 12) throw new Error('GCM needs a 12-byte IV');
  const w = expandKey(key);
  const blk = new Int32Array(4);
  encryptBlock(w, 0, 0, 0, 0, blk);
  const Tb = ghashTables(blk);
  const iv0 = (iv[0] << 24) | (iv[1] << 16) | (iv[2] << 8) | iv[3];
  const iv1 = (iv[4] << 24) | (iv[5] << 16) | (iv[6] << 8) | iv[7];
  const iv2 = (iv[8] << 24) | (iv[9] << 16) | (iv[10] << 8) | iv[11];
  const out = new Uint8Array(data.length);
  let ctr = 2;
  for (let off = 0; off < data.length; off += 16) {
    encryptBlock(w, iv0, iv1, iv2, ctr, blk);
    ctr = (ctr + 1) | 0;
    const n = Math.min(16, data.length - off);
    for (let i = 0; i < n; i++) {
      const ks = (blk[i >> 2] >>> (24 - (i & 3) * 8)) & 255;
      out[off + i] = data[off + i] ^ ks;
    }
  }
  const cipherText = encrypt ? out : data;
  const Y = new Uint8Array(16);
  ghashData(Tb, Y, aad);
  ghashData(Tb, Y, cipherText);
  const lenBlock = new Uint8Array(16);
  const aBits = aad.length * 8, cBits = cipherText.length * 8;
  const put64 = (pos, v) => {
    const hi = Math.floor(v / 0x100000000), lo = v >>> 0;
    lenBlock[pos] = hi >>> 24; lenBlock[pos + 1] = hi >>> 16; lenBlock[pos + 2] = hi >>> 8; lenBlock[pos + 3] = hi;
    lenBlock[pos + 4] = lo >>> 24; lenBlock[pos + 5] = lo >>> 16; lenBlock[pos + 6] = lo >>> 8; lenBlock[pos + 7] = lo;
  };
  put64(0, aBits); put64(8, cBits);
  for (let i = 0; i < 16; i++) Y[i] ^= lenBlock[i];
  ghashBlock(Tb, Y);
  encryptBlock(w, iv0, iv1, iv2, 1, blk);
  const tag = new Uint8Array(16);
  for (let i = 0; i < 16; i++) tag[i] = Y[i] ^ ((blk[i >> 2] >>> (24 - (i & 3) * 8)) & 255);
  return { out, tag };
}

// Returns ciphertext followed by the 16-byte tag (same layout as the Web Crypto API).
export function aesGcmEncrypt(key, iv, plain, aad) {
  const { out, tag } = gcmCore(key, iv, plain, aad || new Uint8Array(0), true);
  const res = new Uint8Array(out.length + 16);
  res.set(out); res.set(tag, out.length);
  return res;
}

export function aesGcmDecrypt(key, iv, sealed, aad) {
  if (sealed.length < 16) throw new Error('decrypt-failed');
  const ct = sealed.subarray(0, sealed.length - 16);
  const given = sealed.subarray(sealed.length - 16);
  const { out, tag } = gcmCore(key, iv, ct, aad || new Uint8Array(0), false);
  let diff = 0;
  for (let i = 0; i < 16; i++) diff |= tag[i] ^ given[i];
  if (diff !== 0) throw new Error('decrypt-failed');
  return out;
}
