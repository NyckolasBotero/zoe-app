// Nome simplificado automático, pré-cadastro (2 nomes + WhatsApp) com aviso ao líder 1 h depois, mudanças bruscas da célula com aprovação do supervisor
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const dia = n => new Date(Date.now() - 3 * 36e5 - 864e5 * n).toISOString().slice(0, 10);
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = (n, nome) => call('createUser', { email: n + '@zoe.com', nome: nome || n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
// 1) simplificado = primeiro + último nome
const fab = mk('fabio', 'Fabio Nyckolas Figueiredo Botero'); const simples = id => e.run(`table_('Membros').rows.filter(function(m){return m.MembroID==='${id}'})[0].Simples`);
assert.equal(simples(fab), 'Fabio Botero'); assert.equal(simples(mk('ana', 'Ana Lima')), 'Ana Lima'); assert.equal(simples(mk('cao', 'Caio')), 'Caio');
const lid = mk('lider'), sup = mk('super');
const cel = call('createCell', { nome: 'Célula Norte', liderId: lid, supervisorId: sup, dia: 'Quinta', inicio: '20:00' }).id;
const poe = (m, k) => e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${m}')writeRow_(t,x._row,{CelulaID:'${k}'})})})()`); poe(lid, cel);
const tk = n => e.call('login', { email: n + '@zoe.com', senha: 'Temp12345' }).data.token, T = { lid: tk('lider'), sup: tk('super') };
e.run('UrlFetchApp={fetch:function(){return {getResponseCode:function(){return 200},getContentText:function(){return ""}}}}');
// 2) pré-cadastro exige nome e sobrenome + WhatsApp
const base = { celulaId: cel, data: dia(1), presentes: [lid], confirmaDia: true };
assert.equal(e.call('saveAttendance', { ...base, visitas: [{ nome: 'Alberto', telefone: '61999990000' }] }, T.lid).ok, false, 'só um nome');
assert.equal(e.call('saveAttendance', { ...base, visitas: [{ nome: 'Alberto Fagundes' }] }, T.lid).ok, false, 'sem telefone');
call('saveAttendance', { ...base, visitas: [{ nome: 'Alberto Fagundes', telefone: '61999990000' }] }, T.lid);
const v = e.run(`JSON.stringify(table_('Visitantes').rows.filter(function(x){return x.Nome==='Alberto Fagundes'}).map(function(x){return {a:x.AvisarEm,m:x.Msg,l:x.LiderID,c:x.Contatado}}))`); const vv = JSON.parse(v)[0]; assert(vv && vv.a && /Posso conversar/.test(vv.m) && /app/.test(vv.m) && vv.l === lid);
// 3) aviso ao líder só depois de 1 hora
e.run(`lembreteVisitantes()`); assert(!call('listNotifications', {}, T.lid).itens.some(n => n.tipo === 'visita'), 'ainda não passou 1 h');
e.run(`(function(){const t=table_('Visitantes');t.rows.forEach(function(x){if(x.Nome==='Alberto Fagundes')writeRow_(t,x._row,{AvisarEm:'2000-01-01 00:00:00'})})})()`);
e.run(`lembreteVisitantes()`); assert(call('listNotifications', {}, T.lid).itens.some(n => n.tipo === 'visita' && /Alberto/.test(n.titulo)), 'aviso ao líder'); e.run(`lembreteVisitantes()`);
assert.equal(call('listNotifications', {}, T.lid).itens.filter(n => n.tipo === 'visita').length, 1, 'só uma vez');
// 4) mudança brusca do líder vai para o supervisor; o resto salva direto
const r = call('saveCell', { celulaId: cel, nome: 'Célula Nova', descricao: 'Nova descrição', dia: 'Quinta', inicio: '20:00' }, T.lid);
assert.deepEqual(r.aguardaAprovacao, ['nome']); const nomeCel = () => e.run(`table_('Celulas').rows.filter(function(c){return c.CelulaID==='${cel}'})[0].Nome`);
assert.equal(nomeCel(), 'Célula Norte', 'nome só muda depois de aprovado'); assert.equal(e.run(`table_('Celulas').rows.filter(function(c){return c.CelulaID==='${cel}'})[0].Descricao`), 'Nova descrição');
assert(call('listNotifications', {}, T.sup).itens.some(n => /Mudança na célula/.test(n.titulo)), 'supervisor avisado');
const ap = call('listApprovals', {}, T.sup).itens.find(x => x.tipo === 'celmud' && x.status === 'pendente'); assert(ap && /Célula Nova/.test(ap.detalhe));
assert.equal(e.call('decideApproval', { tipo: 'celmud', id: ap.id, decisao: 'autorizado' }, T.lid).ok, false, 'o líder não aprova a própria mudança');
call('decideApproval', { tipo: 'celmud', id: ap.id, decisao: 'autorizado' }, T.sup); assert.equal(nomeCel(), 'Célula Nova');
// supervisor muda direto
assert.equal(call('saveCell', { celulaId: cel, nome: 'Célula Final' }, T.sup).aguardaAprovacao, undefined); assert.equal(nomeCel(), 'Célula Final');
console.log('OK lote1');
