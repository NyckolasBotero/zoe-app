// Entrega das notificações: Worker (Cloudflare) e ntfy
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert'; import crypto from 'node:crypto';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const ana = mk('ana'), anaT = e.call('login', { email: 'ana@zoe.com', senha: 'Temp12345' }).data.token;
// só quem tem permissão de configuração mexe na entrega
assert.equal(e.call('saveEntrega', { ntfyAtivo: true }, anaT).error.code, 'FORBIDDEN');
let g = call('getEntrega', {}); assert.equal(g.worker, false); assert.equal(g.ntfy, false);
assert.equal(e.call('saveEntrega', { workerUrl: 'http://x' }, adm).error.code, 'VALIDATION');
// ntfy desligado: usuária não consegue ativar
assert.equal(e.call('setNtfy', { ligar: true }, anaT).error.code, 'VALIDATION');
g = call('saveEntrega', { ntfyUrl: 'https://ntfy.exemplo.com', ntfyToken: 'tk_segredo', ntfyAtivo: true }); assert.equal(g.ntfy, true); assert.equal(g.ntfyToken, true); assert(!JSON.stringify(g).includes('tk_segredo'), 'token nunca volta ao app');
let n = call('setNtfy', { ligar: true }, anaT); assert.match(n.topico, /^zoe-[a-z0-9]{24}$/); assert.equal(n.modo, 'ambos'); assert.equal(n.servidor, 'https://ntfy.exemplo.com');
assert.equal(call('setNtfy', { ligar: true }, anaT).topico, n.topico, 'mantém o tópico'); const t2 = call('setNtfy', { ligar: true, novo: true }, anaT).topico; assert.notEqual(t2, n.topico);
// mock das chamadas externas
e.run('var CALLS = []; UrlFetchApp = { fetchAll: rs => rs.map(r => { CALLS.push(r); return { getResponseCode: () => 200, getContentText: () => "{}" }; }), fetch: (u, r) => { CALLS.push(Object.assign({ url: u }, r)); if (/worker\\.exemplo/.test(u)) { const d = JSON.parse(r.payload); return { getResponseCode: () => (r.headers["X-Segredo"] === "s3" ? 200 : 401), getContentText: () => JSON.stringify({ ok: true, resultados: d.itens.map(i => ({ endpoint: i.sub.endpoint, status: /morto/.test(i.sub.endpoint) ? 410 : 201 })) }) }; } return { getResponseCode: () => 200, getContentText: () => "" }; } }');
e.run(`notify_('${ana}', 'aniv', 'Aniversário', 'Hoje é dia de festa'); pushFlush_()`);
let c = JSON.parse(e.run('JSON.stringify(CALLS.filter(c => /ntfy\\.exemplo/.test(c.url)))')); assert.equal(c.length, 1); const body = JSON.parse(c[0].payload); assert.equal(body.topic, t2); assert.equal(body.title, 'Aniversário'); assert.equal(c[0].headers.Authorization, 'Bearer tk_segredo');
assert.equal(call('testNtfy', {}, anaT).ok, true);
// Worker: desligado usa o envio direto; ligado manda tudo ao Worker, com o segredo
const mkSub = () => { const k = crypto.createECDH('prime256v1'); k.generateKeys(); return { p256dh: k.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') }; };
call('savePushSub', { endpoint: 'https://push.exemplo.com/ana-1-abcdef', keys: mkSub() }, anaT); call('savePushSub', { endpoint: 'https://push.exemplo.com/morto-ana', keys: mkSub() }, anaT);
call('saveEntrega', { workerUrl: 'https://worker.exemplo.workers.dev', workerSegredo: 's3' }); assert.equal(call('getEntrega', {}).worker, true);
e.run('CALLS.length = 0'); e.run(`notify_('${ana}', 'aniv', 'Oi', 'Texto'); pushFlush_()`);
c = JSON.parse(e.run('JSON.stringify(CALLS.filter(c => /worker\\.exemplo/.test(c.url)))')); assert.equal(c.length, 1); assert.equal(c[0].headers['X-Segredo'], 's3'); const it = JSON.parse(c[0].payload).itens; assert.equal(it.length, 2); assert.equal(it[0].payload.title, 'Oi');
assert.equal(e.run('table_("PushSubs").rows.filter(r=>r.Endpoint).length'), 1, 'endpoint 410 devolvido pelo Worker é descartado');
assert.equal(e.run('CALLS.filter(c => /push\\.exemplo/.test(c.url||"")).length'), 0, 'nada vai direto quando há Worker');
// segredo errado: nada quebra e o diagnóstico mostra o motivo
call('saveEntrega', { workerSegredo: 'errado' }); const dg = call('pushDiag', { teste: true }, anaT); assert.equal(dg.teste.ok, 0); assert.match(dg.teste.msg, /401|segredo/);
// modo "só ntfy": o aparelho não recebe o push duplicado
call('saveEntrega', { workerSegredo: 's3' }); call('setNtfy', { ligar: true, modo: 'so_ntfy' }, anaT); e.run('CALLS.length = 0'); e.run(`notify_('${ana}', 'aniv', 'Só ntfy', 'x'); pushFlush_()`);
assert.equal(e.run('CALLS.filter(c => /worker\\.exemplo/.test(c.url||"")).length'), 0); assert.equal(e.run('CALLS.filter(c => /ntfy\\.exemplo/.test(c.url||"")).length'), 1);
// desligar
call('setNtfy', { ligar: false }, anaT); assert.equal(call('getNtfy', {}, anaT).topico, '');
// chaves para colar no Worker
const k = e.run('exportaVapid()'); assert.match(k.VAPID_PUBLICA, /^[A-Za-z0-9_-]{87}$/); assert.match(k.VAPID_PRIVADA, /^[A-Za-z0-9_-]{43}$/);
console.log('OK entrega');
