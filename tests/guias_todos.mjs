// Quiz e Mural de fotos aparecem para todos os participantes da célula, mesmo que a regra configurada diga o contrário
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const lid = mk('lider'), ana = mk('ana'); const cel = call('createCell', { nome: 'Norte', liderId: lid, dia: 'Quinta' }).id;
e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${ana}')writeRow_(t,x._row,{CelulaID:'${cel}'})})})()`);
// regra salva escondendo quiz e mural dos membros
e.run(`(function(){const t=table_('Config');const r={membro:{quiz:{v:0,e:0},mural:{v:0,e:0}},frequentador:{quiz:{v:0,e:0},mural:{v:0,e:0}}};appendRow_(t,{Chave:'RegrasCelulas',Valor:JSON.stringify(r)})})()`);
const R = e.run('regrasCel_()'); ['membro', 'frequentador', 'lider'].forEach(p => { assert.equal(R[p].quiz.v, 1, p + ' quiz'); assert.equal(R[p].mural.v, 1, p + ' mural'); });
assert.equal(R.membro.freq.v, 0, 'outras guias continuam seguindo a regra');
const tA = e.call('login', { email: 'ana@zoe.com', senha: 'Temp12345' }).data.token; const me = call('me', {}, tA); assert.equal(me.permCelula.quiz.v, 1); assert.equal(me.permCelula.mural.v, 1);
console.log('OK guias_todos');
