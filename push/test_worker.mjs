// Confere o Worker: cifra uma mensagem e decifra como o navegador faria; recusa segredo errado
import { criptografar } from './worker_push.js'; import crypto from 'node:crypto'; import assert from 'node:assert';
const b = s => Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'), 'base64'), u = x => Buffer.from(x).toString('base64url');
const ua = crypto.createECDH('prime256v1'); ua.generateKeys(); const auth = crypto.randomBytes(16);
const msg = JSON.stringify({ title: 'Olá 🔔', body: 'Teste da Zoe' });
const out = Buffer.from(await criptografar(msg, new Uint8Array(ua.getPublicKey()), new Uint8Array(auth)));
const salt = out.subarray(0,16), idlen = out[20], asPub = out.subarray(21, 21+idlen), ct = out.subarray(21+idlen);
const shared = ua.computeSecret(asPub), hk = (s,i,info,n)=>Buffer.from(crypto.hkdfSync('sha256', i, s, info, n));
const ikm = hk(auth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]), 32);
const cek = hk(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hk(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length-16));
const claro = Buffer.concat([d.update(ct.subarray(0, ct.length-16)), d.final()]); assert.equal(claro.subarray(0, claro.length-1).toString(), msg); assert.equal(claro[claro.length-1], 2);
const w = (await import('./worker_push.js')).default; const r = await w.fetch(new Request('https://x/', { method:'POST', headers:{ 'X-Segredo':'errado' }, body:'{}' }), { SEGREDO:'certo' }); assert.equal(r.status, 401);
const r2 = await w.fetch(new Request('https://x/', { method:'POST', headers:{ 'X-Segredo':'certo' }, body:JSON.stringify({ itens: [] }) }), { SEGREDO:'certo' }); assert.equal((await r2.json()).ok, true);
console.log('OK worker');
