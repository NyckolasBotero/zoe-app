// Lembretes da chamada: 22:30, 23:00, 23:30, depois de 10 em 10 até 00:00; manhãs seguintes de hora em hora; para ao lançar; intervalos configuráveis
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const lid = mk('lider'), outro = mk('outro'); const cel = call('createCell', { nome: 'Célula Norte', liderId: lid, dia: 'Quinta', inicio: '20:00' }).id;
// quinta-feira de referência (2026-11-05) e horário local de São Paulo (UTC-3)
const T = (data, hm) => Date.parse(data + 'T' + hm + ':00-03:00');
const push = () => e.run(`PUSHQ_.splice(0).length`); const roda = ms => { e.run('PUSHQ_.length=0'); const n = e.run(`chamadaRoda_(${ms})`); e.run('PUSHQ_.length=0'); return n; };
// slots padrão
assert.deepEqual(e.run('chamadaSlots_(chamadaCfg_()).slice(0,6)'), [1350, 1380, 1410, 1420, 1430, 1440]);
assert.equal(e.run('chamadaSlots_(chamadaCfg_())[6]'), 1440 + 480);
const ok = [['2026-11-05', '22:30'], ['2026-11-05', '23:00'], ['2026-11-05', '23:30'], ['2026-11-05', '23:40'], ['2026-11-05', '23:50'], ['2026-11-06', '00:00'], ['2026-11-06', '08:00'], ['2026-11-06', '09:00']];
ok.forEach(([d, h]) => assert.equal(roda(T(d, h)), 1, 'deve avisar ' + d + ' ' + h));
// repetição dentro da mesma janela não duplica
assert.equal(roda(T('2026-11-06', '09:03')), 0, 'mesma janela');
// fora de horário não avisa
['2026-11-05 22:00', '2026-11-05 22:45', '2026-11-05 15:00', '2026-11-06 00:30', '2026-11-06 07:30', '2026-11-06 22:30'].forEach(x => { const [d, h] = x.split(' '); assert.equal(roda(T(d, h)), 0, 'não avisa ' + x); });
// outro dia da semana não avisa
assert.equal(roda(T('2026-11-04', '22:30')), 0, 'quarta não tem célula');
// a notificação dentro do app é criada só uma vez por reunião
assert.equal(call('listNotifications', {}, e.call('login', { email: 'lider@zoe.com', senha: 'Temp12345' }).data.token).itens.filter(n => n.tipo === 'freq').length, 1);
// lançou a chamada: para
e.run(`appendRow_(table_('Reunioes'),{ReuniaoID:'R1',CelulaID:'${cel}',Data:'2026-11-12',Presentes:'1'})`);
assert.equal(roda(T('2026-11-12', '22:30')), 0, 'já lançada');
assert.equal(roda(T('2026-11-19', '22:30')), 1, 'quinta seguinte sem chamada volta a avisar');
// manhãs seguintes: 27, 28 e 29/11 avisam (3 dias); 30/11 não
['2026-11-27', '2026-11-28', '2026-11-29'].forEach(d => assert.equal(roda(T(d, '08:00')), 1, 'manhã ' + d));
assert.equal(roda(T('2026-11-30', '08:00')), 0, 'passou do limite de dias');
// configuração
call('saveConfig', { ChamadaHoraIni: '21:00', ChamadaPasso1: '15', ChamadaQtd1: '2', ChamadaPasso2: '5', ChamadaFim: '23:00', ChamadaManha: '07:00', ChamadaPassoManha: '30', ChamadaDias: '1' });
const sl = e.run('chamadaSlots_(chamadaCfg_())'); assert.deepEqual(sl.slice(0, 5), [1260, 1275, 1280, 1285, 1290]); assert.equal(sl[sl.length - 1], 1440 + 22 * 60); assert.ok(sl.includes(1440 + 420) && sl.includes(1440 + 450) && !sl.includes(2880 + 420));
assert.equal(e.call('saveConfig', { ChamadaHoraIni: '25:99' }, adm).ok, false); assert.equal(e.call('saveConfig', { ChamadaPasso1: '1' }, adm).ok, false);
console.log('OK chamada');
