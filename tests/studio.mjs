// Studio Zoe por área/pessoa + chat pastoral
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const nic = mk('nicacio'), pro = mk('projeta'), fan = mk('fan'); const tk = n => e.call('login', { email: n + '@zoe.com', senha: 'Temp12345' }).data.token, T = { nic: tk('nicacio'), pro: tk('projeta'), fan: tk('fan') };
// sem configuração: membro comum sem acesso; admin tem tudo
assert.deepEqual(call('me', {}, adm).studio, ['live', 'proj', 'cfg']); assert.deepEqual(call('me', {}, T.nic).studio, []); assert.equal(e.call('getTelao', {}, T.nic).ok, false);
// admin libera só projeção ao Nicácio
call('saveStudioAcesso', { membroId: nic, areas: ['proj'] }); assert.deepEqual(call('me', {}, T.nic).studio, ['proj']); assert.equal(e.call('getTelao', {}, T.nic).ok, true);
assert.equal(e.call('getLiveCfg', {}, T.nic).ok, false, 'sem Lives'); assert.equal(e.call('listAgendas', {}, T.nic).ok, true, 'agendas é lido pela projeção'); assert.equal(e.call('saveAgenda', { titulo: 'x' }, T.nic).ok, false, 'configurações não');
assert.equal(e.call('saveStudioAcesso', { membroId: fan, areas: ['proj'] }, T.nic).ok, false, 'só admin define'); assert.equal(e.call('studioAcessos', {}, T.nic).ok, false);
// chat pastoral: liberado ao "fan"; mensagem vai para quem está projetando
call('saveStudioAcesso', { membroId: fan, areas: [], chat: true }); assert.equal(call('me', {}, T.fan).studioChat, true); assert.equal(call('me', {}, T.pro).studioChat, false);
assert.equal(e.call('studioChatEnvia', { texto: 'oi' }, T.fan).ok, false, 'ninguém operando');
call('studioPresenca', { area: 'proj' }, T.nic); assert.equal(call('studioChat', {}, T.fan).operadores[0].id, nic);
call('studioChatEnvia', { texto: 'Pode passar o slide 3?' }, T.fan);
const n = call('studioChat', {}, T.nic); assert.equal(n.msgs.length, 1); assert.equal(n.nao, 1); assert(call('listNotifications', {}, T.nic).itens.some(x => x.tipo === 'studiochat'));
call('studioChatEnvia', { texto: 'Já passei!', para: fan }, T.nic); assert.equal(call('studioChat', { lido: true }, T.fan).msgs.length, 2); call('studioChat', { lido: true }, T.nic); assert.equal(call('studioChat', {}, T.nic).nao, 0, 'lida ao abrir');
assert.equal(e.call('studioChatEnvia', { texto: 'oi', para: nic }, T.pro).ok, false, 'sem liberação não envia');
// remover acesso
call('saveStudioAcesso', { membroId: nic, areas: [] }); assert.deepEqual(call('me', {}, T.nic).studio, []);
console.log('OK studio');
