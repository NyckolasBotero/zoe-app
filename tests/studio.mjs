// Studio Zoe por área/pessoa + chat pastoral
import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert';
const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, call = (a, d, t) => { const r = e.call(a, d, t || adm); assert(r.ok !== false, a + ' ' + JSON.stringify(r)); return r.data !== undefined ? r.data : r; };
const mk = n => call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }).membroId;
const nic = mk('nicacio'), pro = mk('projeta'), fan = mk('fan'); const tk = n => e.call('login', { email: n + '@zoe.com', senha: 'Temp12345' }).data.token, T = { nic: tk('nicacio'), pro: tk('projeta'), fan: tk('fan') };
// só quem foi aprovado no ministério de Mídia entra; Nicácio e Projeta são da Mídia, Fan não
e.run(`appendRow_(table_('Ministerios'), { MinisterioID: 'MMID', Nome: 'Mídia', Ativo: '1' }); appendRow_(table_('Interesses'), { InteresseID: 'IN1', MinisterioID: 'MMID', MembroID: '${nic}', Data: now_(), Status: 'autorizado' }); appendRow_(table_('Interesses'), { InteresseID: 'IN2', MinisterioID: 'MMID', MembroID: '${pro}', Data: now_(), Status: 'autorizado' })`);
// sem configuração: membro comum sem acesso; admin tem tudo
assert.deepEqual(call('me', {}, adm).studio, ['live', 'proj', 'social', 'cfg']); assert.deepEqual(call('me', {}, T.nic).studio, ['social'], 'padrão da Mídia = Social Mídia'); assert.deepEqual(call('me', {}, T.fan).studio, []); assert.equal(e.call('getTelao', {}, T.nic).ok, false);
// admin libera só projeção ao Nicácio
call('saveStudioAcesso', { membroId: nic, areas: ['proj'] }); assert.deepEqual(call('me', {}, T.nic).studio, ['proj']); assert.equal(e.call('getTelao', {}, T.nic).ok, true);
assert.equal(e.call('getLiveCfg', {}, T.nic).ok, false, 'sem Lives'); assert.equal(e.call('listAgendas', {}, T.nic).ok, true, 'agendas é lido pela projeção'); assert.equal(e.call('saveAgenda', { titulo: 'x' }, T.nic).ok, false, 'configurações não');
assert.equal(e.call('saveStudioAcesso', { membroId: fan, areas: ['proj'] }, T.nic).ok, false, 'só admin define'); assert.equal(e.call('studioAcessos', {}, T.nic).ok, false);
// fora da Mídia não recebe áreas, só chat; gravação em lote só vale ao salvar
call('saveStudioAcessos', { itens: [{ membroId: fan, areas: ['live'] }] }); assert.deepEqual(call('me', {}, T.fan).studio, [], 'fora da Mídia ignora áreas');
assert.equal(e.call('saveStudioAcessos', { itens: [] }).ok, false, 'lote vazio');
const ls0 = call('studioAcessos', {}); assert.deepEqual(ls0.itens.find(i => i.id === pro).areas, ['social']); assert.equal(ls0.itens.find(i => i.id === fan), undefined);
call('saveStudioAcessos', { itens: [{ membroId: pro, areas: ['live', 'social', 'xx', 'live'] }, { membroId: fan, chat: true }] });
assert.deepEqual(call('me', {}, T.pro).studio, ['live', 'social']); assert.equal(call('me', {}, T.fan).studioChat, true); assert.deepEqual(call('me', {}, T.nic).studio, ['proj'], 'o que já valia foi preservado');
// chat pastoral: liberado ao "fan"; mensagem vai para quem está projetando
call('saveStudioAcesso', { membroId: fan, areas: [], chat: true }); assert.equal(call('me', {}, T.fan).studioChat, true); assert.equal(call('me', {}, T.pro).studioChat, false);
// mensagem comum (ninguém operando) não é pastoral
call('sendChat', { para: nic, texto: 'Paz!' }, T.fan); assert.equal(call('pingPastoral', {}, T.nic).pa.length, 0); assert.equal(call('listChats', {}, T.nic).pastoral.length, 0);
call('studioPresenca', { area: 'proj' }, T.nic); assert.equal(call('listChats', {}, T.fan).operadores[0].id, nic); assert.deepEqual(call('listChats', {}, T.nic).operadores, [], 'operador não vê a si');
const r1 = call('sendChat', { para: nic, texto: 'Pode passar o slide 3?' }, T.fan); assert.equal(r1.pastoral, true);
// aviso rápido (só cache) e lista autoritativa
let pg = call('pingPastoral', {}, T.nic); assert.equal(pg.pa.length, 1); assert.equal(pg.pa[0].texto, 'Pode passar o slide 3?'); assert.match(pg.pa[0].nome, /^Fan/);
assert.equal(call('listChats', {}, T.nic).pastoral.length, 1);
// abrir a conversa (lida) NÃO libera: só o joinha
call('chatRead', { com: fan }, T.nic); assert.equal(call('pingPastoral', {}, T.nic).pa.length, 1); assert.equal(call('listChats', {}, T.nic).pastoral.length, 1);
assert.equal(e.call('pastoralCiente', { id: r1.id }, T.pro).ok, false, 'só o destinatário dá ciente');
// o pastor vê a conversa sem ciente
assert.deepEqual(call('getChat', { com: nic }, T.fan).cientes, {});
call('pastoralCiente', { id: r1.id }, T.nic); assert.equal(call('pingPastoral', {}, T.nic).pa.length, 0); assert.equal(call('listChats', {}, T.nic).pastoral.length, 0);
assert.ok(call('getChat', { com: nic }, T.fan).cientes[r1.id] > 0, 'pastor vê o 👍');
// quem não tem liberação pastoral manda mensagem comum
assert.equal(call('sendChat', { para: nic, texto: 'oi' }, T.pro).pastoral, false); assert.equal(call('pingPastoral', {}, T.nic).pa.length, 0);
// operador respondendo ao pastor não é pastoral
assert.equal(call('sendChat', { para: fan, texto: 'Já passei!' }, T.nic).pastoral, false);
// remover acesso
call('saveStudioAcesso', { membroId: nic, areas: [] }); assert.deepEqual(call('me', {}, T.nic).studio, []);
// aprovação já mostra e grava o acesso; gestor da Mídia mantém depois
const nova = mk('novata'), tN = tk('novata'); T.nov = tN;
e.run(`appendRow_(table_('Interesses'), { InteresseID: 'IN3', MinisterioID: 'MMID', MembroID: '${nova}', Data: now_(), Status: 'pendente' })`);
const ap = call('listApprovals', {}).itens.find(x => x.id === 'IN3'); assert.equal(ap.ctx.midia, true); assert.deepEqual(ap.ctx.studio.areas, ['social']);
call('decideApproval', { tipo: 'interesse', id: 'IN3', decisao: 'autorizado', studio: { areas: ['proj', 'cfg'], chat: true } });
assert.deepEqual(call('me', {}, T.nov).studio, ['proj', 'cfg']); assert.equal(call('me', {}, T.nov).studioChat, true); assert.equal(call('me', {}, T.nov).studioGestor, false);
console.log('OK studio');
