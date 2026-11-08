// Consolidação v2 + Discipulado: campos obrigatórios, direção automática por sexo, notas, estatísticas, time, encontros, discipulado, recursos
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = (n, nome, sexo, tel) => { const id = call('createUser', { email: n + '@zoe.com', nome: nome || n, senha: 'Temp12345', papel: 'membro' }).membroId; e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${id}')writeRow_(t,x._row,{Sexo:'${sexo || 'M'}',Telefone:'${tel || ''}'})})})()`); return id; };
const poe = (m, k) => e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${m}')writeRow_(t,x._row,{CelulaID:'${k}'})})})()`);
const h = mk('homem', 'Hugo Lider', 'M'), m = mk('mulher', 'Maria Lider', 'F'), h2 = mk('homem2', 'Hélio Lider', 'M'), sup = mk('super', 'Sara Super', 'F'), cons = mk('cons', 'Caio Cons', 'M'), mem = mk('membro', 'Marta Membra', 'F', '61988880000');
const c1 = call('createCell', { nome: 'Célula Casal', liderId: h, treinamentoId: m, supervisorId: sup, dia: 'Quinta', inicio: '20:00', coordenadas: '-23.50, -46.60' }).id;
const c2 = call('createCell', { nome: 'Célula Dois Homens', liderId: h, treinamentoId: h2, supervisorId: sup, dia: 'Sexta', inicio: "20:00", coordenadas: "-23.70, -46.90" }).id;
[h, m, cons, mem].forEach(x => poe(x, c1)); poe(h2, c2);
const tk = n => e.call('login', { email: n + '@zoe.com', senha: 'Temp12345' }).data.token, T = { h: tk('homem'), m: tk('mulher'), sup: tk('super'), cons: tk('cons'), mem: tk('membro') };
const V = (o) => ({ nome: 'Visita Teste', telefone: '11911112222', email: 'v@x.com', sexo: 'F', convite: 'nao', lat: -23.5, lng: -46.6, ...o });
// campos obrigatórios
for (const [campo, extra] of [['email', { email: '' }], ['sexo', { sexo: '' }], ['convite', { convite: '' }], ['quem', { convite: 'sim', conviteQuem: '' }]])
  assert.equal(e.call('saveVisitor', V(extra), adm).error.code, 'VALIDATION', 'falta ' + campo);
// visitante novo: triagem normal, sem direção automática
const v1 = call('saveVisitor', V({ nome: 'Ana Nova', convite: 'sim', conviteQuem: 'Marta' })); assert.ok(!v1.auto);
// direção automática: já participa da célula (por telefone), casal -> líder do mesmo sexo
const v2 = call('saveVisitor', V({ nome: 'Marta Membra', telefone: '(61) 98888-0000', sexo: 'F' })); assert.ok(v2.auto, 'auto');
let li = call('listVisitors', {}); let x2 = li.itens.find(i => i.id === v2.id); assert.equal(x2.status, 'encaminhado'); assert.ok(/Maria/.test(JSON.stringify(x2.notas)), JSON.stringify(x2.notas)); assert.deepEqual(x2.grupos, ['Célula Casal']);
// só um líder do sexo -> ele; dois do mesmo sexo e nenhum do outro -> sem automático
e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${mem}')writeRow_(t,x._row,{CelulaID:'${c2}'})})})()`);
const v3 = call('saveVisitor', V({ nome: 'Marta Membra', telefone: '61988880000', sexo: 'F' })); assert.ok(!v3.auto, 'dois homens, visitante mulher: sem automático');
const v4 = call('saveVisitor', V({ nome: 'Marta Membra', telefone: '61988880000', sexo: 'M' })); assert.ok(!v4.auto, 'dois líderes do mesmo sexo: sem automático');
e.run(`(function(){const t=table_('Celulas');t.rows.forEach(function(x){if(x.CelulaID==='${c2}')writeRow_(t,x._row,{TreinamentoID:''})})})()`);
const v5 = call('saveVisitor', V({ nome: 'Marta Membra', telefone: '61988880000', sexo: 'F' })); assert.ok(v5.auto, 'um único líder: ele recebe');
// time da célula: consolidadores
const tm = call('saveCelTime', { celulaId: c1, consolidadores: [cons, 'inexistente'], equipe: [m] }, T.h); assert.deepEqual(tm.consolidadores, [cons]); assert.deepEqual(tm.equipe, [m]);
assert.equal(e.call('saveCelTime', { celulaId: c1, consolidadores: [] }, T.mem).error.code, 'FORBIDDEN');
// supervisor encaminha ao consolidador; ele aceita; estatísticas
call('routeVisitor', { id: v1.id, celulaId: c1, consolidadorId: cons }, T.sup);
li = call('listVisitors', {}, T.cons); const y = li.itens.find(i => i.id === v1.id); assert.equal(y.status, 'encaminhado'); assert.ok(/Caio/.test(JSON.stringify(y.notas)));
call('acceptVisitor', { id: v1.id }, T.cons);
const st = call('listVisitors', {}, T.sup).pessoas.find(p => p.id === cons); assert.equal(st.recebeu, 1); assert.equal(st.andamento, 1);
// encontros de consolidação: só o consolidador; sem teto
assert.equal(e.call('saveEncontro', { tipo: 'consolidacao', pessoaId: v1.id, obs: 'x' }, T.mem).error.code, 'FORBIDDEN');
for (let i = 0; i < 5; i++) call('saveEncontro', { tipo: 'consolidacao', pessoaId: v1.id, data: '2026-10-0' + (i + 1), obs: 'Conversa ' + i }, T.cons);
const le = call('listEncontros', { tipo: 'consolidacao', pessoaId: v1.id }, T.cons); assert.equal(le.n, 5); assert.ok(le.concluido, 'meta 4 atingida, mas 5 registrados');
assert.equal(e.call('saveEncontro', { tipo: 'consolidacao', pessoaId: v1.id, data: '2999-01-01' }, T.cons).error.code, 'VALIDATION');
assert.equal(call('listVisitors', {}, T.sup).pessoas.find(p => p.id === cons).andamento, 0, 'concluído sai de andamento');
poe(mem, c1);
// discipulado: política
let d = call('discipuladoCel', { celulaId: c1 }, T.h); assert.equal(d.politica, 'todos'); assert.equal(d.sozinhos, d.itens.length);
call('setDiscipulador', { celulaId: c1, discipuloId: mem, discipuladorId: cons }, T.h);
d = call('discipuladoCel', { celulaId: c1 }, T.h); assert.equal(d.itens.find(i => i.id === mem).discipuladorId, cons);
call('setDiscipulador', { celulaId: c1, discipuloId: mem, discipuladorId: m }, T.h); // troca: só um ativo
assert.equal(e.run(`lazy_('Discipulado').rows.filter(function(r){return r.DiscipuloID==='${mem}'&&r.Status==='ativo'}).length`), 1);
call('saveConfig', { DiscPolitica: 'equipe', DiscEncontros: '2' });
assert.equal(e.call('setDiscipulador', { celulaId: c1, discipuloId: mem, discipuladorId: cons }, T.h).error.code, 'VALIDATION', 'consolidador fora da equipe não discipula');
call('setDiscipulador', { celulaId: c1, discipuloId: mem, discipuladorId: m }, T.h);
assert.equal(e.call('setDiscipulador', { celulaId: c1, discipuloId: mem, discipuladorId: h }, T.mem).error.code, 'FORBIDDEN');
// área do discipulador
const mine = call('meusAcomp', {}, T.m); assert.equal(mine.itens.length, 1); assert.equal(mine.itens[0].meta, 2);
for (let i = 0; i < 3; i++) call('saveEncontro', { tipo: 'discipulado', pessoaId: mem, data: '2026-10-1' + i }, T.m);
assert.ok(call('listEncontros', { tipo: 'discipulado', pessoaId: mem }, T.m).concluido);
assert.equal(e.call('saveEncontro', { tipo: 'discipulado', pessoaId: mem }, T.cons).error.code, 'FORBIDDEN');
// recursos
assert.equal(e.call('saveRecursoConsol', { titulo: 'Guia', tipo: 'texto', texto: 'Olá' }, T.h).error.code, 'FORBIDDEN');
assert.equal(e.call('saveRecursoConsol', { titulo: 'Vídeo', tipo: 'video', url: 'http://x' }, adm).error.code, 'VALIDATION');
call('saveRecursoConsol', { titulo: 'Guia', tipo: 'texto', texto: 'Como acolher' }); call('saveRecursoConsol', { titulo: 'Vídeo', tipo: 'video', url: 'https://youtu.be/x' });
assert.equal(call('listRecursosConsol', {}, T.cons).itens.length, 2); assert.equal(e.call('listRecursosConsol', {}, T.mem).error.code, 'FORBIDDEN');
const rid = call('listRecursosConsol', {}).itens[0].id; call('deleteRecursoConsol', { id: rid }); assert.equal(call('listRecursosConsol', {}).itens.length, 1);
console.log('OK consolidacao');
