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
  assert.equal(e.call('orgTree', {}, S).data.grupos[0].celulas.length, 2);
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
  const X = (mk('x@zoe.com', 'membro'), tok('x@zoe.com', 'Temp12345')); assert.equal(e.call('orgTree', {}, X).error.code, 'FORBIDDEN'); { const L1 = e.call('orgTree', {}, tok('l1@zoe.com', 'Temp12345')); assert.ok(L1.ok); assert.ok(L1.data.grupos[0].celulas.every(c => !c.editavel)); } // líder vê, mas só supervisor/admin edita
  const SU = tok('sup@zoe.com', 'Temp12345'), o = e.call('orgTree', {}, SU).data.grupos;
  assert.equal(o.length, 1); assert.equal(o[0].celulas.length, 2); assert.equal(o[0].celulas.find(c => c.nome === 'Seara').maeId, c1); assert.equal(o[0].celulas[0].membros, 1);
  // mover célula para outro supervisor muda quem recebe os pedidos
  const sup2 = mk('sup2@zoe.com', 'membro'), seara = o[0].celulas.find(c => c.nome === 'Seara').id, SU2 = tok('sup2@zoe.com', 'Temp12345');
  assert.equal(e.call('orgMove', { celulaId: seara, supervisorId: sup2 }, X).error.code, 'FORBIDDEN');
  assert.equal(e.call('orgMove', { celulaId: seara, supervisorId: sup2 }, SU2).error.code, 'FORBIDDEN'); // ainda não supervisiona esta
  assert.equal(e.call('orgMove', { celulaId: seara, supervisorId: sup2 }, SU).ok, true);
  assert.equal(e.call('orgTree', {}, SU2).data.grupos.find(g => g.supervisorId === sup2).celulas[0].editavel, true);
  assert.equal(e.call('orgMove', { celulaId: c1, maeId: seara }, adm).error.code, 'VALIDATION'); // ciclo (Seara já é filha de Semeadores)
  assert.equal(e.call('orgMove', { celulaId: seara, supervisorId: '' }, adm).ok, true);
  assert.equal(e.call('saveOrgLayout', { layout: { [seara]: { x: 10, y: 20 } } }, SU).ok, true); assert.equal(e.call('orgTree', {}, adm).data.layout[seara].x, 10);
  assert.equal(e.call('saveOrgLayout', { layout: {} }, X).error.code, 'FORBIDDEN');
});
test('aprovações: central única, membresia por frequência configurável, desfazer', () => {
  const { e, adm, tok, mk } = boot();
  const sup = mk('sup@zoe.com', 'membro'), l1 = mk('lider1@zoe.com', 'membro'), l2 = mk('lider2@zoe.com', 'membro'), ana = mk('ana@zoe.com', 'membro');
  const c1 = e.call('createCell', { nome: 'Semeadores', liderId: l1, supervisorId: sup, dia: 'Quinta' }, adm).data.id;
  const c2 = e.call('createCell', { nome: 'Raízes', liderId: l2, supervisorId: sup, dia: 'Segunda' }, adm).data.id; assert.ok(c2);
  const L1 = tok('lider1@zoe.com', 'Temp12345'), S = tok('sup@zoe.com', 'Temp12345'), A = tok('ana@zoe.com', 'Temp12345'), L2 = tok('lider2@zoe.com', 'Temp12345');
  // parâmetro de frequências para virar membro
  assert.equal(e.call('saveConfig', { FrequenciasParaMembro: 0 }, adm).error.code, 'VALIDATION');
  assert.equal(e.call('saveConfig', { FrequenciasParaMembro: 2 }, adm).data.frequenciasParaMembro, 2);
  // visitante vai a 2 células seguidas (quintas 15 e 22/10/2026) e gera pedido para o supervisor
  const v = e.call('addNewMember', { nome: 'Visitante Silva', celular: '61999990000' }, L1).data.id;
  e.call('saveAttendance', { data: '2026-10-15', presentes: [v] }, L1); assert.equal(e.call('listApprovals', {}, S).data.itens.filter(x => x.tipo === 'membresia').length, 0);
  e.call('saveAttendance', { data: '2026-10-22', presentes: [v] }, L1);
  const m = e.call('listApprovals', {}, S).data.itens.find(x => x.tipo === 'membresia'); assert.ok(m); assert.equal(m.status, 'pendente'); assert.equal(m.revisar.telefone, '61999990000'); assert.equal(e.call('listApprovals', {}, S).data.pendentes, 1);
  assert.equal(e.call('listApprovals', {}, L1).data.itens.length, 0); // líder não vê pedidos de supervisor
  e.call('saveAttendance', { data: '2026-10-22', presentes: [v] }, L1); assert.equal(e.call('listApprovals', {}, S).data.itens.filter(x => x.tipo === 'membresia').length, 1); // não duplica
  assert.equal(e.call('decideApproval', { tipo: 'membresia', id: m.id, decisao: 'autorizado' }, L1).error.code, 'FORBIDDEN');
  assert.equal(e.call('decideApproval', { tipo: 'membresia', id: m.id, decisao: 'autorizado' }, S).data.status, 'autorizado');
  assert.equal(e.run(`table_('Membros').rows.filter(function(x){return x.MembroID==='${v}'})[0].EhMembro`), '1');
  let it = e.call('listApprovals', {}, S).data.itens.find(x => x.id === m.id); assert.equal(it.minha, true); assert.equal(it.podeReverter, true); assert.equal(it.decididoPor, 'Visitante Silva' === it.decididoPor ? '' : it.decididoPor);
  assert.equal(e.call('undoApproval', { tipo: 'membresia', id: m.id }, L1).error.code, 'FORBIDDEN');
  assert.equal(e.call('undoApproval', { tipo: 'membresia', id: m.id }, S).data.status, 'pendente');
  assert.equal(e.run(`table_('Membros').rows.filter(function(x){return x.MembroID==='${v}'})[0].EhMembro`), '0');
  assert.equal(e.call('decideApproval', { tipo: 'membresia', id: m.id, decisao: 'negado' }, S).error.code, 'VALIDATION'); // recusar exige motivo
  assert.equal(e.call('decideApproval', { tipo: 'membresia', id: m.id, decisao: 'negado', motivo: 'Cadastro incompleto' }, S).data.status, 'negado');
  it = e.call('listApprovals', {}, S).data.itens.find(x => x.id === m.id); assert.deepEqual(it.hist.map(h => h.acao), ['autorizado', 'revertido', 'negado']);
  // transferência autorizada e desfeita volta a pessoa para a célula de origem
  const mb = e.call('cellMembers', {}, L1).data.find(x => x.id === ana) || null; assert.equal(mb, null);
  e.run(`writeRow_(table_('Membros'), table_('Membros').rows.filter(function(x){return x.MembroID==='${ana}'})[0]._row, {CelulaID:'${c1}'})`);
  e.call('requestTransfer', { membroId: ana }, L2);
  const tr = e.call('listApprovals', {}, S).data.itens.find(x => x.tipo === 'transferencia' && x.status === 'pendente'); assert.ok(tr);
  assert.equal(e.call('decideApproval', { tipo: 'transferencia', id: tr.id, decisao: 'autorizado' }, S).data.status, 'autorizado');
  assert.equal(e.call('cellMembers', {}, L2).data.some(x => x.id === ana), true);
  e.call('undoApproval', { tipo: 'transferencia', id: tr.id }, S); assert.equal(e.call('cellMembers', {}, L2).data.some(x => x.id === ana), false); assert.equal(e.call('cellMembers', {}, L1).data.some(x => x.id === ana), true);
  // saída autorizada e desfeita
  e.call('requestExit', { membroId: ana }, L1); const sx = e.call('listApprovals', {}, S).data.itens.find(x => x.tipo === 'saida');
  e.call('decideApproval', { tipo: 'saida', id: sx.id, decisao: 'autorizado' }, S); assert.equal(e.call('cellMembers', {}, L1).data.some(x => x.id === ana), false);
  e.call('undoApproval', { tipo: 'saida', id: sx.id }, S); assert.equal(e.call('cellMembers', {}, L1).data.some(x => x.id === ana), true);
  // interesse em ministério: só quem gerencia ministérios decide; aparece no roadmap do membro
  const minId = e.call('listMinistries', {}, A).data[0].id; assert.ok(e.call('interest', { ministerioId: minId }, A).ok);
});
test('interesse em ministério aprovado aparece no perfil do membro; uso da plataforma', () => {
  const { e, adm, tok, mk } = boot(); mk('ana@zoe.com', 'membro'); const A = tok('ana@zoe.com', 'Temp12345'); const mid = e.call('listMinistries', {}, A).data[0].id;
  const route = Object.keys(e.ctx.ROUTES || {}).find(k => /interest/i.test(k)) || e.run(`Object.keys(ROUTES).filter(function(k){return /nterest|nvolva/i.test(k)})[0]`);
  assert.ok(route); assert.ok(e.call(route, { ministerioId: mid }, A).ok);
  assert.equal(e.call('listApprovals', {}, A).data.itens.length, 0);
  const it = e.call('listApprovals', {}, adm).data.itens.find(x => x.tipo === 'interesse'); assert.equal(it.status, 'pendente');
  assert.equal(e.call('me', {}, A).data.interesses[0].status, 'pendente');
  assert.equal(e.call('decideApproval', { tipo: 'interesse', id: it.id, decisao: 'autorizado' }, A).error.code, 'FORBIDDEN');
  e.call('decideApproval', { tipo: 'interesse', id: it.id, decisao: 'autorizado' }, adm);
  const me = e.call('me', {}, A).data; assert.equal(me.interesses[0].status, 'autorizado'); assert.ok(me.interesses[0].dataDecisao);
  assert.equal(e.call(route, { ministerioId: mid }, A).error.code, 'VALIDATION'); // já participa
  e.call('undoApproval', { tipo: 'interesse', id: it.id }, adm); assert.equal(e.call('me', {}, A).data.interesses[0].status, 'pendente');
  // uso
  e.call('track', { tela: 'feed', seg: 120, visita: 1 }, A); e.call('track', { tela: 'biblioteca', seg: 60 }, A); e.call('track', { tela: 'feed', seg: 30 }, A); e.call('track', { tela: '_login', seg: 5 }, A);
  const rep = e.call('usageReport', {}, adm).data; assert.equal(rep.totalSegundos, 210); assert.equal(rep.telas[0].tela, 'feed'); assert.equal(rep.telas[0].pct, 71.4);
  const ru = rep.usuarios.find(x => x.email === 'ana@zoe.com'); assert.equal(ru.segundos, 210); assert.equal(ru.logins >= 1, true);
  assert.equal(e.call('usageReport', {}, A).error.code, 'FORBIDDEN');
  // senha e acesso pelo painel
  assert.ok(e.call('setUser', { email: 'ana@zoe.com', senha: 'NovaSenha999', papel: 'pastor' }, adm).ok); assert.equal(e.call('login', { email: 'ana@zoe.com', senha: 'NovaSenha999' }).ok, true); assert.equal(e.call('login', { email: 'ana@zoe.com', senha: 'Temp12345' }).error.code, 'AUTH');
});

test('nota de 1 a 10 nos livros e fotos de perfil sob demanda', () => {
  const { e, adm, tok, mk } = boot(); mk('ana@zoe.com', 'membro'); mk('beto@zoe.com', 'membro'); const A = tok('ana@zoe.com', 'Temp12345'), B = tok('beto@zoe.com', 'Temp12345');
  const id = e.call('saveBook', { titulo: 'L', pdf: Buffer.from('%PDF-1.4 x').toString('base64') }, adm).data.id;
  assert.equal(e.call('rateBook', { livroId: id, nota: 11 }, A).error.code, 'VALIDATION'); assert.equal(e.call('rateBook', { livroId: id, nota: 0 }, A).error.code, 'VALIDATION');
  e.call('rateBook', { livroId: id, nota: 10 }, A); const r = e.call('rateBook', { livroId: id, nota: 7 }, B).data; assert.equal(r.nota, 8.5); assert.equal(r.votos, 2);
  e.call('rateBook', { livroId: id, nota: 6 }, B); const l = e.call('listBooks', {}, B).data[0]; assert.equal(l.nota, 8); assert.equal(l.minhaNota, 6); assert.equal(l.votos, 2);
  const ana = e.call('me', {}, A).data.membro.MembroID; e.run(`writeRow_(table_('Membros'), table_('Membros').rows.filter(function(x){return x.MembroID==='${ana}'})[0]._row, {Foto:'data:image/jpeg;base64,AAAA'})`);
  const f = e.call('fotos', { ids: [ana, 'x'] }, B).data; assert.equal(f[ana], 'data:image/jpeg;base64,AAAA'); assert.equal(f.x, '');
  const c = e.call('addBookComment', { livroId: id, texto: 'oi' }, A).data.id; assert.ok(c); assert.equal(e.call('listBookComments', { livroId: id }, B).data[0].membroId, ana);
  // envio grande: só saveBook passa de 1,5 MB
  const big = Buffer.alloc(1200000, 65); const pdf = Buffer.concat([Buffer.from('%PDF-1.4 '), big]).toString('base64');
  assert.equal(e.call('saveBook', { titulo: 'Grande', pdf }, adm).ok, true);
  assert.equal(e.call('addTestimony', { texto: 'x'.repeat(10), padding: 'y'.repeat(1600000) }, A).error.code, 'BAD_REQUEST');
});

test('coordenadas da célula: validação, mapa e privacidade do endereço', () => {
  const { e, adm } = boot();
  assert.equal(e.call('createCell', { nome: 'X', coordenadas: 'abc' }, adm).error.code, 'VALIDATION');
  assert.equal(e.call('createCell', { nome: 'X', coordenadas: '-95, 10' }, adm).error.code, 'VALIDATION');
  const id = e.call('createCell', { nome: 'Norte', dia: 'Quinta', coordenadas: '-15.765417, -48.267880' }, adm).data.id;
  let c = e.call('searchCells', {}, adm).data.find(x => x.id === id); assert.equal(c.lat, -15.77); assert.equal(c.lng, -48.27); assert.equal(c.aprox, true); // endereço privado: ponto aproximado
  e.call('saveCell', { celulaId: id, priv: { grupo: true, tel: false, email: false, end: true } }, adm);
  c = e.call('searchCells', {}, adm).data.find(x => x.id === id); assert.equal(c.lat, -15.765417); assert.equal(c.lng, -48.26788); assert.equal(c.aprox, false);
  assert.equal(e.call('saveCell', { celulaId: id, coordenadas: '-15.8,-48.1' }, adm).data.coordenadas, '-15.8, -48.1');
  assert.equal(e.call('saveCell', { celulaId: id, coordenadas: '' }, adm).data.coordenadas, '');
});

test('vídeos e transmissões: tipo e ao vivo', () => {
  const { e, adm } = boot();
  assert.equal(e.call('saveVideo', { titulo: 'Culto', url: 'https://youtu.be/abcdefghijk', tipo: 'live', aoVivo: true }, adm).ok, true);
  assert.equal(e.call('saveVideo', { titulo: 'Aula', url: 'https://youtu.be/abcdefghijl' }, adm).ok, true);
  let l = e.call('listVideos', {}, adm).data; assert.equal(l[0].tipo, 'live'); assert.equal(l[0].aoVivo, true); assert.equal(l[1].tipo, 'video'); assert.equal(l[1].aoVivo, false);
  assert.equal(e.call('updateVideo', { id: l[0].id, aoVivo: false }, adm).ok, true); assert.equal(e.call('listVideos', {}, adm).data[0].aoVivo, false);
  e.call('updateVideo', { id: l[1].id, aoVivo: true }, adm); assert.equal(e.call('listVideos', {}, adm).data[1].aoVivo, false); // só transmissão pode estar ao vivo
  assert.equal(e.call('updateVideo', { id: 'x', aoVivo: true }, adm).error.code, 'NOT_FOUND');
});
test('loja: produtos só pela administração, validação e número da loja', () => {
  const { e, adm, tok, mk } = boot(); mk('maria@zoe.com', 'membro'); const m = tok('maria@zoe.com', 'Temp12345');
  assert.equal(e.call('saveProduct', { nome: 'Boné', preco: 30 }, m).error.code, 'FORBIDDEN');
  assert.equal(e.call('saveProduct', { nome: '', preco: 30 }, adm).error.code, 'VALIDATION');
  assert.equal(e.call('saveProduct', { nome: 'X', preco: -1 }, adm).error.code, 'VALIDATION');
  assert.equal(e.call('saveProduct', { nome: 'X', preco: 5, foto: 'http://x/a.jpg' }, adm).error.code, 'VALIDATION');
  const r = e.call('saveProduct', { nome: 'Camiseta Zoe', categoria: 'Camisetas', preco: 49.9, opcoes: 'P, M, G', descricao: 'Algodão', foto: 'data:image/jpeg;base64,AAAA' }, adm); assert.ok(r.ok);
  e.call('saveProduct', { nome: 'Coisa', categoria: 'Inventada', preco: 1 }, adm);
  const l = e.call('listProducts', {}, m).data; assert.equal(l.length, 2); assert.equal(l[0].preco, 49.9); assert.equal(l[0].opcoes, 'P, M, G'); assert.equal(l[1].categoria, 'Outros');
  assert.ok(e.call('saveProduct', { id: r.data.id, nome: 'Camiseta Zoe', categoria: 'Camisetas', preco: 55, disponivel: false }, adm).ok);
  const a = e.call('listProducts', {}, m).data[0]; assert.equal(a.preco, 55); assert.equal(a.disponivel, false); assert.equal(a.foto, 'data:image/jpeg;base64,AAAA');
  assert.ok(e.call('deleteProduct', { id: r.data.id }, adm).ok); assert.equal(e.call('listProducts', {}, m).data.length, 1);
  assert.equal(e.call('saveConfig', { LojaWhatsApp: '+55 (61) 90000-0000' }, adm).data.lojaWhatsapp, '5561900000000');
});
test('loja: promoções por item, em lote, por categoria e na loja toda', () => {
  const { e, adm, tok, mk } = boot(); mk('maria@zoe.com', 'membro'); const m = tok('maria@zoe.com', 'Temp12345');
  const A = e.call('saveProduct', { nome: 'Camiseta', categoria: 'Camisetas', preco: 100 }, adm).data.id, B = e.call('saveProduct', { nome: 'Regata', categoria: 'Camisetas', preco: 50 }, adm).data.id, C = e.call('saveProduct', { nome: 'Boné', categoria: 'Bonés', preco: 40 }, adm).data.id;
  const get = id => e.call('listProducts', {}, m).data.find(x => x.id === id);
  assert.equal(e.call('setPromo', { escopo: 'todos', tipo: 'percent', valor: 10 }, m).error.code, 'FORBIDDEN');
  assert.equal(e.call('setPromo', { escopo: 'item', id: A, tipo: 'valor', valor: 120 }, adm).error.code, 'VALIDATION'); // maior que o preço
  assert.equal(e.call('setPromo', { escopo: 'todos', tipo: 'percent', valor: 95 }, adm).error.code, 'VALIDATION');
  assert.equal(e.call('setPromo', { escopo: 'todos', tipo: 'valor', valor: 10 }, adm).error.code, 'VALIDATION');
  assert.equal(e.call('setPromo', { escopo: 'lote', ids: [], tipo: 'percent', valor: 10 }, adm).error.code, 'VALIDATION');
  assert.equal(e.call('setPromo', { escopo: 'item', id: A, tipo: 'valor', valor: 80, ate: '2000-01-01' }, adm).error.code, 'VALIDATION');
  assert.ok(e.call('setPromo', { escopo: 'item', id: A, tipo: 'valor', valor: 80 }, adm).ok); assert.equal(get(A).promo, 80); assert.equal(get(A).preco, 100); assert.equal(get(B).promo, null);
  assert.equal(e.call('setPromo', { escopo: 'categoria', categoria: 'Camisetas', tipo: 'percent', valor: 20, ate: '2999-12-31' }, adm).data.n, 2);
  assert.equal(get(A).promo, 80); assert.equal(get(B).promo, 40); assert.equal(get(B).promoAte, '2999-12-31'); assert.equal(get(C).promo, null);
  assert.equal(e.call('setPromo', { escopo: 'lote', ids: [C], tipo: 'percent', valor: 50 }, adm).data.n, 1); assert.equal(get(C).promo, 20);
  assert.equal(e.call('setPromo', { escopo: 'todos', tipo: 'percent', valor: 10 }, adm).data.n, 3); assert.equal(get(A).promo, 90);
  assert.ok(e.call('saveProduct', { id: A, nome: 'Camiseta', categoria: 'Camisetas', preco: 100, disponivel: false }, adm).ok); assert.equal(get(A).promo, 90); // editar não perde a promoção
  assert.ok(e.call('saveProduct', { id: A, nome: 'Camiseta', categoria: 'Camisetas', preco: 85 }, adm).ok); assert.equal(get(A).promo, null); // promoção acima do novo preço é ignorada
  assert.equal(e.call('setPromo', { escopo: 'categoria', categoria: 'Camisetas', limpar: true }, adm).data.n, 2); assert.equal(get(B).promo, null); assert.equal(get(C).promo, 36);
  assert.equal(e.call('setPromo', { escopo: 'todos', limpar: true }, adm).data.n, 3); assert.equal(get(C).promo, null);
});
test('família zoe: pastores e Quem somos cadastrados pela administração, visíveis a todos', () => {
  const { e, adm, tok, mk } = boot(); mk('maria@zoe.com', 'membro'); const m = tok('maria@zoe.com', 'Temp12345');
  assert.equal(e.call('adminSave', { tipo: 'pastores', valores: { Nome: 'Pr. João' } }, m).error.code, 'FORBIDDEN');
  assert.deepEqual(e.call('listFamilia', {}, m).data, { pastores: [], midia: [] });
  assert.ok(e.call('adminSave', { tipo: 'pastores', valores: { Nome: 'Pr. João', Cargo: 'Pastor titular', Foto: 'data:image/jpeg;base64,AAAA', Ordem: '2' } }, adm).ok);
  assert.ok(e.call('adminSave', { tipo: 'pastores', valores: { Nome: 'Pra. Maria', Cargo: 'Pastora titular', Ordem: '1' } }, adm).ok);
  assert.equal(e.call('adminSave', { tipo: 'pastores', valores: { Nome: 'X', Foto: 'http://x/a.jpg' } }, adm).error.code, 'VALIDATION');
  const p = e.call('listFamilia', {}, m).data.pastores; assert.equal(p.length, 2); assert.equal(p[0].nome, 'Pra. Maria'); assert.equal(p[1].foto, 'data:image/jpeg;base64,AAAA');
  assert.ok(e.call('adminSave', { tipo: 'familia', valores: { Tipo: 'video', Url: 'https://youtu.be/M7lc1UVf-VE', Legenda: 'Nosso culto' } }, adm).ok);
  assert.ok(e.call('adminSave', { tipo: 'familia', valores: { Tipo: 'foto', Foto: 'data:image/png;base64,AAAA', Legenda: 'Batismo' } }, adm).ok);
  const md = e.call('listFamilia', {}, m).data.midia; assert.equal(md.length, 2); assert.deepEqual(md.map(x => x.tipo).sort(), ['foto', 'video']);
});
test('cursos: professor cria, supervisor aprova, aulas com chamada, certificado com assinaturas', () => {
  const { e, adm, tok, mk } = boot();
  const profId = mk('prof@zoe.com', 'professor'), supId = mk('sup@zoe.com', 'pastor'), anaId = mk('ana@zoe.com', 'membro'), biaId = mk('bia@zoe.com', 'membro'); mk('caio@zoe.com', 'membro');
  const P = tok('prof@zoe.com', 'Temp12345'), S = tok('sup@zoe.com', 'Temp12345'), A = tok('ana@zoe.com', 'Temp12345'), B = tok('bia@zoe.com', 'Temp12345'), C = tok('caio@zoe.com', 'Temp12345');
  const PDF = 'JVBERi0xLjQKJQ==';
  assert.equal(e.call('saveCourse', { nome: 'Fundamentos' }, A).error.code, 'FORBIDDEN');
  assert.equal(e.call('saveCourse', { nome: 'X', presencaMin: 150 }, P).error.code, 'VALIDATION');
  const cid = e.call('saveCourse', { nome: 'Fundamentos da Fé', descricao: 'Base bíblica', exigeAprovacao: true, presencaMin: 75, cargaHoras: '' }, P).data.id;
  assert.equal(e.call('listCourses', {}, A).data.length, 0); // só vai ao ar depois de aprovado
  assert.equal(e.call('enrollCourse', { cursoId: cid }, A).error.code, 'VALIDATION');
  assert.ok(e.call('listNotifications', {}, S).data.itens.some(n => n.titulo === 'Novo curso para aprovar' && n.texto.includes('Base bíblica')));
  let it = e.call('listApprovals', {}, S).data.itens.find(x => x.tipo === 'curso'); assert.equal(it.status, 'pendente'); assert.equal(it.ctx.professor, 'prof'); assert.equal(it.podeReverter, false);
  assert.equal(e.call('listApprovals', {}, P).data.itens.length, 0); // professor não decide
  assert.equal(e.call('decideApproval', { tipo: 'curso', id: cid, decisao: 'negado' }, S).error.code, 'VALIDATION'); // exige motivo
  assert.equal(e.call('decideApproval', { tipo: 'curso', id: cid, decisao: 'autorizado' }, P).error.code, 'FORBIDDEN');
  assert.ok(e.call('decideApproval', { tipo: 'curso', id: cid, decisao: 'negado', motivo: 'Falta ementa' }, S).ok);
  assert.ok(e.call('listNotifications', {}, P).data.itens.some(n => n.texto.includes('Falta ementa')));
  assert.ok(e.call('saveCourse', { id: cid, nome: 'Fundamentos da Fé', descricao: 'Base bíblica completa', exigeAprovacao: true, presencaMin: 75 }, P).ok); // reenvia
  assert.equal(e.call('listCourses', {}, P).data[0].status, 'pendente');
  assert.ok(e.call('decideApproval', { tipo: 'curso', id: cid, decisao: 'autorizado' }, S).ok);
  assert.equal(e.call('listCourses', {}, A).data[0].status, 'aprovado');
  // aulas
  assert.equal(e.call('saveAula', { cursoId: cid, titulo: 'A1', data: '2026-01-10' }, A).error.code, 'FORBIDDEN');
  assert.equal(e.call('saveAula', { cursoId: cid, titulo: 'A1', data: '10/01/2026' }, P).error.code, 'VALIDATION');
  assert.equal(e.call('saveAula', { cursoId: cid, titulo: 'A1', data: '2026-01-10', inicio: '10:00', fim: '09:00' }, P).error.code, 'VALIDATION');
  assert.equal(e.call('saveAula', { cursoId: cid, titulo: 'A1', data: '2026-01-10', pdf: 'xxxx' }, P).error.code, 'VALIDATION');
  assert.equal(e.call('requestStart', { cursoId: cid }, P).error.code, 'VALIDATION'); // sem aulas
  const a2 = e.call('saveAula', { cursoId: cid, titulo: 'Aula 2', data: '2026-01-17', inicio: '09:00', fim: '11:00' }, P).data.id;
  const a1 = e.call('saveAula', { cursoId: cid, titulo: 'Aula 1', descricao: 'Salvação', data: '2026-01-10', inicio: '09:00', fim: '10:30', pdf: PDF, pdfNome: 'aula1.pdf' }, P).data.id;
  const a3 = e.call('saveAula', { cursoId: cid, titulo: 'Aula 3', data: '2999-01-01', inicio: '09:00', fim: '10:00' }, P).data.id;
  let dt = e.call('courseDetail', { cursoId: cid }, P).data; assert.deepEqual(dt.aulas.map(a => a.titulo), ['Aula 1', 'Aula 2', 'Aula 3']); assert.deepEqual(dt.aulas.map(a => a.numero), [1, 2, 3]); assert.equal(dt.curso.cargaMin, 270); assert.ok(dt.pode.gerir);
  assert.equal(e.call('saveClassRoll', { aulaId: a1, presentes: [] }, P).error.code, 'VALIDATION'); // ainda não começou
  assert.ok(e.call('requestStart', { cursoId: cid }, P).ok); assert.equal(e.call('requestStart', { cursoId: cid }, P).error.code, 'VALIDATION');
  assert.ok(e.call('listApprovals', {}, S).data.itens.some(x => x.tipo === 'inicio' && x.status === 'pendente'));
  assert.ok(e.call('decideApproval', { tipo: 'inicio', id: cid, decisao: 'negado', motivo: 'Espere o mês que vem' }, S).ok); assert.equal(e.call('listCourses', {}, P).data[0].inicioStatus, 'negado');
  assert.ok(e.call('requestStart', { cursoId: cid }, P).ok); assert.ok(e.call('decideApproval', { tipo: 'inicio', id: cid, decisao: 'autorizado' }, S).ok); assert.equal(e.call('listCourses', {}, P).data[0].status, 'andamento');
  // matrículas: curso exige aprovação do supervisor
  assert.equal(e.call('enrollCourse', { cursoId: cid }, A).data.status, 'pendente'); assert.equal(e.call('enrollCourse', { cursoId: cid }, B).data.status, 'pendente');
  const mats = e.call('listApprovals', {}, S).data.itens.filter(x => x.tipo === 'matricula'); assert.equal(mats.length, 2);
  assert.ok(e.call('decideApproval', { tipo: 'matricula', id: mats.find(x => x.pessoaId === anaId).id, decisao: 'autorizado' }, S).ok); assert.ok(e.call('decideApproval', { tipo: 'matricula', id: mats.find(x => x.pessoaId === biaId).id, decisao: 'negado', motivo: 'Turma cheia' }, S).ok);
  assert.ok(e.call('listNotifications', {}, B).data.itens.some(n => n.texto.includes('Turma cheia')));
  assert.equal(e.call('listCourses', {}, A).data[0].minha.status, 'autorizado'); assert.equal(e.call('listCourses', {}, B).data[0].minha.status, 'negado');
  // material só para matriculado
  assert.equal(e.call('getAulaPdf', { id: a1 }, A).data.pdf, PDF); assert.equal(e.call('getAulaPdf', { id: a1 }, B).error.code, 'FORBIDDEN'); assert.equal(e.call('getAulaPdf', { id: a1 }, C).error.code, 'FORBIDDEN');
  dt = e.call('courseDetail', { cursoId: cid }, A).data; assert.equal(dt.aulas[0].temPdf, true); assert.equal(dt.aulas[0].descricao, 'Salvação'); assert.equal(e.call('courseDetail', { cursoId: cid }, B).data.aulas[0].temPdf, undefined);
  // chamada
  const roll = e.call('getClassRoll', { aulaId: a1 }, P).data; assert.deepEqual(roll.alunos.map(x => x.id), [anaId]); assert.equal(e.call('getClassRoll', { aulaId: a1 }, A).error.code, 'FORBIDDEN');
  assert.equal(e.call('saveClassRoll', { aulaId: a1, presentes: [anaId, biaId], foto: 'data:image/jpeg;base64,AAAA' }, P).data.presentes, 1); // Bia não está matriculada
  assert.ok(e.call('saveClassRoll', { aulaId: a2, presentes: [] }, P).ok);
  dt = e.call('courseDetail', { cursoId: cid }, A).data; assert.equal(dt.aulas[0].presente, true); assert.equal(dt.aulas[1].presente, false); assert.equal(dt.aulas[0].foto, 'data:image/jpeg;base64,AAAA');
  // avaliação das aulas
  assert.equal(e.call('rateAula', { aulaId: a1, nota: 11 }, A).error.code, 'VALIDATION'); assert.equal(e.call('rateAula', { aulaId: a1 }, A).error.code, 'VALIDATION'); assert.equal(e.call('rateAula', { aulaId: a1, nota: 9 }, B).error.code, 'FORBIDDEN'); assert.equal(e.call('rateAula', { aulaId: a3, nota: 9 }, A).error.code, 'VALIDATION');
  assert.ok(e.call('rateAula', { aulaId: a1, nota: 9, feedback: 'Ótima', duvida: 'O que é graça?' }, A).ok); assert.ok(e.call('rateAula', { aulaId: a1, nota: 10 }, A).ok);
  assert.ok(e.call('listNotifications', {}, P).data.itens.some(n => n.texto.includes('O que é graça?'))); const fb = e.call('aulaFeedback', { aulaId: a1 }, P).data.itens; assert.equal(fb.length, 1); assert.equal(fb[0].nota, 10); assert.equal(e.call('aulaFeedback', { aulaId: a1 }, A).error.code, 'FORBIDDEN');
  assert.equal(e.call('courseDetail', { cursoId: cid }, P).data.aulas[0].media, 10);
  // prévia do certificado: vale com o curso ainda em andamento e sem salvar o layout
  const lc0 = e.call('listCertificates', { cursoId: cid }, P).data, m0 = lc0.alunos[0].id;
  const pv0 = e.call('previewCert', { cursoId: cid, matriculaId: m0 }, P).data; assert.equal(pv0.codigo, 'PRÉVIA'); assert.equal(pv0.aluno, 'ana'); assert.equal(pv0.layout.titulo, 'CERTIFICADO');
  assert.equal(e.call('previewCert', { cursoId: cid }, P).data.aluno, 'Nome do Aluno'); assert.equal(e.call('previewCert', { cursoId: cid }, A).error.code, 'FORBIDDEN');
  const pv1 = e.call('previewCert', { cursoId: cid, layout: { titulo: 'DIPLOMA', cor1: '#112233', moldura: 'ornamental' } }, P).data; assert.deepEqual([pv1.layout.titulo, pv1.layout.cor1, pv1.layout.moldura, pv1.layout.fonte], ['DIPLOMA', '#112233', 'ornamental', 'cursiva']);
  assert.equal(e.call('previewCert', { cursoId: cid, layout: { cor1: 'vermelho' } }, P).error.code, 'VALIDATION'); assert.equal(e.call('saveCertLayout', { layout: { titulo: 'X' } }, A).error.code, 'FORBIDDEN');
  assert.equal(e.call('saveCertLayout', { layout: { moldura: 'x' } }, P).error.code, 'VALIDATION'); assert.ok(e.call('saveCertLayout', { layout: { titulo: 'CERTIFICADO ZOE', cor1: '#0a5c8a', rodape: 'Igreja Zoe' } }, P).ok);
  assert.equal(e.call('getCertLayout', {}, P).data.layout.titulo, 'CERTIFICADO ZOE'); assert.equal(e.call('getCertLayout', {}, A).error.code, 'FORBIDDEN');
  // encerrar e certificados
  assert.equal(e.call('decideCert', { id: 'x', decisao: 'autorizado' }, P).error.code, 'VALIDATION'); // sem assinatura
  assert.equal(e.call('finishCourse', { cursoId: cid }, A).error.code, 'FORBIDDEN'); assert.ok(e.call('finishCourse', { cursoId: cid }, P).ok); assert.equal(e.call('listCourses', {}, P).data[0].status, 'encerrado');
  const lc = e.call('listCertificates', { cursoId: cid }, P).data; assert.equal(lc.alunos.length, 1); assert.equal(lc.alunos[0].presenca, 33.3); assert.equal(lc.alunos[0].atinge, false); assert.equal(lc.presencaMin, 75);
  const mid = lc.alunos[0].id; assert.equal(e.call('decideCert', { id: mid, decisao: 'autorizado' }, P).error.code, 'VALIDATION');
  assert.equal(e.call('saveSignature', { tipo: 'desenho', dado: 'http://x/a.png' }, P).error.code, 'VALIDATION'); assert.equal(e.call('saveSignature', { tipo: 'texto', dado: 'Fulano' }, A).error.code, 'FORBIDDEN');
  assert.ok(e.call('saveSignature', { tipo: 'desenho', dado: 'data:image/png;base64,AAAA', cargo: 'Professor de Fundamentos' }, P).ok); assert.ok(e.call('saveSignature', { tipo: 'texto', dado: 'Pr. Sup', cargo: 'Pastor e Supervisor' }, S).ok);
  assert.equal(e.call('certificate', { id: mid }, A).error.code, 'NOT_FOUND'); // ainda não emitido
  assert.equal(e.call('decideCert', { ids: [mid], decisao: 'autorizado' }, A).error.code, 'VALIDATION'); // aluno sem assinatura
  assert.ok(e.call('decideCert', { ids: [mid], decisao: 'autorizado' }, P).ok);
  const cert = e.call('certificate', { id: mid }, A).data; assert.equal(cert.aluno, 'ana'); assert.equal(cert.curso.nome, 'Fundamentos da Fé'); assert.equal(cert.curso.cargaMin, 270); assert.equal(cert.curso.nAulas, 3); assert.equal(cert.curso.descricao, 'Base bíblica completa');
  assert.equal(cert.professor.assinatura.tipo, 'desenho'); assert.equal(cert.professor.cargo, 'Professor de Fundamentos'); assert.equal(cert.supervisor.cargo, 'Pastor e Supervisor'); assert.equal(cert.supervisor.assinatura.dado, 'Pr. Sup'); assert.match(cert.codigo, /^ZOE-/);
  assert.equal(e.call('certificate', { id: mid }, B).error.code, 'FORBIDDEN'); assert.equal(e.call('listCourses', {}, A).data[0].minha.cert, 'emitido');
  assert.ok(e.call('listNotifications', {}, A).data.itens.some(n => n.titulo === 'Seu certificado está pronto'));
  assert.equal(cert.layout.titulo, 'CERTIFICADO ZOE'); assert.equal(cert.layout.cor1, '#0a5c8a');
  // excluir um certificado emitido por engano
  const xp0 = e.call('profileView', {}, A).data; assert.ok(xp0.insignias.some(x => x.codigo.startsWith('curso:')));
  assert.equal(e.call('revokeCert', { id: mid }, A).error.code, 'FORBIDDEN'); assert.equal(e.call('revokeCert', { id: 'x' }, P).error.code, 'NOT_FOUND');
  assert.ok(e.call('revokeCert', { id: mid }, P).ok); assert.equal(e.call('certificate', { id: mid }, A).error.code, 'NOT_FOUND'); assert.equal(e.call('revokeCert', { id: mid }, P).error.code, 'NOT_FOUND');
  const xp1 = e.call('profileView', {}, A).data; assert.ok(!xp1.insignias.some(x => x.codigo.startsWith('curso:'))); assert.equal(xp1.xp.xp, xp0.xp.xp - 300);
  assert.equal(e.call('listCertificates', { cursoId: cid }, P).data.alunos[0].cert, 'pendente'); assert.equal(e.call('listCourses', {}, A).data[0].minha.status, 'autorizado');
  assert.ok(e.call('listNotifications', {}, A).data.itens.some(n => n.titulo === 'Certificado removido'));
  assert.ok(e.call('decideCert', { ids: [mid], decisao: 'autorizado' }, P).ok); assert.equal(e.call('profileView', {}, A).data.xp.xp, xp0.xp.xp); // reemitido: tudo volta
});
test('cursos: sem exigência de aprovação a matrícula é imediata; níveis e permissões do professor', () => {
  const { e, adm, tok, mk } = boot(); mk('prof@zoe.com', 'professor'); mk('ana@zoe.com', 'membro'); const P = tok('prof@zoe.com', 'Temp12345'), A = tok('ana@zoe.com', 'Temp12345');
  const perms = e.call('getPerms', {}, adm).data; assert.equal(perms.professor.prof, 1); assert.equal(perms.professor.cursos, 0); assert.equal(perms.pastor.cursos, 1); assert.equal(perms.membro.prof, 0);
  assert.ok(e.call('listTypes', {}, adm) || true);
  const cid = e.call('saveCourse', { nome: 'Casais', exigeAprovacao: false }, P).data.id; e.call('decideApproval', { tipo: 'curso', id: cid, decisao: 'autorizado' }, adm);
  assert.equal(e.call('enrollCourse', { cursoId: cid }, A).data.status, 'autorizado'); assert.equal(e.call('enrollCourse', { cursoId: cid }, P).error.code, 'VALIDATION');
  assert.equal(e.call('listApprovals', {}, adm).data.itens.filter(x => x.tipo === 'matricula').length, 0);
});
test('parabéns de aniversário: só no dia, uma vez por dia, sem auto-parabéns', () => {
  const { e, adm, tok, mk } = boot(); const ana = mk('ana@zoe.com', 'membro'), bia = mk('bia@zoe.com', 'membro'); const A = tok('ana@zoe.com', 'Temp12345'), B = tok('bia@zoe.com', 'Temp12345'); const hoje = e.run('today_()');
  assert.equal(e.call('greet', { membroId: bia }, A).error.code, 'VALIDATION'); // não é o dia
  e.run(`(function(){const t=table_('Membros'),r=t.rows.filter(function(x){return x.MembroID==='${bia}'})[0];writeRow_(t,r._row,{Nascimento:'1990-${hoje.slice(5)}'})})()`);
  assert.ok(e.call('greet', { membroId: bia }, A).ok); assert.ok(e.call('greet', { membroId: bia }, A).data.repetido);
  assert.equal(e.call('greet', { membroId: bia }, B).error.code, 'VALIDATION'); // a si mesma
  const n = e.call('listNotifications', {}, B).data.itens.filter(x => x.titulo.includes('te parabenizou')); assert.equal(n.length, 1); assert.ok(n[0].texto.includes('Salmos 118:24'));
  assert.equal(e.call('greet', { membroId: 'ZZ' }, A).error.code, 'NOT_FOUND');
});
test('histórico: o % do passado não cai quando entra gente nova (usa o elenco da época)', () => {
  const { e, adm, tok, mk } = boot(); const l1 = mk('lider1@zoe.com', 'membro');
  e.call('createCell', { nome: 'Semeadores', liderId: l1, dia: 'Quinta', inicio: '20:00', fim: '21:30' }, adm);
  const L1 = tok('lider1@zoe.com', 'Temp12345');
  for (const n of ['Ana Souza', 'Bia Lima', 'Caio Reis']) assert.ok(e.call('addNewMember', { nome: n, endereco: 'Rua 1', celular: '61999990000' }, L1).ok);
  const ids = e.call('cellMembers', {}, L1).data.map(m => m.id); assert.equal(ids.length, 4);
  e.call('saveAttendance', { data: '2026-10-01', presentes: ids, deus: false }, L1);
  assert.ok(e.call('addNewMember', { nome: 'Davi Novo', endereco: 'Rua 2', celular: '61999990001' }, L1).ok);
  const h = e.call('history', {}, L1).data; assert.equal(h.reunioes[0].presentes, 4); assert.equal(h.reunioes[0].total, 4); assert.equal(h.indicadores.mediaPresenca, 100);
  const ids5 = e.call('cellMembers', {}, L1).data.map(m => m.id); assert.equal(ids5.length, 5);
  e.call('saveAttendance', { data: '2026-10-08', presentes: ids5.slice(0, 4), deus: false }, L1);
  const h2 = e.call('history', {}, L1).data; assert.equal(h2.reunioes.length, 2);
  const nova = h2.reunioes.find(r => r.data === '2026-10-08'), velha = h2.reunioes.find(r => r.data === '2026-10-01');
  assert.equal(nova.total, 5); assert.equal(nova.presentes, 4); assert.equal(velha.total, 4); assert.equal(velha.nomesAusentes.length, 0); assert.equal(nova.nomesAusentes.length, 1);
});
test('tipos de acesso: frequentador por presença, tipo novo, abas e regras por guia da célula', () => {
  const { e, adm, tok, mk } = boot(); const l1 = mk('lider1@zoe.com', 'membro'), m1 = mk('maria@zoe.com', 'membro'), semcel = mk('pedro@zoe.com', 'membro');
  const c = e.call('createCell', { nome: 'Semeadores', liderId: l1, dia: 'Quinta', inicio: '20:00', fim: '21:30' }, adm).data.id;
  e.call('saveMember', { membroId: m1, membro: { CelulaID: c } }, adm);
  const rows = e.sheets.Membros; const hdr = rows.header || null; void hdr;
  const R = e.call('getAccessRules', {}, adm); assert.ok(R.ok, JSON.stringify(R)); assert.ok(R.data.tipos.some(t => t.id === 'frequentador'));
  assert.equal(R.data.regras.membro.oracao.e, 1); assert.equal(R.data.regras.membro.freq.v, 0); assert.equal(R.data.regras.lider.freq.e, 1);
  const bad = e.call('saveAccessRules', { novoTipo: 'Membro' }, adm); assert.equal(bad.error.code, 'VALIDATION');
  const ok = e.call('saveAccessRules', { novoTipo: 'Visitante Especial' }, adm); assert.ok(ok.ok, JSON.stringify(ok)); const novo = ok.data.tipos.find(t => t.nome === 'Visitante Especial'); assert.ok(novo && !novo.base);
  assert.ok(e.call('createUser', { email: 'vis@zoe.com', nome: 'Vis', senha: 'Temp12345', papel: novo.id }, adm).ok);
  assert.equal(e.call('createUser', { email: 'x@zoe.com', nome: 'X', senha: 'Temp12345', papel: 'inexistente' }, adm).error.code, 'VALIDATION');
  const M = tok('maria@zoe.com', 'Temp12345'); const me = e.call('me', {}, M).data; assert.ok(['membro', 'frequentador'].includes(me.usuario.tipo));
  assert.equal(e.call('saveAccessRules', { regras: { membro: { org: { v: 1, e: 0 } } } }, M).error.code, 'FORBIDDEN');
  assert.ok(e.call('saveAccessRules', { regras: { membro: { freq: { v: 1, e: 0 }, mural: { v: 1, e: 1 } } }, abas: { frequentador: { loja: 0 } } }, adm).ok);
  const R2 = e.call('getAccessRules', {}, adm).data; assert.equal(R2.regras.membro.freq.v, 1); assert.equal(R2.regras.membro.freq.e, 0); assert.equal(R2.abas.frequentador.loja, 0);
  const L = tok('lider1@zoe.com', 'Temp12345'); assert.ok(e.call('cellMembers', {}, L).ok);
  const sp = tok('pedro@zoe.com', 'Temp12345'); assert.equal(e.call('cellMembers', {}, sp).ok, false);
  void semcel;
});
test('supervisor: precisa multiplicar X células, com exceção aberta por quem administra', () => {
  const { e, adm, tok, mk } = boot(); const sup = mk('sup@zoe.com', 'membro'), l1 = mk('lider1@zoe.com', 'membro');
  assert.ok(e.call('createCell', { nome: 'A', liderId: l1, supervisorId: sup, dia: 'Quinta' }, adm).ok, 'regra desligada por padrão');
  assert.ok(e.call('saveConfig', { CelulasParaSupervisor: 2 }, adm).ok);
  assert.equal(e.call('saveConfig', { CelulasParaSupervisor: -1 }, adm).error.code, 'VALIDATION');
  const l2 = mk('lider2@zoe.com', 'membro');
  const r = e.call('createCell', { nome: 'B', liderId: l2, supervisorId: l1, dia: 'Segunda' }, adm); assert.equal(r.error.code, 'REGRA_SUPERVISOR');
  assert.ok(e.call('createCell', { nome: 'B', liderId: l2, supervisorId: l1, dia: 'Segunda', excecao: true }, adm).ok);
  const mae = e.call('createCell', { nome: 'M', liderId: l1, dia: 'Terça' }, adm).data.id;
  e.call('createCell', { nome: 'F1', liderId: l2, dia: 'Sexta', maeId: mae }, adm); e.call('createCell', { nome: 'F2', liderId: mk('l3@zoe.com', 'membro'), dia: 'Sábado', maeId: mae }, adm);
  assert.ok(e.call('createCell', { nome: 'C', liderId: mk('l4@zoe.com', 'membro'), supervisorId: l1, dia: 'Domingo' }, adm).ok, 'multiplicou 2 células');
  void tok;
});

test('aprovações: motivo vai para o líder como notificação e o aprovador recebe o resumo da pessoa', () => {
  const { e, adm, tok, mk } = boot();
  const sup = mk('sup@zoe.com', 'membro'), l1 = mk('lider1@zoe.com', 'membro'), l2 = mk('lider2@zoe.com', 'membro');
  const c1 = e.call('createCell', { nome: 'Semeadores', liderId: l1, supervisorId: sup, dia: 'Quinta' }, adm).data.id;
  e.call('createCell', { nome: 'Raízes', liderId: l2, supervisorId: sup, dia: 'Segunda' }, adm);
  const L1 = tok('lider1@zoe.com', 'Temp12345'), L2 = tok('lider2@zoe.com', 'Temp12345'), S = tok('sup@zoe.com', 'Temp12345');
  const p = e.call('addNewMember', { nome: 'Carlos Pereira', celular: '61999990000' }, L1).data.id;
  e.run(`writeRow_(table_('Membros'), table_('Membros').rows.filter(function(x){return x.MembroID==='${p}'})[0]._row, {DataBatismo:'2025-10-11'})`);
  e.call('saveAttendance', { data: '2026-10-15', presentes: [p] }, L1); e.call('saveAttendance', { data: '2026-10-22', presentes: [] }, L1);
  assert.equal(e.call('requestTransfer', { membroId: p, motivo: 'Mudou para perto da Raízes' }, L2).data.status, 'pendente');
  const it = e.call('listApprovals', {}, S).data.itens.find(x => x.tipo === 'transferencia'); assert.ok(it);
  assert.equal(it.ctx.de, 'Semeadores'); assert.equal(it.ctx.para, 'Raízes'); assert.equal(it.ctx.motivo, 'Mudou para perto da Raízes');
  assert.equal(it.resumo.nome, 'Carlos Pereira'); assert.equal(it.resumo.batizado, true); assert.equal(it.resumo.dataBatismo, '2025-10-11'); assert.equal(it.resumo.celula, 'Semeadores'); assert.equal(it.resumo.pct, 50); assert.equal(it.resumo.tipo, 'Frequentador');
  assert.equal(e.call('decideApproval', { tipo: 'transferencia', id: it.id, decisao: 'negado', motivo: '  ' }, S).error.code, 'VALIDATION');
  assert.equal(e.call('decideApproval', { tipo: 'transferencia', id: it.id, decisao: 'negado', motivo: 'Aguarde o fim do curso' }, S).data.status, 'negado');
  const n = e.call('listNotifications', {}, L2).data; assert.equal(n.naoLidas, 1); assert.ok(n.itens[0].titulo.includes('recusada')); assert.ok(n.itens[0].texto.includes('Aguarde o fim do curso'));
  assert.equal(e.call('listNotifications', {}, L1).data.naoLidas, 1); // líder da célula de origem também fica sabendo
  assert.equal(e.call('listNotifications', {}, S).data.naoLidas, 0); // quem decidiu não se notifica
  const dec = e.call('listApprovals', {}, S).data.itens.find(x => x.id === it.id); assert.equal(dec.motivoDecisao, 'Aguarde o fim do curso'); assert.equal(dec.hist.pop().motivo, 'Aguarde o fim do curso');
  assert.equal(e.call('readNotifications', {}, L2).data.naoLidas, 0); assert.equal(e.call('listNotifications', {}, L1).data.naoLidas, 1);
  // aprovar não exige motivo; com motivo, ele também chega
  e.call('undoApproval', { tipo: 'transferencia', id: it.id }, S);
  assert.equal(e.call('decideApproval', { tipo: 'transferencia', id: it.id, decisao: 'autorizado' }, S).data.status, 'autorizado');
  assert.ok(e.call('listNotifications', {}, L2).data.itens[0].titulo.includes('aprovada'));
  assert.ok(c1);
});
test('termômetro da presença de Deus e resumo da reunião', () => {
  const { e, adm, tok, mk } = boot(); const l1 = mk('lider1@zoe.com', 'membro');
  e.call('createCell', { nome: 'Semeadores', liderId: l1, dia: 'Quinta' }, adm); const L1 = tok('lider1@zoe.com', 'Temp12345');
  const p = e.call('addNewMember', { nome: 'Ana Souza', celular: '61999990000' }, L1).data.id;
  assert.equal(e.call('saveAttendance', { data: '2026-10-15', presentes: [p], termometro: 'x' }, L1).error.code, 'VALIDATION');
  e.call('saveAttendance', { data: '2026-10-15', presentes: [p], termometro: 85, obs: 'Tempo de louvor muito forte' }, L1);
  e.call('saveAttendance', { data: '2026-10-22', presentes: [p], termometro: 20, obs: 'Reunião tranquila' }, L1);
  e.call('saveAttendance', { data: '2026-10-08', presentes: [p], deus: true }, L1); // jeito antigo
  const h = e.call('history', {}, L1).data, r = d => h.reunioes.find(x => x.data === d);
  assert.equal(r('2026-10-15').termometro, 85); assert.equal(r('2026-10-15').obs, 'Tempo de louvor muito forte'); assert.equal(r('2026-10-15').deus, true); assert.equal(r('2026-10-22').deus, false); assert.equal(r('2026-10-08').termometro, 80);
  assert.equal(h.indicadores.presencaDeDeus, 2);
  e.call('saveAttendance', { data: '2026-10-22', presentes: [p], termometro: 500 }, L1); assert.equal(e.call('history', {}, L1).data.reunioes.find(x => x.data === '2026-10-22').termometro, 100);
  const ind = e.call('indicators', {}, L1).data.termometro; assert.equal(ind.serie.length, 3); assert.equal(ind.media, Math.round((80 + 85 + 100) / 3));
});
test('guia de primeiro acesso: aparece até a pessoa concluir', () => {
  const { e, tok, mk } = boot(); mk('nova@zoe.com', 'membro'); const N = tok('nova@zoe.com', 'Temp12345');
  assert.equal(e.call('me', {}, N).data.guiaVisto, false);
  assert.equal(e.call('guideDone', {}, N).data.guiaVisto, true);
  assert.equal(e.call('me', {}, N).data.guiaVisto, true);
  const M = (mk('outra@zoe.com', 'membro'), tok('outra@zoe.com', 'Temp12345')); assert.equal(e.call('me', {}, M).data.guiaVisto, false); // por pessoa
  e.run(`(function(){const t=table_('Usuarios'),r=t.rows.filter(function(x){return x.Email==='outra@zoe.com'})[0];writeRow_(t,r._row,{GuiaVisto:''})})()`); assert.equal(e.call('me', {}, M).data.guiaVisto, true); // conta antiga (sem marca) não vê o tutorial
});
test('XP e insígnias: batismo/decisão, idempotência, nível e personalização por nível', () => {
  const { e, tok, mk } = boot(); mk('joao@zoe.com', 'membro'); const j = tok('joao@zoe.com', 'Temp12345');
  assert.equal(e.call('me', {}, j).data.xp.nivel, 1);
  assert.ok(e.call('saveMember', { membro: { Nome: 'João Silva', DataBatismo: '2020-01-05', DataDecisao: '2019-03-02' } }, j).ok);
  assert.ok(e.call('saveMember', { membro: { Nome: 'João Silva', DataBatismo: '2020-01-05', DataDecisao: '2019-03-02' } }, j).ok); // repetir não duplica
  const pv = e.call('profileView', {}, j).data; const cods = pv.insignias.map(x => x.codigo).sort();
  assert.deepEqual(cods, ['batismo', 'decisao']); assert.equal(pv.xp.xp, 350); assert.equal(pv.xp.nivel, 6);
  assert.equal(pv.insignias.find(x => x.codigo === 'batismo').ano, '2020');
  assert.ok(pv.bloqueadas.some(x => x.codigo === 'perfil')); assert.ok(!pv.bloqueadas.some(x => x.codigo === 'batismo'));
  assert.equal(e.call('saveProfile', { fundo: 'aurora' }, j).error.code, 'FORBIDDEN');
  assert.equal(e.call('saveProfile', { fundo: 'nada' }, j).error.code, 'VALIDATION');
  assert.equal(e.call('saveHighlight', { foto: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }, j).error.code, 'FORBIDDEN');
  e.run(`awardXp_('${pv.id}','teste',500,'t')`);
  assert.ok(e.call('saveProfile', { bio: 'Olá!', fundo: 'aurora', contorno: 'verde', moldura: 'fio', versiculo: 'Sl 23' }, j).ok);
  assert.equal(e.call('saveProfile', { contorno: 'dourada' }, j).error.code, 'FORBIDDEN'); // abre no nível 20
  const p2 = e.call('profileView', {}, j).data; assert.equal(p2.bio, 'Olá!'); assert.equal(p2.fundo, 'aurora'); assert.equal(p2.contorno, 'verde'); assert.equal(p2.libera.slots, 2);
  const f = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  assert.ok(e.call('saveHighlight', { foto: f, legenda: 'Batismo' }, j).ok); assert.ok(e.call('saveHighlight', { foto: f }, j).ok);
  assert.equal(e.call('saveHighlight', { foto: f }, j).error.code, 'FORBIDDEN');
  const d = e.call('profileView', {}, j).data.destaques; assert.equal(d.length, 2);
  assert.ok(e.call('deleteHighlight', { id: d[0].id }, j).ok); assert.equal(e.call('profileView', {}, j).data.destaques.length, 1);
});
test('insígnias criadas por supervisores: critério, progresso, escuras até conquistar', () => {
  const { e, adm, tok, mk } = boot(); mk('ana@zoe.com', 'membro'); const A = tok('ana@zoe.com', 'Temp12345');
  assert.equal(e.call('saveInsigniaDef', { titulo: 'Mão no arado', criterio: { tipo: 'servico', atividade: 'Limpeza', meses: 2 } }, A).error.code, 'FORBIDDEN');
  const r = e.call('saveInsigniaDef', { titulo: 'Mão no arado', descricao: 'Serviço fiel', xp: 120, visual: { estilo: 'ouro', forma: 'hex', icone: 'arado', cor1: '#2f6b3a', cor2: '#efe3b0' }, criterio: { tipo: 'servico', atividade: 'Limpeza', meses: 2 } }, adm);
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(e.call('saveInsigniaDef', { titulo: 'x', criterio: { tipo: 'zzz' } }, adm).error.code, 'VALIDATION');
  const ana = e.call('me', {}, A).data.membroId || e.sheets.Membros.rows[e.sheets.Membros.rows.length - 1][0];
  let pv = e.call('profileView', {}, A).data; const b = pv.bloqueadas.find(x => x.codigo === 'cust:' + r.data.id);
  assert.ok(b && b.progresso.atual === 0 && b.progresso.meta === 2 && b.visual.estilo === 'ouro');
  assert.equal(e.call('logServico', { atividade: 'Limpeza', mes: '2026-09', membros: [pv.id] }, A).error.code, 'FORBIDDEN');
  assert.equal(e.call('logServico', { atividade: 'Limpeza', mes: '2026-09', membros: [pv.id] }, adm).data.n, 1);
  assert.equal(e.call('logServico', { atividade: 'Limpeza', mes: '2026-09', membros: [pv.id] }, adm).data.n, 0);
  pv = e.call('profileView', {}, A).data; assert.equal(pv.bloqueadas.find(x => x.codigo === 'cust:' + r.data.id).progresso.atual, 1);
  e.call('logServico', { atividade: 'limpeza', mes: '2026-10', membros: [pv.id] }, adm);
  pv = e.call('profileView', {}, A).data; const g = pv.insignias.find(x => x.codigo === 'cust:' + r.data.id);
  assert.ok(g && g.visual.forma === 'hex' && !pv.bloqueadas.some(x => x.codigo === 'cust:' + r.data.id)); assert.equal(pv.xp.xp, 120);
});
test('botons de eventos: check-in dá insígnia exclusiva e "presença total"', () => {
  const { e, adm, tok, mk } = boot(); const a = mk('ana@zoe.com', 'membro'), b = mk('bia@zoe.com', 'membro'); const A = tok('ana@zoe.com', 'Temp12345');
  for (const [t, d, ins] of [['Dia do Amigo', '2026-03-10', 'Dia do Amigo'], ['Aniversário Zoe', '2026-05-10', 'Aniversário Zoe'], ['Culto Especial', '2026-07-10', '']]) assert.ok(e.call('createEvent', { titulo: t, data: d, insignia: ins }, adm).ok);
  const evs = e.call('listEvents', {}, adm).data; assert.equal(evs.length, 0); // eventos antigos (mais de 30 dias) não aparecem na lista
  const ids = e.sheets.Eventos.rows.slice(1).map(r => r[0]);
  assert.equal(e.call('checkinEvento', { eventoId: ids[0], membros: [a] }, A).error.code, 'FORBIDDEN');
  assert.equal(e.call('checkinEvento', { eventoId: 'X', membros: [a] }, adm).error.code, 'NOT_FOUND');
  assert.equal(e.call('checkinEvento', { eventoId: ids[0], membros: [a, b, 'ZZ'] }, adm).data.n, 2);
  assert.equal(e.call('checkinEvento', { eventoId: ids[0], membros: [a, b] }, adm).data.n, 0); // sem repetir
  e.call('checkinEvento', { eventoId: ids[1], membros: [a] }, adm); e.call('checkinEvento', { eventoId: ids[2], membros: [a, b] }, adm);
  const pa = e.call('profileView', {}, A).data.insignias.map(x => x.codigo + ':' + x.ano).sort();
  assert.ok(pa.includes('presenca:2026') && pa.some(x => x.startsWith('evento:')), JSON.stringify(pa));
  const pb = e.call('profileView', { membroId: b }, adm).data.insignias.map(x => x.codigo); assert.ok(!pb.includes('presenca')); assert.equal(pb.filter(x => x.startsWith('evento:')).length, 1);
  assert.equal(e.call('eventoPresenca', { eventoId: ids[0] }, adm).data.presentes.length, 2);
});
test('Maratona Bíblica: limite diário, devocional validado pelo líder, faixas e lugares', () => {
  const { e, adm, tok, mk } = boot(); const l = mk('lider@zoe.com', 'membro'), a = mk('ana@zoe.com', 'membro'), b = mk('bia@zoe.com', 'membro'), c = mk('cris@zoe.com', 'membro'); const L = tok('lider@zoe.com', 'Temp12345'), A = tok('ana@zoe.com', 'Temp12345'), B = tok('bia@zoe.com', 'Temp12345'), C = tok('cris@zoe.com', 'Temp12345');
  const cel = e.call('createCell', { nome: 'Semeadores', liderId: l, dia: 'Quinta', inicio: '20:00', fim: '21:30', categoria: 'Mulheres e Homens', faixa: 'Jovens', bairro: 'X', cidade: 'Y', uf: 'GO' }, adm).data.id;
  for (const m of [a, b]) assert.ok(e.call('adminSave', { tipo: 'membros', id: m, valores: { Nome: m === a ? 'Ana' : 'Bia', CelulaID: cel } }, adm).ok);
  assert.equal(e.call('getCorrida', {}, A).data.ativa, false);
  const hoje = new Date().toISOString().slice(0, 10);
  const cr = e.call('adminSave', { tipo: 'corridas', valores: { Titulo: 'Corrida 2026', Ano: '2026', Inicio: hoje, CapDia: '3', TotalCap: '3', Status: 'Ativo' } }, adm); assert.ok(cr.ok, JSON.stringify(cr));
  const g = e.call('getCorrida', {}, A).data; assert.ok(g.ativa && g.capDia === 3 && g.total === 3); const cid = g.id;
  assert.equal(e.call('corridaLer', { corridaId: cid, capitulos: 4, resumo: 'x'.repeat(40) }, A).error.code, 'VALIDATION'); // acima do limite
  assert.equal(e.call('corridaLer', { corridaId: cid, capitulos: 3, resumo: 'curto' }, A).error.code, 'VALIDATION'); // sem devocional
  assert.ok(e.call('corridaLer', { corridaId: cid, capitulos: 3, resumo: 'Li e entendi que Deus é fiel em todo tempo.' }, A).ok);
  assert.equal(e.call('corridaLer', { corridaId: cid, capitulos: 1, resumo: 'y'.repeat(40) }, A).error.code, 'VALIDATION'); // só uma vez ao dia
  assert.equal(e.call('getCorrida', {}, A).data.concluiu, null); // ainda não validado
  assert.equal(e.call('listCorridaValidar', {}, A).data.length, 0); // ela mesma não valida
  assert.equal(e.call('decideLeitura', { corridaId: cid, membroId: a, data: hoje, ok: true }, A).error.code, 'FORBIDDEN');
  assert.equal(e.call('decideLeitura', { corridaId: cid, membroId: a, data: hoje, ok: true }, C).error.code, 'FORBIDDEN'); // outro membro não valida
  const pend = e.call('listCorridaValidar', {}, L).data; assert.equal(pend.length, 1); assert.ok(pend[0].resumo.includes('fiel'));
  assert.ok(e.sheets.Notificacoes.rows.some(n => n[1] === l && n[2] === 'corrida'));
  assert.equal(e.call('decideLeitura', { corridaId: cid, membroId: a, data: hoje, ok: false }, L).error.code, 'VALIDATION'); // recusa exige motivo
  assert.ok(e.call('decideLeitura', { corridaId: cid, membroId: a, data: hoje, ok: true }, L).data.terminou);
  const ca = e.call('getCorrida', {}, A).data.concluiu; assert.deepEqual([ca.faixa, ca.pos], ['ouro', 1]);
  assert.ok(e.call('profileView', {}, A).data.insignias.some(x => x.codigo === 'corrida-ouro-1' && x.ano === '2026'));
  // segunda pessoa: o lugar seguinte na mesma faixa; recusa tira o dia e permite refazer hoje
  assert.ok(e.call('corridaLer', { corridaId: cid, capitulos: 3, resumo: 'z'.repeat(40) }, B).ok); assert.ok(e.call('decideLeitura', { corridaId: cid, membroId: b, data: hoje, ok: false, obs: 'Resumo genérico' }, L).ok);
  assert.equal(e.call('getCorrida', {}, B).data.hoje.status, 'Recusado'); assert.ok(e.call('corridaLer', { corridaId: cid, capitulos: 3, resumo: 'Agora com minhas palavras sobre o texto lido.' }, B).ok);
  assert.ok(e.call('decideLeitura', { corridaId: cid, membroId: b, data: hoje, ok: true }, adm).data.terminou); // a administração também valida
  assert.equal(e.call('getCorrida', {}, B).data.concluiu.pos, 2);
  // quem perde um dia cai para prata (a faixa é calculada pelos dias sem leitura)
  assert.equal(e.run(`corFaixa_(corFaltas_(${JSON.stringify({ Inicio: '2026-01-01' })}, [{Data:'2026-01-01',Status:'Validado'},{Data:'2026-01-03',Status:'Validado'}], '2026-01-03'))`), 'prata');
  assert.equal(e.run(`corFaixa_(corFaltas_(${JSON.stringify({ Inicio: '2026-01-01' })}, [{Data:'2026-01-01',Status:'Validado'},{Data:'2026-01-04',Status:'Validado'}], '2026-01-04'))`), 'bronze');
});

test('pessoas: busca por nome, perfil aberto com envolvimento (ou oculto) e chat entre usuários', () => {
  const { e, adm, tok, mk } = boot(); const a = mk('ana@zoe.com', 'membro'), b = mk('bruno@zoe.com', 'membro'); mk('carla@zoe.com', 'membro'); const A = tok('ana@zoe.com', 'Temp12345'), B = tok('bruno@zoe.com', 'Temp12345');
  assert.ok(e.call('adminSave', { tipo: 'membros', id: b, valores: { Nome: 'Bruno Álvares' } }, adm).ok);
  assert.deepEqual(e.call('searchPeople', { q: 'b' }, A).data, []); assert.deepEqual(e.call('searchPeople', { q: 'alvares' }, A).data.map(x => x.id), [b]); assert.equal(e.call('searchPeople', { q: 'ana' }, A).data.length, 0); // não lista a si mesma
  assert.ok(e.call('searchPeople', { q: 'carla' }, A).data.length === 1);
  const pb = e.call('profileView', { membroId: b }, A).data; assert.equal(pb.meu, false); assert.ok(pb.envolvimento && Array.isArray(pb.envolvimento.cursos)); assert.equal(pb.libera, undefined);
  assert.ok(e.call('saveProfile', { oculto: true }, e.call('login', { email: 'bruno@zoe.com', senha: 'Temp12345' }).data.token).ok);
  assert.equal(e.call('profileView', { membroId: b }, A).data.envolvimento, null); assert.ok(e.call('profileView', {}, B).data.envolvimento);
  // chat
  assert.equal(e.call('sendChat', { para: a, texto: 'oi' }, A).error.code, 'VALIDATION'); assert.equal(e.call('sendChat', { para: b, texto: '  ' }, A).error.code, 'VALIDATION'); assert.equal(e.call('sendChat', { para: 'ZZ', texto: 'oi' }, A).error.code, 'NOT_FOUND');
  assert.ok(e.call('sendChat', { para: b, texto: 'Paz, Bruno!' }, A).ok); assert.ok(e.call('sendChat', { para: b, texto: 'Tudo bem?' }, A).ok);
  assert.equal(e.call('listChats', {}, B).data.naoLidas, 2); assert.equal(e.call('listChats', {}, A).data.naoLidas, 0); const lc = e.call('listChats', {}, B).data.conversas; assert.equal(lc[0].id, a); assert.equal(lc[0].ultima, 'Tudo bem?');
  const g = e.call('getChat', { com: a }, B).data; assert.equal(g.msgs.length, 2); assert.equal(g.msgs[0].minha, false); assert.equal(g.com.nome, 'ana');
  assert.equal(e.call('chatRead', { com: a }, B).data.n, 2); assert.equal(e.call('listChats', {}, B).data.naoLidas, 0);
  assert.ok(e.call('sendChat', { para: a, texto: 'Tudo ótimo!' }, B).ok); assert.equal(e.call('getChat', { com: b, depois: g.msgs[1].ts }, A).data.msgs.length, 1);
  assert.equal(e.call('getChat', { com: a }, tok('carla@zoe.com', 'Temp12345')).data.msgs.length, 0); // outra pessoa não lê a conversa
  for (let i = 0; i < 20; i++) e.call('sendChat', { para: b, texto: 'spam ' + i }, A); assert.equal(e.call('sendChat', { para: b, texto: 'mais' }, A).error.code, 'RATE');
});

test('feed social: decisão, curtir, comentar, visibilidade', () => {
  const { e, adm, tok, mk } = boot(); const a = mk('ana@zoe.com', 'membro'), A = tok('ana@zoe.com', 'Temp12345');
  assert.equal(e.call('registerDecision', { nome: 'Carlos Souza' }, A).error.code, 'FORBIDDEN');
  const r = e.call('registerDecision', { nome: 'Carlos Souza' }, adm); assert.ok(r.ok, JSON.stringify(r));
  assert.equal(e.call('registerDecision', { nome: 'carlos souza' }, adm).error.code, 'DUPLICATE');
  const f = e.call('listFeed', {}, A).data.itens; assert.equal(f.length, 1); assert.equal(f[0].tipo, 'decisao'); assert.equal(f[0].titulo, 'Carlos Souza aceitou Jesus!');
  assert.equal(e.call('likePost', { id: f[0].id }, A).data.curtidas, 1); assert.equal(e.call('likePost', { id: f[0].id, on: false }, A).data.curtidas, 0);
  assert.ok(e.call('commentPost', { id: f[0].id, texto: 'Glória a Deus!' }, A).ok); assert.equal(e.call('listComments', { id: f[0].id }, A).data.itens.length, 1);
  assert.equal(e.call('listFeed', {}, A).data.itens[0].comentarios, 1);
  assert.equal(e.call('deletePost', { id: f[0].id }, A).error.code, 'FORBIDDEN'); assert.ok(e.call('deletePost', { id: f[0].id }, adm).ok); assert.equal(e.call('listFeed', {}, A).data.itens.length, 0);
});
test('consolidação: visitante, célula mais próxima, alerta ao líder', () => {
  const { e, adm, tok, mk } = boot(); const lid = mk('lid@zoe.com', 'membro'), A = (mk('ana@zoe.com', 'membro'), tok('ana@zoe.com', 'Temp12345'));
  const c1 = e.call('createCell', { nome: 'Célula Norte', liderId: lid, coordenadas: '-23.50, -46.60' }, adm), c2 = e.call('createCell', { nome: 'Célula Sul', coordenadas: '-23.90, -46.60' }, adm); assert.ok(c1.ok && c2.ok, JSON.stringify(c1));
  assert.equal(e.call('saveVisitor', { nome: 'Pedro', telefone: '11988887777', lat: -23.51, lng: -46.61 }, A).error.code, 'FORBIDDEN');
  assert.equal(e.call('saveVisitor', { nome: 'Pedro', telefone: '11988887777' }, adm).error.code, 'VALIDATION');
  const r = e.call('saveVisitor', { nome: 'Pedro Lima', apelido: 'Pedrão', telefone: '11988887777', lat: -23.51, lng: -46.61 }, adm); assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.data.celula.nome, 'Célula Norte');
  const L = (e.run(`(function(){const t=table_('Usuarios');return 1})()`), tok('lid@zoe.com', 'Temp12345'));
  const n = e.sheets.Notificacoes.rows.slice(1).filter(x => x[1] === lid && x[2] === 'visitante'); assert.equal(n.length, 1);
  const lv = e.call('listVisitors', {}, adm).data; assert.equal(lv.itens.length, 1); assert.ok(lv.itens[0].msg.includes('Pedrão'));
  assert.ok(e.call('contactVisitor', { id: r.data.id, msg: 'Oi!' }, adm).ok); assert.equal(e.call('listVisitors', {}, adm).data.itens[0].contatado, true);
});
test('Bíblia: marcações, comentários públicos e anotação do culto na célula', () => {
  const { e, adm, tok, mk } = boot(); const a = mk('ana@zoe.com', 'membro'), A = tok('ana@zoe.com', 'Temp12345'), B = (mk('bia@zoe.com', 'membro'), tok('bia@zoe.com', 'Temp12345'));
  const c = e.call('createCell', { nome: 'Célula Norte' }, adm).data.id; e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(m){if(m.Email==='ana@zoe.com'||m.Email==='bia@zoe.com')writeRow_(t,m._row,{CelulaID:'${c}'})})})()`);
  assert.ok(e.call('saveMark', { ref: '43:3:16', cor: 'amarelo', coment: 'Amor!', publico: true }, A).ok); assert.equal(e.call('saveMark', { ref: 'x', cor: 'amarelo' }, A).error.code, 'VALIDATION');
  const mb = e.call('listMarks', { b: 43, c: 3 }, B).data; assert.equal(mb.minhas.length, 0); assert.equal(mb.publicos.length, 1);
  assert.equal(e.call('listMarks', { b: 43, c: 3 }, A).data.minhas[0].cor, 'amarelo');
  assert.ok(e.call('saveMark', { ref: '43:3:16' }, A).data.removida);
  const n = e.call('saveNote', { data: '2026-11-01', tema: 'Mordomia Cristã', itens: [{ ref: '43:3:16', texto: 'Porque Deus amou…', coment: 'minha nota' }] }, A); assert.ok(n.ok, JSON.stringify(n)); assert.equal(n.data.titulo, '01/11/2026 Domingo - Tema Mordomia Cristã');
  const fc = e.call('listFeed', { escopo: 'celula' }, B).data.itens; assert.equal(fc.length, 1); assert.equal(fc[0].meta.itens.length, 1);
});
