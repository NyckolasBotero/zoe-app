// Web Push sem dependências (VAPID ES256 + criptografia aes128gcm, RFC 8030/8291/8292), só com o módulo crypto do Node.
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';

const b64u = (b) => Buffer.from(b).toString('base64url');
const unb64u = (s) => Buffer.from(String(s), 'base64url');

export function carregaVapid(arquivo, env = process.env) {
  if (env.VAPID_PUBLIC && env.VAPID_PRIVATE) return { pub: env.VAPID_PUBLIC, priv: env.VAPID_PRIVATE };
  try { const o = JSON.parse(fs.readFileSync(arquivo, 'utf8')); if (o.pub && o.priv) return o; } catch {}
  const k = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = k.privateKey.export({ format: 'jwk' });
  const pub = b64u(Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)])), priv = jwk.d;
  try { fs.writeFileSync(arquivo, JSON.stringify({ pub, priv })); } catch {}
  return { pub, priv };
}
function jwtVapid(endpoint, vapid, assunto) {
  const aud = new URL(endpoint).origin, exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })), p = b64u(JSON.stringify({ aud, exp, sub: assunto }));
  const pubBuf = unb64u(vapid.pub), key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: vapid.priv, x: b64u(pubBuf.subarray(1, 33)), y: b64u(pubBuf.subarray(33, 65)) }, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(h + '.' + p), { key, dsaEncoding: 'ieee-p1363' });
  return h + '.' + p + '.' + b64u(sig);
}
const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
export function cifra(payload, sub) { // aes128gcm
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys(); const asPub = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(ua), salt = crypto.randomBytes(16);
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const corpo = Buffer.concat([c.update(Buffer.concat([Buffer.from(JSON.stringify(payload)), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, corpo]);
}
export function envia(sub, payload, vapid, assunto = 'mailto:contato@zoe.local') {
  return new Promise((ok) => {
    let corpo; try { corpo = cifra(payload, sub); } catch (e) { return ok({ endpoint: sub.endpoint, status: 0, erro: 'cifra' }); }
    const u = new URL(sub.endpoint), mod = u.protocol === 'http:' ? http : https;
    const rq = mod.request(u, { method: 'POST', timeout: 10000, headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'Content-Length': corpo.length, TTL: '86400', Urgency: 'normal', Authorization: `vapid t=${jwtVapid(sub.endpoint, vapid, assunto)}, k=${vapid.pub}` } }, (r) => { r.resume(); r.on('end', () => ok({ endpoint: sub.endpoint, status: r.statusCode })); });
    rq.on('error', () => ok({ endpoint: sub.endpoint, status: 0 })); rq.on('timeout', () => { rq.destroy(); });
    rq.end(corpo);
  });
}
