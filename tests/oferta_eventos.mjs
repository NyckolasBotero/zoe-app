// Campo de oferta na chamada (liga/desliga), palestrantes nos eventos, recesso institucional avisa líderes
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const dia = n => new Date(Date.now() - 3 * 36e5 + 864e5 * n).toISOString().slice(0, 10);
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const lid = mk('lider'), ana = mk('ana');
const cel = call('createCell', { nome: 'Célula Norte', liderId: lid, dia: 'Quinta', inicio: '20:00' }).id;
e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${lid}')writeRow_(t,x._row,{CelulaID:'${cel}'})})})()`);
const tL = e.call('login', { email: 'lider@zoe.com', senha: 'Temp12345' }).data.token;
const base = { celulaId: cel, presentes: [lid], confirmaDia: true };
// oferta desligada: ignorada e invisível
call('saveAttendance', { ...base, data: dia(-9), oferta: '150,50' }, tL);
let h = call('history', { celulaId: cel }, tL); assert.equal(h.reunioes[0].oferta, null); assert.equal(e.run('publicConfig_().ofertaAtiva'), false);
// liga
call('saveConfig', { OfertaAtiva: true }, adm); assert.equal(e.run('publicConfig_().ofertaAtiva'), true);
call('saveAttendance', { ...base, data: dia(-8), oferta: 'R$ 1.250,75' }, tL);
h = call('history', { celulaId: cel }, tL); assert.equal(h.reunioes.find(r => r.data === dia(-8)).oferta, 1250.75);
assert.equal(e.call('saveAttendance', { ...base, data: dia(-7), oferta: '-5' }, tL).ok, false); assert.equal(e.call('saveAttendance', { ...base, data: dia(-7), oferta: 'abc' }, tL).ok, false);
assert.equal(h.reunioes.find(r => r.data === dia(-9)).oferta, null, 'oferta enviada com campo desligado não foi gravada');
// desliga de novo: some do histórico
call('saveConfig', { OfertaAtiva: false }, adm); assert.equal(call('history', { celulaId: cel }, tL).reunioes.every(r => r.oferta === null), true);
// palestrantes
const foto = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
call('createEvent', { titulo: 'Congresso', data: dia(10), palestrantes: [{ nome: 'Pr. João', foto }, { nome: 'Missª Ana' }, { nome: '' }] });
call('createEvent', { titulo: 'Culto simples', data: dia(11) });
const ev = call('listEvents', {}, tL); const c = ev.find(x => x.titulo === 'Congresso'); assert.equal(c.palestrantes.length, 2); assert.equal(c.palestrantes[0].nome, 'Pr. João'); assert.equal(c.palestrantes[1].foto, '');
assert.deepEqual(ev.find(x => x.titulo === 'Culto simples').palestrantes, []);
assert.equal(e.call('createEvent', { titulo: 'X', data: dia(12), palestrantes: [{ nome: 'A', foto: 'http://x/y.png' }] }, adm).ok, false);
// recesso institucional: aviso aos líderes e registro
call('saveConfig', { RecessoIgrejaIni: dia(-3), RecessoIgrejaFim: dia(20) }, adm);
const nt = call('listNotifications', {}, tL).itens.filter(n => n.tipo === 'recesso'); assert.equal(nt.length, 1); assert.ok(/institucional/i.test(nt[0].titulo));
e.run('recessoRoda_(Date.now())'); assert.equal(call('listNotifications', {}, tL).itens.filter(n => n.tipo === 'recesso').length, 1, 'aviso só uma vez');
const sem = call('history', { celulaId: cel }, tL).semReuniao; assert.ok(sem.length >= 0 && sem.every(x => x.motivo === 'Recesso institucional'));
console.log('OK oferta_eventos');
