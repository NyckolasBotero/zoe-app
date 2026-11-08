// Quiz: pontos por rapidez, ranking, histórico, aba da célula, lembrete das 9h só para quem não jogou
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const hoje = n => new Date(Date.now() - 3 * 36e5 - 864e5 * n).toISOString().slice(0, 10);
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const lid = mk('lider'), a = mk('ana'), b = mk('beto'), c = mk('caio'), out = mk('fora');
const cel = call('createCell', { nome: 'Célula Norte', liderId: lid, dia: 'Quarta' }).id, cel2 = call('createCell', { nome: 'Célula Sul', liderId: out, dia: 'Quarta' }).id;
const poe = (m, k) => e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${m}')writeRow_(t,x._row,{CelulaID:'${k}'})})})()`); [lid, a, b, c].forEach(m => poe(m, cel)); poe(out, cel2);
const tk = n => e.call('login', { email: n + '@zoe.com', senha: 'Temp12345' }).data.token, T = { lid: tk('lider'), a: tk('ana'), b: tk('beto'), c: tk('caio'), out: tk('fora') };
e.run('var IA=null;UrlFetchApp={fetchAll:rs=>rs.map(()=>({getResponseCode:()=>200,getContentText:()=>""})),fetch:()=>({getResponseCode:()=>200,getContentText:()=>""})}');
const texto = 'O semeador saiu a semear e parte da semente caiu à beira do caminho. Jesus explicou que a semente é a palavra de Deus anunciada. O coração endurecido não permite que a palavra produza frutos.';
call('saveLesson', { titulo: 'Parábola do Semeador', resumo: 'Os tipos de coração', conteudo: texto }); const lic = call('listLessons', {}).find(l => l.titulo === 'Parábola do Semeador').id;
// logo depois da presença o quiz já está disponível (a tela chama quizPrepara em segundo plano)
call('saveAttendance', { celulaId: cel, data: hoje(0), presentes: [a, b, c], licaoId: lic, confirmaDia: true }, T.lid);
assert.equal(call('quizPrepara', { celulaId: cel }, T.lid).ok, true);
assert.equal(e.call('quizPrepara', { celulaId: cel }, T.a).ok, false, 'membro comum não dispara');
const ml = call('myQuizzes', {}, T.a); assert.equal(ml.itens.length, 1); const id = ml.itens[0].id;
assert(call('listNotifications', {}, T.a).itens.some(n => n.tipo === 'quiz' && /liberado/.test(n.texto)), 'aviso na hora');
// pontos: 100 por acerto + até 100 pela rapidez
const q0 = call('getQuiz', { id }, T.a); assert.equal(q0.perguntas.length, 0, 'antes de começar não mostra perguntas'); assert(q0.n >= 2); const q = call('getQuiz', { id, inicia: true }, T.a); assert.equal(q.perguntas.length, q0.n); assert(q.perguntas.every(p => p.c === undefined)); const g = JSON.parse(e.run(`JSON.stringify(table_('Quizzes').rows.filter(r=>r.QuizID==='${id}')[0].Perguntas)`)), ps = JSON.parse(g), certas = ps.map(p => p.c), n = ps.length;
assert.equal(q.limite, 20000);
const r1 = call('answerQuiz', { id, respostas: certas, tempos: certas.map(() => 1000) }, T.a); assert.equal(r1.acertos, n);
assert(r1.pontos > 100 * n && r1.pontos <= 200 * n, 'bônus de rapidez: ' + r1.pontos); assert.equal(r1.posicao, 1); assert.equal(r1.de, 1);
// quem demora 20 s ou mais fica só com 100 por acerto; quem erra não pontua; o servidor não aceita tempo menor que o real
call('getQuiz', { id, inicia: true }, T.b); const r2 = call('answerQuiz', { id, respostas: certas, tempos: certas.map(() => 25000) }, T.b); assert.equal(r2.pontos, 100 * n, 'lento = só os acertos'); assert.equal(r2.posicao, 2);
const errado = certas.map(x => (x + 1) % 4); call('getQuiz', { id, inicia: true }, T.c); const r3 = call('answerQuiz', { id, respostas: errado, tempos: errado.map(() => 1000) }, T.c); assert.equal(r3.pontos, 0); assert.equal(r3.acertos, 0);
assert.equal(call('answerQuiz', { id, respostas: certas, tempos: certas.map(() => 1000) }, T.a).pontos, r1.pontos, 'só joga uma vez');
// ranking, histórico da célula e meu histórico
const qc = call('quizCelula', { celulaId: cel }, T.b); assert.equal(qc.ranking.tudo[0].nome.startsWith('Ana'), true); assert.equal(qc.ranking.tudo[0].pontos, r1.pontos);
assert.equal(qc.ranking.tudo.length, 4, 'inclui quem ainda não jogou'); assert.equal(qc.eu.pos, 2); assert.equal(qc.ranking.mes.length, 4);
assert.equal(qc.quizzes[0].jogaram.length, 3); assert.equal(qc.quizzes[0].faltam.length, 1); assert.match(qc.quizzes[0].faltam[0].nome, /Lider/);
assert.equal(qc.meus.length, 1); assert.equal(qc.meus[0].pos, 2); assert.equal(qc.meus[0].de, 3); assert.equal(qc.pendentes.length, 0);
assert.equal(e.call('quizCelula', { celulaId: cel }, T.out).ok, false, 'de outra célula não vê');
const qc2 = call('quizCelula', {}, T.lid); assert.equal(qc2.pendentes.length, 1, 'quem não jogou vê o quiz pendente'); assert.equal(qc2.eu.pontos, 0);
// guia "Quiz" visível a todos da célula
assert.equal(call('me', {}, T.a).permCelula.quiz.v, 1);
// lembrete 9h do dia seguinte: só para quem não jogou, uma vez
e.run(`(function(){const t=table_('Quizzes');t.rows.forEach(function(q){writeRow_(t,q._row,{EnviadoEm:'${hoje(1)} 09:00:00'})})})()`);
const notif = t => call('listNotifications', {}, t).itens.filter(x => /ainda não fez/.test(x.titulo)).length;
e.run('enviaQuizzes()'); assert.equal(notif(T.lid), 1, 'quem não jogou é lembrado'); assert.equal(notif(T.a), 0); assert.equal(notif(T.b), 0); assert.equal(notif(T.c), 0);
e.run('enviaQuizzes()'); assert.equal(notif(T.lid), 1, 'lembrete uma vez só');
// quiz de hoje ainda não passa pelo lembrete
call('saveAttendance', { celulaId: cel, data: hoje(0), presentes: [a], licaoId: '', licaoResumo: 'A importância de perseverar na fé mesmo diante das dificuldades da vida', confirmaDia: true }, T.lid); call('quizPrepara', { celulaId: cel }, T.lid); e.run('enviaQuizzes()'); assert.equal(notif(T.b), 0);
// tempo esgotado (-1) vale como erro; sem abrir o quiz não há bônus de rapidez
call('saveAttendance', { celulaId: cel, data: hoje(2), presentes: [a], licaoId: '', licaoResumo: 'Estudo sobre a fidelidade de Deus em todas as estações da nossa vida diária', confirmaDia: true }, T.lid); call('quizPrepara', { celulaId: cel }, T.lid);
const id2 = call('myQuizzes', {}, T.a).itens.find(x => !x.feito).id, p2 = JSON.parse(e.run(`table_('Quizzes').rows.filter(r=>r.QuizID==='${id2}')[0].Perguntas`)).map(p => p.c);
const r4 = call('answerQuiz', { id: id2, respostas: p2.map((c, i) => i ? c : -1), tempos: p2.map(() => 1000) }, T.a); assert.equal(r4.acertos, p2.length - 1); assert.equal(r4.pontos, 100 * (p2.length - 1), 'sem abrir: sem bônus');

console.log('OK quiz_pontos');
