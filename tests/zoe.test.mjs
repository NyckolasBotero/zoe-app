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
  const sup = mk('sup@zoe.com', 'supervisor'), l1 = mk('lider1@zoe.com', 'lider'), l2 = mk('lider2@zoe.com', 'lider');
  const c1 = e.call('createCell', { nome: 'Semeadores', liderId: l1, supervisorId: sup, dia: 'Quinta', inicio: '20:00', fim: '21:30', categoria: 'Mulheres e Homens', faixa: 'Jovens', bairro: 'Chácaras Coimbra', cidade: 'Águas Lindas de Goiás', uf: 'GO' }, adm).data.id;
  const c2 = e.call('createCell', { nome: 'Raízes', liderId: l2, supervisorId: sup, dia: 'Segunda', inicio: '19:30', fim: '21:00' }, adm).data.id;
  const L1 = tok('lider1@zoe.com', 'Temp12345'), L2 = tok('lider2@zoe.com', 'Temp12345'), S = tok('sup@zoe.com', 'Temp12345');
  assert.equal(e.call('cellMembers', { celulaId: c2 }, L1).error.code, 'FORBIDDEN');
  assert.equal(e.call('saveCell', { celulaId: c2, nome: 'X' }, L1).error.code, 'FORBIDDEN');
  assert.equal(e.call('cellMembers', { celulaId: c2 }, S).ok, true);
  const novo = e.call('addNewMember', { nome: 'Carlos Pereira', endereco: 'Rua 1', celular: '61999990000', extras: { 'Quem convidou': 'Lari', 'Outra': 'x' } }, L1); assert.ok(novo.ok);
  const mems = e.call('cellMembers', {}, L1).data; assert.equal(mems.length, 2);
  assert.ok(e.sheets.Membros.rows.some(r => String(r[32]).includes('Quem convidou') && !String(r[32]).includes('Outra')));
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
  const { e, adm, tok, mk } = boot(); const l = mk('lider@zoe.com', 'lider');
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
  const { e, adm, tok, mk } = boot(); mk('maria@zoe.com', 'membro'); const m = tok('maria@zoe.com', 'Temp12345'); const l1 = mk('lider1@zoe.com', 'lider');
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
