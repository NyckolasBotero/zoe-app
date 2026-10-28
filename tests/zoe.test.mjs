import { makeEnv } from './mock_env.mjs'; import assert from 'node:assert/strict'; import test from 'node:test';
function boot() {
  const e = makeEnv(); e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
  const tok = (email, senha) => e.call('login', { email, senha }).data.token;
  const adm = tok('admin@zoe.com', 'SenhaForte123');
  const mk = (email, papel, extra = {}) => { const r = e.call('createUser', Object.assign({ email, nome: email.split('@')[0], senha: 'Temp12345', papel }, extra), adm); assert.ok(r.ok, JSON.stringify(r)); return r.data.membroId; };
  return { e, adm, tok, mk };
}
test('login: senha com hash, bloqueio e sessão', () => {
  const { e } = boot();
  assert.equal(e.call('login', { email: 'admin@zoe.com', senha: 'errada' }).error.code, 'AUTH');
  const ok = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }); assert.ok(ok.ok && ok.data.token);
  assert.ok(!JSON.stringify(e.sheets.Usuarios.rows).includes('SenhaForte123'));
  assert.equal(e.call('me').error.code, 'SESSION');
  for (let i = 0; i < 5; i++) e.call('login', { email: 'x@y.com', senha: 'a' });
  assert.equal(e.call('login', { email: 'x@y.com', senha: 'a' }).error.code, 'LOCKED');
  assert.equal(e.call('constructor').error.code, 'NOT_FOUND');
});
test('permissões são conferidas no servidor', () => {
  const { e, adm, tok, mk } = boot(); mk('maria@zoe.com', 'membro'); const m = tok('maria@zoe.com', 'Temp12345');
  for (const a of ['createEvent', 'saveMinistry', 'saveConfig', 'listUsers', 'createUser', 'listTransfers', 'createCell', 'savePerms']) assert.equal(e.call(a, {}, m).error.code, 'FORBIDDEN', a);
  assert.ok(e.call('createEvent', { titulo: 'Aniversário Zoe', data: '2026-10-31', hora: '18:00' }, adm).ok);
  assert.equal(e.call('listEvents', {}, m).data[0].titulo, 'Aniversário Zoe');
  assert.equal(e.call('enroll', { eventoId: e.call('listEvents', {}, m).data[0].id, on: true }, m).data.inscrito, true);
  assert.equal(e.call('listEvents', {}, m).data[0].inscrito, true);
  assert.equal(e.call('createEvent', { titulo: 'x', data: '31/10/2026' }, adm).error.code, 'VALIDATION');
  const pm = e.call('savePerms', { matriz: { membro: { eventos: 1 } } }, adm); assert.ok(pm.ok && pm.data.admin.config === 1);
  assert.ok(e.call('createEvent', { titulo: 'Agora pode', data: '2026-11-01' }, m).ok);
});
test('membro edita só o próprio perfil; e-mail de acesso não muda; batismo automático', () => {
  const { e, tok, mk } = boot(); mk('joao@zoe.com', 'membro'); const j = tok('joao@zoe.com', 'Temp12345');
  const r = e.call('saveMember', { membro: { Nome: 'João Silva', Nascimento: '1999-08-07', DataBatismo: '2020-01-05', Email: 'hack@x.com', Filhos: [{ n: 'Ana', idade: '3' }] } }, j); assert.ok(r.ok, JSON.stringify(r));
  const me = e.call('me', {}, j).data; assert.equal(me.membro.Batizado, 'sim'); assert.equal(me.membro.Email, 'joao@zoe.com'); assert.equal(me.membro.Filhos[0].n, 'Ana');
  assert.equal(e.call('saveMember', { membro: { Nascimento: '07/08/1999' } }, j).error.code, 'VALIDATION');
  assert.equal(e.call('saveMember', { membro: { Nome: '' } }, j).error.code, 'VALIDATION');
});
test('células: líder só na própria; presença; transferência com aprovação do supervisor', () => {
  const { e, adm, tok, mk } = boot();
  const sup = mk('sup@zoe.com', 'membro'), l1 = mk('lider1@zoe.com', 'membro'), l2 = mk('lider2@zoe.com', 'membro');
  const c1 = e.call('createCell', { nome: 'Semeadores', liderId: l1, supervisorId: sup, dia: 'Quinta', inicio: '20:00', fim: '21:30', categoria: 'Mulheres e Homens', faixa: 'Jovens', bairro: 'Chácaras Coimbra', cidade: 'Águas Lindas de Goiás', uf: 'GO' }, adm).data.id;
  const c2 = e.call('createCell', { nome: 'Raízes', liderId: l2, supervisorId: sup, dia: 'Segunda', inicio: '19:30', fim: '21:00' }, adm).data.id;
  const L1 = tok('lider1@zoe.com', 'Temp12345'), L2 = tok('lider2@zoe.com', 'Temp12345'), S = tok('sup@zoe.com', 'Temp12345');
  assert.equal(e.call('cellMembers', { celulaId: c2 }, L1).error.code, 'FORBIDDEN');
  assert.equal(e.call('saveCell', { celulaId: c2, nome: 'X' }, L1).error.code, 'FORBIDDEN');
  assert.equal(e.call('cellMembers', { celulaId: c2 }, S).ok, true);
  const novo = e.call('addNewMember', { nome: 'Carlos Pereira', endereco: 'Rua 1', celular: '61999990000', extras: { 'Quem convidou': 'Lari', 'Outra': 'x' } }, L1); assert.ok(novo.ok);
  const mems = e.call('cellMembers', {}, L1).data; assert.equal(mems.length, 2);
  assert.ok(e.sheets.Membros.rows.some(r => r.some(x => String(x).includes('Quem convidou')) && !r.some(x => String(x).includes('Outra'))));
  const att = e.call('saveAttendance', { data: '2026-10-22', presentes: mems.map(m => m.id), deus: true }, L1); assert.equal(att.data.presentes, 2);
  e.call('saveAttendance', { data: '2026-10-22', presentes: [mems[0].id], deus: false }, L1);
  const h = e.call('history', {}, L1).data; assert.equal(h.reunioes.length, 1); assert.equal(h.reunioes[0].presentes, 1); assert.equal(h.indicadores.presencaDeDeus, 0);
  const f = e.call('lookup', { nome: 'carlos' }, L2).data; assert.equal(f[0].situacao, 'outra'); assert.equal(f[0].celula, 'Semeadores');
  assert.equal(e.call('requestTransfer', { membroId: f[0].id }, L2).data.status, 'pendente');
  assert.equal(e.call('requestTransfer', { membroId: f[0].id }, L2).error.code, 'VALIDATION');
  const tr = e.call('listTransfers', {}, S).data; assert.equal(tr.length, 1); assert.equal(tr[0].status, 'pendente');
  assert.equal(e.call('listTransfers', {}, L2).error.code, 'FORBIDDEN');
  assert.equal(e.call('decideTransfer', { id: tr[0].id, decisao: 'autorizado' }, L2).error.code, 'FORBIDDEN');
  assert.equal(e.call('decideTransfer', { id: tr[0].id, decisao: 'autorizado' }, S).data.status, 'autorizado');
  assert.equal(e.call('cellMembers', {}, L2).data.length, 2); assert.equal(e.call('cellMembers', {}, L1).data.length, 1);
  assert.equal(e.call('decideTransfer', { id: tr[0].id, decisao: 'negado' }, S).error.code, 'VALIDATION');
  assert.equal(e.call('orgTree', {}, S).data[0].celulas.length, 2);
});
test('busca de células respeita privacidade; aniversários só dia e apelido', () => {
  const { e, adm, tok, mk } = boot(); const l = mk('lider@zoe.com', 'membro');
  e.call('saveMember', { membro: { Telefone: '61900000000' } }, tok('lider@zoe.com', 'Temp12345'));
  e.call('createCell', { nome: 'Semeadores', liderId: l, dia: 'Quinta', bairro: 'Coimbra', cidade: 'Águas Lindas', uf: 'GO', endereco: 'Rua Secreta 1' }, adm);
  const L = tok('lider@zoe.com', 'Temp12345'); mk('m@zoe.com', 'membro'); const M = tok('m@zoe.com', 'Temp12345');
  let r = e.call('searchCells', { q: 'aguas lindas' }, M).data; assert.equal(r.length, 1); assert.ok(!r[0].telefone && !r[0].local.includes('Secreta'));
  e.call('saveCell', { priv: { grupo: true, tel: true, email: false, end: true } }, L);
  r = e.call('searchCells', {}, M).data; assert.equal(r[0].telefone, '61900000000'); assert.ok(r[0].local.includes('Secreta'));
  e.call('saveCell', { priv: { grupo: false } }, L); assert.equal(e.call('searchCells', {}, M).data.length, 0);
  const hoje = e.run('today_()'); e.call('saveMember', { membro: { Nascimento: '1990-' + hoje.slice(5) } }, M);
  const b = e.call('birthdays', {}, M).data; assert.ok(b.lista.some(x => x.hoje)); assert.ok(!JSON.stringify(b).includes('1990'));
});
test('usuários: desativar encerra sessão; trocar senha; ministérios e config', () => {
  const { e, adm, tok, mk } = boot(); mk('a@zoe.com', 'membro'); const A = tok('a@zoe.com', 'Temp12345');
  assert.equal(e.call('setUser', { email: 'admin@zoe.com', status: 'Inativo' }, adm).error.code, 'VALIDATION');
  assert.equal(e.call('setUser', { email: 'admin@zoe.com', papel: 'membro' }, adm).error.code, 'VALIDATION');
  assert.ok(e.call('setUser', { email: 'a@zoe.com', status: 'Inativo' }, adm).ok);
  assert.equal(e.call('me', {}, A).error.code, 'SESSION'); assert.equal(e.call('login', { email: 'a@zoe.com', senha: 'Temp12345' }).error.code, 'AUTH');
  e.call('setUser', { email: 'a@zoe.com', status: 'Ativo' }, adm); const A2 = tok('a@zoe.com', 'Temp12345');
  assert.equal(e.call('changePassword', { atual: 'errada', nova: 'NovaSenha123' }, A2).error.code, 'AUTH');
  assert.ok(e.call('changePassword', { atual: 'Temp12345', nova: 'NovaSenha123' }, A2).ok); assert.equal(e.call('me', {}, A2).error.code, 'SESSION'); assert.ok(tok('a@zoe.com', 'NovaSenha123'));
  assert.equal(e.call('listMinistries', {}, adm).data.length, 7); assert.ok(e.call('saveMinistry', { nome: 'Teatro' }, adm).ok); assert.equal(e.call('saveMinistry', { nome: 'teatro' }, adm).error.code, 'VALIDATION');
  const mid = e.call('listMinistries', {}, adm).data.find(x => x.nome === 'Teatro').id; assert.ok(e.call('interest', { ministerioId: mid, membro: { Profissao: 'Designer' } }, adm).ok); assert.equal(e.call('listInterests', {}, adm).data[0].ministerio, 'Teatro');
  assert.ok(e.call('saveConfig', { WhatsApp: '+55 (61) 99437-7971', LocalEndereco: 'Rua A, 1', colunasExtras: ['Quem convidou', 'Bairro'] }, adm).ok);
  const c = e.call('me', {}, adm).data.config; assert.equal(c.whatsapp, '5561994377971'); assert.deepEqual(c.colunasExtras, ['Quem convidou', 'Bairro']);
  assert.equal(e.call('saveVideo', { titulo: 'x', url: 'http://x' }, adm).error.code, 'VALIDATION'); assert.ok(e.call('saveVideo', { titulo: 'Aula', url: 'https://youtube.com/x' }, adm).ok);
  assert.ok(e.call('saveLesson', { titulo: 'Semeando', resumo: 'r', categoria: 'Fé', url: 'https://x.com' }, adm).ok); assert.equal(e.call('saveLesson', { titulo: 'x', url: 'javascript:1' }, adm).error.code, 'VALIDATION'); const A3 = tok('a@zoe.com', 'NovaSenha123'); assert.equal(e.call('listLessons', {}, A3).data[0].titulo, 'Semeando'); assert.equal(e.call('getPerms', {}, adm).data.membro.config, 0); assert.equal(e.call('getPerms', {}, A3).error.code, 'FORBIDDEN');
});
test('admin edita tudo que criou: células, eventos, notícias, cursos, vídeos, dinâmicas', () => {
  const { e, adm, tok, mk } = boot(); mk('maria@zoe.com', 'membro'); const m = tok('maria@zoe.com', 'Temp12345'); const l1 = mk('lider1@zoe.com', 'membro');
  for (const a of ['adminList', 'adminSave', 'adminRemove']) assert.equal(e.call(a, { tipo: 'celulas' }, m).error.code, 'FORBIDDEN', a);
  assert.equal(e.call('adminList', { tipo: 'segredo' }, adm).error.code, 'VALIDATION');
  // célula
  const c = e.call('createCell', { nome: 'Semeadores', dia: 'Quinta' }, adm).data.id;
  let L = e.call('adminList', { tipo: 'celulas' }, adm).data; assert.equal(L.itens.length, 1); assert.ok(L.membros.length >= 2);
  assert.ok(e.call('adminSave', { tipo: 'celulas', id: c, valores: { Nome: 'Semeadores 2', Dia: 'Sexta', LiderID: l1, Status: 'Ativa' } }, adm).ok);
  L = e.call('adminList', { tipo: 'celulas' }, adm).data; assert.equal(L.itens[0].valores.Nome, 'Semeadores 2'); assert.equal(L.itens[0].valores.Dia, 'Sexta');
  assert.equal(e.call('adminSave', { tipo: 'celulas', id: c, valores: { Nome: '' } }, adm).error.code, 'VALIDATION');
  assert.equal(e.call('adminSave', { tipo: 'celulas', id: c, valores: { Nome: 'x', Dia: 'Feriado' } }, adm).error.code, 'VALIDATION');
  assert.ok(e.call('adminRemove', { tipo: 'celulas', id: c }, adm).ok); assert.equal(e.call('adminList', { tipo: 'celulas' }, adm).data.itens[0].off, true);
  assert.ok(e.call('adminRemove', { tipo: 'celulas', id: c, reativar: true }, adm).ok); assert.equal(e.call('adminList', { tipo: 'celulas' }, adm).data.itens[0].off, false);
  // evento
  assert.ok(e.call('createEvent', { titulo: 'Culto', data: '2026-11-01' }, adm).ok);
  const ev = e.call('adminList', { tipo: 'eventos' }, adm).data.itens[0];
  assert.ok(e.call('adminSave', { tipo: 'eventos', id: ev.id, valores: { Titulo: 'Culto Especial', Data: '2026-11-02', Programacao: 'Louvor\nPalavra' } }, adm).ok);
  assert.equal(e.call('listEvents', {}, m).data[0].titulo, 'Culto Especial'); assert.deepEqual(e.call('listEvents', {}, m).data[0].programacao, ['Louvor', 'Palavra']);
  assert.equal(e.call('adminSave', { tipo: 'eventos', id: ev.id, valores: { Data: '02/11/2026' } }, adm).error.code, 'VALIDATION');
  e.call('adminRemove', { tipo: 'eventos', id: ev.id }, adm); assert.equal(e.call('listEvents', {}, m).data.length, 0);
  // criar do zero por cada tipo + vídeo exige https
  assert.ok(e.call('adminSave', { tipo: 'noticias', valores: { Titulo: 'Aviso', Texto: 'Olá' } }, adm).ok); assert.equal(e.call('listNews', {}, m).data[0].titulo, 'Aviso');
  assert.ok(e.call('adminSave', { tipo: 'cursos', valores: { Nome: 'Escola de Líderes' } }, adm).ok); assert.equal(e.call('listCourses', {}, m).data[0].nome, 'Escola de Líderes');
  assert.equal(e.call('adminSave', { tipo: 'videos', valores: { Titulo: 'V', Url: 'http://x' } }, adm).error.code, 'VALIDATION');
  assert.ok(e.call('adminSave', { tipo: 'videos', valores: { Titulo: 'V', Url: 'https://youtu.be/abc' } }, adm).ok);
  assert.ok(e.call('adminSave', { tipo: 'dinamicas', valores: { Titulo: 'Quebra-gelo', Minutos: '15' } }, adm).ok);
  const d = e.call('adminList', { tipo: 'dinamicas' }, adm).data; assert.equal(d.podeApagar, true);
  e.call('adminRemove', { tipo: 'dinamicas', id: d.itens[0].id }, adm); assert.equal(e.call('adminList', { tipo: 'dinamicas' }, adm).data.itens.length, 0);
  assert.ok(e.call('adminSave', { tipo: 'ministerios', valores: { Nome: 'Teatro', Ordem: '9' } }, adm).ok);
});
test('admin edita membros e ministério com foto (foto mantida quando não alterada)', () => {
  const { e, adm, tok, mk } = boot(); mk('joao@zoe.com', 'membro'); const j = tok('joao@zoe.com', 'Temp12345');
  const c = e.call('createCell', { nome: 'Semeadores' }, adm).data.id;
  assert.equal(e.call('adminList', { tipo: 'membros' }, j).error.code, 'FORBIDDEN');
  let L = e.call('adminList', { tipo: 'membros' }, adm).data; assert.ok(L.itens.length >= 2); assert.equal(L.celulas[0].id, c);
  const it = L.itens.find(i => i.valores.Nome === 'joao'); assert.ok(it);
  assert.ok(e.call('adminSave', { tipo: 'membros', id: it.id, valores: { Nome: 'João da Silva', Telefone: '61999990000', CelulaID: c, Nascimento: '1990-05-01' } }, adm).ok);
  L = e.call('adminList', { tipo: 'membros' }, adm).data; const v = L.itens.find(i => i.id === it.id).valores; assert.equal(v.Nome, 'João da Silva'); assert.equal(v.CelulaID, c); assert.equal(v.Email, undefined);
  assert.equal(e.call('adminSave', { tipo: 'membros', id: it.id, valores: { Nome: 'x', Nascimento: '01/05/1990' } }, adm).error.code, 'VALIDATION');
  assert.equal(e.call('cellMembers', { celulaId: c }, adm).data.some(m => m.Nome === 'João da Silva' || m.nome === 'João da Silva'), true);
  e.call('adminRemove', { tipo: 'membros', id: it.id }, adm); assert.equal(e.call('adminList', { tipo: 'membros' }, adm).data.itens.find(i => i.id === it.id).off, true);
  // ministério com foto
  const foto = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const mid = e.call('adminSave', { tipo: 'ministerios', valores: { Nome: 'Teatro', Descricao: 'Artes', Foto: foto } }, adm).data.id;
  assert.equal(e.call('listMinistries', {}, j).data.find(m => m.id === mid).foto, foto);
  assert.equal(e.call('adminList', { tipo: 'ministerios' }, adm).data.itens.find(i => i.id === mid).valores.Foto, '__keep');
  assert.ok(e.call('adminSave', { tipo: 'ministerios', id: mid, valores: { Nome: 'Teatro Zoe', Foto: '__keep' } }, adm).ok);
  assert.equal(e.call('listMinistries', {}, j).data.find(m => m.id === mid).foto, foto);
  assert.equal(e.call('adminSave', { tipo: 'ministerios', id: mid, valores: { Nome: 'Teatro Zoe', Foto: 'javascript:alert(1)' } }, adm).error.code, 'VALIDATION');
  e.call('adminSave', { tipo: 'ministerios', id: mid, valores: { Nome: 'Teatro Zoe', Foto: '' } }, adm); assert.equal(e.call('listMinistries', {}, j).data.find(m => m.id === mid).foto, '');
});
test('cargos de célula são independentes do nível de acesso: admin pode ser líder e supervisor; treinamento; fluxo de transferência', () => {
  const { e, adm, tok, mk } = boot();
  const admId = e.call('me', {}, adm).data.membro.MembroID;
  const sup = mk('sup@zoe.com', 'membro'), l2 = mk('lider2@zoe.com', 'membro'), tr = mk('trein@zoe.com', 'membro'), x = mk('comum@zoe.com', 'membro');
  // só quem tem permissão de administração cria células; ser líder/supervisor não dá esse poder
  assert.equal(e.call('createCell', { nome: 'A' }, tok('sup@zoe.com', 'Temp12345')).error.code, 'FORBIDDEN');
  // o próprio admin é líder da célula A e supervisor da célula B; B é liderada por lider2 com tr em treinamento
  const cA = e.call('createCell', { nome: 'Célula A', liderId: admId, supervisorId: sup }, adm).data.id;
  const cB = e.call('createCell', { nome: 'Célula B', liderId: l2, supervisorId: admId, treinamentoId: tr }, adm).data.id;
  const me = e.call('me', {}, adm).data; assert.equal(me.usuario.papel, 'admin'); assert.equal(me.cargos.lider, true); assert.equal(me.cargos.supervisor, true);
  const S = tok('sup@zoe.com', 'Temp12345'), L2 = tok('lider2@zoe.com', 'Temp12345'), T = tok('trein@zoe.com', 'Temp12345'), X = tok('comum@zoe.com', 'Temp12345');
  assert.deepEqual(e.call('me', {}, S).data.cargos, { lider: false, treinamento: false, supervisor: true });
  assert.equal(e.call('me', {}, T).data.nivelCelula, 'treinamento'); assert.equal(e.call('me', {}, L2).data.nivelCelula, 'lider');
  // treinamento: vê membros e registra presença; não gerencia nem pede transferência
  assert.equal(e.call('cellMembers', {}, T).ok, true);
  assert.equal(e.call('saveAttendance', { data: '2026-10-22', presentes: [] }, T).ok, true);
  assert.equal(e.call('saveCell', { nome: 'Y' }, T).error.code, 'FORBIDDEN'); assert.equal(e.call('requestTransfer', { membroId: x }, T).error.code, 'FORBIDDEN');
  // membro comum sem cargo não acessa dados da célula
  assert.equal(e.call('cellMembers', { celulaId: cB }, X).error.code, 'FORBIDDEN');
  // líder pede (a pessoa X está sem célula: entra direto; para testar o pedido, X entra na célula A primeiro)
  assert.equal(e.call('requestTransfer', { membroId: x }, L2).data.status, 'incluido');
  assert.equal(e.call('requestTransfer', { membroId: x, celulaId: cB }, tok('sup@zoe.com', 'Temp12345')).error.code, 'FORBIDDEN'); // supervisor não é quem pede
  const y = mk('outro@zoe.com', 'membro'); e.call('adminSave', { tipo: 'membros', id: y, valores: { Nome: 'Outro', CelulaID: cA } }, adm);
  assert.equal(e.call('requestTransfer', { membroId: y }, L2).data.status, 'pendente');   // de A para B
  // o supervisor da origem/destino decide; quem pediu e o treinamento não
  const lista = e.call('listTransfers', {}, adm).data; assert.equal(lista.length, 1);           // admin é supervisor de B (destino)
  assert.equal(e.call('listTransfers', {}, T).error.code, 'FORBIDDEN');
  assert.equal(e.call('listTransfers', {}, S).data.length, 1);                                 // sup é supervisor de A (origem)
  assert.equal(e.call('decideTransfer', { id: lista[0].id, decisao: 'autorizado' }, L2).error.code, 'FORBIDDEN');
  assert.equal(e.call('decideTransfer', { id: lista[0].id, decisao: 'autorizado' }, S).data.status, 'autorizado');
  assert.equal(e.call('cellMembers', { celulaId: cB }, adm).data.some(m => m.id === y), true);
  // pedido feito por quem também supervisiona o destino: precisa de outra pessoa decidir
  const z = mk('z@zoe.com', 'membro'); e.call('adminSave', { tipo: 'membros', id: z, valores: { Nome: 'Zé', CelulaID: cB } }, adm);
  assert.equal(e.call('requestTransfer', { membroId: z, celulaId: cA }, adm).data.status, 'pendente');
  assert.equal(e.call('papelLegado', {}, adm).error.code, 'NOT_FOUND');
});
test('evento com foto personalizada: criar, listar, editar e validar', () => {
  const { e, adm, tok, mk } = boot(); mk('m@zoe.com', 'membro'); const m = tok('m@zoe.com', 'Temp12345');
  const foto = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  assert.equal(e.call('createEvent', { titulo: 'Retiro', data: '2026-11-20', foto: 'http://evil/x.png' }, adm).error.code, 'VALIDATION');
  assert.equal(e.call('createEvent', { titulo: 'Retiro', data: '2026-11-20', foto: 'data:image/jpeg;base64,' + 'A'.repeat(46000) }, adm).error.code, 'VALIDATION');
  assert.ok(e.call('createEvent', { titulo: 'Retiro', data: '2026-11-20', foto }, adm).ok);
  assert.equal(e.call('listEvents', {}, m).data[0].foto, foto);
  const it = e.call('adminList', { tipo: 'eventos' }, adm).data.itens[0]; assert.equal(it.valores.Foto, '__keep');
  assert.ok(e.call('adminSave', { tipo: 'eventos', id: it.id, valores: { Titulo: 'Retiro Zoe', Data: '2026-11-20', Foto: '__keep' } }, adm).ok); assert.equal(e.call('listEvents', {}, m).data[0].foto, foto);
  e.call('adminSave', { tipo: 'eventos', id: it.id, valores: { Titulo: 'Retiro Zoe', Data: '2026-11-20', Foto: '' } }, adm); assert.equal(e.call('listEvents', {}, m).data[0].foto, '');
});
test('horário que o Sheets converteu em Date (1899-12-30) volta como HH:mm, não como data', () => {
  const { e } = boot();
  assert.equal(e.run(`str_(new Date('1899-12-30T23:06:28Z'))`), '20:00');
  assert.equal(e.run(`str_(new Date('2026-10-22T12:00:00Z'))`), '2026-10-22');
  assert.equal(e.run(`str_('20:00')`), '20:00');
});
test('fluxo: frequência confere o dia da célula; saída só com líder + supervisor; histórico com nomes', () => {
  const { e, adm, tok, mk } = boot();
  const sup = mk('sup@zoe.com', 'membro'), l1 = mk('lider1@zoe.com', 'membro');
  const c1 = e.call('createCell', { nome: 'Semeadores', liderId: l1, supervisorId: sup, dia: 'Quinta', inicio: '20:00' }, adm).data.id;
  const a = e.call('createUser', { email: 'ana@zoe.com', nome: 'Ana', senha: 'Temp12345', papel: 'membro', celulaId: c1 }, adm).data.membroId;
  const b = e.call('createUser', { email: 'beto@zoe.com', nome: 'Beto', senha: 'Temp12345', papel: 'membro', celulaId: c1 }, adm).data.membroId;
  const L = tok('lider1@zoe.com', 'Temp12345'), S = tok('sup@zoe.com', 'Temp12345');
  const mems = e.call('cellMembers', {}, L).data; assert.ok(mems.some(m => m.id === a) && mems.some(m => m.id === b));
  // 2026-10-22 é quinta; 2026-10-21 é quarta; futuro bloqueado
  assert.equal(e.call('saveAttendance', { data: '2099-01-01', presentes: [] }, L).error.code, 'VALIDATION');
  const r = e.call('saveAttendance', { data: '2026-10-21', presentes: [a] }, L); assert.equal(r.error.code, 'DIA_DIFERENTE');
  assert.equal(e.call('history', {}, L).data.reunioes.length, 0);
  assert.equal(e.call('saveAttendance', { data: '2026-10-21', presentes: [a], confirmaDia: true }, L).data.foraDoDia, true);
  assert.equal(e.call('saveAttendance', { data: '2026-10-22', presentes: [a] }, L).data.foraDoDia, false);
  const h = e.call('history', {}, L).data; assert.equal(h.reunioes.length, 2);
  assert.equal(h.reunioes[0].dia, 'Quinta'); assert.deepEqual(h.reunioes[0].nomesPresentes, ['Ana']); assert.ok(h.reunioes[0].nomesAusentes.includes('Beto') && !h.reunioes[0].nomesAusentes.includes('Ana'));
  assert.equal(h.reunioes[1].foraDoDia, true); assert.equal(h.indicadores.exParticipantes, 0);
  // saída: líder pede, supervisor decide; antes disso Beto continua na lista
  assert.equal(e.call('requestExit', { membroId: b }, S).error.code, 'FORBIDDEN');
  assert.equal(e.call('requestExit', { membroId: b, motivo: 'Mudou de igreja' }, L).data.status, 'pendente');
  assert.equal(e.call('requestExit', { membroId: b }, L).error.code, 'VALIDATION');
  const n0 = e.call('cellMembers', {}, L).data.length; assert.equal(e.call('history', {}, L).data.indicadores.exParticipantes, 0);
  const pend = e.call('listTransfers', {}, S).data.filter(x => x.tipo === 'saida'); assert.equal(pend.length, 1); assert.equal(pend[0].motivo, 'Mudou de igreja');
  assert.equal(e.call('decideExit', { id: pend[0].id, decisao: 'autorizado' }, L).error.code, 'FORBIDDEN');
  assert.equal(e.call('decideExit', { id: pend[0].id, decisao: 'autorizado' }, S).data.status, 'autorizado');
  assert.equal(e.call('cellMembers', {}, L).data.length, n0 - 1);
  const h2 = e.call('history', {}, L).data; assert.equal(h2.indicadores.exParticipantes, 1); assert.equal(h2.indicadores.exNomes[0].nome, 'Beto'); assert.equal(h2.indicadores.participantes, n0 - 1);
  // transferência não conta como ex-participante
  const l2 = mk('lider2@zoe.com', 'membro'), c2 = e.call('createCell', { nome: 'Raízes', liderId: l2, supervisorId: sup, dia: 'Segunda' }, adm).data.id; assert.ok(c2);
  const L2 = tok('lider2@zoe.com', 'Temp12345'); e.call('requestTransfer', { membroId: a }, L2);
  const t = e.call('listTransfers', {}, S).data.find(x => x.tipo === 'transferencia'); e.call('decideTransfer', { id: t.id, decisao: 'autorizado' }, S);
  assert.equal(e.call('history', {}, L).data.indicadores.exParticipantes, 1);
});
test('biblioteca virtual: admin envia PDF; membros leem e comentam; testemunhos para todos', () => {
  const { e, adm, tok, mk } = boot(); mk('ana@zoe.com', 'membro'); mk('beto@zoe.com', 'membro');
  const A = tok('ana@zoe.com', 'Temp12345'), B = tok('beto@zoe.com', 'Temp12345');
  const pdf = Buffer.from('%PDF-1.4 teste').toString('base64');
  assert.equal(e.call('saveBook', { titulo: 'Livro X', pdf }, A).error.code, 'FORBIDDEN');
  assert.equal(e.call('saveBook', { titulo: 'Livro X', pdf: Buffer.from('nao e pdf').toString('base64') }, adm).error.code, 'VALIDATION');
  assert.equal(e.call('saveBook', { titulo: 'Livro X' }, adm).error.code, 'VALIDATION');
  const id = e.call('saveBook', { titulo: 'Livro X', autor: 'Autor', descricao: 'Desc', capa: '', pdf }, adm).data.id;
  const l = e.call('listBooks', {}, A).data; assert.equal(l.length, 1); assert.equal(l[0].titulo, 'Livro X'); assert.equal(l[0].tamanho > 0, true);
  assert.equal(Buffer.from(e.call('getBookFile', { id }, A).data.pdf, 'base64').toString().startsWith('%PDF'), true);
  const c = e.call('addBookComment', { livroId: id, texto: 'Que livro abençoador', pagina: '12' }, A).data.id;
  assert.equal(e.call('addBookComment', { livroId: id, texto: '' }, A).error.code, 'VALIDATION');
  assert.equal(e.call('toggleLike', { tipo: 'comentario', alvoId: c }, B).data.curti, true);
  const fc = e.call('listBookComments', { livroId: id }, B).data; assert.equal(fc[0].autor, 'ana'); assert.equal(fc[0].curtidas, 1); assert.equal(fc[0].curti, true); assert.equal(fc[0].meu, false);
  assert.equal(e.call('deleteBookComment', { id: c }, B).error.code, 'FORBIDDEN');
  assert.equal(e.call('listBooks', {}, B).data[0].comentarios, 1);
  // substituir PDF mantém o livro
  e.call('saveBook', { id, titulo: 'Livro X 2', pdf }, adm); assert.equal(e.call('listBooks', {}, A).data[0].titulo, 'Livro X 2');
  // testemunhos
  assert.equal(e.call('addTestimony', { texto: 'curto' }, A).error.code, 'VALIDATION');
  const t = e.call('addTestimony', { titulo: 'Cura', texto: 'Deus me curou de uma enfermidade.' }, A).data.id;
  const lt = e.call('listTestimonies', {}, B).data; assert.equal(lt.length, 1); assert.equal(lt[0].titulo, 'Cura'); assert.equal(lt[0].autor, 'ana');
  assert.equal(e.call('deleteTestimony', { id: t }, B).error.code, 'FORBIDDEN');
  assert.equal(e.call('deleteTestimony', { id: t }, adm).ok, true); assert.equal(e.call('listTestimonies', {}, B).data.length, 0);
  assert.equal(e.call('deleteBook', { id }, A).error.code, 'FORBIDDEN'); assert.equal(e.call('deleteBook', { id }, adm).ok, true); assert.equal(e.call('listBooks', {}, A).data.length, 0);
});
test('organograma: todos veem a árvore; célula gerada de outra', () => {
  const { e, adm, tok, mk } = boot(); const sup = mk('sup@zoe.com', 'membro'), l1 = mk('l1@zoe.com', 'membro'), l2 = mk('l2@zoe.com', 'membro');
  const c1 = e.call('createCell', { nome: 'Semeadores', liderId: l1, supervisorId: sup }, adm).data.id;
  e.call('createCell', { nome: 'Seara', liderId: l2, supervisorId: sup, maeId: c1 }, adm);
  const X = (mk('x@zoe.com', 'membro'), tok('x@zoe.com', 'Temp12345')); const o = e.call('orgTree', {}, X).data;
  assert.equal(o.length, 1); assert.equal(o[0].celulas.length, 2); assert.equal(o[0].celulas.find(c => c.nome === 'Seara').maeId, c1); assert.equal(o[0].celulas[0].membros, 1);
});
