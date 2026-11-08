// Painel de células: indicador de multiplicação, multiplicar (pessoas, líderes, supervisor) e supervisor geral
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const lider = mk('lider'), trein = mk('trein'), sup1 = mk('sup1'), sup2 = mk('sup2'), geral = mk('geral'), g = Array.from({ length: 10 }, (_, i) => mk('m' + i));
const cel = call('createCell', { nome: 'Célula Norte', liderId: lider, treinamentoId: trein, supervisorId: sup1, dia: 'Quarta', inicio: '20:00' }).id;
const vivo = ids => ids.forEach(m => e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${m}')writeRow_(t,x._row,{CelulaID:'${cel}'})})})()`)); vivo(g);
const tk = n => e.call('login', { email: n + '@zoe.com', senha: 'Temp12345' }).data.token;
// só admin vê o painel
assert.equal(e.call('celPainel', {}, tk('m0')).error.code, 'FORBIDDEN');
let p = call('celPainel', {}); assert.equal(p.limite, 10); let c = p.celulas.find(x => x.id === cel);
assert.equal(c.total, 12); assert.equal(c.contaveis, 10, '12 pessoas, 2 são líder e líder em treinamento = 10'); assert.equal(c.precisa, true); assert.equal(p.resumo.precisam, 1);
// limite configurável (só indicador)
assert.equal(e.call('saveConfig', { CelulaMultiplicarAcima: 1 }, adm).error.code, 'VALIDATION'); call('saveConfig', { CelulaMultiplicarAcima: 11 }); p = call('celPainel', {}); assert.equal(p.limite, 11); assert.equal(p.celulas.find(x => x.id === cel).precisa, false); assert.equal(p.resumo.precisam, 0);
call('saveConfig', { CelulaMultiplicarAcima: 10 });
// supervisor geral
call('setSuperior', { membroId: sup1, superiorId: geral }); p = call('celPainel', {}); assert.equal(p.celulas.find(x => x.id === cel).superior, 'Geral'); assert(p.supervisores.some(s => s.id === sup1 && s.superiorId === geral));
assert.equal(e.call('setSuperior', { membroId: geral, superiorId: sup1 }, adm).error.code, 'VALIDATION', 'sem ciclo'); assert.equal(e.call('setSuperior', { membroId: sup1, superiorId: sup1 }, adm).error.code, 'VALIDATION');
// multiplicar: líder em treinamento vai para a nova célula, líder fica; metade das pessoas vai
const vao = g.slice(0, 5);
assert.equal(e.call('multiplyCell', { celulaId: cel, nome: 'Célula Sul', liderOrigId: lider, liderNovaId: lider }, adm).error.code, 'VALIDATION', 'mesma pessoa em dois cargos');
assert.equal(e.call('multiplyCell', { celulaId: cel, nome: 'Célula Sul', liderOrigId: lider, liderNovaId: mk('fora') }, adm).error.code, 'VALIDATION', 'líder precisa ser da célula');
assert.equal(e.call('multiplyCell', { celulaId: cel, nome: 'X', liderOrigId: lider, liderNovaId: trein }, tk('m0')).error.code, 'FORBIDDEN');
const r = call('multiplyCell', { celulaId: cel, nome: 'Célula Sul', dia: 'Quinta', liderOrigId: lider, treinOrigId: '', liderNovaId: trein, treinNovaId: g[0], membrosNova: vao, supervisorId: sup2, superiorId: geral });
assert.equal(r.foram, 6, '5 escolhidos + o líder em treinamento que virou líder'); assert.equal(r.ficaram, 6, 'o líder + 5 pessoas ficam');
p = call('celPainel', {}); const a = p.celulas.find(x => x.id === cel), b = p.celulas.find(x => x.id === r.novaId);
assert.equal(a.liderId, lider); assert.equal(a.treinamentoId, ''); assert.equal(a.supervisorId, sup2); assert.equal(a.total, 6); assert.equal(a.contaveis, 5);
assert.equal(b.nome, 'Célula Sul'); assert.equal(b.liderId, trein); assert.equal(b.treinamentoId, g[0]); assert.equal(b.supervisorId, sup2); assert.equal(b.maeId, cel); assert.equal(b.mae, 'Célula Norte'); assert.equal(b.dia, 'Quinta'); assert.equal(b.inicio, '20:00'); assert.equal(b.total, 5 + 1, 'os 5 + o líder em treinamento que virou líder'); assert.equal(b.contaveis, 4);
assert.equal(a.superiorId, geral); assert.equal(b.superiorId, geral);
const ids = x => x.membros.map(m => m.id); assert(vao.every(m => ids(b).includes(m)) && vao.every(m => !ids(a).includes(m)) && ids(b).includes(trein) && !ids(a).includes(trein));
// o novo líder passa a administrar a célula nova (acesso) e deixa de administrar a antiga
assert.deepEqual(e.run(`cargos_('${trein}').lidera`), [r.novaId]); assert.deepEqual(e.run(`cargos_('${lider}').lidera`), [cel]);
// multiplicação conta para a regra de supervisor (líder que multiplicou)
call('saveConfig', { CelulasParaSupervisor: 1 }); const novo = mk('novosup'); const r2 = e.call('multiplyCell', { celulaId: b.id, nome: 'Célula Leste', liderOrigId: trein, liderNovaId: g[1], membrosNova: [g[1]], supervisorId: novo }, adm); assert.equal(r2.error.code, 'REGRA_SUPERVISOR', 'regra de supervisor continua valendo'); 
assert.equal(call('multiplyCell', { celulaId: b.id, nome: 'Célula Leste', liderOrigId: trein, liderNovaId: g[1], membrosNova: [g[1]], supervisorId: novo, excecao: true }).foram, 1);
console.log('OK multiplicar');
