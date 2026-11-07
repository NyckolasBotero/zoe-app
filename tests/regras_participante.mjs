// Regras de célula: presenças para participante e faltas seguidas para ex-participante (Administração)
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d) => { const r = e.call(a, d, adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const lid = mk('lider'), a = mk('ana'), b = mk('beto'), c = mk('caio');
const cel = call('createCell', { nome: 'Célula Norte', liderId: lid, dia: 'Quarta' }).id;
[lid, a, b, c].forEach(m => e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${m}')writeRow_(t,x._row,{CelulaID:'${cel}'})})})()`));
e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${b}')writeRow_(t,x._row,{Batizado:'1',EhMembro:'0'});if(x.MembroID==='${c}')writeRow_(t,x._row,{EhMembro:'1'})})})()`);
let cfg = call('saveConfig', { PresencasParaParticipante: 2, FaltasParaExParticipante: 3 }); assert.equal(cfg.presencasParticipante, 2); assert.equal(cfg.faltasExParticipante, 3);
assert(e.call('saveConfig', { FaltasParaExParticipante: 0 }, adm).ok === false, 'rejeita 0');
const datas = ['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04'], pres = [[a, b, c], [a, b, c], [b, c], [b, c], [b, c]];
datas.forEach((d, i) => { call('saveAttendance', { celulaId: cel, data: d, presentes: pres[i].concat([lid]) }); });
const mem = call('cellMembers', { celulaId: cel }); const nomes = mem.map(m => m.nome); console.log(mem.map(m => m.nome + ':' + m.cat + ':' + m.pres));
assert(!nomes.some(n => n.startsWith('Ana')), 'Ana saiu após 3 faltas seguidas');
assert(mem.find(m => m.nome.startsWith('Beto')).cat === 'Batizado não-membro'); assert(mem.find(m => m.nome.startsWith('Caio')).cat === 'Membro da igreja'); assert(nomes.some(n => n.startsWith('Lider')), 'líder não sai');
const h = call('history', { celulaId: cel }); assert.equal(h.indicadores.exParticipantes, 1); console.log(h.indicadores.exNomes);
// com 2 presenças vira participante; com 1 ainda é visitante
cfg = call('saveConfig', { PresencasParaParticipante: 6 }); const m2 = call('cellMembers', { celulaId: cel }); assert(m2.every(m => m.cat === 'Visitante'), 'com 6 presenças exigidas todos ainda são visitantes');
console.log('OK regras');
