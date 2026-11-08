// Quiz da lição: agenda ao lançar a presença, gera perguntas (IA ou modelo), envia aos participantes e guarda respostas
const hoje = n => new Date(Date.now() - 3 * 36e5 - 864e5 * n).toISOString().slice(0, 10); // data de Brasília
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const lid = mk('lider'), a = mk('ana'), b = mk('beto'), z = mk('zeca');
const cel = call('createCell', { nome: 'Célula Norte', liderId: lid, dia: 'Quarta' }).id;
[lid, a, b].forEach(m => e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(x){if(x.MembroID==='${m}')writeRow_(t,x._row,{CelulaID:'${cel}'})})})()`));
const tk = n => e.call('login', { email: n + '@zoe.com', senha: 'Temp12345' }).data.token, aT = tk('ana'), bT = tk('beto'), zT = tk('zeca');
['Paz de Cristo', 'A armadura de Deus', 'Fé e obras', 'Oração que transforma'].forEach(t => call('saveLesson', { titulo: t, resumo: 'resumo' }));
const texto = 'O semeador saiu a semear e parte da semente caiu à beira do caminho. Jesus explicou que a semente é a palavra de Deus anunciada. O coração endurecido não permite que a palavra produza frutos. A terra boa representa quem ouve a palavra e persevera com paciência.';
call('saveLesson', { titulo: 'Parábola do Semeador', resumo: 'Os tipos de coração', conteudo: texto }); const lic = call('listLessons', {}).find(l => l.titulo === 'Parábola do Semeador').id;
e.run('var CALLS = []; var IA = null; UrlFetchApp = { fetchAll: rs => rs.map(r => ({ getResponseCode: () => 200, getContentText: () => "" })), fetch: (u, r) => { CALLS.push({ url: u, r }); return { getResponseCode: () => 200, getContentText: () => "" }; } }');
// presença com lição cria quiz agendado para o dia seguinte; sem lição/resumo não cria
const ontem = hoje(2);
call('saveAttendance', { celulaId: cel, data: ontem, presentes: [a], licaoId: lic, confirmaDia: true });
let qs = e.run('JSON.stringify(table_("Quizzes").rows)'); qs = JSON.parse(qs); assert.equal(qs.length, 1); assert.equal(qs[0].Status, 'agendado'); assert.equal(qs[0].Titulo, 'Parábola do Semeador'); assert(qs[0].Texto.includes('semeador'), 'texto da lição vira a base');
assert.equal(call('myQuizzes', {}, aT).itens.length, 1, 'data de envio já passou: aparece (e é gerado/enviado na hora)');
// sem chave de IA: perguntas do plano B (modelo)
let lq = call('quizLider', { celulaId: cel }); assert.equal(lq.itens[0].status, 'enviado'); assert.equal(lq.itens[0].fonte, 'modelo'); assert(lq.itens[0].total >= 2, 'perguntas do modelo: ' + lq.itens[0].total);
lq.itens[0].perguntas.forEach(p => { assert.equal(p.op.length, 4); assert(p.c >= 0 && p.c < 4); assert.equal(new Set(p.op).size, 4); });
assert(lq.itens[0].perguntas[0].p.includes('tema') || lq.itens[0].perguntas[0].p.includes('Complete'));
// aviso para todos da célula (ana, beto, líder), não para quem é de fora
const nt = t => call('listNotifications', {}, t).itens.filter(x => x.tipo === 'quiz').length; assert.equal(nt(aT), 1); assert.equal(nt(bT), 1); assert.equal(nt(zT), 0);
assert.equal(call('myQuizzes', {}, aT).itens.length, 1); assert.equal(nt(aT), 1, 'não repete o aviso');
// quem é de fora não abre
const id = lq.itens[0].id; assert.equal(e.call('getQuiz', { id }, zT).error.code, 'NOT_FOUND'); assert.equal(e.call('answerQuiz', { id, respostas: [0, 0, 0, 0, 0] }, zT).error.code, 'NOT_FOUND');
// abrir: sem gabarito
let q = call('getQuiz', { id }, aT); assert.equal(q.feito, false); assert(q.perguntas.every(p => p.c === undefined && p.e === undefined), 'gabarito não vai antes de responder');
assert.equal(e.call('answerQuiz', { id, respostas: [0] }, aT).error.code, 'VALIDATION');
const cert = lq.itens[0].perguntas.map(p => p.c); let r = call('answerQuiz', { id, respostas: cert }, aT); assert.equal(r.acertos, cert.length); assert.equal(r.feito, true); assert(r.perguntas.every(p => p.c !== undefined));
const xp = () => Number(e.run(`table_('XpLog').rows.filter(r=>r.MembroID==='${a}'&&r.Ref==='quiz:${id}').map(r=>r.Pontos)[0]`)); assert.equal(xp(), 5 + cert.length * 3);
r = call('answerQuiz', { id, respostas: cert.map(() => 0) }, aT); assert.equal(r.acertos, cert.length, 'segunda tentativa não vale'); 
call('answerQuiz', { id, respostas: cert.map(p => (p + 1) % 4) }, bT); lq = call('quizLider', { celulaId: cel }); assert.equal(lq.itens[0].responderam, 2); assert.equal(lq.itens[0].media, cert.length / 2); assert(lq.itens[0].pessoas.find(p => p.nome.startsWith('Ana')).acertos === cert.length);
assert.equal(call('myQuizzes', {}, aT).pendentes, 0); assert.equal(call('myQuizzes', {}, bT).itens[0].feito.acertos, 0);
assert.equal(e.call('quizAcao', { id, acao: 'refazer' }, adm).error.code, 'VALIDATION', 'não refaz depois de respondido');
assert.equal(e.call('quizLider', { celulaId: cel }, zT).error.code, 'FORBIDDEN');
// IA gratuita (Worker /ia): ligar o Worker faz as perguntas virem da IA
assert.equal(e.call('testQuizIa', {}, adm).error.code, 'VALIDATION', 'sem Worker não testa');
call('saveEntrega', { workerUrl: 'https://worker.exemplo.workers.dev', workerSegredo: 's3' }); assert.equal(call('getQuizCfg', {}).ia, true);
e.run(`UrlFetchApp.fetch = (u, r) => { CALLS.push({ url: u, r }); if (/\\/ia$/.test(u)) { if (IA === "erro") return { getResponseCode: () => 502, getContentText: () => "{}" }; return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, texto: "Claro! Aqui está:\\n" + JSON.stringify(IA) }) }; } return { getResponseCode: () => 200, getContentText: () => "" }; };
IA = [1,2,3,4,5].map(i => ({ p: 'Pergunta ' + i + '?', op: ['A'+i, 'B'+i, 'C'+i, 'D'+i], c: i % 4, e: 'porque sim' })); CALLS.length = 0`);
assert.equal(call('testQuizIa', {}).ok, true);
call('saveAttendance', { celulaId: cel, data: hoje(0), presentes: [a, b], licaoId: '', licaoResumo: 'Estudamos a oração do Pai Nosso e a importância de orar com fé e perseverança todos os dias', confirmaDia: true });
let ag = JSON.parse(e.run('JSON.stringify(table_("Quizzes").rows.filter(r=>r.Status==="agendado"))')); assert.equal(ag.length, 1, 'resumo livre também gera quiz'); assert.equal(ag[0].EnviarEm, hoje(-1), 'enviado só no dia seguinte');
assert.equal(call('myQuizzes', {}, aT).itens.length, 1, 'ainda não venceu');
e.run('CALLS.length = 0'); let ac = call('quizAcao', { id: ag[0].QuizID, acao: 'enviar' }, adm); assert.equal(ac.ok, true); const ca = e.run('JSON.stringify(CALLS.filter(c=>/\\/ia$/.test(c.url)).map(c=>({h:c.r.headers,b:JSON.parse(c.r.payload)})))'); const cj = JSON.parse(ca); assert.equal(cj.length, 1); assert.equal(cj[0].h['X-Segredo'], 's3'); assert.match(cj[0].b.prompt, /oração do Pai Nosso/);
lq = call('quizLider', { celulaId: cel }); assert.equal(lq.itens[0].fonte, 'ia'); assert.equal(lq.itens[0].total, 5); assert.equal(lq.itens[0].perguntas[0].p, 'Pergunta 1?');
e.run('IA = "erro"'); call('saveAttendance', { celulaId: cel, data: ontem, presentes: [a], licaoId: lic, confirmaDia: true });
// gatilho diário
e.run('IA = null'); call('saveAttendance', { celulaId: cel, data: hoje(1), presentes: [b], licaoId: '', licaoResumo: 'A importância de perseverar na fé mesmo diante das dificuldades da vida', confirmaDia: true });
e.run('enviaQuizzes()'); assert.equal(JSON.parse(e.run('JSON.stringify(table_("Quizzes").rows.map(r=>r.Status))')).filter(s => s === 'enviado').length, 3);
// cancelar
call('saveAttendance', { celulaId: cel, data: hoje(0), presentes: [a], licaoId: lic, confirmaDia: true }); const ult = JSON.parse(e.run('JSON.stringify(table_("Quizzes").rows.filter(r=>r.Status==="agendado"))'))[0]; if (ult) { call('quizAcao', { id: ult.QuizID, acao: 'cancelar' }); assert(!call('quizLider', { celulaId: cel }).itens.some(i => i.id === ult.QuizID)); }
// mesma lição em várias células: uma só chamada à IA, mesmas perguntas
const cel2 = call('createCell', { nome: 'Célula Sul', liderId: mk('carla'), dia: 'Quinta' }).id, dia3 = hoje(3);
call('saveLesson', { titulo: 'Fé e perseverança', resumo: 'Perseverar na fé', conteudo: 'Tiago ensina que a prova da nossa fé produz perseverança. Quem persevera na provação recebe a coroa da vida. A fé verdadeira se mostra nas obras e na paciência diante das dificuldades da vida.' }); const lic2 = call('listLessons', {}).find(l => l.titulo === 'Fé e perseverança').id;
call('saveAttendance', { celulaId: cel, data: dia3, presentes: [a], licaoId: lic2, confirmaDia: true }); call('saveAttendance', { celulaId: cel2, data: dia3, presentes: [], licaoId: lic2, confirmaDia: true });
e.run('CALLS.length = 0; IA = [1,2,3,4,5].map(i => ({ p: "Reuso " + i + "?", op: ["A"+i, "B"+i, "C"+i, "D"+i], c: i % 4, e: "x" }))'); e.run('enviaQuizzes()');
assert.equal(JSON.parse(e.run('JSON.stringify(CALLS.filter(c=>/\\/ia$/.test(c.url)).length)')), 1, 'uma chamada à IA para duas células');
const dois = JSON.parse(e.run('JSON.stringify(table_("Quizzes").rows.filter(r=>r.Titulo==="Fé e perseverança").map(r=>[r.Status,r.Fonte,r.Perguntas]))')); assert.equal(dois.length, 2); assert(dois.every(x => x[0] === 'enviado' && x[1] === 'ia') && dois[0][2] === dois[1][2]);
// lição "Outra" (resumo livre) nunca reaproveita: cada reunião gera o próprio quiz a partir do resumo
const dia4 = hoje(4), rs = 'Falamos sobre o perdão: perdoar como Cristo nos perdoou, deixando a mágoa e restaurando relacionamentos feridos';
e.run('CALLS.length = 0'); call('saveAttendance', { celulaId: cel, data: dia4, presentes: [a], licaoId: '', licaoResumo: rs, confirmaDia: true }); call('saveAttendance', { celulaId: cel2, data: dia4, presentes: [], licaoId: '', licaoResumo: rs, confirmaDia: true });
e.run('enviaQuizzes()'); assert.equal(JSON.parse(e.run('JSON.stringify(CALLS.filter(c=>/\\/ia$/.test(c.url)).length)')), 2, 'resumo livre: uma chamada por reunião'); assert.match(JSON.parse(e.run('JSON.stringify(CALLS.filter(c=>/\\/ia$/.test(c.url)).map(c=>JSON.parse(c.r.payload).prompt))'))[0], /perdão/);
// IA que devolve JSON torto: o app tolera, tenta de novo e, no pior caso, cai para o modelo
const P = x => JSON.parse(e.run(`JSON.stringify(quizParse_(${JSON.stringify(x)}))`));
const bom = { p: 'Qual a pergunta?', op: ['a', 'b', 'c', 'd'], c: 1, e: 'ok' };
assert.equal(P('Claro! ' + JSON.stringify([bom, bom]) + ' espero ter ajudado').length, 2, 'texto antes e depois');
assert.equal(P(JSON.stringify([bom, bom]).replace(/\]$/, ',]')).length, 2, 'vírgula sobrando');
assert.equal(P('[{"p":"Quem disse “eu sou o caminho”?","op":["a","b","c","d"],"c":1,"e":"x"},{"p":"Outra?","op":["a","b","c","d"],"c":0,"e":"y"}]').length, 2, 'aspas curvas');
const torto = '[{"p":"O que Jesus chamou de "semente"?","op":["a","b","c","d"],"c":1,"e":"x"},' + JSON.stringify(bom) + ',' + JSON.stringify(bom) + ']';
assert(P(torto).length >= 2, 'aspas soltas: aproveita o que dá'); assert(P('[{"p":"cortado","op":["a","b"').length === 0);
e.run('var BOM = ' + JSON.stringify(bom) + '; CALLS.length = 0; var SEQ = ["lixo sem json " + JSON.stringify(BOM), "[" + JSON.stringify(BOM) + "," + JSON.stringify(BOM) + "," + JSON.stringify(BOM) + "]"]; var SEQI = 0; UrlFetchApp.fetch = (u, r) => { CALLS.push({ url: u, r }); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, texto: SEQ[Math.min(SEQI++, 1)], usage: { prompt_tokens: 500, completion_tokens: 300 } }) }; }');
assert.equal(JSON.parse(e.run('JSON.stringify(quizIa_("Tema", "Texto da lição sobre o semeador e a palavra"))')).length, 3, 'segunda tentativa deu certo'); assert.equal(e.run('CALLS.length'), 2);
e.run('SEQI = 0; SEQ = ["nada", "nada de novo"]'); assert.throws(() => e.run('quizIa_("Tema", "Texto da lição sobre o semeador")'), /formato inválido/); const ts = call('testQuizIa', {}); assert.equal(ts.ok, false); assert.match(ts.msg, /fora do formato/); assert(!/vínculo AI/.test(ts.msg));
console.log('OK quiz');
