// Histórico de papéis por célula e lição ministrada ao lançar a presença
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d) => { const r = e.call(a, d, adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const lid = mk('lider'), a = mk('ana'), b = mk('beto');
const cel = call('createCell', { nome: 'Célula Norte', liderId: lid, dia: 'Quarta' }).id;
[lid, a, b].forEach(m => e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${m}')writeRow_(t,x._row,{CelulaID:'${cel}'})})})()`));
call('saveLesson', { titulo: 'Semeando a Palavra', resumo: 'Parábola do semeador' }); const lic = call('listLessons', {}).find(l => l.titulo === 'Semeando a Palavra').id; assert(lic, 'lição criada');
// papéis: log de atribuição e remoção
call('savePapeis', { celulaId: cel, itens: [{ membroId: a, papel: 'Louvor' }, { membroId: b, papel: 'Recepcionar visitantes' }] });
let lg = call('papeisLog', { celulaId: cel }); assert.equal(lg.length, 2); assert(lg.every(x => x.acao === 'atribuido' && x.por.startsWith('Pastor')));
call('savePapeis', { celulaId: cel, itens: [{ membroId: a, papel: 'Louvor' }, { membroId: a, papel: 'Dinâmica e quebra-gelo' }] });
lg = call('papeisLog', { celulaId: cel }); console.log(lg.map(x => x.membro + ' ' + x.acao + ' ' + x.papel)); assert.equal(lg.length, 4); assert(lg.some(x => x.membro.startsWith('Beto') && x.acao === 'removido' && x.papel === 'Recepcionar visitantes')); assert(lg.some(x => x.membro.startsWith('Ana') && x.acao === 'atribuido' && x.papel === 'Dinâmica e quebra-gelo'));
// presença: exige lição ou resumo (versão nova do app); versão antiga sem os campos continua valendo
let r = e.call('saveAttendance', { celulaId: cel, data: '2026-10-28', presentes: [a], licaoId: '', licaoResumo: '' }, adm); assert.equal(r.error.code, 'VALIDATION');
r = e.call('saveAttendance', { celulaId: cel, data: '2026-10-28', presentes: [a], licaoId: '', licaoResumo: 'curto' }, adm); assert.equal(r.error.code, 'VALIDATION', 'resumo curto demais');
r = e.call('saveAttendance', { celulaId: cel, data: '2026-10-28', presentes: [a], licaoId: lic }, adm); assert(r.ok, JSON.stringify(r));
r = e.call('saveAttendance', { celulaId: cel, data: '2026-11-04', presentes: [a, b], licaoId: '', licaoResumo: 'Estudamos Salmo 23 e a confiança em Deus' }, adm); assert(r.ok, JSON.stringify(r));
assert(e.call('saveAttendance', { celulaId: cel, data: '2026-10-21', presentes: [a] }, adm).ok, 'sem os campos novos ainda aceita');
// papéis mudam depois, mas a reunião antiga guarda quem fazia o quê
call('savePapeis', { celulaId: cel, itens: [{ membroId: b, papel: 'Louvor' }] });
call('saveAttendance', { celulaId: cel, data: '2026-10-28', presentes: [a, b], licaoId: lic });
const h = call('history', { celulaId: cel }).reunioes, m1 = h.find(x => x.data === '2026-10-28'), m2 = h.find(x => x.data === '2026-11-04');
console.log(m1.licao, '|', m1.papeis, '|', m2.licaoOutra);
assert.equal(m1.licao, 'Semeando a Palavra'); assert(m1.papeis.some(x => x.nome.startsWith('Ana') && x.papel === 'Louvor'), 'papéis do dia ficam guardados'); assert(!m1.papeis.some(x => x.nome.startsWith('Beto')));
assert.equal(m2.licao, ''); assert(m2.licaoOutra.includes('Salmo 23'));
console.log('OK papeis e lição');
