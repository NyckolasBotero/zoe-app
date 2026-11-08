// Pedidos de oração (aviso a todos, "orei por você"), álbum da supervisão, visita da supervisão, recesso da célula/igreja
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const dia = n => new Date(Date.now() - 3 * 36e5 + 864e5 * n).toISOString().slice(0, 10);
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const lid = mk('lider'), sup = mk('super'), ana = mk('ana'), beto = mk('beto'), fora = mk('fora');
const cel = call('createCell', { nome: 'Célula Norte', liderId: lid, supervisorId: sup, dia: 'Quinta', inicio: '20:00' }).id;
const cel2 = call('createCell', { nome: 'Célula Sul', liderId: fora, supervisorId: mk('outrosup'), dia: 'Sexta', inicio: '20:00' }).id;
const poe = (m, k) => e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${m}')writeRow_(t,x._row,{CelulaID:'${k}'})})})()`); [lid, ana, beto].forEach(m => poe(m, cel)); poe(fora, cel2);
const tk = n => e.call('login', { email: n + '@zoe.com', senha: 'Temp12345' }).data.token, T = { lid: tk('lider'), sup: tk('super'), ana: tk('ana'), beto: tk('beto'), fora: tk('fora') };
const notifs = (t, tipo) => call('listNotifications', {}, t).itens.filter(n => n.tipo === tipo);
// 1) pedido de oração avisa supervisor, líder e participantes (menos o autor)
const r = call('addPrayer', { tema: 'Saúde', titulo: 'Minha mãe', texto: 'Orem pela cirurgia' }, T.ana); assert.equal(r.avisados, 3);
assert.equal(notifs(T.sup, 'oracao').length, 1); assert.equal(notifs(T.lid, 'oracao').length, 1); assert.equal(notifs(T.beto, 'oracao').length, 1); assert.equal(notifs(T.ana, 'oracao').length, 0); assert.equal(notifs(T.fora, 'oracao').length, 0);
// 2) todos veem; "orei" liga/desliga; autor é avisado uma vez e vê quem orou
let l = call('listPrayers', {}, T.beto); assert.equal(l.length, 1); assert.equal(l[0].autor.split(' ')[0], 'Ana'); assert.equal(l[0].oraram, 0);
const pid = l[0].id; assert.equal(call('prayFor', { id: pid }, T.beto).oraram, 1); assert.equal(call('prayFor', { id: pid }, T.lid).oraram, 2);
assert.equal(notifs(T.ana, 'oracao_orei').length, 2); assert.equal(call('prayFor', { id: pid }, T.beto).euOrei, false); assert.equal(call('prayFor', { id: pid }, T.beto).euOrei, true);
assert.equal(notifs(T.ana, 'oracao_orei').length, 3, 'nova marcação avisa de novo');
l = call('listPrayers', {}, T.ana); assert.equal(l[0].minha, true); assert.equal(l[0].quemOrou.length, 2); assert.equal(call('listPrayers', {}, T.beto)[0].quemOrou.length, 0);
assert.equal(e.call('prayFor', { id: pid }, T.ana).ok, false, 'não ora por si mesmo'); assert.equal(e.call('prayFor', { id: pid }, T.fora).ok, false, 'outra célula não');
// 3) visita da supervisão + álbum
const foto = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
call('saveAttendance', { celulaId: cel, data: dia(-1), presentes: [lid, ana], confirmaDia: true, foto, visitaSup: true }, T.lid);
const h = call('history', { celulaId: cel }, T.lid); assert.equal(h.reunioes[0].visitaSup, true);
const al = call('albumSupervisao', {}, T.sup); assert.equal(al.itens.length, 1); assert.equal(al.itens[0].celula, 'Célula Norte'); assert.equal(al.itens[0].fotos[0].visitaSup, true); assert.equal(al.celulas.length, 1);
assert.equal(e.call('albumSupervisao', {}, T.lid).ok, false, 'líder comum não tem álbum'); assert.equal(call('albumSupervisao', {}, adm).celulas.length, 2);
// 4) recesso da célula
const quinta = (() => { for (let i = -14; i < 0; i++) { if (new Date(dia(i) + 'T12:00:00').getDay() === 4) return dia(i); } })();
assert.equal(e.call('setCellRecess', { celulaId: cel, ini: dia(3), fim: dia(1) }, T.lid).ok, false, 'fim antes do início');
assert.equal(e.call('setCellRecess', { celulaId: cel, ini: dia(-30), fim: dia(-20) }, T.lid).ok, false, 'passado');
assert.equal(e.call('setCellRecess', { celulaId: cel, ini: dia(1), fim: dia(5) }, T.ana).ok, false, 'membro não define');
let rc = call('setCellRecess', { celulaId: cel, ini: dia(-10), fim: dia(20) }, T.lid); assert.equal(rc.ativo, true);
assert.equal(notifs(T.sup, 'recesso').length, 1, 'supervisor avisado ao iniciar');
const sem = call('history', { celulaId: cel }, T.lid).semReuniao; assert.ok(sem.length >= 1 && sem.every(x => x.motivo === 'Recesso da célula'), 'registra "não houve reunião" nas quintas');
call('setCellRecess', { celulaId: cel, ini: dia(-10), fim: dia(30) }, T.lid); assert.equal(notifs(T.sup, 'recesso').length, 2, 'prorrogar avisa');
// lembrete de chamada pausado durante o recesso
e.run('PUSHQ_.length=0'); const q5 = Date.parse(quinta + 'T22:30:00-03:00'); assert.equal(e.run(`chamadaRoda_(${q5})`), 0, 'sem lembrete em recesso');
// 5) recesso da igreja sobreposto desativa o da célula e impede novo
assert.equal(e.call('saveConfig', { RecessoIgrejaIni: dia(10), RecessoIgrejaFim: '2020-01-01' }, adm).ok, false);
call('saveConfig', { RecessoIgrejaIni: dia(10), RecessoIgrejaFim: dia(15) }, adm);
rc = call('getCellRecess', { celulaId: cel }, T.lid); assert.equal(rc.ini, ''); assert.equal(rc.igreja.ini, dia(10));
assert.equal(e.call('setCellRecess', { celulaId: cel, ini: dia(12), fim: dia(40) }, T.lid).ok, false, 'sobrepõe a igreja');
call('setCellRecess', { celulaId: cel, ini: dia(20), fim: dia(25) }, T.lid);
rc = call('setCellRecess', { celulaId: cel, encerrar: true }, T.lid); assert.equal(rc.ini, '');
assert.equal(e.run('publicConfig_().recessoIgreja.ini'), dia(10));
console.log('OK oracao_recesso');
