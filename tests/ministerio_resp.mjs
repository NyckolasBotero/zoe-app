// Responsáveis por ministério: supervisor decide; responsável só com autonomia; sem autonomia só é avisado; sem responsável fica com o supervisor
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; }, nega = (a, d, t) => { const r = e.call(a, d, t); assert.equal(r.ok, false, a); return r.error.code; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const sup = mk('sup'), sup2 = mk('sup2'), lid = mk('lider'), lid2 = mk('lider2'), resp = mk('resp'), resp2 = mk('resp2'), ana = mk('ana'), beto = mk('beto');
const c1 = call('createCell', { nome: 'Norte', liderId: lid, supervisorId: sup }).id, c2 = call('createCell', { nome: 'Sul', liderId: lid2, supervisorId: sup2 }).id;
const poe = (m, c) => e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${m}')writeRow_(t,x._row,{CelulaID:'${c}'})})})()`); poe(ana, c1); poe(beto, c2);
const tk = n => e.call('login', { email: n + '@zoe.com', senha: 'Temp12345' }).data.token, T = { sup: tk('sup'), sup2: tk('sup2'), resp: tk('resp'), resp2: tk('resp2'), ana: tk('ana'), beto: tk('beto') };
const mi = call('listMinistries', {}); const M1 = mi[0].id, M2 = mi[1].id;
const nots = (t) => call('listNotifications', {}, t).itens;
// sem responsável: o pedido fica com o supervisor da pessoa
call('interest', { ministerioId: M1 }, T.ana);
let pend = t => call('listApprovals', {}, t).itens.filter(x => x.tipo === 'interesse' && x.status === 'pendente');
assert.equal(pend(T.sup).length, 1, 'supervisor vê'); assert.equal(pend(T.sup2).length, 0, 'outro supervisor não vê'); assert.equal(pend(T.resp).length, 0);
assert(nots(T.sup).some(n => /quer participar/.test(n.titulo)), 'supervisor foi avisado');
// só admin define responsáveis
assert.equal(nega('saveMinResp', { ministerioId: M1, ids: [resp] }, T.sup), 'FORBIDDEN');
let r = call('saveMinResp', { ministerioId: M1, ids: [resp, resp2] }); assert.equal(r.itens.find(x => x.id === M1).responsaveis.length, 2);
assert(nots(T.resp).some(n => /responsável por/.test(n.titulo)));
assert.equal(call('me', {}, T.resp).cargos.respMin, true);
// responsável sem autonomia: não vê nem decide o pedido
call('interest', { ministerioId: M1 }, T.beto);   // beto é do supervisor 2
assert.equal(pend(T.resp).length, 0, 'sem autonomia não vê'); assert.equal(pend(T.sup2).length, 1);
const ped = pend(T.sup)[0]; assert.match(ped.detalhe, /Responsável: Resp/);
assert.equal(nega('decideApproval', { tipo: 'interesse', id: ped.id, decisao: 'autorizado' }, T.resp), 'FORBIDDEN');
// só supervisor define autonomia, e só de quem é responsável
assert.equal(nega('saveMinAutonomia', { ministerioId: M1, responsavelId: resp, autonomia: true }, T.ana), 'FORBIDDEN');
assert.equal(nega('saveMinAutonomia', { ministerioId: M1, responsavelId: ana, autonomia: true }, T.sup), 'VALIDATION');
r = call('saveMinAutonomia', { ministerioId: M1, responsavelId: resp, autonomia: true }, T.sup); assert.equal(r.itens.find(x => x.id === M1).responsaveis.find(x => x.id === resp).autonomia, true);
assert(nots(T.resp).some(n => /ganhou autonomia/.test(n.titulo)));
assert.equal(call('minResp', {}, T.sup2).itens.find(x => x.id === M1).responsaveis.find(x => x.id === resp).autonomia, false, 'a autonomia vale só para as pessoas de quem deu');
// com autonomia do supervisor 1, o responsável vê só o pedido da Ana e decide
assert.equal(pend(T.resp).length, 1); assert.equal(pend(T.resp)[0].pessoaId, ana);
assert.equal(pend(T.resp2).length, 0, 'o outro responsável continua sem autonomia');
call('decideApproval', { tipo: 'interesse', id: ped.id, decisao: 'autorizado' }, T.resp);
assert(nots(T.resp2).some(n => /Novo integrante/.test(n.titulo)), 'quem não decidiu foi avisado da entrada');
assert(!nots(T.resp).some(n => /Novo integrante/.test(n.titulo)), 'quem decidiu não precisa de aviso');
assert(nots(T.ana).some(n => /aprovada/.test(n.titulo)), 'pessoa avisada da decisão');
// sem autonomia (supervisor 2): quem decide é o supervisor e o responsável só é avisado da entrada
const pb = pend(T.sup2)[0]; call('decideApproval', { tipo: 'interesse', id: pb.id, decisao: 'autorizado' }, T.sup2);
assert(nots(T.resp).some(n => /Novo integrante/.test(n.titulo)) && nots(T.resp2).filter(n => /Novo integrante/.test(n.titulo)).length === 2);
// remover a autonomia
call('saveMinAutonomia', { ministerioId: M1, responsavelId: resp, autonomia: false }, T.sup);
// outro ministério sem responsável continua com o supervisor
call('interest', { ministerioId: M2 }, T.ana); assert.equal(pend(T.sup).length, 1); assert.equal(pend(T.resp).length, 0);
// trocar responsáveis limpa a autonomia de quem saiu
call('saveMinAutonomia', { ministerioId: M1, responsavelId: resp, autonomia: true }, T.sup); call('saveMinResp', { ministerioId: M1, ids: [resp2] });
assert.equal(e.run(`table_('Ministerios').rows.filter(function(m){return m.MinisterioID==='${M1}'})[0].Autonomia`), '{}');
console.log('OK ministerio_resp');
