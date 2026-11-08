// Parentes que não usam o site: edição completa, troca de parentesco, padrasto/madrasta e parentescos criados pela administração
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Silva', senha: 'Temp12345', papel: 'membro' }).membroId;
const ana = mk('ana'), beto = mk('beto'); const tk = n => e.call('login', { email: n + '@zoe.com', senha: 'Temp12345' }).data.token, T = { ana: tk('ana'), beto: tk('beto') };
// padrasto e madrasta já existem
let v = call('listKin', {}, T.ana); assert.deepEqual(v.rels.map(r => r.k).slice(0, 2), ['padrasto', 'madrasta']);
// cadastra um padrasto que não usa o site, com mais dados
const r = call('addKinPerson', { rel: 'padrasto', nome: 'Carlos Pereira', telefone: '61999990000', cidade: 'Brasília', uf: 'df', profissao: 'Motorista', crista: '1', congrega: '0' }, T.ana);
v = call('listKin', {}, T.ana); assert.equal(v.outros.length, 1); assert.equal(v.outros[0].rotulo, 'Padrasto'); assert.equal(v.outros[0].pessoa.completo, 'Carlos Pereira'); const cid = r.id;
const m = () => e.run(`table_('Membros').rows.filter(function(x){return x.MembroID==='${cid}'})[0]`); assert.equal(m().UF, 'DF'); assert.equal(m().Telefone, '61999990000'); assert.equal(m().Sexo, 'M');
// edita tudo
call('editKinPerson', { id: cid, nome: 'Carlos Alberto Pereira', apelido: 'Beto C', sexo: 'M', nasc: '1970-03-04', telefone: '61988887777', email: 'c@x.com', cidade: 'Goiânia', uf: 'GO', profissao: 'Pedreiro', crista: '0', congrega: '1' }, T.ana);
assert.equal(m().Nome, 'Carlos Alberto Pereira'); assert.equal(m().Cidade, 'Goiânia'); assert.equal(m().Nascimento, '1970-03-04'); assert.equal(m().Crista, '0'); assert.equal(m().CongregaZoe, '1'); assert.equal(m().Profissao, 'Pedreiro');
assert.equal(e.call('editKinPerson', { id: cid, nome: 'Xy' }, T.ana).ok, false, 'nome curto'); assert.equal(e.call('editKinPerson', { id: cid, nome: 'Intruso Qualquer' }, T.beto).ok, false, 'de fora não edita'); assert.equal(e.call('editKinPerson', { id: beto, nome: 'Beto Outro' }, T.ana).ok, false, 'quem usa o app edita o próprio');
// troca o parentesco: padrasto -> pai (estrutural), e depois -> madrasta (inválido p/ sexo? permitido) e volta
call('changeKinRel', { b: cid, rel: 'pai' }, T.ana); v = call('listKin', {}, T.ana); assert.equal(v.outros.length, 0); assert.equal(v.pais.length, 1);
call('changeKinRel', { b: cid, rel: 'padrasto' }, T.ana); v = call('listKin', {}, T.ana); assert.equal(v.pais.length, 0); assert.equal(v.outros.length, 1);
// do lado do padrasto, o rótulo é o inverso
// admin cria parentesco novo; membro não
assert.equal(e.call('saveKinRelDef', { nome: 'Sogro', inverso: 'Genro/Nora' }, T.ana).ok, false);
const defs = call('saveKinRelDef', { nome: 'Sogro', inverso: 'Genro/Nora' }).rels; assert.ok(defs.some(x => x.k === 'x_sogro'));
assert.equal(e.call('saveKinRelDef', { nome: 'Sogro' }, adm).ok, false, 'duplicado');
const r2 = call('addKinPerson', { rel: 'x_sogro', nome: 'Manoel Souza' }, T.ana); v = call('listKin', {}, T.ana); assert.deepEqual(v.outros.map(o => o.rotulo).sort(), ['Padrasto', 'Sogro']);
// remover vínculo extra
const px = v.outros.find(o => o.k === 'x_sogro').id; call('delKin', { id: px }, T.ana); assert.equal(call('listKin', {}, T.ana).outros.length, 1);
call('saveKinRelDef', { remover: 'x_sogro' }); assert.ok(!call('listKin', {}, T.ana).rels.some(x => x.k === 'x_sogro'));
console.log('OK parentes');
