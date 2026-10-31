import vm from 'node:vm'; import fs from 'node:fs'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
const CODE = fileURLToPath(new URL('../apps-script/Code.gs', import.meta.url));
export function makeEnv() {
  const sheets = {};
  const mk = (name) => { const s = { name, rows: [],
    getDataRange: () => ({ getValues: () => s.rows.map(r => r.slice()) }),
    getLastRow: () => s.rows.length, getLastColumn: () => Math.max(0, ...s.rows.map(r => r.length)),
    getMaxRows: () => 1000,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((s.rows[r - 1 + i] || [])[c - 1 + j] ?? ''); o.push(row); } return o; },
      setValues: v => { v.forEach((row, i) => { s.rows[r - 1 + i] = s.rows[r - 1 + i] || []; row.forEach((x, j) => { s.rows[r - 1 + i][c - 1 + j] = x; }); }); },
      setNumberFormat() {}, setFontWeight() {} }),
    appendRow: row => { s.rows.push(row.slice()); }, deleteRow: n => { s.rows.splice(n - 1, 1); }, setFrozenRows() {} }; sheets[name] = s; return s; };
  const store = {}, props = {};
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => mk(n), getId: () => 'SSID' };
  const ctx = { Logger: { log() {} }, console: { error(...a) { if (process.env.ZDEBUG) process.stderr.write(a.join(" ") + "\n"); }, log() {} }, Date, Math, JSON, Number, String, Object, Array, isFinite, isNaN, RegExp, Error,
    SpreadsheetApp: { create: () => ss, openById: () => ss },
    CacheService: { getScriptCache: () => ({ get: k => store[k] ?? null, put: (k, v) => { store[k] = v; }, remove: k => { delete store[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    Utilities: { newBlob: (bytes, type, name) => ({ bytes, type, name, getBytes: () => typeof bytes === 'string' ? [...Buffer.from(bytes)].map(x => x > 127 ? x - 256 : x) : bytes }), computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', Buffer.from(k.map(x => x & 255))).update(Buffer.from(v.map(x => x & 255))).digest()].map(x => x > 127 ? x - 256 : x), base64Decode: s => [...Buffer.from(s, 'base64')], getUuid: () => crypto.randomUUID(), base64Encode: b => Buffer.from(b).toString('base64'), DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (a, s) => [...crypto.createHash('sha256').update(Array.isArray(s) ? Buffer.from(s.map(x => x & 255)) : s).digest()].map(x => x > 127 ? x - 256 : x),
      formatDate: (d, tz, f) => { const p = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d); const [D, T] = p.split(' '); return f === 'yyyy-MM-dd' ? D : f === 'HH:mm' ? T.slice(0, 5) : f === 'yyyy-MM-dd HH:mm' ? D + ' ' + T.slice(0, 5) : D + ' ' + T; } },
    DriveApp: (() => { const files = {}, fold = { getId: () => 'FOLDER', createFile: b => { const id = 'F' + Object.keys(files).length; files[id] = { id, blob: b, trashed: false, getId: () => id, getBlob: () => ({ getBytes: () => b.bytes }), setTrashed(v) { this.trashed = v; } }; return files[id]; } }; return { _files: files, createFolder: () => fold, getFolderById: () => fold, getFileById: id => files[id] }; })(),
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; }, getContent() { return t; } }) } };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(CODE, 'utf8'), ctx); vm.runInContext('setup()', ctx);
  const call = (action, data = {}, token) => { ctx.__req = JSON.stringify({ action, data, token }); return JSON.parse(vm.runInContext('doPost({postData:{contents:__req}}).getContent()', ctx)); };
  const run = code => vm.runInContext(code, ctx);
  return { call, run, sheets, ctx };
}
