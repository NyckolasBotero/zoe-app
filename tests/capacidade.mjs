// Capacidade restante de IA e notificações (contadores do dia)
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert'; import crypto from 'node:crypto';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const ana = mk('ana'), anaT = e.call('login', { email: 'ana@zoe.com', senha: 'Temp12345' }).data.token;
assert.equal(e.call('capacidade', {}, anaT).error.code, 'FORBIDDEN');
let c = call('capacidade', {}); assert.equal(c.ia.limite, 10000); assert.equal(c.ia.restantes, 10000); assert.equal(c.ia.quizzesRestantes, Math.floor(10000 / 170)); assert.equal(c.ia.estimado, true); assert.equal(c.ia.ligada, false); assert.match(c.zeraAs, /^\d\d:\d\d$/);
// IA com tokens informados pelo Worker: 1000 lidos + 700 escritos = 27 + 143 = 170 neurons
call('saveEntrega', { workerUrl: 'https://worker.exemplo.workers.dev', workerSegredo: 's3' });
const mkSub = () => { const k = crypto.createECDH('prime256v1'); k.generateKeys(); return { p256dh: k.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') }; };
e.run(`var USO_IA = true; UrlFetchApp = { fetchAll: rs => rs.map(r => ({ getResponseCode: () => 201, getContentText: () => "" })), fetch: (u, r) => { if (/\\/ia$/.test(u)) { if (!USO_IA) return { getResponseCode: () => 502, getContentText: () => "{}" }; return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, texto: JSON.stringify([1,2].map(i => ({ p: 'P' + i + '?', op: ['a','b','c','d'], c: 0, e: 'x' }))), usage: { prompt_tokens: 1000, completion_tokens: 700 } }) }; } const d = JSON.parse(r.payload); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, resultados: d.itens.map((i, k) => ({ endpoint: i.sub.endpoint, status: k === 0 ? 201 : 410 })) }) }; } }`);
assert.equal(call('testQuizIa', {}).ok, true); c = call('capacidade', {}); assert.equal(c.ia.chamadas, 1); assert.equal(c.ia.neurons, 170); assert.equal(c.ia.restantes, 9830); assert.equal(c.ia.mediaPorQuiz, 170); assert.equal(c.ia.estimado, false); assert.equal(c.ia.ligada, true);
assert.equal(c.push.urlFetch, 1);
// erro da IA conta a chamada e o erro, mas não gasta neurons
e.run('USO_IA = false'); assert.equal(call('testQuizIa', {}).ok, false); c = call('capacidade', {}); assert.equal(c.ia.chamadas, 2); assert.equal(c.ia.erros, 1); assert.equal(c.ia.neurons, 170);
// notificações pelo Worker: 2 aparelhos, 1 entregue e 1 morto (410)
call('savePushSub', { endpoint: 'https://push.exemplo.com/ana-1-abcdef', keys: mkSub() }, anaT); call('savePushSub', { endpoint: 'https://push.exemplo.com/morto-2', keys: mkSub() }, anaT);
e.run(`notify_('${ana}', 'aniv', 'Oi', 'Texto'); pushFlush_()`); c = call('capacidade', {});
assert.equal(c.push.envios, 2); assert.equal(c.push.ok, 1); assert.equal(c.push.falhas, 1); assert.equal(c.push.chamadasWorker, 1); assert.equal(c.push.urlFetch, 3, '2 chamadas à IA + 1 ao Worker'); assert.equal(c.push.restantesUrlFetch, 20000 - 3); assert.equal(c.push.enviosRestantes, (20000 - 3) * 50);
assert.equal(c.semana.length, 1); assert.equal(c.semana[0].envios, 2);
// um dia só vira linha única
assert.equal(e.run('table_("UsoDia").rows.length'), 1);
console.log('OK capacidade');
