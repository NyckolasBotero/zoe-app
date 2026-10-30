// Teste do Web Push: cifra como o navegador espera, entrega a um "serviço de push" falso e decifra com as chaves do receptor.
import http from 'node:http';
import crypto from 'node:crypto';
import { envia, carregaVapid } from './push.mjs';
const b64u = (b) => Buffer.from(b).toString('base64url'), ub = (s) => Buffer.from(s, 'base64url');
const ua = crypto.createECDH('prime256v1'); ua.generateKeys(); const auth = crypto.randomBytes(16);
const vapid = carregaVapid('/tmp/vapid-teste-' + process.pid + '.json', {});
let pedido;
const srv = http.createServer((req, res) => { const bs = []; req.on('data', (c) => bs.push(c)); req.on('end', () => { pedido = { h: req.headers, b: Buffer.concat(bs) }; res.writeHead(201); res.end(); }); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const ep = `http://127.0.0.1:${srv.address().port}/push/abc`;
const r = await envia({ endpoint: ep, keys: { p256dh: b64u(ua.getPublicKey()), auth: b64u(auth) } }, { title: 'Olá', body: 'Mensagem de teste ✨' }, vapid);
if (r.status !== 201) { console.error('FALHOU: status', r); process.exit(1); }
// autorização VAPID: confere a assinatura ES256
const m = /^vapid t=([^,]+), k=(.+)$/.exec(pedido.h.authorization); if (!m || m[2] !== vapid.pub) { console.error('FALHOU: cabeçalho vapid'); process.exit(1); }
const [h, p, sg] = m[1].split('.'); const pub = ub(vapid.pub);
const ok = crypto.verify('sha256', Buffer.from(h + '.' + p), { key: crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, ub(sg));
if (!ok) { console.error('FALHOU: assinatura VAPID'); process.exit(1); }
// decifra (RFC 8291)
const b = pedido.b, salt = b.subarray(0, 16), idlen = b[20], asPub = b.subarray(21, 21 + idlen), cifrado = b.subarray(21 + idlen);
const shared = ua.computeSecret(asPub), hk = (s, i, inf, n) => Buffer.from(crypto.hkdfSync('sha256', i, s, inf, n));
const ikm = hk(auth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]), 32);
const d = crypto.createDecipheriv('aes-128-gcm', hk(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), hk(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12));
d.setAuthTag(cifrado.subarray(cifrado.length - 16)); const claro = Buffer.concat([d.update(cifrado.subarray(0, cifrado.length - 16)), d.final()]);
const json = JSON.parse(claro.subarray(0, claro.lastIndexOf(2)).toString());
if (json.title !== 'Olá' || !json.body.includes('✨')) { console.error('FALHOU: conteúdo', json); process.exit(1); }
console.log('OK: Web Push cifrado, assinado (VAPID) e decifrado'); srv.close(); process.exit(0);
