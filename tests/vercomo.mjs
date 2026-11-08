// "Ver como": o administrador enxerga o app como outra pessoa, só leitura; ninguém mais pode usar
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t, x) => e.call(a, d, t || adm, x);
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).data.membroId;
const lid = mk('lider'), ana = mk('ana');
const cel = call('createCell', { nome: 'Célula Norte', liderId: lid, dia: 'Quarta' }).data.id;
const lista = call('verComoLista', {}).data.itens; assert(lista.length >= 2 && !lista.some(x => x.nome === 'Pastor Admin'));
const l = lista.find(x => x.id === lid); assert.deepEqual(l.cargos, ['Líder']); assert.equal(l.celula, 'Célula Norte');
// lê como o líder
const me = call('me', {}, adm, { as: lid }).data; assert.equal(me.membro.MembroID, lid); assert.equal(me.nivelCelula, 'lider'); assert.deepEqual(me.cargos, { lider: true, treinamento: false, supervisor: false, respMin: false });
const meAdm = call('me', {}).data; assert.equal(meAdm.usuario.papel, 'admin');
// como a Ana (membro) não vê a administração
assert.equal(call('listUsers', {}, adm, { as: ana }).ok, false);
// escrita é bloqueada
const w = call('saveMember', { nome: 'X' }, adm, { as: lid }); assert.equal(w.ok, false); assert.equal(w.error.code, 'VERCOMO');
assert.equal(call('decideApproval', {}, adm, { as: lid }).error.code, 'VERCOMO');
// registros passivos passam sem efeito
assert.equal(call('track', {}, adm, { as: lid }).ok, true);
// quem não é admin não consegue usar nem o "as" nem a lista
const lt = e.call('login', { email: 'lider@zoe.com', senha: 'Temp12345' }).data.token;
assert.equal(call('verComoLista', {}, lt).ok, false);
const eu = call('me', {}, lt, { as: ana }).data; assert.equal(eu.membro.MembroID, lid, 'o "as" de não-admin é ignorado');
// auditoria
assert(e.run(`table_('Auditoria').rows.some(function(r){return r.Acao==='VERCOMO'})`) !== undefined);
console.log('OK vercomo');
