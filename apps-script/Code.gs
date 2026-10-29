/**
 * ZOE — Backend em Google Apps Script (app de membros do Ministério Zoe)
 * ------------------------------------------------------------------
 * 1) Cole este arquivo em Code.gs de um projeto Apps Script novo.
 * 2) Rode setup()  -> cria a planilha "Zoe - Dados" no seu Drive (ou usa a de SHEET_ID) e todas as abas.
 * 3) Rode criarAdmin('seu@email.com','SenhaForte123','Seu Nome')  -> primeiro administrador.
 * 4) Implantar > Nova implantação > App da Web (Executar como: Eu | Acesso: Qualquer pessoa).
 *    Cole a URL /exec em assets/js/config.js (apiUrl).
 *    Ao mudar o código: Gerenciar implantações > editar > Nova versão.
 *
 * Segurança (mesmo modelo do Safezone/Núcleo):
 *  - Senha com hash + salt (nunca volta pela API). Sessão com expiração e bloqueio após tentativas.
 *  - Toda ação confere papel e permissão AQUI no servidor; esconder botão na tela não protege nada.
 *  - Líder só mexe na própria célula, supervisor nas que supervisiona; administração/pastor em todas.
 *  - Dados pessoais de outros membros só saem no mínimo necessário (nome, apelido, aniversário sem ano).
 */
const CFG = { TZ: 'America/Sao_Paulo', SESSION_TTL: 21600, MAX_FAILS: 5, LOCK_SECONDS: 900, HASH_ROUNDS: 1500, SHEET_NAME: 'Zoe - Dados' };
// Nível de acesso ao app (Usuarios.Papel). Cargos de célula (líder, supervisor, líder em treinamento) NÃO são papéis:
// derivam de Celulas.LiderID / SupervisorID / TreinamentoID e podem somar-se a qualquer nível (ex.: admin + líder).
const PAPEIS = ['admin', 'pastor', 'membro', 'frequentador'];
const PAPEIS_BASE = PAPEIS;
const ROTULOS_TIPO = { admin: 'Administrador', pastor: 'Pastor', membro: 'Membro', frequentador: 'Frequentador' };
// guias do menu que o administrador pode esconder por tipo de acesso (Início, Editar perfil, Aprovações e Administração seguem regras próprias)
const ABAS_APP = ['membro', 'biblioteca', 'celula', 'familia', 'ministerios', 'buscar', 'licoes', 'dinamicas', 'cursos', 'eventos', 'aniversarios', 'tutoriais', 'loja'];
const GUIAS_CEL = ['freq', 'plan', 'papeis', 'oracao', 'ind', 'membros', 'perfilc', 'priv', 'pres', 'hist', 'mural', 'org'];
const PERMS = ['eventos', 'transf', 'celulas', 'min', 'config'];
const DEFAULT_PERMS = {
  admin: { eventos: 1, transf: 1, celulas: 1, min: 1, config: 1 },
  pastor: { eventos: 1, transf: 1, celulas: 1, min: 1, config: 0 },
  membro: { eventos: 0, transf: 0, celulas: 0, min: 0, config: 0 },
  frequentador: { eventos: 0, transf: 0, celulas: 0, min: 0, config: 0 }
};
const PERMS_ZERO = { eventos: 0, transf: 0, celulas: 0, min: 0, config: 0 };
const SHEETS = {
  Usuarios: ['Email', 'SenhaHash', 'Salt', 'Papel', 'Status', 'MembroID', 'TrocarSenha', 'CriadoEm', 'UltimoAcesso'],
  Membros: ['MembroID', 'Nome', 'Simples', 'Apelido', 'Sexo', 'Nascimento', 'Nacionalidade', 'Naturalidade', 'Sangue', 'Doador', 'Profissao', 'Telefone', 'Email', 'CEP', 'UF', 'Cidade', 'Endereco', 'Bairro', 'DataDecisao', 'Batizado', 'DataBatismo', 'IgrejaBatismo', 'Mae', 'Pai', 'EstadoCivil', 'Conjuge', 'DataCasamento', 'Filhos', 'Foto', 'CelulaID', 'EhMembro', 'Status', 'DataSaida', 'Extras', 'AceitePrivacidade', 'AceiteTermos', 'CriadoEm'],
  Celulas: ['CelulaID', 'Nome', 'Descricao', 'Foto', 'LiderID', 'SupervisorID', 'Dia', 'Inicio', 'Fim', 'Categoria', 'Faixa', 'Bairro', 'Cidade', 'UF', 'Endereco', 'TreinamentoID', 'MaeID', 'PrivGrupo', 'PrivTel', 'PrivEmail', 'PrivEnd', 'Status', 'Lat', 'Lng'],
  Reunioes: ['ReuniaoID', 'CelulaID', 'Data', 'Presentes', 'PresencaDeDeus', 'Obs', 'ForaDoDia', 'Elenco'],
  Presencas: ['ReuniaoID', 'CelulaID', 'Data', 'MembroID'],
  Papeis: ['CelulaID', 'MembroID', 'Papel'],
  Oracoes: ['OracaoID', 'CelulaID', 'MembroID', 'Tema', 'Titulo', 'Texto', 'Data'],
  Eventos: ['EventoID', 'Titulo', 'Data', 'Hora', 'Local', 'Descricao', 'Programacao', 'Escopo', 'CelulaID', 'CriadoPor', 'Status', 'Foto'],
  Inscricoes: ['EventoID', 'MembroID', 'Data'],
  Ministerios: ['MinisterioID', 'Nome', 'Ordem', 'Ativo', 'Descricao', 'Foto'],
  Interesses: ['InteresseID', 'MinisterioID', 'MembroID', 'Data', 'Status', 'DecididoPor', 'DataDecisao'],
  Membresias: ['MembresiaID', 'MembroID', 'CelulaID', 'Frequencias', 'Status', 'DecididoPor', 'Data', 'DataDecisao'],
  AprovLog: ['Tipo', 'RefID', 'Acao', 'Por', 'Data', 'Motivo'],
  Notificacoes: ['NotifID', 'MembroID', 'Tipo', 'Titulo', 'Texto', 'Ref', 'Data', 'Lida'],
  Uso: ['Mes', 'MembroID', 'Tela', 'Segundos', 'Visitas'],
  Livros: ['LivroID', 'Titulo', 'Autor', 'Descricao', 'Capa', 'ArquivoID', 'Tamanho', 'Status', 'CriadoEm'],
  LivroComentarios: ['ComentarioID', 'LivroID', 'MembroID', 'Texto', 'Pagina', 'Data', 'Status'],
  Testemunhos: ['TestemunhoID', 'MembroID', 'Titulo', 'Texto', 'Data', 'Status'],
  LivroNotas: ['LivroID', 'MembroID', 'Nota', 'Data'],
  Curtidas: ['Tipo', 'AlvoID', 'MembroID', 'Data'],
  Saidas: ['SaidaID', 'MembroID', 'CelulaID', 'Motivo', 'SolicitadoPor', 'Status', 'DecididoPor', 'Data', 'DataDecisao'],
  Transferencias: ['TransfID', 'MembroID', 'DeCelulaID', 'ParaCelulaID', 'SolicitadoPor', 'Status', 'DecididoPor', 'Data', 'DataDecisao', 'Motivo'],
  Cursos: ['CursoID', 'Nome', 'Ativo'],
  Matriculas: ['MatriculaID', 'CursoID', 'MembroID', 'Status', 'Data'],
  Noticias: ['NoticiaID', 'Titulo', 'Texto', 'Data', 'CriadoPor', 'Status'],
  Licoes: ['LicaoID', 'Titulo', 'Resumo', 'Categoria', 'Url', 'Status'],
  Dinamicas: ['DinamicaID', 'Titulo', 'Descricao', 'Minutos', 'MembroID', 'Data'],
  Produtos: ['ProdutoID', 'Nome', 'Categoria', 'Preco', 'Descricao', 'Foto', 'Opcoes', 'Ativo', 'Ordem', 'Disponivel'],
  Videos: ['VideoID', 'Titulo', 'Url', 'Ordem', 'Status', 'Tipo', 'AoVivo'],
  Permissoes: ['Papel'].concat(PERMS),
  Config: ['Chave', 'Valor'],
  Auditoria: ['Data', 'Usuario', 'Acao', 'Alvo', 'Resultado']
};
const DEFAULT_CONFIG = { NomeIgreja: 'Ministério Cristão Zoe', WhatsApp: '', LocalNome: 'Templo Zoe', LocalEndereco: '', LinkMapa: 'https://maps.app.goo.gl/RZWqr2FkSz8aux2t7', ColunasExtras: '["Quem convidou"]', CanalYoutube: 'https://youtube.com/@zoe.digital.1', FrequenciasParaMembro: '4', LojaWhatsApp: '', FrequentadorPct: '70', FrequentadorJanela: '8', CelulasParaSupervisor: '0' };
const DEFAULT_MIN = ['Gourmet', 'Infantil', 'Mídia', 'Música', 'Som', 'Limpeza', 'Recepção'];

class ApiError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

/* ============================== SETUP ============================== */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID');
  if (!id) { const s = SpreadsheetApp.create(CFG.SHEET_NAME); id = s.getId(); props.setProperty('SHEET_ID', id); }
  const ss = SpreadsheetApp.openById(id);
  Object.keys(SHEETS).forEach(function (n) { ensureSheet_(ss, n, SHEETS[n]); });
  const p = table_('Permissoes'), have = {}; p.rows.forEach(function (r) { have[r.Papel] = 1; });
  PAPEIS.forEach(function (r) { if (!have[r]) appendRow_(p, Object.assign({ Papel: r }, DEFAULT_PERMS[r])); });
  const c = table_('Config'), hc = {}; c.rows.forEach(function (r) { hc[r.Chave] = 1; });
  Object.keys(DEFAULT_CONFIG).forEach(function (k) { if (!hc[k]) appendRow_(c, { Chave: k, Valor: DEFAULT_CONFIG[k] }); });
  const m = table_('Ministerios');
  if (!m.rows.length) DEFAULT_MIN.forEach(function (n, i) { appendRow_(m, { MinisterioID: id_('MIN'), Nome: n, Ordem: i + 1, Ativo: '1' }); });
  pastaLivros_(); // pede a autorização do Google Drive (PDFs da biblioteca)
  Logger.log('Setup concluído. Planilha: https://docs.google.com/spreadsheets/d/' + id + '  (mantenha o compartilhamento RESTRITO)');
}
// Rode ESTA função no editor (o botão Executar não passa argumentos para criarAdmin).
// 1) Troque os 3 valores abaixo  2) Executar  3) Depois APAGUE a senha daqui.
function criarAdminInicial() {
  criarAdmin('SEU_EMAIL@exemplo.com', 'TROQUE-POR-UMA-SENHA-FORTE', 'Seu Nome');
}
function criarAdmin(email, senha, nome) {
  email = String(email || '').trim().toLowerCase(); if (!email || String(senha || '').length < 8) throw new Error('Informe e-mail e senha com 8+ caracteres.');
  const u = table_('Usuarios'); if (u.rows.some(function (r) { return String(r.Email).toLowerCase() === email; })) throw new Error('Usuário já existe.');
  const mid = id_('M'); appendRow_(table_('Membros'), { MembroID: mid, Nome: nome || email, Simples: nome || email, Apelido: String(nome || email).split(' ')[0], Email: email, EhMembro: '1', Status: 'Ativo', CriadoEm: now_() });
  const salt = Utilities.getUuid();
  appendRow_(u, { Email: email, SenhaHash: hash_(salt, String(senha)), Salt: salt, Papel: 'admin', Status: 'Ativo', MembroID: mid, TrocarSenha: '', CriadoEm: now_() });
  Logger.log('Administrador criado: ' + email);
}
function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  else { const cur = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); const miss = headers.filter(function (h) { return cur.indexOf(h) < 0; }); if (miss.length) sh.getRange(1, cur.length + 1, 1, miss.length).setValues([miss]); }
  sh.getRange(1, 1, sh.getMaxRows(), sh.getLastColumn()).setNumberFormat('@'); // texto puro: datas e horas não viram Date
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold'); sh.setFrozenRows(1);
}

/* ============================== BASE ============================== */
function ss_() { const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID'); if (!id) throw new ApiError('SETUP', 'Rode setup() no Apps Script.'); return SpreadsheetApp.openById(id); }
function table_(name) {
  const sh = ss_().getSheetByName(name); if (!sh) throw new ApiError('SETUP', 'Aba ausente: ' + name + '. Rode setup().');
  const v = sh.getDataRange().getValues(), headers = (v[0] || []).map(String);
  const rows = v.slice(1).map(function (r, i) { const o = { _row: i + 2 }; headers.forEach(function (h, j) { o[h] = str_(r[j]); }); return o; }).filter(function (o) { return headers.some(function (h) { return o[h] !== ''; }); });
  return { sh: sh, headers: headers, rows: rows };
}
let TZ_SHEET_ = null;
function tzSheet_() { if (TZ_SHEET_) return TZ_SHEET_; try { TZ_SHEET_ = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')).getSpreadsheetTimeZone() || CFG.TZ; } catch (e) { TZ_SHEET_ = CFG.TZ; } return TZ_SHEET_; }
// O Google Sheets converte "20:00" em hora (ano 1899) quando a célula não é texto. Aqui devolvemos sempre texto legível.
function str_(x) { if (x instanceof Date) { if (x.getFullYear() < 1950) return Utilities.formatDate(x, tzSheet_(), 'HH:mm'); return Utilities.formatDate(x, CFG.TZ, 'yyyy-MM-dd'); } return x === null || x === undefined ? '' : String(x); }
function appendRow_(t, o) { const vals = t.headers.map(function (h) { return o[h] === undefined ? '' : o[h]; }); const rg = t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, vals.length); rg.setNumberFormat('@'); rg.setValues([vals]); } // formato texto antes de gravar: horas e datas não viram Date
function writeRow_(t, row, patch) { Object.keys(patch).forEach(function (k) { const c = t.headers.indexOf(k); if (c >= 0) { const rg = t.sh.getRange(row, c + 1, 1, 1); rg.setNumberFormat('@'); rg.setValues([[patch[k]]]); } }); }
function id_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); }
function now_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd'); }
function clip_(s, n) { return String(s === undefined || s === null ? '' : s).trim().slice(0, n || 200); }
function withLock_(fn) { const l = LockService.getScriptLock(); l.waitLock(20000); try { return fn(); } finally { l.releaseLock(); } }
function norm_(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
function jparse_(s, d) { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function audit_(user, action, alvo, res) { try { appendRow_(table_('Auditoria'), { Data: now_(), Usuario: user, Acao: action, Alvo: alvo || '', Resultado: res || 'OK' }); } catch (e) { } }
function hash_(salt, pw) { let h = salt + pw; for (let i = 0; i < CFG.HASH_ROUNDS; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + h + pw)); return h; }
function safeEq_(a, b) { let d = a.length ^ b.length; const n = Math.max(a.length, b.length); for (let i = 0; i < n; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }

/* ============================ SESSÃO / PERMISSÃO ============================ */
function ver_(email) { return CacheService.getScriptCache().get('v:' + email) || '0'; }
function bumpVer_(email) { CacheService.getScriptCache().put('v:' + email, String(Date.now()), 21600); }
function login_(d) {
  const email = clip_(d.email, 120).toLowerCase(), pw = String(d.senha || ''), generic = new ApiError('AUTH', 'E-mail ou senha inválidos.');
  if (!email || !pw || pw.length > 200) throw generic;
  const cache = CacheService.getScriptCache(), fk = 'f:' + email, fails = Number(cache.get(fk) || 0);
  if (fails >= CFG.MAX_FAILS) { audit_(email, 'LOGIN_BLOQUEADO', '', 'NEGADO'); throw new ApiError('LOCKED', 'Muitas tentativas. Aguarde alguns minutos.'); }
  const t = table_('Usuarios'), u = t.rows.filter(function (r) { return String(r.Email).toLowerCase() === email; })[0];
  const ok = u && u.Status !== 'Inativo' && u.SenhaHash && safeEq_(hash_(u.Salt, pw), u.SenhaHash);
  if (!ok) { cache.put(fk, String(fails + 1), CFG.LOCK_SECONDS); audit_(email, 'LOGIN', '', 'FALHA'); throw generic; }
  cache.remove(fk); writeRow_(t, u._row, { UltimoAcesso: now_() });
  try { withLock_(function () { upsertUso_(today_().slice(0, 7), u.MembroID, '_login', 0, 1); }); } catch (e) { /* não impede o login */ }
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('s:' + token, JSON.stringify({ e: email, v: ver_(email) }), CFG.SESSION_TTL); audit_(email, 'LOGIN', '', 'OK');
  return { token: token, trocarSenha: u.TrocarSenha === '1' };
}
function auth_(token) {
  const raw = token && CacheService.getScriptCache().get('s:' + token); if (!raw) throw new ApiError('SESSION', 'Sessão expirada. Entre novamente.');
  const s = JSON.parse(raw); if (s.v !== ver_(s.e)) throw new ApiError('SESSION', 'Sessão encerrada. Entre novamente.');
  const u = table_('Usuarios').rows.filter(function (r) { return String(r.Email).toLowerCase() === s.e; })[0];
  if (!u || u.Status === 'Inativo') throw new ApiError('SESSION', 'Acesso desativado.');
  const m = table_('Membros').rows.filter(function (r) { return r.MembroID === u.MembroID; })[0] || {};
  const cg = cargos_(u.MembroID);
  return { email: s.e, papel: papelValido_(u.Papel) ? u.Papel : 'membro', membroId: u.MembroID, celulaId: m.CelulaID || '', lidera: cg.lidera, treina: cg.treina, supervisiona: cg.supervisiona, token: token };
}
function cargos_(membroId) {
  const o = { lidera: [], treina: [], supervisiona: [] }; if (!membroId) return o;
  table_('Celulas').rows.forEach(function (c) { if (c.Status === 'Inativa') return; if (c.LiderID === membroId) o.lidera.push(c.CelulaID); if (c.TreinamentoID === membroId) o.treina.push(c.CelulaID); if (c.SupervisorID === membroId) o.supervisiona.push(c.CelulaID); });
  return o;
}
function tiposCustom_() { return jparse_(cfgMap_().TiposAcesso, []).filter(function (t) { return t && /^c_[a-z0-9]{1,20}$/.test(t.id) && t.nome; }).slice(0, 12); }
function papeis_() { return PAPEIS_BASE.concat(tiposCustom_().map(function (t) { return t.id; })); }
function papelValido_(p) { return PAPEIS_BASE.indexOf(p) >= 0 || tiposCustom_().some(function (t) { return t.id === p; }); }
function tiposOut_() { return PAPEIS_BASE.map(function (id) { return { id: id, nome: ROTULOS_TIPO[id], base: true }; }).concat(tiposCustom_().map(function (t) { return { id: t.id, nome: t.nome, base: false }; })); }
function permMatrix_() { const o = {}, ps = papeis_(); table_('Permissoes').rows.forEach(function (r) { if (ps.indexOf(r.Papel) < 0) return; o[r.Papel] = {}; PERMS.forEach(function (k) { o[r.Papel][k] = r[k] === '1' || r[k] === 'true' ? 1 : 0; }); }); ps.forEach(function (p) { if (!o[p]) o[p] = Object.assign({}, DEFAULT_PERMS[p] || PERMS_ZERO); }); o.admin.config = 1; return o; }
// "Frequentador" é calculado: quem está numa célula e tem presença abaixo do limite (padrão 70%) nas últimas reuniões
function pctMembro_(membroId, celulaId) {
  const cfg = cfgMap_(), janela = Math.max(1, Number(cfg.FrequentadorJanela) || 8), reun = table_('Reunioes').rows.filter(function (r) { return r.CelulaID === celulaId; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; });
  const pres = {}, primeira = {}; table_('Presencas').rows.forEach(function (p) { if (p.CelulaID !== celulaId) return; pres[p.Data + '|' + p.MembroID] = 1; if (!primeira[p.MembroID] || p.Data < primeira[p.MembroID]) primeira[p.MembroID] = p.Data; });
  let n = 0, ok = 0;
  for (let i = 0; i < reun.length && n < janela; i++) { const r = reun[i], no = r.Elenco ? String(r.Elenco).split(',').indexOf(membroId) >= 0 : (primeira[membroId] && primeira[membroId] <= r.Data); if (!no) continue; n++; if (pres[r.Data + '|' + membroId]) ok++; }
  return n ? Math.round(ok / n * 100) : null;
}
function tipoEf_(u) {
  if (u._tef) return u._tef; let t = u.papel;
  if ((t === 'membro' || t === 'frequentador') && u.celulaId) { const pct = pctMembro_(u.membroId, u.celulaId), lim = Number(cfgMap_().FrequentadorPct) || 70; t = (pct === null || pct < lim) ? 'frequentador' : 'membro'; }
  u._tef = t; return t;
}
function can_(u, k) { const m = permMatrix_(); if (u.papel !== 'membro' && u.papel !== 'frequentador') return !!(m[u.papel] || {})[k]; if (!!(m.membro || {})[k] === !!(m.frequentador || {})[k]) return !!(m.membro || {})[k]; return !!(m[tipoEf_(u)] || {})[k]; }
function abasPorTipo_() { const st = jparse_(cfgMap_().AbasPorTipo, {}), o = {}; papeis_().forEach(function (p) { o[p] = {}; ABAS_APP.forEach(function (a) { o[p][a] = (p === 'admin' || !st[p] || st[p][a] === undefined || st[p][a]) ? 1 : 0; }); }); return o; }
function allCelPerm_() { const o = {}; GUIAS_CEL.forEach(function (g) { o[g] = { v: 1, e: 1 }; }); return o; }
// Regras das guias da célula por perfil (Definições de Parâmetros > Regras Células). Padrão: líder e supervisor fazem tudo;
// líder em treinamento ajuda na presença; membro e frequentador podem ver e pedir oração. Admin/pastor com a permissão "celulas" veem e editam tudo.
function defRegras_() {
  const all = function (v, e) { const o = {}; GUIAS_CEL.forEach(function (g) { o[g] = { v: v, e: e }; }); return o; };
  const so = function (ver, ed) { const o = all(0, 0); ver.forEach(function (g) { o[g].v = 1; }); ed.forEach(function (g) { o[g].e = 1; o[g].v = 1; }); return o; };
  const base = so(['plan', 'oracao', 'membros', 'perfilc', 'mural', 'org'], ['oracao']);
  const d = { supervisor: all(1, 1), lider: all(1, 1), treinamento: so(['freq', 'plan', 'oracao', 'ind', 'membros', 'pres', 'hist', 'mural'], ['freq', 'pres', 'oracao']), pastor: all(1, 1), membro: base, frequentador: JSON.parse(JSON.stringify(base)) };
  tiposCustom_().forEach(function (t) { d[t.id] = JSON.parse(JSON.stringify(base)); });
  return d;
}
function regrasCel_() {
  const st = jparse_(cfgMap_().RegrasCelulas, {}), def = defRegras_(), out = {};
  Object.keys(def).forEach(function (p) { out[p] = {}; GUIAS_CEL.forEach(function (g) { const x = st[p] && st[p][g]; out[p][g] = x ? { v: (x.v || x.e) ? 1 : 0, e: x.e ? 1 : 0 } : def[p][g]; }); });
  return out;
}
function celPermMap_(u, c) {
  const R = regrasCel_(), per = [], o = {}; if (c.LiderID === u.membroId) per.push('lider'); if (c.SupervisorID === u.membroId) per.push('supervisor'); if (c.TreinamentoID === u.membroId) per.push('treinamento'); if (u.celulaId === c.CelulaID) per.push(tipoEf_(u));
  GUIAS_CEL.forEach(function (g) { o[g] = { v: 0, e: 0 }; per.forEach(function (p) { const r = (R[p] || {})[g]; if (r) { if (r.v) o[g].v = 1; if (r.e) o[g].e = 1; } }); });
  return o;
}
function celPerm_(u, c, guia, acao) { const m = celPermMap_(u, c)[guia]; return !!m && !!(acao === 'editar' ? m.e : m.v); }
// nivel (regra antiga): 'ver' e 'presenca' (líder, líder em treinamento, supervisor) · 'gerir' (líder, supervisor) · 'transf' (só o líder pede transferência)
// Com "guia" e "acao" (ver/editar) vale a tabela de regras acima. Admin/pastor com a permissão "celulas" enxergam e gerem todas.
function cellAccess_(u, celulaId, nivel, guia, acao) {
  if (!celulaId) throw new ApiError('VALIDATION', 'Você ainda não está em uma célula.');
  if (can_(u, 'celulas')) return true;
  const c = table_('Celulas').rows.filter(function (r) { return r.CelulaID === celulaId; })[0]; if (!c) throw new ApiError('NOT_FOUND', 'Célula não encontrada.');
  if (guia) { if (celPerm_(u, c, guia, acao || 'ver')) return true; throw new ApiError('FORBIDDEN', 'O seu perfil não tem permissão para esta guia da célula.'); }
  const isL = c.LiderID === u.membroId, isS = c.SupervisorID === u.membroId, isT = c.TreinamentoID === u.membroId; nivel = nivel || 'gerir';
  if (nivel === 'transf' ? isL : nivel === 'gerir' ? (isL || isS) : (isL || isS || isT)) return true;
  throw new ApiError('FORBIDDEN', 'Você não tem permissão sobre esta célula.');
}
function celulaAtiva_(u) { return u.lidera[0] || u.treina[0] || u.supervisiona[0] || u.celulaId || ''; }
function cellOf_(u, d, nivel, guia, acao) { const id = clip_(d.celulaId, 30) || celulaAtiva_(u); cellAccess_(u, id, nivel, guia, acao); return id; }
function ehSupervisor_(u) { return u.supervisiona.length > 0; }

/* ============================== MEMBROS ============================== */
const MEMBER_EDIT = ['Nome', 'Simples', 'Apelido', 'Sexo', 'Nascimento', 'Nacionalidade', 'Naturalidade', 'Sangue', 'Doador', 'Profissao', 'Telefone', 'Email', 'CEP', 'UF', 'Cidade', 'Endereco', 'Bairro', 'DataDecisao', 'Batizado', 'DataBatismo', 'IgrejaBatismo', 'Mae', 'Pai', 'EstadoCivil', 'Conjuge', 'DataCasamento', 'Foto'];
function memberFull_(m) { const o = {}; Object.keys(m).forEach(function (k) { if (k !== '_row') o[k] = m[k]; }); o.Filhos = jparse_(m.Filhos, []); o.Extras = jparse_(m.Extras, {}); return o; }
function memberPub_(m) { return { id: m.MembroID, nome: m.Nome, apelido: m.Apelido || m.Simples || String(m.Nome).split(' ')[0], nasc: m.Nascimento, membro: m.EhMembro === '1', foto: m.Foto ? 'sim' : '' }; }
function getMember_(id) { const t = table_('Membros'); const m = t.rows.filter(function (r) { return r.MembroID === id; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Membro não encontrado.'); return { t: t, m: m }; }
function dateOk_(s) { return s === '' || /^\d{4}-\d{2}-\d{2}$/.test(s); }
function me_(d, u) {
  const mm = getMember_(u.membroId).m, ativa = clip_(d.celulaId, 30) ? (cellAccess_(u, clip_(d.celulaId, 30), 'ver'), clip_(d.celulaId, 30)) : celulaAtiva_(u), todas = table_('Celulas').rows.filter(function (r) { return r.Status !== 'Inativa'; });
  const cel = ativa ? todas.filter(function (r) { return r.CelulaID === ativa; })[0] : null, full = can_(u, 'celulas');
  const cargo = function (r) { return r.LiderID === u.membroId ? 'Líder' : r.SupervisorID === u.membroId ? 'Supervisor' : r.TreinamentoID === u.membroId ? 'Líder em treinamento' : ''; };
  const minhas = todas.filter(function (r) { return full || cargo(r); }).map(function (r) { return { id: r.CelulaID, nome: r.Nome, cargo: cargo(r) || 'Administração' }; });
  const cg = { lider: u.lidera.length > 0, treinamento: u.treina.length > 0, supervisor: u.supervisiona.length > 0 };
  const nivelCel = !cel ? '' : (full || (cel.LiderID === u.membroId) ? 'lider' : cel.SupervisorID === u.membroId ? 'supervisor' : cel.TreinamentoID === u.membroId ? 'treinamento' : 'membro');
  const tef = tipoEf_(u), abas = abasPorTipo_()[tef] || {}, cp = cel ? (full ? allCelPerm_() : celPermMap_(u, cel)) : null;
  return { usuario: { email: u.email, papel: u.papel, tipo: tef }, abas: abas, permCelula: cp, membro: memberFull_(mm), celula: cel ? cellOut_(cel, nivelCel !== 'membro') : null, nivelCelula: nivelCel, cargos: cg, minhasCelulas: minhas, permissoes: permMatrix_()[tef], config: publicConfig_(), interesses: interessesDe_(u.membroId), membresia: membresiaDe_(u.membroId) };
}
function saveMember_(d, u) {
  return withLock_(function () {
    const g = getMember_(u.membroId), p = {}, src = d.membro || {};
    MEMBER_EDIT.forEach(function (k) { if (src[k] !== undefined) p[k] = k === 'Foto' ? String(src[k]).slice(0, 45000) : clip_(src[k], 200); });
    if (p.Nome !== undefined && !p.Nome) throw new ApiError('VALIDATION', 'O nome completo não pode ficar vazio.');
    ['Nascimento', 'DataDecisao', 'DataBatismo', 'DataCasamento'].forEach(function (k) { if (p[k] !== undefined && !dateOk_(p[k])) throw new ApiError('VALIDATION', 'Data inválida em ' + k + '.'); });
    if (p.DataBatismo) p.Batizado = 'sim';
    if (p.Email !== undefined) delete p.Email; // e-mail de acesso só muda pelo administrador
    if (src.Filhos !== undefined) p.Filhos = JSON.stringify((src.Filhos || []).slice(0, 15).map(function (f) { return { n: clip_(f.n, 120), idade: clip_(f.idade, 30) }; }));
    writeRow_(g.t, g.m._row, p); audit_(u.email, 'MEMBRO_SALVO', u.membroId, 'OK'); return memberFull_(Object.assign({}, g.m, p));
  });
}
function acceptLegal_(d, u) { return withLock_(function () { const g = getMember_(u.membroId), k = d.tipo === 'termos' ? 'AceiteTermos' : 'AceitePrivacidade'; writeRow_(g.t, g.m._row, (function () { const o = {}; o[k] = now_(); return o; })()); return { ok: true }; }); }
function birthdays_(d, u) {
  const hoje = today_(), mes = hoje.slice(5, 7), dia = hoje.slice(8, 10);
  const l = table_('Membros').rows.filter(function (m) { return m.Nascimento && m.Nascimento.slice(5, 7) === mes && m.Status !== 'Inativo'; }).map(function (m) { return { id: m.MembroID, apelido: m.Apelido || m.Simples || m.Nome.split(' ')[0], dia: m.Nascimento.slice(8, 10), hoje: m.Nascimento.slice(8, 10) === dia }; });
  l.sort(function (a, b) { return a.dia < b.dia ? -1 : 1; }); return { mes: mes, lista: l };
}

/* ============================== CONFIG PÚBLICA ============================== */
function cfgMap_() { const o = {}; table_('Config').rows.forEach(function (r) { o[r.Chave] = r.Valor; }); return o; }
function publicConfig_() { const c = cfgMap_(); return { nomeIgreja: c.NomeIgreja, whatsapp: c.WhatsApp, localNome: c.LocalNome, localEndereco: c.LocalEndereco, linkMapa: c.LinkMapa || '', colunasExtras: jparse_(c.ColunasExtras, []), canalYoutube: c.CanalYoutube || '', lojaWhatsapp: c.LojaWhatsApp || '', frequentadorPct: Number(c.FrequentadorPct) || 70, frequentadorJanela: Number(c.FrequentadorJanela) || 8, celulasParaSupervisor: Math.max(0, Number(c.CelulasParaSupervisor) || 0), frequenciasParaMembro: freqMembro_() }; }
function saveConfig_(d, u) {
  return withLock_(function () {
    const t = table_('Config'), allow = { NomeIgreja: 120, WhatsApp: 20, LojaWhatsApp: 20, LocalNome: 120, LocalEndereco: 250, LinkMapa: 300 };
    [['FrequentadorPct', 1, 100, 'O limite de presença precisa estar entre 1 e 100.'], ['FrequentadorJanela', 1, 52, 'Informe de 1 a 52 reuniões.'], ['CelulasParaSupervisor', 0, 50, 'Informe de 0 a 50 células.']].forEach(function (q) {
      if (d[q[0]] === undefined) return; const n = Number(d[q[0]]); if (!isFinite(n) || n < q[1] || n > q[2] || Math.round(n) !== n) throw new ApiError('VALIDATION', q[3]);
      const r0 = t.rows.filter(function (x) { return x.Chave === q[0]; })[0]; if (r0) writeRow_(t, r0._row, { Valor: String(n) }); else appendRow_(t, { Chave: q[0], Valor: String(n) });
    });
    if (d.FrequenciasParaMembro !== undefined) {
      const n = Number(d.FrequenciasParaMembro); if (!isFinite(n) || n < 1 || n > 50 || Math.round(n) !== n) throw new ApiError('VALIDATION', 'Informe um número inteiro de 1 a 50.');
      const r0 = t.rows.filter(function (x) { return x.Chave === 'FrequenciasParaMembro'; })[0]; if (r0) writeRow_(t, r0._row, { Valor: String(n) }); else appendRow_(t, { Chave: 'FrequenciasParaMembro', Valor: String(n) });
    }
    Object.keys(allow).forEach(function (k) {
      if (d[k] === undefined) return; let v = clip_(d[k], allow[k]); if (k === 'WhatsApp' || k === 'LojaWhatsApp') v = v.replace(/\D/g, '');
      if (k === 'LinkMapa' && v && !/^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps|google\.com\/maps|maps\.google\.com)\//.test(v)) throw new ApiError('VALIDATION', 'Use um link do Google Maps (https://maps.app.goo.gl/...).');
      const r = t.rows.filter(function (x) { return x.Chave === k; })[0]; if (r) writeRow_(t, r._row, { Valor: v }); else appendRow_(t, { Chave: k, Valor: v });
    });
    if (d.colunasExtras !== undefined) { const v = JSON.stringify((d.colunasExtras || []).slice(0, 20).map(function (s) { return clip_(s, 60); }).filter(String)); const r = t.rows.filter(function (x) { return x.Chave === 'ColunasExtras'; })[0]; if (r) writeRow_(t, r._row, { Valor: v }); else appendRow_(t, { Chave: 'ColunasExtras', Valor: v }); }
    audit_(u.email, 'CONFIG_SALVA', '', 'OK'); return publicConfig_();
  });
}

/* ============================== CÉLULAS ============================== */
function parseCoord_(v) {
  if (v === undefined) return undefined;
  const t = String(v).trim(); if (!t) return { Lat: '', Lng: '' };
  const m = t.replace(/,/g, ' ').match(/-?\d+(?:\.\d+)?/g);
  if (!m || m.length !== 2) throw new ApiError('VALIDATION', 'Informe as coordenadas como "latitude, longitude". Ex.: -15.765417, -48.267880');
  const a = Number(m[0]), b = Number(m[1]);
  if (!isFinite(a) || !isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) throw new ApiError('VALIDATION', 'Coordenadas fora do intervalo válido.');
  return { Lat: String(Math.round(a * 1e6) / 1e6), Lng: String(Math.round(b * 1e6) / 1e6) };
}
function cellOut_(c, own) {
  const l = c.LiderID ? table_('Membros').rows.filter(function (m) { return m.MembroID === c.LiderID; })[0] : null;
  const o = { id: c.CelulaID, nome: c.Nome, descricao: c.Descricao, dia: c.Dia, inicio: c.Inicio, fim: c.Fim, categoria: c.Categoria, faixa: c.Faixa, bairro: c.Bairro, cidade: c.Cidade, uf: c.UF, lider: l ? (l.Apelido || l.Simples || l.Nome) : '' };
  if (own) { o.foto = c.Foto; o.endereco = c.Endereco; o.coordenadas = c.Lat !== '' && c.Lat !== undefined && c.Lng !== '' ? c.Lat + ', ' + c.Lng : ''; o.priv = { grupo: c.PrivGrupo === '1', tel: c.PrivTel === '1', email: c.PrivEmail === '1', end: c.PrivEnd === '1' }; }
  return o;
}
function saveCell_(d, u) {
  return withLock_(function () {
    const id = clip_(d.celulaId, 30) || celulaAtiva_(u), outros = Object.keys(d).filter(function (k) { return k !== 'celulaId' && k !== 'priv'; });
    if (d.priv) cellAccess_(u, id, 'gerir', 'priv', 'editar'); if (outros.length || !d.priv) cellAccess_(u, id, 'gerir', 'perfilc', 'editar');
    const t = table_('Celulas'), c = t.rows.filter(function (r) { return r.CelulaID === id; })[0], p = {};
    ['Nome', 'Descricao', 'Dia', 'Inicio', 'Fim', 'Categoria', 'Faixa', 'Bairro', 'Cidade', 'UF', 'Endereco'].forEach(function (k) { const kk = k.charAt(0).toLowerCase() + k.slice(1); if (d[kk] !== undefined) p[k] = clip_(d[kk], k === 'Descricao' ? 500 : 150); });
    if (d.foto !== undefined) p.Foto = String(d.foto).slice(0, 45000);
    const co = parseCoord_(d.coordenadas); if (co) { p.Lat = co.Lat; p.Lng = co.Lng; }
    if (d.priv) { p.PrivGrupo = d.priv.grupo ? '1' : '0'; p.PrivTel = d.priv.tel ? '1' : '0'; p.PrivEmail = d.priv.email ? '1' : '0'; p.PrivEnd = d.priv.end ? '1' : '0'; }
    if (p.Nome === '') throw new ApiError('VALIDATION', 'Dê um nome à célula.');
    writeRow_(t, c._row, p); audit_(u.email, 'CELULA_SALVA', id, 'OK'); return cellOut_(Object.assign({}, c, p), true);
  });
}
function createCell_(d, u) {
  return withLock_(function () {
    const nome = clip_(d.nome, 100); if (!nome) throw new ApiError('VALIDATION', 'Informe o nome da célula.'); const co = parseCoord_(d.coordenadas);
    checarSupervisor_(clip_(d.supervisorId, 30), d, u, clip_(d.maeId, 30));
    const id = id_('C'); appendRow_(table_('Celulas'), { CelulaID: id, Nome: nome, Descricao: clip_(d.descricao, 500), LiderID: clip_(d.liderId, 30), SupervisorID: clip_(d.supervisorId, 30), TreinamentoID: clip_(d.treinamentoId, 30), MaeID: clip_(d.maeId, 30), Dia: clip_(d.dia, 20), Inicio: clip_(d.inicio, 5), Fim: clip_(d.fim, 5), Categoria: clip_(d.categoria, 30), Faixa: clip_(d.faixa, 30), Bairro: clip_(d.bairro, 80), Cidade: clip_(d.cidade, 80), UF: clip_(d.uf, 2), Endereco: clip_(d.endereco, 150), PrivGrupo: '1', PrivTel: '0', PrivEmail: '0', PrivEnd: '0', Status: 'Ativa', Lat: co ? co.Lat : '', Lng: co ? co.Lng : '' });
    if (d.liderId) { const g = getMember_(d.liderId); writeRow_(g.t, g.m._row, { CelulaID: id }); }
    if (d.treinamentoId) { const g = getMember_(d.treinamentoId); if (!g.m.CelulaID) writeRow_(g.t, g.m._row, { CelulaID: id }); }
    audit_(u.email, 'CELULA_CRIADA', id, 'OK'); return { id: id };
  });
}
function cellOfAny_(u, d, guias) { let err; for (let i = 0; i < guias.length; i++) { try { return cellOf_(u, d, 'ver', guias[i], 'ver'); } catch (e) { err = e; } } throw err; }
function cellMembers_(d, u) { const id = cellOfAny_(u, d, ['membros', 'freq', 'pres', 'papeis']); return table_('Membros').rows.filter(function (m) { return m.CelulaID === id && m.Status !== 'Inativo'; }).map(memberPub_); }
function searchCells_(d) {
  const f = d || {}, q = norm_(f.q || '');
  const l = table_('Celulas').rows.filter(function (c) { return c.Status !== 'Inativa' && c.PrivGrupo === '1'; }).filter(function (c) {
    return (!f.dia || c.Dia === f.dia) && (!f.categoria || c.Categoria === f.categoria) && (!f.faixa || c.Faixa === f.faixa) && (!f.inicio || c.Inicio >= f.inicio) && (!f.fim || c.Fim <= f.fim) && (!q || norm_(c.Bairro + ' ' + c.Cidade + ' ' + c.UF).indexOf(q) >= 0);
  });
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'], ord = f.ordem || 'dia';
  l.sort(function (a, b) { return ord === 'inicio' ? (a.Inicio < b.Inicio ? -1 : 1) : ord === 'categoria' ? (a.Categoria < b.Categoria ? -1 : 1) : dias.indexOf(a.Dia) - dias.indexOf(b.Dia); });
  const mem = table_('Membros').rows;
  return l.map(function (c) {
    const o = cellOut_(c, false), lid = mem.filter(function (m) { return m.MembroID === c.LiderID; })[0] || {};
    if (c.PrivTel === '1') o.telefone = lid.Telefone || ''; if (c.PrivEmail === '1') o.email = lid.Email || '';
    if (c.Lat !== '' && c.Lat !== undefined && c.Lng !== '') { const exato = c.PrivEnd === '1', k = function (x) { return exato ? Number(x) : Math.round(Number(x) * 100) / 100; }; o.lat = k(c.Lat); o.lng = k(c.Lng); o.aprox = !exato; }
    o.local = c.PrivEnd === '1' ? [c.Endereco, c.Bairro, c.Cidade, c.UF].filter(String).join(', ') : [c.Bairro, c.Cidade, c.UF].filter(String).join(', '); return o;
  });
}
const SEMANA_ = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
function diaDe_(data) { const p = data.split('-'); return SEMANA_[new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay()]; }
function diaIgual_(a, b) { return norm_(String(a || '')).slice(0, 3) === norm_(String(b || '')).slice(0, 3); }
function ativosDaCelula_(id) { return table_('Membros').rows.filter(function (m) { return m.CelulaID === id && m.Status !== 'Inativo'; }); }
function saveAttendance_(d, u) {
  return withLock_(function () {
    const id = cellOf_(u, d, 'presenca', 'freq', 'editar'), data = clip_(d.data, 10) || today_(); if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ApiError('VALIDATION', 'Data inválida.');
    if (data > today_()) throw new ApiError('VALIDATION', 'Não é possível lançar frequência de uma data futura.');
    const cel = table_('Celulas').rows.filter(function (c) { return c.CelulaID === id; })[0] || {}, dia = diaDe_(data), fora = !!cel.Dia && !diaIgual_(cel.Dia, dia);
    if (fora && !d.confirmaDia) throw new ApiError('DIA_DIFERENTE', 'A célula acontece na ' + cel.Dia + ', mas a data escolhida cai em ' + dia + '. Confirme se a reunião foi mesmo nesse dia ou corrija a data.');
    const mem = ativosDaCelula_(id).map(function (m) { return m.MembroID; });
    const pres = (d.presentes || []).filter(function (x) { return mem.indexOf(x) >= 0; });
    const pt = table_('Presencas'); for (let i = pt.rows.length - 1; i >= 0; i--) if (pt.rows[i].CelulaID === id && pt.rows[i].Data === data) pt.sh.deleteRow(pt.rows[i]._row);
    const rt = table_('Reunioes'), ex = rt.rows.filter(function (r) { return r.CelulaID === id && r.Data === data; })[0], rid = ex ? ex.ReuniaoID : id_('R');
    const elenco = (ex && ex.Elenco) ? String(ex.Elenco).split(',').filter(String) : mem.slice(); pres.forEach(function (m) { if (elenco.indexOf(m) < 0) elenco.push(m); });
    const patch = { Presentes: String(pres.length), PresencaDeDeus: d.deus ? '1' : '0', Obs: clip_(d.obs, 300), ForaDoDia: fora ? '1' : '0', Elenco: elenco.join(',') };
    if (ex) writeRow_(rt, ex._row, patch); else appendRow_(rt, Object.assign({ ReuniaoID: rid, CelulaID: id, Data: data }, patch));
    const pt2 = table_('Presencas'); pres.forEach(function (m) { appendRow_(pt2, { ReuniaoID: rid, CelulaID: id, Data: data, MembroID: m }); });
    membresiaCheck_(id, pres);
    audit_(u.email, 'FREQUENCIA', id + ' ' + data + (fora ? ' (fora do dia)' : ''), 'OK'); return { reuniaoId: rid, presentes: pres.length, total: mem.length, foraDoDia: fora, atualizada: !!ex };
  });
}
function history_(d, u) {
  const id = cellOfAny_(u, d, ['hist', 'freq']), ativos = ativosDaCelula_(id), total = ativos.length;
  const nome = {}; table_('Membros').rows.forEach(function (m) { nome[m.MembroID] = m.Apelido || m.Simples || m.Nome; });
  const pres = {}, primeira = {}; table_('Presencas').rows.forEach(function (p) { if (p.CelulaID !== id) return; (pres[p.Data] = pres[p.Data] || []).push(p.MembroID); if (!primeira[p.MembroID] || p.Data < primeira[p.MembroID]) primeira[p.MembroID] = p.Data; });
  const l = table_('Reunioes').rows.filter(function (r) { return r.CelulaID === id; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; });
  // quem fazia parte da célula NAQUELA reunião: lista gravada na época (Elenco); nas antigas, quem já tinha aparecido até a data. Assim entrar gente nova não muda o % do passado.
  const elencoDe = function (r, ids) { const e = r.Elenco ? String(r.Elenco).split(',').filter(String) : Object.keys(primeira).filter(function (m) { return primeira[m] <= r.Data; }); ids.forEach(function (m) { if (e.indexOf(m) < 0) e.push(m); }); return e; };
  const saidas = table_('Saidas').rows.filter(function (x) { return x.CelulaID === id && x.Status === 'autorizado'; });
  const lista = l.map(function (r) {
    const ids = pres[r.Data] || [], el = elencoDe(r, ids), aus = el.filter(function (m) { return ids.indexOf(m) < 0; }).map(function (m) { return nome[m] || '?'; });
    return { data: r.Data, dia: r.Data ? diaDe_(r.Data) : '', presentes: ids.length, total: Math.max(1, el.length), deus: r.PresencaDeDeus === '1', foraDoDia: r.ForaDoDia === '1', nomesPresentes: ids.map(function (i) { return nome[i] || '?'; }), nomesAusentes: aus };
  });
  const media = lista.length ? Math.round(lista.reduce(function (a, r) { return a + Math.min(1, r.presentes / r.total); }, 0) / lista.length * 100) : 0;
  return { reunioes: lista, indicadores: { participantes: total, exParticipantes: saidas.length, exNomes: saidas.map(function (x) { return { nome: nome[x.MembroID] || '?', data: x.DataDecisao, motivo: x.Motivo }; }), reunioes: l.length, presencaDeDeus: l.filter(function (r) { return r.PresencaDeDeus === '1'; }).length, mediaPresenca: media } };
}
function indicators_(d, u) {
  const id = cellOf_(u, d, 'ver', 'ind', 'ver'), mem = table_('Membros').rows.filter(function (m) { return m.CelulaID === id; }), ids = {}; mem.forEach(function (m) { ids[m.MembroID] = m.Apelido || m.Simples || m.Nome; });
  const cursos = {}; table_('Cursos').rows.forEach(function (c) { cursos[c.CursoID] = c.Nome; });
  const ev = {}; table_('Eventos').rows.forEach(function (e) { ev[e.EventoID] = e.Titulo; });
  const byC = {}, byE = {};
  table_('Matriculas').rows.forEach(function (r) { if (ids[r.MembroID] && cursos[r.CursoID]) (byC[cursos[r.CursoID]] = byC[cursos[r.CursoID]] || []).push(ids[r.MembroID]); });
  table_('Inscricoes').rows.forEach(function (r) { if (ids[r.MembroID] && ev[r.EventoID]) (byE[ev[r.EventoID]] = byE[ev[r.EventoID]] || []).push(ids[r.MembroID]); });
  return { cursos: byC, eventos: byE };
}
function getPapeis_(d, u) { const id = cellOf_(u, d, 'ver', 'papeis', 'ver'); return table_('Papeis').rows.filter(function (r) { return r.CelulaID === id; }).map(function (r) { return { membroId: r.MembroID, papel: r.Papel }; }); }
function savePapeis_(d, u) {
  return withLock_(function () {
    const id = cellOf_(u, d, 'gerir', 'papeis', 'editar'), t = table_('Papeis'); for (let i = t.rows.length - 1; i >= 0; i--) if (t.rows[i].CelulaID === id) t.sh.deleteRow(t.rows[i]._row);
    const mem = table_('Membros').rows.filter(function (m) { return m.CelulaID === id; }).map(function (m) { return m.MembroID; }), t2 = table_('Papeis');
    (d.itens || []).slice(0, 200).forEach(function (x) { if (mem.indexOf(x.membroId) >= 0) appendRow_(t2, { CelulaID: id, MembroID: x.membroId, Papel: clip_(x.papel, 60) }); }); return { ok: true };
  });
}
function addPrayer_(d, u) {
  const texto = clip_(d.texto, 1000); if (!texto) throw new ApiError('VALIDATION', 'Escreva o pedido de oração.');
  const id = prayerCell_(u, d, 'editar'); if (!id) throw new ApiError('VALIDATION', 'Você ainda não está em uma célula.');
  appendRow_(table_('Oracoes'), { OracaoID: id_('O'), CelulaID: id, MembroID: u.membroId, Tema: clip_(d.tema, 80), Titulo: clip_(d.titulo, 100), Texto: texto, Data: now_() }); return { ok: true };
}
function prayerCell_(u, d, acao) { const id = clip_(d.celulaId, 30) || u.celulaId || celulaAtiva_(u); if (id) cellAccess_(u, id, 'ver', 'oracao', acao || 'ver'); return id; }
function listPrayers_(d, u) { const id = prayerCell_(u, d); if (!id) return []; return table_('Oracoes').rows.filter(function (o) { return o.CelulaID === id; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 50).map(function (o) { return { tema: o.Tema, titulo: o.Titulo, texto: o.Texto, data: o.Data }; }); }
function multiplicadas_(membroId, maeId) {
  const cs = table_('Celulas').rows.filter(function (c) { return c.Status !== 'Inativa'; }), minhas = cs.filter(function (c) { return c.LiderID === membroId; }).map(function (c) { return c.CelulaID; });
  return cs.filter(function (c) { return c.MaeID && minhas.indexOf(c.MaeID) >= 0; }).length + (maeId && minhas.indexOf(maeId) >= 0 ? 1 : 0);
}
// Regra: o líder precisa multiplicar X células para virar supervisor (X em Definições > Regras Células). Admin/pastor podem abrir exceção.
function checarSupervisor_(sid, d, u, maeId) {
  const X = Math.max(0, Number(cfgMap_().CelulasParaSupervisor) || 0); if (!sid || X <= 0) return;
  const n = multiplicadas_(sid, maeId); if (n >= X) return;
  if (d && d.excecao && can_(u, 'celulas')) { audit_(u.email, 'EXCECAO_SUPERVISOR', sid + ' (' + n + '/' + X + ')', 'OK'); return; }
  const g = table_('Membros').rows.filter(function (m) { return m.MembroID === sid; })[0] || {};
  throw new ApiError('REGRA_SUPERVISOR', (g.Apelido || g.Simples || g.Nome || 'Essa pessoa') + ' multiplicou ' + n + ' de ' + X + ' células. Para designar como supervisor mesmo assim, abra uma exceção.');
}
function canOrg_(u) { return can_(u, 'celulas') || ehSupervisor_(u); }
function orgVer_(u) { if (canOrg_(u)) return true; const ids = (u.lidera || []).concat(u.treina || [], u.celulaId ? [u.celulaId] : []), cs = table_('Celulas').rows; return ids.some(function (id) { const c = cs.filter(function (r) { return r.CelulaID === id; })[0]; return !!c && celPerm_(u, c, 'org', 'ver'); }); }
function orgTree_(d, u) {
  if (!orgVer_(u)) throw new ApiError('FORBIDDEN', 'O seu perfil não tem acesso ao organograma.');
  const mem = {}; table_('Membros').rows.forEach(function (m) { mem[m.MembroID] = m.Apelido || m.Simples || m.Nome; });
  const qtd = {}; table_('Membros').rows.forEach(function (m) { if (m.CelulaID && m.Status !== 'Inativo') qtd[m.CelulaID] = (qtd[m.CelulaID] || 0) + 1; });
  const full = can_(u, 'celulas'), cs = table_('Celulas').rows.filter(function (c) { return c.Status !== 'Inativa'; }), g = {};
  cs.forEach(function (c) { const k = c.SupervisorID || '-'; (g[k] = g[k] || []).push({ id: c.CelulaID, nome: c.Nome, dia: c.Dia, inicio: c.Inicio, lider: mem[c.LiderID] || '', liderId: c.LiderID || '', treinamento: mem[c.TreinamentoID] || '', membros: qtd[c.CelulaID] || 0, maeId: c.MaeID || '', editavel: full || (c.SupervisorID === u.membroId && celPerm_(u, c, 'org', 'editar')) }); });
  const grupos = Object.keys(g).map(function (k) { return { supervisorId: k === '-' ? '' : k, supervisor: k === '-' ? 'Sem supervisor' : mem[k] || 'Supervisor', celulas: g[k] }; });
  const pessoas = table_('Usuarios').rows.filter(function (x) { return x.Status !== 'Inativo' && x.MembroID; }).map(function (x) { return { id: x.MembroID, nome: mem[x.MembroID] || x.Email }; }).sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
  return { grupos: grupos, pessoas: pessoas, layout: jparse_(cfgMap_().OrgLayout, {}), admin: full };
}
function orgMove_(d, u) {
  return withLock_(function () {
    if (!canOrg_(u)) throw new ApiError('FORBIDDEN', 'Só supervisores e administradores alteram o organograma.');
    const t = table_('Celulas'), c = t.rows.filter(function (x) { return x.CelulaID === clip_(d.celulaId, 30) && x.Status !== 'Inativa'; })[0]; if (!c) throw new ApiError('NOT_FOUND', 'Célula não encontrada.');
    if (!can_(u, 'celulas') && (c.SupervisorID !== u.membroId || !celPerm_(u, c, 'org', 'editar'))) throw new ApiError('FORBIDDEN', 'Você só move células que você supervisiona.');
    const p = {};
    if (d.supervisorId !== undefined) { const sid = clip_(d.supervisorId, 30); if (sid) getMember_(sid); if (sid && sid !== c.SupervisorID) checarSupervisor_(sid, d, u, d.maeId !== undefined ? clip_(d.maeId, 30) : c.MaeID); p.SupervisorID = sid; }
    if (d.maeId !== undefined) {
      const mid = clip_(d.maeId, 30);
      if (mid) { if (mid === c.CelulaID) throw new ApiError('VALIDATION', 'Uma célula não pode ser mãe dela mesma.'); const cel = {}; t.rows.forEach(function (x) { cel[x.CelulaID] = x; }); if (!cel[mid]) throw new ApiError('NOT_FOUND', 'Célula-mãe não encontrada.'); let k = cel[mid], n = 0; while (k && n < 60) { if (k.CelulaID === c.CelulaID) throw new ApiError('VALIDATION', 'Isso criaria um ciclo entre as células.'); k = k.MaeID ? cel[k.MaeID] : null; n++; } }
      p.MaeID = mid;
    }
    if (!Object.keys(p).length) throw new ApiError('VALIDATION', 'Nada para alterar.');
    writeRow_(t, c._row, p); audit_(u.email, 'ORGANOGRAMA_MOVE', c.CelulaID + ' ' + JSON.stringify(p), 'OK'); return { ok: true };
  });
}
function saveOrgLayout_(d, u) {
  return withLock_(function () {
    if (!canOrg_(u)) throw new ApiError('FORBIDDEN', 'Só supervisores e administradores alteram o organograma.');
    const src = d.layout && typeof d.layout === 'object' ? d.layout : {}, out = {}; Object.keys(src).slice(0, 400).forEach(function (k) { const v = src[k]; if (!/^[A-Za-z0-9:_-]{1,40}$/.test(k) || !v) return; const x = Math.round(Number(v.x)), y = Math.round(Number(v.y)); if (isFinite(x) && isFinite(y) && Math.abs(x) < 20000 && Math.abs(y) < 20000) out[k] = { x: x, y: y }; });
    const t = table_('Config'), r = t.rows.filter(function (x) { return x.Chave === 'OrgLayout'; })[0], v = JSON.stringify(out); if (r) writeRow_(t, r._row, { Valor: v }); else appendRow_(t, { Chave: 'OrgLayout', Valor: v });
    return { ok: true };
  });
}

/* ===== aprovações (central única), membresia por frequência e uso da plataforma ===== */
function stN_(s) { return s === 'novo' ? 'pendente' : s; }
function freqMembro_() { const n = Number(cfgMap_().FrequenciasParaMembro); return isFinite(n) && n >= 1 && n <= 50 ? Math.round(n) : 4; }
function interessesDe_(membroId) {
  const mi = {}; table_('Ministerios').rows.forEach(function (m) { mi[m.MinisterioID] = m.Nome; });
  return table_('Interesses').rows.filter(function (i) { return i.MembroID === membroId; }).map(function (i) { return { ministerio: mi[i.MinisterioID] || '', status: stN_(i.Status), data: i.Data, dataDecisao: i.DataDecisao }; });
}
function membresiaDe_(membroId) { const b = table_('Membresias').rows.filter(function (x) { return x.MembroID === membroId; })[0]; return b ? { status: b.Status, frequencias: Number(b.Frequencias || 0), data: b.Data, dataDecisao: b.DataDecisao } : null; }
// visitante que frequentou N reuniões seguidas da célula gera um pedido para o supervisor aprovar como membro
function membresiaCheck_(id, pres) {
  const N = freqMembro_(), mems = table_('Membros').rows, mt = table_('Membresias');
  const reun = table_('Reunioes').rows.filter(function (r) { return r.CelulaID === id; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; });
  const pset = {}; table_('Presencas').rows.forEach(function (p) { if (p.CelulaID === id) pset[p.Data + '|' + p.MembroID] = 1; });
  pres.forEach(function (mid) {
    const m = mems.filter(function (x) { return x.MembroID === mid; })[0]; if (!m || m.EhMembro === '1' || m.Status === 'Inativo') return;
    if (mt.rows.some(function (r) { return r.MembroID === mid; })) return;
    let n = 0; for (let i = 0; i < reun.length; i++) { if (pset[reun[i].Data + '|' + mid]) n++; else break; }
    if (n >= N) { appendRow_(mt, { MembresiaID: id_('MB'), MembroID: mid, CelulaID: id, Frequencias: String(n), Status: 'pendente', Data: now_() }); mt.rows.push({ MembroID: mid }); }
  });
}
function aprovItens_(u) {
  const mem = {}; table_('Membros').rows.forEach(function (m) { mem[m.MembroID] = m; });
  const nm = function (id) { return id && mem[id] ? (mem[id].Nome || '') : ''; };
  const cel = {}; table_('Celulas').rows.forEach(function (c) { cel[c.CelulaID] = c; });
  const mi = {}; table_('Ministerios').rows.forEach(function (m) { mi[m.MinisterioID] = m.Nome; });
  const meu = function (c) { return !!c && !!u.membroId && c.SupervisorID === u.membroId; }, adm = can_(u, 'transf'), min = can_(u, 'min');
  const logs = {}; table_('AprovLog').rows.forEach(function (l) { const k = l.Tipo + ':' + l.RefID; (logs[k] = logs[k] || []).push({ acao: l.Acao, por: nm(l.Por) || '—', data: l.Data, motivo: l.Motivo || '' }); });
  const out = [];
  const add = function (o) {
    o.hist = (logs[o.tipo + ':' + o.id] || []).sort(function (a, b) { return a.data < b.data ? -1 : 1; }); o.minha = !!o.decididoPorId && o.decididoPorId === u.membroId;
    o.podeReverter = o.status !== 'pendente' && (o.minha || o.admOk); delete o.admOk;
    if (o.status !== 'pendente') { const dec = o.hist.filter(function (h) { return h.acao === 'autorizado' || h.acao === 'negado'; }).pop(); o.motivoDecisao = dec ? dec.motivo : ''; }
    else if (out.length < 60) o.resumo = resumoPessoa_(o.pessoaId, o.ctxCel);
    delete o.ctxCel; out.push(o);
  };
  table_('Transferencias').rows.forEach(function (t) {
    if (!(adm || meu(cel[t.ParaCelulaID]) || meu(cel[t.DeCelulaID]))) return;
    add({ tipo: 'transferencia', id: t.TransfID, pessoaId: t.MembroID, titulo: 'Transferência de ' + nm(t.MembroID), detalhe: ((cel[t.DeCelulaID] || {}).Nome || '?') + ' para ' + ((cel[t.ParaCelulaID] || {}).Nome || '?'), status: t.Status, data: t.Data, solicitante: nm(t.SolicitadoPor), decididoPorId: t.DecididoPor, decididoPor: nm(t.DecididoPor), dataDecisao: t.DataDecisao, pode: adm || t.SolicitadoPor !== u.membroId, admOk: adm, ctxCel: t.DeCelulaID, ctx: { de: (cel[t.DeCelulaID] || {}).Nome || '', para: (cel[t.ParaCelulaID] || {}).Nome || '', motivo: t.Motivo || '' } });
  });
  table_('Saidas').rows.forEach(function (x) {
    if (!(adm || meu(cel[x.CelulaID]))) return;
    add({ tipo: 'saida', id: x.SaidaID, pessoaId: x.MembroID, titulo: nm(x.MembroID) + ' saiu da congregação', detalhe: 'Célula ' + ((cel[x.CelulaID] || {}).Nome || '?') + (x.Motivo ? ' · ' + x.Motivo : ''), status: x.Status, data: x.Data, solicitante: nm(x.SolicitadoPor), decididoPorId: x.DecididoPor, decididoPor: nm(x.DecididoPor), dataDecisao: x.DataDecisao, pode: adm || x.SolicitadoPor !== u.membroId, admOk: adm, ctxCel: x.CelulaID, ctx: { de: (cel[x.CelulaID] || {}).Nome || '', motivo: x.Motivo || '' } });
  });
  if (min) table_('Interesses').rows.forEach(function (i) {
    const m = mem[i.MembroID] || {};
    add({ tipo: 'interesse', id: i.InteresseID, pessoaId: i.MembroID, titulo: nm(i.MembroID) + ' quer participar do ministério ' + (mi[i.MinisterioID] || '?'), detalhe: m.Telefone ? 'Telefone ' + m.Telefone : 'Sem telefone cadastrado', status: stN_(i.Status), data: i.Data, solicitante: nm(i.MembroID), decididoPorId: i.DecididoPor, decididoPor: nm(i.DecididoPor), dataDecisao: i.DataDecisao, pode: true, admOk: true, ctx: { ministerio: mi[i.MinisterioID] || '' } });
  });
  table_('Membresias').rows.forEach(function (b) {
    if (!(adm || meu(cel[b.CelulaID]))) return; const m = mem[b.MembroID] || {};
    add({ tipo: 'membresia', id: b.MembresiaID, pessoaId: b.MembroID, titulo: nm(b.MembroID) + ' pode se tornar membro', detalhe: 'Frequentou ' + b.Frequencias + ' células seguidas em ' + ((cel[b.CelulaID] || {}).Nome || '?') + '. Revise o cadastro antes de aprovar.', status: b.Status, data: b.Data, solicitante: 'Sistema', decididoPorId: b.DecididoPor, decididoPor: nm(b.DecididoPor), dataDecisao: b.DataDecisao, pode: true, admOk: adm, ctxCel: b.CelulaID, ctx: { de: (cel[b.CelulaID] || {}).Nome || '', frequencias: Number(b.Frequencias || 0) },
      revisar: { nome: m.Nome, telefone: m.Telefone, email: m.Email, nascimento: m.Nascimento, endereco: [m.Endereco, m.Bairro, m.Cidade].filter(String).join(', ') } });
  });
  return out.sort(function (a, b) { return a.data < b.data ? 1 : -1; });
}
function listApprovals_(d, u) { const l = aprovItens_(u).slice(0, 300); return { itens: l, pendentes: l.filter(function (x) { return x.status === 'pendente' && x.pode; }).length }; }
function logAprov_(tipo, id, acao, u, motivo) { appendRow_(table_('AprovLog'), { Tipo: tipo, RefID: id, Acao: acao, Por: u.membroId, Data: now_(), Motivo: clip_(motivo, 300) }); }
// Visão geral da pessoa para quem decide: tempo de casa, batismo, presença, célula, cursos, ministérios e eventos
const RESUMO_CACHE_ = {};
function resumoPessoa_(mid, celulaId) {
  if (!mid) return null; const m = table_('Membros').rows.filter(function (x) { return x.MembroID === mid; })[0]; if (!m) return null;
  const cs = table_('Celulas').rows, cel = function (id) { return id ? cs.filter(function (c) { return c.CelulaID === id; })[0] : null; };
  const atual = cel(m.CelulaID), ref = celulaId || m.CelulaID, pct = ref ? pctMembro_(mid, ref) : null, lim = Number(cfgMap_().FrequentadorPct) || 70;
  const nomes = function (tab, idCol, nmCol) { const o = {}; table_(tab).rows.forEach(function (r) { o[r[idCol]] = r[nmCol]; }); return o; };
  const cu = nomes('Cursos', 'CursoID', 'Nome'), mi = nomes('Ministerios', 'MinisterioID', 'Nome'), ev = nomes('Eventos', 'EventoID', 'Titulo');
  const ints = table_('Interesses').rows.filter(function (i) { return i.MembroID === mid; });
  return { nome: m.Nome, membroDesde: String(m.CriadoEm || '').slice(0, 10), ehMembro: m.EhMembro === '1', batizado: m.Batizado === 'sim' || !!m.DataBatismo, dataBatismo: m.DataBatismo || '', celula: atual ? atual.Nome : '', pct: pct, tipo: pct === null ? '' : (pct < lim ? 'Frequentador' : 'Membro'),
    cursos: table_('Matriculas').rows.filter(function (r) { return r.MembroID === mid && cu[r.CursoID]; }).slice(0, 6).map(function (r) { return cu[r.CursoID]; }),
    ministerios: ints.filter(function (i) { return stN_(i.Status) === 'autorizado' && mi[i.MinisterioID]; }).map(function (i) { return mi[i.MinisterioID]; }),
    ministeriosPendentes: ints.filter(function (i) { return stN_(i.Status) === 'pendente' && mi[i.MinisterioID]; }).map(function (i) { return mi[i.MinisterioID]; }),
    eventos: table_('Inscricoes').rows.filter(function (r) { return r.MembroID === mid && ev[r.EventoID]; }).slice(0, 5).map(function (r) { return ev[r.EventoID]; }) };
}
/* ===== notificações (antes "alertas"): resultado das decisões vai para quem pediu e para o líder ===== */
function notify_(mid, tipo, titulo, texto, ref) { if (!mid) return; appendRow_(table_('Notificacoes'), { NotifID: id_('NT'), MembroID: mid, Tipo: tipo, Titulo: clip_(titulo, 160), Texto: clip_(texto, 400), Ref: clip_(ref, 40), Data: now_(), Lida: '0' }); }
function listNotifications_(d, u) {
  const l = table_('Notificacoes').rows.filter(function (n) { return n.MembroID === u.membroId; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 60);
  return { itens: l.map(function (n) { return { id: n.NotifID, tipo: n.Tipo, titulo: n.Titulo, texto: n.Texto, data: n.Data, lida: n.Lida === '1' }; }), naoLidas: l.filter(function (n) { return n.Lida !== '1'; }).length };
}
function readNotifications_(d, u) {
  return withLock_(function () {
    const t = table_('Notificacoes'), ids = Array.isArray(d.ids) ? d.ids : null;
    t.rows.forEach(function (n) { if (n.MembroID === u.membroId && n.Lida !== '1' && (!ids || ids.indexOf(n.NotifID) >= 0)) writeRow_(t, n._row, { Lida: '1' }); });
    return listNotifications_({}, u);
  });
}
function notifyDecisao_(tipo, id, status, motivo, u) {
  const cs = table_('Celulas').rows, lider = function (cid) { const c = cs.filter(function (x) { return x.CelulaID === cid; })[0]; return c ? c.LiderID : ''; };
  const nome = function (mid) { const m = table_('Membros').rows.filter(function (x) { return x.MembroID === mid; })[0]; return m ? (m.Apelido || m.Simples || m.Nome) : '—'; };
  let dest = [], pessoa = '', rot = '';
  if (tipo === 'transferencia') { const r = table_('Transferencias').rows.filter(function (x) { return x.TransfID === id; })[0]; if (!r) return; pessoa = nome(r.MembroID); rot = 'Transferência de ' + pessoa; dest = [r.SolicitadoPor, lider(r.ParaCelulaID), lider(r.DeCelulaID)]; }
  else if (tipo === 'saida') { const r = table_('Saidas').rows.filter(function (x) { return x.SaidaID === id; })[0]; if (!r) return; pessoa = nome(r.MembroID); rot = 'Saída de ' + pessoa; dest = [r.SolicitadoPor, lider(r.CelulaID)]; }
  else if (tipo === 'interesse') { const r = table_('Interesses').rows.filter(function (x) { return x.InteresseID === id; })[0]; if (!r) return; const g = table_('Membros').rows.filter(function (x) { return x.MembroID === r.MembroID; })[0] || {}; pessoa = nome(r.MembroID); rot = 'Ministério de ' + pessoa; dest = [r.MembroID, lider(g.CelulaID)]; }
  else if (tipo === 'membresia') { const r = table_('Membresias').rows.filter(function (x) { return x.MembresiaID === id; })[0]; if (!r) return; pessoa = nome(r.MembroID); rot = 'Cadastro de membro de ' + pessoa; dest = [lider(r.CelulaID)]; }
  const seen = {}; dest.forEach(function (m) { if (!m || m === u.membroId || seen[m]) return; seen[m] = 1; notify_(m, 'aprovacao', rot + (status === 'autorizado' ? ' aprovada' : ' recusada'), (motivo ? 'Motivo: ' + motivo : 'Sem motivo informado.') + ' · por ' + nome(u.membroId), tipo + ':' + id); });
}
function decideInterest_(d, u) {
  return withLock_(function () {
    if (!can_(u, 'min')) throw new ApiError('FORBIDDEN', 'Sem permissão para aprovar ministérios.');
    const t = table_('Interesses'), r = t.rows.filter(function (x) { return x.InteresseID === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Pedido não encontrado.'); if (stN_(r.Status) !== 'pendente') throw new ApiError('VALIDATION', 'Esse pedido já foi decidido.');
    const st = d.decisao === 'autorizado' ? 'autorizado' : 'negado'; writeRow_(t, r._row, { Status: st, DecididoPor: u.membroId, DataDecisao: now_() }); audit_(u.email, 'INTERESSE_' + st.toUpperCase(), r.InteresseID, 'OK'); return { status: st };
  });
}
function decideMembership_(d, u) {
  return withLock_(function () {
    const t = table_('Membresias'), r = t.rows.filter(function (x) { return x.MembresiaID === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Pedido não encontrado.'); if (r.Status !== 'pendente') throw new ApiError('VALIDATION', 'Esse pedido já foi decidido.');
    const c = table_('Celulas').rows.filter(function (x) { return x.CelulaID === r.CelulaID; })[0] || {};
    if (!(can_(u, 'transf') || (c.SupervisorID && c.SupervisorID === u.membroId))) throw new ApiError('FORBIDDEN', 'Só o supervisor responsável decide.');
    const st = d.decisao === 'autorizado' ? 'autorizado' : 'negado'; writeRow_(t, r._row, { Status: st, DecididoPor: u.membroId, DataDecisao: now_() });
    if (st === 'autorizado') { const g = getMember_(r.MembroID); writeRow_(g.t, g.m._row, { EhMembro: '1' }); }
    audit_(u.email, 'MEMBRESIA_' + st.toUpperCase(), r.MembresiaID, 'OK'); return { status: st };
  });
}
function decideApproval_(d, u) {
  const tipo = String(d.tipo || ''), mot = clip_(d.motivo, 300); let r;
  if (d.decisao !== 'autorizado' && !mot) throw new ApiError('VALIDATION', 'Informe o motivo da recusa. Ele é enviado ao líder como notificação.');
  if (tipo === 'transferencia') r = decideTransfer_(d, u); else if (tipo === 'saida') r = decideExit_(d, u); else if (tipo === 'interesse') r = decideInterest_(d, u); else if (tipo === 'membresia') r = decideMembership_(d, u); else throw new ApiError('VALIDATION', 'Tipo de pedido inválido.');
  logAprov_(tipo, d.id, r.status, u, mot);
  try { notifyDecisao_(tipo, d.id, r.status, mot, u); } catch (e) { /* a decisão já foi gravada */ }
  return r;
}
// volta o pedido ao estado anterior (pendente) e desfaz o efeito da decisão, para decidir de novo
function undoApproval_(d, u) {
  return withLock_(function () {
    const tipo = String(d.tipo || ''), cfgT = { transferencia: ['Transferencias', 'TransfID'], saida: ['Saidas', 'SaidaID'], interesse: ['Interesses', 'InteresseID'], membresia: ['Membresias', 'MembresiaID'] }[tipo]; if (!cfgT) throw new ApiError('VALIDATION', 'Tipo de pedido inválido.');
    const t = table_(cfgT[0]), r = t.rows.filter(function (x) { return x[cfgT[1]] === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Pedido não encontrado.');
    const item = aprovItens_(u).filter(function (x) { return x.tipo === tipo && x.id === d.id; })[0];
    if (!item) throw new ApiError('FORBIDDEN', 'Você não tem acesso a este pedido.'); if (item.status === 'pendente') throw new ApiError('VALIDATION', 'Esse pedido ainda não foi decidido.'); if (!item.podeReverter) throw new ApiError('FORBIDDEN', 'Só quem decidiu ou a administração pode desfazer.');
    const st = stN_(r.Status);
    if (st === 'autorizado') {
      if (tipo === 'transferencia') { const g = getMember_(r.MembroID); if (g.m.CelulaID !== r.ParaCelulaID) throw new ApiError('VALIDATION', 'A pessoa já mudou de célula depois dessa decisão. Ajuste manualmente.'); writeRow_(g.t, g.m._row, { CelulaID: r.DeCelulaID }); }
      if (tipo === 'saida') { const g = getMember_(r.MembroID); if (g.m.CelulaID) throw new ApiError('VALIDATION', 'A pessoa já foi incluída em outra célula depois dessa decisão. Ajuste manualmente.'); writeRow_(g.t, g.m._row, { CelulaID: r.CelulaID, Status: 'Ativo', DataSaida: '' }); }
      if (tipo === 'membresia') { const g = getMember_(r.MembroID); writeRow_(g.t, g.m._row, { EhMembro: '0' }); }
    }
    writeRow_(t, r._row, { Status: tipo === 'interesse' ? 'novo' : 'pendente', DecididoPor: '', DataDecisao: '' });
    logAprov_(tipo, d.id, 'revertido', u); audit_(u.email, 'APROVACAO_REVERTIDA', tipo + ':' + d.id, 'OK'); return { status: 'pendente' };
  });
}
function upsertUso_(mes, membroId, tela, seg, vis) {
  const t = table_('Uso'), r = t.rows.filter(function (x) { return x.Mes === mes && x.MembroID === membroId && x.Tela === tela; })[0];
  if (r) writeRow_(t, r._row, { Segundos: String(Number(r.Segundos || 0) + seg), Visitas: String(Number(r.Visitas || 0) + vis) }); else appendRow_(t, { Mes: mes, MembroID: membroId, Tela: tela, Segundos: String(seg), Visitas: String(vis) });
}
function track_(d, u) {
  return withLock_(function () {
    const itens = (Array.isArray(d.itens) ? d.itens : [d]).slice(0, 25), mes = today_().slice(0, 7); let n = 0;
    itens.forEach(function (x) {
      const tela = clip_(x.tela, 30); if (!/^[a-z0-9_:-]+$/i.test(tela) || tela.charAt(0) === '_') return;
      const seg = Math.max(0, Math.min(900, Math.round(Number(x.seg) || 0))), vis = x.visita ? Math.min(20, Math.round(Number(x.visita)) || 1) : 0; if (!seg && !vis) return;
      upsertUso_(mes, u.membroId, tela, seg, vis); n++;
    });
    return { ok: true, n: n };
  });
}
function usageReport_(d, u) {
  const mes = String(d.mes || today_().slice(0, 7)), todos = mes === 'todos';
  const us = table_('Usuarios').rows, mem = {}; table_('Membros').rows.forEach(function (m) { mem[m.MembroID] = m; });
  const por = {}, glob = {}; let total = 0, totalVis = 0;
  table_('Uso').rows.forEach(function (r) {
    if (!todos && r.Mes !== mes) return; const seg = Number(r.Segundos || 0), vis = Number(r.Visitas || 0), o = por[r.MembroID] = por[r.MembroID] || { logins: 0, seg: 0, telas: {} };
    if (r.Tela === '_login') { o.logins += vis; return; }
    o.seg += seg; o.telas[r.Tela] = (o.telas[r.Tela] || 0) + seg; const g = glob[r.Tela] = glob[r.Tela] || { seg: 0, vis: 0 }; g.seg += seg; g.vis += vis; total += seg; totalVis += vis;
  });
  const usuarios = us.map(function (x) { const o = por[x.MembroID] || { logins: 0, seg: 0, telas: {} }, m = mem[x.MembroID] || {};
    const top = Object.keys(o.telas).sort(function (a, b) { return o.telas[b] - o.telas[a]; }).slice(0, 3).map(function (k) { return { tela: k, segundos: o.telas[k] }; });
    return { nome: m.Nome || x.Email, email: x.Email, papel: x.Papel, logins: o.logins, segundos: o.seg, pct: total ? Math.round(o.seg / total * 1000) / 10 : 0, ultimoAcesso: x.UltimoAcesso, top: top }; })
    .sort(function (a, b) { return b.segundos - a.segundos || b.logins - a.logins; });
  const telas = Object.keys(glob).map(function (k) { return { tela: k, segundos: glob[k].seg, visitas: glob[k].vis, pct: total ? Math.round(glob[k].seg / total * 1000) / 10 : 0 }; }).sort(function (a, b) { return b.segundos - a.segundos; });
  return { mes: mes, totalSegundos: total, totalVisitas: totalVis, logins: usuarios.reduce(function (a, x) { return a + x.logins; }, 0), usuarios: usuarios, telas: telas };
}

/* ===== biblioteca virtual (PDFs no Google Drive) e testemunhos ===== */
const MAX_PDF_B64 = 14000000; // ~10 MB de PDF
function canMod_(u) { return can_(u, 'min') || can_(u, 'config'); }
function pastaLivros_() {
  const p = PropertiesService.getScriptProperties(), fid = p.getProperty('LIVROS_FOLDER');
  if (fid) { try { return DriveApp.getFolderById(fid); } catch (e) { /* recria */ } }
  const f = DriveApp.createFolder('Zoe - Biblioteca Virtual (PDFs)'); p.setProperty('LIVROS_FOLDER', f.getId()); return f;
}
function nomes_() { const o = {}; table_('Membros').rows.forEach(function (m) { o[m.MembroID] = m.Apelido || m.Simples || m.Nome; }); return o; }
function curtidas_(tipo, u) { const n = {}, eu = {}; table_('Curtidas').rows.forEach(function (c) { if (c.Tipo !== tipo) return; n[c.AlvoID] = (n[c.AlvoID] || 0) + 1; if (c.MembroID === u.membroId) eu[c.AlvoID] = 1; }); return { n: n, eu: eu }; }
function listBooks_(d, u) {
  const com = {}; table_('LivroComentarios').rows.forEach(function (c) { if (c.Status !== 'Removido') com[c.LivroID] = (com[c.LivroID] || 0) + 1; });
  const notas = {}; table_('LivroNotas').rows.forEach(function (r) { const o = notas[r.LivroID] = notas[r.LivroID] || { soma: 0, n: 0, minha: 0 }; o.soma += Number(r.Nota || 0); o.n++; if (r.MembroID === u.membroId) o.minha = Number(r.Nota || 0); });
  return table_('Livros').rows.filter(function (l) { return l.Status !== 'Removido'; }).sort(function (a, b) { return a.CriadoEm < b.CriadoEm ? 1 : -1; })
    .map(function (l) { const nt = notas[l.LivroID] || { soma: 0, n: 0, minha: 0 }; return { id: l.LivroID, titulo: l.Titulo, autor: l.Autor, descricao: l.Descricao, capa: l.Capa, tamanho: Number(l.Tamanho || 0), comentarios: com[l.LivroID] || 0, temPdf: !!l.ArquivoID, nota: nt.n ? Math.round(nt.soma / nt.n * 10) / 10 : 0, votos: nt.n, minhaNota: nt.minha }; });
}
function saveBook_(d, u) {
  if (!canMod_(u)) throw new ApiError('FORBIDDEN', 'Sem permissão para gerenciar a biblioteca.');
  return withLock_(function () {
    const titulo = clip_(d.titulo, 150); if (!titulo) throw new ApiError('VALIDATION', 'Informe o nome do livro.');
    const t = table_('Livros'), ex = d.id ? t.rows.filter(function (r) { return r.LivroID === d.id && r.Status !== 'Removido'; })[0] : null; if (d.id && !ex) throw new ApiError('NOT_FOUND', 'Livro não encontrado.');
    const patch = { Titulo: titulo, Autor: clip_(d.autor, 120), Descricao: clip_(d.descricao, 1500) };
    if (d.capa !== undefined && d.capa !== '__keep') patch.Capa = fotoOk_(d.capa);
    const pdf = String(d.pdf || '');
    if (!ex && !pdf) throw new ApiError('VALIDATION', 'Envie o arquivo PDF do livro.');
    if (pdf) {
      if (pdf.length > MAX_PDF_B64) throw new ApiError('VALIDATION', 'PDF muito grande (máximo ~10 MB).');
      if (pdf.slice(0, 5) !== 'JVBER') throw new ApiError('VALIDATION', 'O arquivo precisa ser um PDF.');
      const bytes = Utilities.base64Decode(pdf), file = pastaLivros_().createFile(Utilities.newBlob(bytes, 'application/pdf', titulo + '.pdf'));
      if (ex && ex.ArquivoID) { try { DriveApp.getFileById(ex.ArquivoID).setTrashed(true); } catch (e) { /* já removido */ } }
      patch.ArquivoID = file.getId(); patch.Tamanho = String(bytes.length);
    }
    if (ex) { writeRow_(t, ex._row, patch); audit_(u.email, 'LIVRO_EDITADO', ex.LivroID, 'OK'); return { id: ex.LivroID }; }
    const id = id_('L'); appendRow_(t, Object.assign({ LivroID: id, Status: 'Ativo', CriadoEm: now_() }, patch)); audit_(u.email, 'LIVRO_NOVO', id, 'OK'); return { id: id };
  });
}
function rateBook_(d, u) {
  return withLock_(function () {
    const nota = Math.round(Number(d.nota)); if (!isFinite(nota) || nota < 1 || nota > 10) throw new ApiError('VALIDATION', 'A nota vai de 1 a 10.');
    const id = clip_(d.livroId, 30); if (!table_('Livros').rows.some(function (l) { return l.LivroID === id && l.Status !== 'Removido'; })) throw new ApiError('NOT_FOUND', 'Livro não encontrado.');
    const t = table_('LivroNotas'), ex = t.rows.filter(function (r) { return r.LivroID === id && r.MembroID === u.membroId; })[0];
    if (ex) writeRow_(t, ex._row, { Nota: String(nota), Data: now_() }); else appendRow_(t, { LivroID: id, MembroID: u.membroId, Nota: String(nota), Data: now_() });
    const todas = t.rows.filter(function (r) { return r.LivroID === id && r.MembroID !== u.membroId; }).map(function (r) { return Number(r.Nota || 0); }).concat([nota]);
    return { nota: Math.round(todas.reduce(function (a, b) { return a + b; }, 0) / todas.length * 10) / 10, votos: todas.length, minhaNota: nota };
  });
}
// fotos de perfil sob demanda (evita repetir a imagem em cada comentário ou lista)
function fotos_(d, u) {
  const ids = (Array.isArray(d.ids) ? d.ids : []).slice(0, 25).map(function (x) { return clip_(x, 30); }), o = {}; ids.forEach(function (i) { o[i] = ''; });
  table_('Membros').rows.forEach(function (m) { if (Object.prototype.hasOwnProperty.call(o, m.MembroID)) o[m.MembroID] = m.Foto || ''; });
  return o;
}
function deleteBook_(d, u) {
  if (!canMod_(u)) throw new ApiError('FORBIDDEN', 'Sem permissão para gerenciar a biblioteca.');
  return withLock_(function () {
    const t = table_('Livros'), r = t.rows.filter(function (x) { return x.LivroID === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Livro não encontrado.');
    writeRow_(t, r._row, { Status: 'Removido' }); if (r.ArquivoID) { try { DriveApp.getFileById(r.ArquivoID).setTrashed(true); } catch (e) { /* ok */ } }
    audit_(u.email, 'LIVRO_REMOVIDO', r.LivroID, 'OK'); return { ok: true };
  });
}
function getBookFile_(d, u) {
  const r = table_('Livros').rows.filter(function (x) { return x.LivroID === d.id && x.Status !== 'Removido'; })[0]; if (!r || !r.ArquivoID) throw new ApiError('NOT_FOUND', 'Livro não encontrado.');
  return { pdf: Utilities.base64Encode(DriveApp.getFileById(r.ArquivoID).getBlob().getBytes()) };
}
function feed_(rows, tipo, nm, lk, u, idc, extra) {
  return rows.map(function (r) { const o = { id: r[idc], membroId: r.MembroID, autor: nm[r.MembroID] || 'Membro', meu: r.MembroID === u.membroId, data: r.Data, texto: r.Texto, curtidas: lk.n[r[idc]] || 0, curti: !!lk.eu[r[idc]] }; return extra(o, r); });
}
function listBookComments_(d, u) {
  const nm = nomes_(), lk = curtidas_('comentario', u), id = clip_(d.livroId, 30);
  const rows = table_('LivroComentarios').rows.filter(function (c) { return c.LivroID === id && c.Status !== 'Removido'; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 200);
  return feed_(rows, 'comentario', nm, lk, u, 'ComentarioID', function (o, r) { o.pagina = r.Pagina; return o; });
}
function addBookComment_(d, u) {
  return withLock_(function () {
    const id = clip_(d.livroId, 30), texto = clip_(d.texto, 1500); if (!texto) throw new ApiError('VALIDATION', 'Escreva seu comentário.');
    if (!table_('Livros').rows.some(function (l) { return l.LivroID === id && l.Status !== 'Removido'; })) throw new ApiError('NOT_FOUND', 'Livro não encontrado.');
    const pg = clip_(d.pagina, 6); if (pg && !/^\d{1,5}$/.test(pg)) throw new ApiError('VALIDATION', 'Página inválida.');
    const cid = id_('LC'); appendRow_(table_('LivroComentarios'), { ComentarioID: cid, LivroID: id, MembroID: u.membroId, Texto: texto, Pagina: pg, Data: now_(), Status: 'Ativo' }); return { id: cid };
  });
}
function deleteBookComment_(d, u) {
  return withLock_(function () {
    const t = table_('LivroComentarios'), r = t.rows.filter(function (x) { return x.ComentarioID === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Comentário não encontrado.');
    if (r.MembroID !== u.membroId && !canMod_(u)) throw new ApiError('FORBIDDEN', 'Só o autor ou a administração apaga.');
    writeRow_(t, r._row, { Status: 'Removido' }); return { ok: true };
  });
}
function listTestimonies_(d, u) {
  const nm = nomes_(), lk = curtidas_('testemunho', u);
  const rows = table_('Testemunhos').rows.filter(function (t) { return t.Status !== 'Removido'; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 100);
  return feed_(rows, 'testemunho', nm, lk, u, 'TestemunhoID', function (o, r) { o.titulo = r.Titulo; return o; });
}
function addTestimony_(d, u) {
  return withLock_(function () {
    const texto = clip_(d.texto, 2000); if (texto.length < 10) throw new ApiError('VALIDATION', 'Conte seu testemunho com um pouco mais de detalhes.');
    const id = id_('TE'); appendRow_(table_('Testemunhos'), { TestemunhoID: id, MembroID: u.membroId, Titulo: clip_(d.titulo, 100), Texto: texto, Data: now_(), Status: 'Ativo' }); audit_(u.email, 'TESTEMUNHO', id, 'OK'); return { id: id };
  });
}
function deleteTestimony_(d, u) {
  return withLock_(function () {
    const t = table_('Testemunhos'), r = t.rows.filter(function (x) { return x.TestemunhoID === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Testemunho não encontrado.');
    if (r.MembroID !== u.membroId && !canMod_(u)) throw new ApiError('FORBIDDEN', 'Só o autor ou a administração apaga.');
    writeRow_(t, r._row, { Status: 'Removido' }); audit_(u.email, 'TESTEMUNHO_REMOVIDO', r.TestemunhoID, 'OK'); return { ok: true };
  });
}
function toggleLike_(d, u) {
  return withLock_(function () {
    const tipo = d.tipo === 'testemunho' ? 'testemunho' : d.tipo === 'comentario' ? 'comentario' : ''; if (!tipo) throw new ApiError('VALIDATION', 'Tipo inválido.');
    const alvo = clip_(d.alvoId, 30), t = table_('Curtidas'), ex = t.rows.filter(function (c) { return c.Tipo === tipo && c.AlvoID === alvo && c.MembroID === u.membroId; })[0];
    if (ex) { t.sh.deleteRow(ex._row); } else appendRow_(t, { Tipo: tipo, AlvoID: alvo, MembroID: u.membroId, Data: now_() });
    return { curti: !ex };
  });
}

/* ===== presença: pessoa já está em outra célula? transferência, novo cadastro ===== */
function lookup_(d, u) {
  const id = cellOf_(u, d, 'presenca', 'pres', 'editar'), q = norm_(d.nome); if (q.length < 3) throw new ApiError('VALIDATION', 'Digite ao menos 3 letras do nome.');
  const cels = {}; table_('Celulas').rows.forEach(function (c) { cels[c.CelulaID] = c.Nome; });
  return table_('Membros').rows.filter(function (m) { return norm_(m.Nome + ' ' + m.Apelido).indexOf(q) >= 0; }).slice(0, 8).map(function (m) { return { id: m.MembroID, nome: m.Nome, situacao: m.CelulaID === id ? 'aqui' : m.CelulaID ? 'outra' : 'sem', celula: cels[m.CelulaID] || '' }; });
}
function requestTransfer_(d, u) {
  return withLock_(function () {
    const para = cellOf_(u, d, 'transf'), g = getMember_(clip_(d.membroId, 30)); if (g.m.CelulaID === para) throw new ApiError('VALIDATION', 'Essa pessoa já está na sua célula.');
    const t = table_('Transferencias'); if (t.rows.some(function (r) { return r.MembroID === g.m.MembroID && r.ParaCelulaID === para && r.Status === 'pendente'; })) throw new ApiError('VALIDATION', 'Já existe um pedido pendente.');
    if (!g.m.CelulaID) { writeRow_(g.t, g.m._row, { CelulaID: para, Status: 'Ativo', DataSaida: '' }); audit_(u.email, 'ENTRADA_CELULA', g.m.MembroID + '>' + para, 'OK'); return { status: 'incluido' }; }
    appendRow_(t, { TransfID: id_('T'), MembroID: g.m.MembroID, DeCelulaID: g.m.CelulaID, ParaCelulaID: para, SolicitadoPor: u.membroId, Status: 'pendente', Data: now_(), Motivo: clip_(d.motivo, 300) });
    audit_(u.email, 'TRANSFERENCIA_PEDIDA', g.m.MembroID, 'OK'); return { status: 'pendente' };
  });
}
function listTransfers_(d, u) {
  const mem = {}; table_('Membros').rows.forEach(function (m) { mem[m.MembroID] = m.Nome; }); const cel = {}; table_('Celulas').rows.forEach(function (c) { cel[c.CelulaID] = c; });
  if (!can_(u, 'transf') && !ehSupervisor_(u)) throw new ApiError('FORBIDDEN', 'Só supervisores e a administração veem as transferências.');
  const meu = function (c) { return c && c.SupervisorID === u.membroId; };
  const tr = table_('Transferencias').rows.filter(function (t) { return can_(u, 'transf') || meu(cel[t.ParaCelulaID]) || meu(cel[t.DeCelulaID]); })
    .map(function (t) { return { tipo: 'transferencia', id: t.TransfID, nome: mem[t.MembroID], de: (cel[t.DeCelulaID] || {}).Nome, para: (cel[t.ParaCelulaID] || {}).Nome, status: t.Status, data: t.Data }; });
  const sd = table_('Saidas').rows.filter(function (x) { return can_(u, 'transf') || meu(cel[x.CelulaID]); })
    .map(function (x) { return { tipo: 'saida', id: x.SaidaID, nome: mem[x.MembroID], de: (cel[x.CelulaID] || {}).Nome, para: '', motivo: x.Motivo, status: x.Status, data: x.Data }; });
  return tr.concat(sd).sort(function (a, b) { return a.data < b.data ? 1 : -1; }).slice(0, 100);
}
function requestExit_(d, u) {
  return withLock_(function () {
    const cid = cellOf_(u, d, 'transf'), g = getMember_(clip_(d.membroId, 30)); if (g.m.CelulaID !== cid || g.m.Status === 'Inativo') throw new ApiError('VALIDATION', 'Essa pessoa não está na sua célula.');
    const t = table_('Saidas'); if (t.rows.some(function (r) { return r.MembroID === g.m.MembroID && r.CelulaID === cid && r.Status === 'pendente'; })) throw new ApiError('VALIDATION', 'Já existe um pedido de saída pendente para essa pessoa.');
    appendRow_(t, { SaidaID: id_('S'), MembroID: g.m.MembroID, CelulaID: cid, Motivo: clip_(d.motivo, 300) || 'Saiu da congregação', SolicitadoPor: u.membroId, Status: 'pendente', Data: now_() });
    audit_(u.email, 'SAIDA_PEDIDA', g.m.MembroID, 'OK'); return { status: 'pendente' };
  });
}
function decideExit_(d, u) {
  return withLock_(function () {
    const t = table_('Saidas'), r = t.rows.filter(function (x) { return x.SaidaID === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Pedido não encontrado.'); if (r.Status !== 'pendente') throw new ApiError('VALIDATION', 'Esse pedido já foi decidido.');
    const c = table_('Celulas').rows.filter(function (x) { return x.CelulaID === r.CelulaID; })[0] || {};
    if (!(can_(u, 'transf') || (c.SupervisorID && c.SupervisorID === u.membroId))) throw new ApiError('FORBIDDEN', 'Só o supervisor responsável decide.');
    if (r.SolicitadoPor === u.membroId && !can_(u, 'transf')) throw new ApiError('FORBIDDEN', 'Esse pedido precisa ser decidido por outro supervisor ou pela administração.');
    const st = d.decisao === 'autorizado' ? 'autorizado' : 'negado'; writeRow_(t, r._row, { Status: st, DecididoPor: u.membroId, DataDecisao: now_() });
    if (st === 'autorizado') { const g = getMember_(r.MembroID); if (g.m.CelulaID === r.CelulaID) writeRow_(g.t, g.m._row, { CelulaID: '', Status: 'Inativo', DataSaida: today_() }); }
    audit_(u.email, 'SAIDA_' + st.toUpperCase(), r.SaidaID, 'OK'); return { status: st };
  });
}
function decideTransfer_(d, u) {
  return withLock_(function () {
    const t = table_('Transferencias'), r = t.rows.filter(function (x) { return x.TransfID === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Pedido não encontrado.'); if (r.Status !== 'pendente') throw new ApiError('VALIDATION', 'Esse pedido já foi decidido.');
    const cel = {}; table_('Celulas').rows.forEach(function (c) { cel[c.CelulaID] = c; });
    const okSup = (cel[r.ParaCelulaID] && cel[r.ParaCelulaID].SupervisorID === u.membroId) || (cel[r.DeCelulaID] && cel[r.DeCelulaID].SupervisorID === u.membroId);
    if (!(can_(u, 'transf') || okSup)) throw new ApiError('FORBIDDEN', 'Só o supervisor responsável decide.');
    if (r.SolicitadoPor === u.membroId && !can_(u, 'transf')) throw new ApiError('FORBIDDEN', 'Um pedido feito por você precisa ser decidido por outro supervisor ou pela administração.');
    const st = d.decisao === 'autorizado' ? 'autorizado' : 'negado'; writeRow_(t, r._row, { Status: st, DecididoPor: u.membroId, DataDecisao: now_() });
    if (st === 'autorizado') { const g = getMember_(r.MembroID); writeRow_(g.t, g.m._row, { CelulaID: r.ParaCelulaID }); }
    audit_(u.email, 'TRANSFERENCIA_' + st.toUpperCase(), r.TransfID, 'OK'); return { status: st };
  });
}
function addNewMember_(d, u) {
  return withLock_(function () {
    const id = cellOf_(u, d, 'presenca', 'pres', 'editar'), nome = clip_(d.nome, 150); if (!nome) throw new ApiError('VALIDATION', 'Informe o nome.');
    const colunas = jparse_(cfgMap_().ColunasExtras, []), ex = {}; colunas.forEach(function (c) { if (d.extras && d.extras[c] !== undefined) ex[c] = clip_(d.extras[c], 150); });
    const mid = id_('M'); appendRow_(table_('Membros'), { MembroID: mid, Nome: nome, Simples: nome, Apelido: nome.split(' ')[0], Endereco: clip_(d.endereco, 200), Telefone: clip_(d.celular, 25), CelulaID: id, EhMembro: '0', Status: 'Ativo', Extras: JSON.stringify(ex), CriadoEm: now_() });
    audit_(u.email, 'MEMBRO_NOVO', mid, 'OK'); return { id: mid };
  });
}

/* ============================== EVENTOS / FEED ============================== */
function listEvents_(d, u) {
  const ins = {}; table_('Inscricoes').rows.forEach(function (r) { if (r.MembroID === u.membroId) ins[r.EventoID] = 1; }); const lim = Utilities.formatDate(new Date(Date.now() - 30 * 86400000), CFG.TZ, 'yyyy-MM-dd');
  return table_('Eventos').rows.filter(function (e) { return e.Status !== 'Cancelado' && e.Data >= lim && (e.Escopo !== 'celula' || e.CelulaID === u.celulaId || can_(u, 'celulas')); }).sort(function (a, b) { return a.Data < b.Data ? -1 : 1; })
    .map(function (e) { return { id: e.EventoID, titulo: e.Titulo, data: e.Data, hora: e.Hora, local: e.Local, descricao: e.Descricao, programacao: jparse_(e.Programacao, []), escopo: e.Escopo, celulaId: e.CelulaID, foto: e.Foto || '', inscrito: !!ins[e.EventoID], adm: e.Escopo !== 'celula' }; });
}
function fotoOk_(v) { v = String(v || ''); if (v && (!/^data:image\/(jpeg|png|webp);base64,/.test(v) || v.length > 45000)) throw new ApiError('VALIDATION', 'Foto inválida ou muito grande.'); return v; }
function createEvent_(d, u) {
  return withLock_(function () {
    const t = clip_(d.titulo, 120), data = clip_(d.data, 10); if (!t || !data || !dateOk_(data)) throw new ApiError('VALIDATION', 'Informe título e data válida.');
    appendRow_(table_('Eventos'), { EventoID: id_('E'), Titulo: t, Data: data, Hora: clip_(d.hora, 5), Local: clip_(d.local, 150), Descricao: clip_(d.descricao, 1000), Programacao: JSON.stringify((d.programacao || []).slice(0, 30).map(function (x) { return clip_(x, 120); })), Escopo: 'igreja', CriadoPor: u.membroId, Status: 'Ativo', Foto: fotoOk_(d.foto) });
    audit_(u.email, 'EVENTO_CRIADO', t, 'OK'); return { ok: true };
  });
}
function createCellEvent_(d, u) {
  return withLock_(function () {
    const id = cellOf_(u, d, 'gerir', 'plan', 'editar'), t = clip_(d.titulo, 120), data = clip_(d.data, 10); if (!t || !data || !dateOk_(data)) throw new ApiError('VALIDATION', 'Informe título e data válida.');
    appendRow_(table_('Eventos'), { EventoID: id_('E'), Titulo: t, Data: data, Hora: clip_(d.hora, 5), Local: clip_(d.local, 150), Descricao: clip_(d.descricao, 500), Programacao: '[]', Escopo: 'celula', CelulaID: id, CriadoPor: u.membroId, Status: 'Ativo' }); return { ok: true };
  });
}
function enroll_(d, u) {
  return withLock_(function () {
    const e = table_('Eventos').rows.filter(function (r) { return r.EventoID === d.eventoId && r.Status !== 'Cancelado'; })[0]; if (!e) throw new ApiError('NOT_FOUND', 'Evento não encontrado.');
    const t = table_('Inscricoes'), ex = t.rows.filter(function (r) { return r.EventoID === e.EventoID && r.MembroID === u.membroId; })[0];
    if (d.on && !ex) appendRow_(t, { EventoID: e.EventoID, MembroID: u.membroId, Data: now_() }); if (!d.on && ex) t.sh.deleteRow(ex._row); return { inscrito: !!d.on };
  });
}
function postNews_(d, u) { const t = clip_(d.titulo, 120); if (!t) throw new ApiError('VALIDATION', 'Informe o título.'); appendRow_(table_('Noticias'), { NoticiaID: id_('N'), Titulo: t, Texto: clip_(d.texto, 1500), Data: now_(), CriadoPor: u.membroId, Status: 'Ativo' }); audit_(u.email, 'NOTICIA', t, 'OK'); return { ok: true }; }
function listNews_() { return table_('Noticias').rows.filter(function (n) { return n.Status !== 'Removida'; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 30).map(function (n) { return { id: n.NoticiaID, titulo: n.Titulo, texto: n.Texto, data: n.Data }; }); }

/* ============================== MINISTÉRIOS / CURSOS / EXTRAS ============================== */
function listMin_() { return table_('Ministerios').rows.filter(function (m) { return m.Ativo !== '0'; }).sort(function (a, b) { return Number(a.Ordem) - Number(b.Ordem); }).map(function (m) { return { id: m.MinisterioID, nome: m.Nome, descricao: m.Descricao || '', foto: m.Foto || '' }; }); }
function interest_(d, u) {
  return withLock_(function () {
    const m = table_('Ministerios').rows.filter(function (r) { return r.MinisterioID === d.ministerioId && r.Ativo !== '0'; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Ministério não encontrado.');
    if (d.membro) saveMember_({ membro: { Nome: d.membro.Nome, Telefone: d.membro.Telefone, Profissao: d.membro.Profissao, Nascimento: d.membro.Nascimento } }, u);
    const t = table_('Interesses'); if (t.rows.some(function (r) { return r.MinisterioID === m.MinisterioID && r.MembroID === u.membroId && r.Status === 'autorizado'; })) throw new ApiError('VALIDATION', 'Você já participa deste ministério.');
    if (!t.rows.some(function (r) { return r.MinisterioID === m.MinisterioID && r.MembroID === u.membroId && r.Status === 'novo'; })) appendRow_(t, { InteresseID: id_('I'), MinisterioID: m.MinisterioID, MembroID: u.membroId, Data: now_(), Status: 'novo' });
    return { ok: true };
  });
}
function listInterests_() { const mem = {}; table_('Membros').rows.forEach(function (m) { mem[m.MembroID] = m; }); const mi = {}; table_('Ministerios').rows.forEach(function (m) { mi[m.MinisterioID] = m.Nome; });
  return table_('Interesses').rows.sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 200).map(function (i) { const m = mem[i.MembroID] || {}; return { id: i.InteresseID, ministerio: mi[i.MinisterioID], nome: m.Nome, telefone: m.Telefone, data: i.Data, status: stN_(i.Status) }; }); }
function saveMinistry_(d, u) {
  return withLock_(function () {
    const n = clip_(d.nome, 60); if (!n) throw new ApiError('VALIDATION', 'Informe o nome do ministério.'); const t = table_('Ministerios');
    if (t.rows.some(function (r) { return norm_(r.Nome) === norm_(n) && r.Ativo !== '0'; })) throw new ApiError('VALIDATION', 'Esse ministério já existe.');
    appendRow_(t, { MinisterioID: id_('MIN'), Nome: n, Ordem: String(t.rows.length + 1), Ativo: '1' }); audit_(u.email, 'MINISTERIO', n, 'OK'); return { ok: true };
  });
}
function deleteMinistry_(d, u) { return withLock_(function () { const t = table_('Ministerios'), r = t.rows.filter(function (x) { return x.MinisterioID === d.id; })[0]; if (r) writeRow_(t, r._row, { Ativo: '0' }); audit_(u.email, 'MINISTERIO_REMOVIDO', d.id, 'OK'); return { ok: true }; }); }
function listCourses_(d, u) { const mine = {}; table_('Matriculas').rows.forEach(function (r) { if (r.MembroID === u.membroId) mine[r.CursoID] = r.Status; });
  return table_('Cursos').rows.filter(function (c) { return c.Ativo !== '0'; }).map(function (c) { return { id: c.CursoID, nome: c.Nome, status: mine[c.CursoID] || '' }; }); }
function enrollCourse_(d, u) { return withLock_(function () { const c = table_('Cursos').rows.filter(function (r) { return r.CursoID === d.cursoId && r.Ativo !== '0'; })[0]; if (!c) throw new ApiError('NOT_FOUND', 'Curso não encontrado.'); const t = table_('Matriculas'); if (!t.rows.some(function (r) { return r.CursoID === c.CursoID && r.MembroID === u.membroId; })) appendRow_(t, { MatriculaID: id_('MAT'), CursoID: c.CursoID, MembroID: u.membroId, Status: 'Pendente', Data: now_() }); return { status: 'Pendente' }; }); }
function listLessons_() { return table_('Licoes').rows.filter(function (l) { return l.Status !== 'Removida'; }).map(function (l) { return { id: l.LicaoID, titulo: l.Titulo, resumo: l.Resumo, categoria: l.Categoria, url: l.Url }; }); }
function listDyn_() { return table_('Dinamicas').rows.map(function (x) { return { id: x.DinamicaID, titulo: x.Titulo, descricao: x.Descricao, minutos: Number(x.Minutos || 10), meu: false, membroId: x.MembroID }; }); }
function addDyn_(d, u) { const t = clip_(d.titulo, 100); if (!t) throw new ApiError('VALIDATION', 'Dê um nome à dinâmica.'); appendRow_(table_('Dinamicas'), { DinamicaID: id_('D'), Titulo: t, Descricao: clip_(d.descricao, 800), Minutos: String(Math.max(1, Math.min(240, Number(d.minutos) || 10))), MembroID: u.membroId, Data: now_() }); return { ok: true }; }
function saveLesson_(d, u) { const t = clip_(d.titulo, 120), url = clip_(d.url, 300); if (!t) throw new ApiError('VALIDATION', 'Informe o título da lição.'); if (url && !/^https:\/\//.test(url)) throw new ApiError('VALIDATION', 'O link precisa começar com https://.'); appendRow_(table_('Licoes'), { LicaoID: id_('L'), Titulo: t, Resumo: clip_(d.resumo, 400), Categoria: clip_(d.categoria, 40), Url: url, Status: 'Ativa' }); audit_(u.email, 'LICAO', t, 'OK'); return { ok: true }; }
function listVideos_() { return table_('Videos').rows.filter(function (v) { return v.Status !== 'Removido'; }).sort(function (a, b) { return Number(a.Ordem) - Number(b.Ordem); }).map(function (v) { return { id: v.VideoID, titulo: v.Titulo, url: v.Url, tipo: v.Tipo === 'live' ? 'live' : 'video', aoVivo: v.AoVivo === '1' }; }); }
function saveVideo_(d, u) { const t = clip_(d.titulo, 120), url = clip_(d.url, 300); if (!t || !/^https:\/\//.test(url)) throw new ApiError('VALIDATION', 'Informe título e link https.'); const v = table_('Videos'); appendRow_(v, { VideoID: id_('V'), Titulo: t, Url: url, Ordem: String(v.rows.length + 1), Status: 'Ativo', Tipo: d.tipo === 'live' ? 'live' : 'video', AoVivo: d.tipo === 'live' && d.aoVivo ? '1' : '0' }); audit_(u.email, 'VIDEO', t, 'OK'); return { ok: true }; }
function updateVideo_(d, u) { return withLock_(function () { const t = table_('Videos'), r = t.rows.filter(function (x) { return x.VideoID === d.id && x.Status !== 'Removido'; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Vídeo não encontrado.'); const p = {}; if (d.titulo !== undefined) { p.Titulo = clip_(d.titulo, 120); if (!p.Titulo) throw new ApiError('VALIDATION', 'Informe o título.'); } if (d.tipo !== undefined) p.Tipo = d.tipo === 'live' ? 'live' : 'video'; if (d.aoVivo !== undefined) p.AoVivo = d.aoVivo ? '1' : '0'; if ((p.Tipo || r.Tipo) !== 'live') p.AoVivo = '0'; writeRow_(t, r._row, p); audit_(u.email, 'VIDEO_EDIT', r.Titulo, 'OK'); return { ok: true }; }); }
/* ============================== LOJA ZOE ============================== */
const CATEGORIAS_LOJA = ['Camisetas', 'Pulseiras', 'Bonés', 'Garrafas', 'Marca-texto', 'Marcador de página', 'Porta-copos', 'Outros'];
function prodOut_(p) { return { id: p.ProdutoID, nome: p.Nome, categoria: p.Categoria || 'Outros', preco: Number(p.Preco) || 0, descricao: p.Descricao || '', foto: p.Foto || '', opcoes: p.Opcoes || '', disponivel: p.Disponivel !== '0' }; }
function listProducts_() { return table_('Produtos').rows.filter(function (p) { return p.Ativo !== '0'; }).sort(function (a, b) { return Number(a.Ordem) - Number(b.Ordem); }).map(prodOut_); }
function saveProduct_(d, u) {
  return withLock_(function () {
    const nome = clip_(d.nome, 80); if (!nome) throw new ApiError('VALIDATION', 'Informe o nome do produto.');
    const preco = Number(d.preco); if (!isFinite(preco) || preco < 0 || preco > 100000) throw new ApiError('VALIDATION', 'Informe um preço válido.');
    const cat = CATEGORIAS_LOJA.indexOf(d.categoria) >= 0 ? d.categoria : 'Outros';
    const row = { Nome: nome, Categoria: cat, Preco: String(Math.round(preco * 100) / 100), Descricao: clip_(d.descricao, 600), Opcoes: clip_(d.opcoes, 120), Disponivel: d.disponivel === false ? '0' : '1' };
    if (d.foto !== undefined) { const f = String(d.foto || ''); if (f && (!/^data:image\/(jpeg|png|webp);base64,/.test(f) || f.length > 45000)) throw new ApiError('VALIDATION', 'Foto inválida ou grande demais.'); row.Foto = f; }
    const t = table_('Produtos');
    if (d.id) { const r = t.rows.filter(function (x) { return x.ProdutoID === d.id && x.Ativo !== '0'; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Produto não encontrado.'); writeRow_(t, r._row, row); audit_(u.email, 'PRODUTO_EDITADO', nome, 'OK'); return { id: d.id }; }
    row.ProdutoID = id_('PRD'); row.Ativo = '1'; row.Ordem = String(t.rows.length + 1); if (row.Foto === undefined) row.Foto = '';
    appendRow_(t, row); audit_(u.email, 'PRODUTO', nome, 'OK'); return { id: row.ProdutoID };
  });
}
function deleteProduct_(d, u) { return withLock_(function () { const t = table_('Produtos'), r = t.rows.filter(function (x) { return x.ProdutoID === d.id; })[0]; if (r) writeRow_(t, r._row, { Ativo: '0' }); audit_(u.email, 'PRODUTO_REMOVIDO', d.id, 'OK'); return { ok: true }; }); }
function deleteVideo_(d, u) { return withLock_(function () { const t = table_('Videos'), r = t.rows.filter(function (x) { return x.VideoID === d.id; })[0]; if (r) writeRow_(t, r._row, { Status: 'Removido' }); return { ok: true }; }); }

/* ============================== USUÁRIOS / PERMISSÕES ============================== */
function listUsers_() { const mem = {}; table_('Membros').rows.forEach(function (m) { mem[m.MembroID] = m; }); return table_('Usuarios').rows.map(function (r) { return { email: r.Email, nome: (mem[r.MembroID] || {}).Nome || '', papel: r.Papel, status: r.Status || 'Ativo', ultimoAcesso: r.UltimoAcesso, membroId: r.MembroID }; }); }
function createUser_(d, u) {
  return withLock_(function () {
    const email = clip_(d.email, 120).toLowerCase(), nome = clip_(d.nome, 150), pw = String(d.senha || ''), papel = String(d.papel || 'membro');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError('VALIDATION', 'E-mail inválido.'); if (pw.length < 8) throw new ApiError('VALIDATION', 'A senha temporária precisa ter 8+ caracteres.');
    if (!papelValido_(papel)) throw new ApiError('VALIDATION', 'Papel inválido.'); if (papel === 'admin' && u.papel !== 'admin') throw new ApiError('FORBIDDEN', 'Só administrador cria administrador.');
    const t = table_('Usuarios'); if (t.rows.some(function (r) { return String(r.Email).toLowerCase() === email; })) throw new ApiError('VALIDATION', 'Já existe usuário com esse e-mail.');
    const mid = d.membroId ? getMember_(d.membroId).m.MembroID : id_('M'); if (!d.membroId) appendRow_(table_('Membros'), { MembroID: mid, Nome: nome || email, Simples: nome || email, Apelido: (nome || email).split(' ')[0], Email: email, CelulaID: clip_(d.celulaId, 30), EhMembro: '1', Status: 'Ativo', CriadoEm: now_() });
    const salt = Utilities.getUuid(); appendRow_(t, { Email: email, SenhaHash: hash_(salt, pw), Salt: salt, Papel: papel, Status: 'Ativo', MembroID: mid, TrocarSenha: '1', CriadoEm: now_() }); audit_(u.email, 'USUARIO_CRIADO', email + ':' + papel, 'OK'); return { ok: true, membroId: mid };
  });
}
function setUser_(d, u) {
  return withLock_(function () {
    const email = clip_(d.email, 120).toLowerCase(), t = table_('Usuarios'), r = t.rows.filter(function (x) { return String(x.Email).toLowerCase() === email; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Usuário não encontrado.');
    const p = {}; if (d.papel) { if (!papelValido_(d.papel)) throw new ApiError('VALIDATION', 'Papel inválido.'); if ((d.papel === 'admin' || r.Papel === 'admin') && u.papel !== 'admin') throw new ApiError('FORBIDDEN', 'Só administrador altera administradores.'); if (email === u.email && d.papel !== 'admin' && u.papel === 'admin') throw new ApiError('VALIDATION', 'Você não pode remover o seu próprio acesso de administrador.'); p.Papel = d.papel; }
    if (d.status) { if (email === u.email) throw new ApiError('VALIDATION', 'Você não pode desativar a si mesmo.'); p.Status = d.status === 'Inativo' ? 'Inativo' : 'Ativo'; }
    if (d.senha) { if (String(d.senha).length < 8) throw new ApiError('VALIDATION', 'A senha precisa ter 8+ caracteres.'); const salt = Utilities.getUuid(); p.Salt = salt; p.SenhaHash = hash_(salt, String(d.senha)); p.TrocarSenha = '1'; }
    writeRow_(t, r._row, p); bumpVer_(email); audit_(u.email, 'USUARIO_ALTERADO', email, 'OK'); return { ok: true };
  });
}
function changePassword_(d, u) {
  return withLock_(function () {
    const t = table_('Usuarios'), r = t.rows.filter(function (x) { return String(x.Email).toLowerCase() === u.email; })[0]; const nova = String(d.nova || '');
    if (!safeEq_(hash_(r.Salt, String(d.atual || '')), r.SenhaHash)) throw new ApiError('AUTH', 'A senha atual não confere.'); if (nova.length < 8) throw new ApiError('VALIDATION', 'A nova senha precisa ter 8+ caracteres.');
    const salt = Utilities.getUuid(); writeRow_(t, r._row, { Salt: salt, SenhaHash: hash_(salt, nova), TrocarSenha: '' }); bumpVer_(u.email); audit_(u.email, 'SENHA_TROCADA', '', 'OK'); return { ok: true, relogin: true };
  });
}
function savePerms_(d, u) {
  if (u.papel !== 'admin') throw new ApiError('FORBIDDEN', 'Só o administrador altera permissões.');
  return withLock_(function () { const t = table_('Permissoes'); papeis_().forEach(function (p) { const r = t.rows.filter(function (x) { return x.Papel === p; })[0], src = (d.matriz || {})[p] || {}, patch = {}; PERMS.forEach(function (k) { patch[k] = (p === 'admin' && k === 'config') || src[k] ? '1' : '0'; }); if (r) writeRow_(t, r._row, patch); else appendRow_(t, Object.assign({ Papel: p }, patch)); }); audit_(u.email, 'PERMISSOES', '', 'OK'); return permMatrix_(); });
}

function accessRules_() { return { tipos: tiposOut_(), permissoes: permMatrix_(), abas: abasPorTipo_(), regras: regrasCel_(), guias: GUIAS_CEL, abasLista: ABAS_APP }; }
function saveAccessRules_(d, u) {
  if (u.papel !== 'admin') throw new ApiError('FORBIDDEN', 'Só o administrador altera as regras de acesso.');
  return withLock_(function () {
    const t = table_('Config'), put = function (k, v) { const r = t.rows.filter(function (x) { return x.Chave === k; })[0]; if (r) writeRow_(t, r._row, { Valor: v }); else appendRow_(t, { Chave: k, Valor: v }); t.rows = table_('Config').rows; };
    if (d.novoTipo !== undefined) {
      const nome = clip_(d.novoTipo, 40); if (!nome) throw new ApiError('VALIDATION', 'Informe o nome do tipo de acesso.');
      const lista = tiposCustom_(); if (norm_(nome) === 'admin' || PAPEIS_BASE.some(function (p) { return norm_(ROTULOS_TIPO[p]) === norm_(nome); }) || lista.some(function (x) { return norm_(x.nome) === norm_(nome); })) throw new ApiError('VALIDATION', 'Já existe um tipo com esse nome.');
      if (lista.length >= 12) throw new ApiError('VALIDATION', 'Limite de 12 tipos personalizados.');
      let id = 'c_' + norm_(nome).replace(/[^a-z0-9]/g, '').slice(0, 14); if (id === 'c_') id = 'c_tipo'; let k = id, n = 2; while (lista.some(function (x) { return x.id === k; })) k = id + (n++); lista.push({ id: k, nome: nome }); put('TiposAcesso', JSON.stringify(lista));
    }
    if (d.removerTipo) { const lista = tiposCustom_().filter(function (x) { return x.id !== d.removerTipo; }); put('TiposAcesso', JSON.stringify(lista)); }
    const ps = papeis_(), perfis = ps.filter(function (p) { return p !== 'admin'; }).concat(['supervisor', 'lider', 'treinamento']);
    if (d.abas && typeof d.abas === 'object') { const cur = jparse_(cfgMap_().AbasPorTipo, {}); ps.forEach(function (p) { if (p === 'admin' || !d.abas[p]) return; cur[p] = cur[p] || {}; ABAS_APP.forEach(function (a) { if (d.abas[p][a] !== undefined) cur[p][a] = d.abas[p][a] ? 1 : 0; }); }); put('AbasPorTipo', JSON.stringify(cur)); }
    if (d.regras && typeof d.regras === 'object') { const cur = jparse_(cfgMap_().RegrasCelulas, {}); perfis.forEach(function (p) { if (!d.regras[p]) return; cur[p] = cur[p] || {}; GUIAS_CEL.forEach(function (g) { const x = d.regras[p][g]; if (x) cur[p][g] = { v: (x.v || x.e) ? 1 : 0, e: x.e ? 1 : 0 }; }); }); put('RegrasCelulas', JSON.stringify(cur)); }
    audit_(u.email, 'REGRAS_ACESSO', '', 'OK'); return accessRules_();
  });
}

/* ============================== ROTAS ============================== */

/* ============================== ADMIN: EDITAR TUDO (genérico) ============================== */
// Cada entidade descreve: aba, prefixo do ID, permissão exigida, campos editáveis, coluna de status e como "remover".
const DIAS_ = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const ENT = {
  celulas: { titulo: 'Células', aba: 'Celulas', id: 'CelulaID', pre: 'C', perm: 'celulas', rotulo: 'Nome', status: { col: 'Status', ativo: 'Ativa', off: 'Inativa' }, campos: [
    { k: 'Nome', l: 'Nome', t: 'text', max: 100, req: 1 }, { k: 'Descricao', l: 'Descrição', t: 'area', max: 500 }, { k: 'LiderID', l: 'Líder', t: 'membro' }, { k: 'SupervisorID', l: 'Supervisor', t: 'membro' },
    { k: 'TreinamentoID', l: 'Líder em treinamento', t: 'membro' }, { k: 'MaeID', l: 'Gerada da célula (multiplicação)', t: 'celula' }, { k: 'Dia', l: 'Dia da semana', t: 'sel', op: DIAS_ }, { k: 'Inicio', l: 'Início', t: 'time' }, { k: 'Fim', l: 'Fim', t: 'time' }, { k: 'Categoria', l: 'Categoria', t: 'text', max: 30 }, { k: 'Faixa', l: 'Faixa etária', t: 'text', max: 30 },
    { k: 'Bairro', l: 'Bairro', t: 'text', max: 80 }, { k: 'Cidade', l: 'Cidade', t: 'text', max: 80 }, { k: 'UF', l: 'UF', t: 'text', max: 2 }, { k: 'Endereco', l: 'Endereço', t: 'text', max: 200 },
    { k: 'Status', l: 'Situação', t: 'sel', op: [['Ativa', 'Ativa'], ['Inativa', 'Inativa']] }] },
  eventos: { titulo: 'Eventos', aba: 'Eventos', id: 'EventoID', pre: 'E', perm: 'eventos', rotulo: 'Titulo', sub: 'Data', status: { col: 'Status', ativo: 'Ativo', off: 'Cancelado' }, defaults: { Escopo: 'igreja' }, campos: [
    { k: 'Titulo', l: 'Título', t: 'text', max: 120, req: 1 }, { k: 'Data', l: 'Data', t: 'date', req: 1 }, { k: 'Hora', l: 'Hora', t: 'time' }, { k: 'Local', l: 'Local', t: 'text', max: 150 },
    { k: 'Descricao', l: 'Descrição', t: 'area', max: 1000 }, { k: 'Programacao', l: 'Programação (uma linha por item)', t: 'lines' }, { k: 'Foto', l: 'Foto do evento', t: 'foto' },
    { k: 'Status', l: 'Situação', t: 'sel', op: [['Ativo', 'Ativo'], ['Cancelado', 'Cancelado']] }] },
  noticias: { titulo: 'Notícias', aba: 'Noticias', id: 'NoticiaID', pre: 'N', perm: 'eventos', rotulo: 'Titulo', sub: 'Data', status: { col: 'Status', ativo: 'Ativo', off: 'Removida' }, defaults: {}, campos: [
    { k: 'Titulo', l: 'Título', t: 'text', max: 120, req: 1 }, { k: 'Texto', l: 'Texto', t: 'area', max: 1500 }, { k: 'Status', l: 'Situação', t: 'sel', op: [['Ativo', 'Publicada'], ['Removida', 'Removida']] }] },
  ministerios: { titulo: 'Ministérios', aba: 'Ministerios', id: 'MinisterioID', pre: 'MIN', perm: 'min', rotulo: 'Nome', status: { col: 'Ativo', ativo: '1', off: '0' }, campos: [
    { k: 'Nome', l: 'Nome', t: 'text', max: 60, req: 1 }, { k: 'Descricao', l: 'Descrição curta', t: 'area', max: 300 }, { k: 'Foto', l: 'Foto do ministério', t: 'foto' }, { k: 'Ordem', l: 'Ordem', t: 'num' }, { k: 'Ativo', l: 'Situação', t: 'sel', op: [['1', 'Ativo'], ['0', 'Inativo']] }] },
  membros: { titulo: 'Membros', aba: 'Membros', id: 'MembroID', pre: 'M', perm: 'config', rotulo: 'Nome', sub: 'Telefone', status: { col: 'Status', ativo: 'Ativo', off: 'Inativo' }, defaults: { EhMembro: '1' }, campos: [
    { k: 'Nome', l: 'Nome completo', t: 'text', max: 120, req: 1 }, { k: 'Simples', l: 'Nome simplificado', t: 'text', max: 60 }, { k: 'Apelido', l: 'Apelido', t: 'text', max: 40 }, { k: 'Sexo', l: 'Sexo', t: 'sel', op: ['Feminino', 'Masculino'] },
    { k: 'Nascimento', l: 'Nascimento', t: 'date' }, { k: 'Telefone', l: 'Celular', t: 'text', max: 25 }, { k: 'Profissao', l: 'Profissão', t: 'text', max: 60 }, { k: 'CEP', l: 'CEP', t: 'text', max: 9 }, { k: 'Endereco', l: 'Endereço', t: 'text', max: 200 },
    { k: 'Bairro', l: 'Bairro', t: 'text', max: 80 }, { k: 'Cidade', l: 'Cidade', t: 'text', max: 80 }, { k: 'UF', l: 'UF', t: 'text', max: 2 }, { k: 'EstadoCivil', l: 'Estado civil', t: 'text', max: 30 },
    { k: 'DataBatismo', l: 'Data do batismo', t: 'date' }, { k: 'CelulaID', l: 'Célula', t: 'celula' }, { k: 'Foto', l: 'Foto', t: 'foto' },
    { k: 'Status', l: 'Situação', t: 'sel', op: [['Ativo', 'Ativo'], ['Inativo', 'Inativo']] }] },
  cursos: { titulo: 'Cursos', aba: 'Cursos', id: 'CursoID', pre: 'CUR', perm: 'config', rotulo: 'Nome', status: { col: 'Ativo', ativo: '1', off: '0' }, campos: [
    { k: 'Nome', l: 'Nome do curso', t: 'text', max: 100, req: 1 }, { k: 'Ativo', l: 'Situação', t: 'sel', op: [['1', 'Ativo'], ['0', 'Inativo']] }] },
  licoes: { titulo: 'Lições / Extras', aba: 'Licoes', id: 'LicaoID', pre: 'L', perm: 'config', rotulo: 'Titulo', status: { col: 'Status', ativo: 'Ativa', off: 'Removida' }, campos: [
    { k: 'Titulo', l: 'Título', t: 'text', max: 120, req: 1 }, { k: 'Resumo', l: 'Resumo', t: 'area', max: 400 }, { k: 'Categoria', l: 'Categoria', t: 'text', max: 40 }, { k: 'Url', l: 'Link (https://)', t: 'url' },
    { k: 'Status', l: 'Situação', t: 'sel', op: [['Ativa', 'Ativa'], ['Removida', 'Removida']] }] },
  dinamicas: { titulo: 'Dinâmicas', aba: 'Dinamicas', id: 'DinamicaID', pre: 'D', perm: 'config', rotulo: 'Titulo', apagar: 1, campos: [
    { k: 'Titulo', l: 'Título', t: 'text', max: 100, req: 1 }, { k: 'Descricao', l: 'Descrição', t: 'area', max: 800 }, { k: 'Minutos', l: 'Minutos', t: 'num' }] },
  videos: { titulo: 'Vídeos (Célula in Class)', aba: 'Videos', id: 'VideoID', pre: 'V', perm: 'config', rotulo: 'Titulo', status: { col: 'Status', ativo: 'Ativo', off: 'Removido' }, campos: [
    { k: 'Titulo', l: 'Título', t: 'text', max: 120, req: 1 }, { k: 'Url', l: 'Link do YouTube (https://)', t: 'url', req: 1 }, { k: 'Ordem', l: 'Ordem', t: 'num' },
    { k: 'Status', l: 'Situação', t: 'sel', op: [['Ativo', 'Ativo'], ['Removido', 'Removido']] }] }
};
function ent_(d, u) {
  const e = Object.prototype.hasOwnProperty.call(ENT, d.tipo) ? ENT[d.tipo] : null; if (!e) throw new ApiError('VALIDATION', 'Tipo inválido.');
  if (!can_(u, e.perm)) { audit_(u.email, 'NEGADO:admin_' + d.tipo, '', 'NEGADO'); throw new ApiError('FORBIDDEN', 'Você não tem permissão para esta área.'); }
  return e;
}
function adminCampo_(f, v) {
  v = f.t === 'lines' ? (Array.isArray(v) ? v : String(v || '').split('\n')).map(function (x) { return clip_(x, 120); }).filter(String).slice(0, 30) : v;
  if (f.t === 'lines') return JSON.stringify(v);
  if (f.t === 'foto') { v = String(v || ''); if (v && (!/^data:image\/(jpeg|png|webp);base64,/.test(v) || v.length > 45000)) throw new ApiError('VALIDATION', 'Foto inválida ou muito grande.'); return v; }
  v = clip_(v, f.max || 200);
  if (f.req && !v) throw new ApiError('VALIDATION', 'Preencha: ' + f.l + '.');
  if (f.t === 'date' && v && !dateOk_(v)) throw new ApiError('VALIDATION', 'Data inválida em: ' + f.l + '.');
  if (f.t === 'url' && v && !/^https:\/\//.test(v)) throw new ApiError('VALIDATION', 'O link precisa começar com https:// (' + f.l + ').');
  if (f.t === 'num') v = v === '' ? '' : String(Math.max(0, Math.min(100000, Math.floor(Number(v) || 0))));
  if (f.t === 'sel') { const ok = f.op.some(function (o) { return String(Array.isArray(o) ? o[0] : o) === v; }); if (v && !ok) throw new ApiError('VALIDATION', 'Opção inválida em: ' + f.l + '.'); }
  return v;
}
function adminList_(d, u) {
  const e = ent_(d, u), t = table_(e.aba), mem = {};
  const membros = (e.campos.some(function (f) { return f.t === 'membro'; }) ? table_('Membros').rows.filter(function (m) { return m.Status !== 'Inativo'; }).map(function (m) { mem[m.MembroID] = m.Simples || m.Nome; return { id: m.MembroID, nome: m.Simples || m.Nome || m.Email }; }).sort(function (a, b) { return a.nome < b.nome ? -1 : 1; }) : []);
  const celulas = e.campos.some(function (f) { return f.t === 'celula'; }) ? table_('Celulas').rows.filter(function (x) { return x.Status !== 'Inativa'; }).map(function (x) { return { id: x.CelulaID, nome: x.Nome }; }) : [];
  const itens = t.rows.map(function (r) {
    const v = {}; e.campos.forEach(function (f) { v[f.k] = f.t === 'lines' ? jparse_(r[f.k], []).join('\n') : f.t === 'foto' ? (r[f.k] ? '__keep' : '') : r[f.k]; });
    const off = e.status ? r[e.status.col] === e.status.off : false;
    return { id: r[e.id], rotulo: r[e.rotulo] || '(sem nome)', sub: e.sub ? r[e.sub] : '', off: off, valores: v };
  });
  if (e.sub === 'Data') itens.sort(function (a, b) { return a.sub < b.sub ? 1 : -1; });
  return { titulo: e.titulo, campos: e.campos, membros: membros, celulas: celulas, itens: itens, podeApagar: !!e.apagar };
}
function adminSave_(d, u) {
  return withLock_(function () {
    const e = ent_(d, u), t = table_(e.aba), dados = d.valores || {}, patch = {};
    e.campos.forEach(function (f) { if (f.t === 'foto' && (dados[f.k] === undefined || dados[f.k] === '__keep')) return; if (dados[f.k] !== undefined || f.req) patch[f.k] = (f.t === 'membro' || f.t === 'celula') ? clip_(dados[f.k], 30) : adminCampo_(f, dados[f.k]); });
    if (e.aba === 'Videos' && patch.Url === undefined) throw new ApiError('VALIDATION', 'Informe o link.');
    const row = d.id ? t.rows.filter(function (r) { return r[e.id] === d.id; })[0] : null;
    if (d.id && !row) throw new ApiError('NOT_FOUND', 'Item não encontrado.');
    if (e.aba === 'Celulas' && patch.SupervisorID && (!row || patch.SupervisorID !== row.SupervisorID)) checarSupervisor_(patch.SupervisorID, d, u, (row || {}).MaeID);
    let id = d.id;
    if (row) writeRow_(t, row._row, patch);
    else {
      id = id_(e.pre); const novo = Object.assign({}, e.defaults || {}, patch); novo[e.id] = id;
      if (e.status && novo[e.status.col] === undefined) novo[e.status.col] = e.status.ativo;
      if (e.aba === 'Eventos') novo.CriadoPor = u.membroId; if (e.aba === 'Noticias') { novo.Data = now_(); novo.CriadoPor = u.membroId; } if (e.aba === 'Dinamicas') { novo.MembroID = u.membroId; novo.Data = now_(); }
      if (e.aba === 'Videos' && !novo.Ordem) novo.Ordem = String(t.rows.length + 1);
      appendRow_(t, novo);
    }
    if (e.aba === 'Celulas' && patch.TreinamentoID) { const tg = table_('Membros').rows.filter(function (m) { return m.MembroID === patch.TreinamentoID; })[0]; if (tg && !tg.CelulaID) writeRow_(table_('Membros'), tg._row, { CelulaID: id }); }
    if (e.aba === 'Celulas' && patch.LiderID) { const g = table_('Membros').rows.filter(function (m) { return m.MembroID === patch.LiderID; })[0]; if (g) writeRow_(table_('Membros'), g._row, { CelulaID: id }); }
    audit_(u.email, 'ADMIN_SALVAR:' + d.tipo, id, 'OK'); return { id: id };
  });
}
function adminRemove_(d, u) {
  return withLock_(function () {
    const e = ent_(d, u), t = table_(e.aba), row = t.rows.filter(function (r) { return r[e.id] === d.id; })[0]; if (!row) throw new ApiError('NOT_FOUND', 'Item não encontrado.');
    if (e.apagar) t.sh.deleteRow(row._row); else { const p = {}; p[e.status.col] = d.reativar ? e.status.ativo : e.status.off; writeRow_(t, row._row, p); }
    audit_(u.email, (d.reativar ? 'ADMIN_REATIVAR:' : 'ADMIN_REMOVER:') + d.tipo, d.id, 'OK'); return { ok: true };
  });
}
const ROUTES = {
  ping: { fn: function () { return { servico: 'Zoe API', status: 'online' }; } },
  login: { fn: login_ },
  logout: { auth: 'any', fn: function (d, u) { bumpVer_(u.email); return { ok: true }; } },
  me: { auth: 'any', fn: me_ }, changePassword: { auth: 'any', write: 1, fn: changePassword_ },
  saveMember: { auth: 'any', write: 1, fn: saveMember_ }, acceptLegal: { auth: 'any', write: 1, fn: acceptLegal_ }, birthdays: { auth: 'any', fn: birthdays_ },
  listEvents: { auth: 'any', fn: listEvents_ }, enroll: { auth: 'any', write: 1, fn: enroll_ }, listNews: { auth: 'any', fn: listNews_ },
  listMinistries: { auth: 'any', fn: listMin_ }, interest: { auth: 'any', write: 1, fn: interest_ },
  listCourses: { auth: 'any', fn: listCourses_ }, enrollCourse: { auth: 'any', write: 1, fn: enrollCourse_ },
  listLessons: { auth: 'any', fn: listLessons_ }, listDynamics: { auth: 'any', fn: listDyn_ }, addDynamic: { auth: 'any', write: 1, fn: addDyn_ }, listVideos: { auth: 'any', fn: listVideos_ }, listProducts: { auth: 'any', fn: listProducts_ }, saveProduct: { auth: 'config', write: 1, fn: saveProduct_ }, deleteProduct: { auth: 'config', write: 1, fn: deleteProduct_ },
  searchCells: { auth: 'any', fn: searchCells_ }, addPrayer: { auth: 'any', write: 1, fn: addPrayer_ }, listPrayers: { auth: 'any', fn: listPrayers_ },
  cellMembers: { auth: 'any', fn: cellMembers_ }, saveCell: { auth: 'any', write: 1, fn: saveCell_ }, saveAttendance: { auth: 'any', write: 1, fn: saveAttendance_ }, history: { auth: 'any', fn: history_ },
  indicators: { auth: 'any', fn: indicators_ }, getPapeis: { auth: 'any', fn: getPapeis_ }, savePapeis: { auth: 'any', write: 1, fn: savePapeis_ }, createCellEvent: { auth: 'any', write: 1, fn: createCellEvent_ },
  lookup: { auth: 'any', fn: lookup_ }, requestTransfer: { auth: 'any', write: 1, fn: requestTransfer_ }, requestExit: { auth: 'any', write: 1, fn: requestExit_ }, decideExit: { auth: 'any', write: 1, fn: decideExit_ }, addNewMember: { auth: 'any', write: 1, fn: addNewMember_ }, orgTree: { auth: 'any', fn: orgTree_ },
  listTransfers: { auth: 'any', fn: listTransfers_ }, decideTransfer: { auth: 'any', write: 1, fn: decideTransfer_ },
  createEvent: { auth: 'eventos', write: 1, fn: createEvent_ }, postNews: { auth: 'eventos', write: 1, fn: postNews_ },
  listApprovals: { auth: 'any', fn: listApprovals_ }, listNotifications: { auth: 'any', fn: listNotifications_ }, readNotifications: { auth: 'any', write: 1, fn: readNotifications_ }, decideApproval: { auth: 'any', fn: decideApproval_ }, undoApproval: { auth: 'any', fn: undoApproval_ }, track: { auth: 'any', fn: track_ }, usageReport: { auth: 'config', fn: usageReport_ },
  orgMove: { auth: 'any', write: 1, fn: orgMove_ }, saveOrgLayout: { auth: 'any', write: 1, fn: saveOrgLayout_ }, rateBook: { auth: 'any', write: 1, fn: rateBook_ }, fotos: { auth: 'any', fn: fotos_ },
  listBooks: { auth: 'any', fn: listBooks_ }, saveBook: { auth: 'any', write: 1, fn: saveBook_ }, deleteBook: { auth: 'any', write: 1, fn: deleteBook_ }, getBookFile: { auth: 'any', fn: getBookFile_ },
  listBookComments: { auth: 'any', fn: listBookComments_ }, addBookComment: { auth: 'any', write: 1, fn: addBookComment_ }, deleteBookComment: { auth: 'any', write: 1, fn: deleteBookComment_ },
  listTestimonies: { auth: 'any', fn: listTestimonies_ }, addTestimony: { auth: 'any', write: 1, fn: addTestimony_ }, deleteTestimony: { auth: 'any', write: 1, fn: deleteTestimony_ }, toggleLike: { auth: 'any', write: 1, fn: toggleLike_ },
  saveMinistry: { auth: 'min', write: 1, fn: saveMinistry_ }, deleteMinistry: { auth: 'min', write: 1, fn: deleteMinistry_ }, listInterests: { auth: 'min', fn: listInterests_ },
  saveConfig: { auth: 'config', write: 1, fn: saveConfig_ }, getAccessRules: { auth: 'config', fn: accessRules_ }, saveAccessRules: { auth: 'config', write: 1, fn: saveAccessRules_ }, saveVideo: { auth: 'config', write: 1, fn: saveVideo_ }, deleteVideo: { auth: 'config', write: 1, fn: deleteVideo_ }, updateVideo: { auth: 'config', write: 1, fn: updateVideo_ },
  listUsers: { auth: 'config', fn: listUsers_ }, createUser: { auth: 'config', write: 1, fn: createUser_ }, setUser: { auth: 'config', write: 1, fn: setUser_ }, savePerms: { auth: 'config', write: 1, fn: savePerms_ },
  saveLesson: { auth: 'config', write: 1, fn: saveLesson_ }, getPerms: { auth: 'config', fn: function () { return permMatrix_(); } },
  createCell: { auth: 'celulas', write: 1, fn: createCell_ },
  adminList: { auth: 'any', fn: adminList_ }, adminSave: { auth: 'any', write: 1, fn: adminSave_ }, adminRemove: { auth: 'any', write: 1, fn: adminRemove_ }
};
function doGet() { return json_({ ok: true, data: { servico: 'Zoe API', status: 'online' } }); }
function doPost(e) {
  let out, user = null, route = null, action = '';
  try {
    const raw = e && e.postData && e.postData.contents; if (!raw || raw.length > 16000000) throw new ApiError('BAD_REQUEST', 'Requisição inválida.');
    const req = JSON.parse(raw); action = String(req.action || '');
    if (raw.length > 1500000 && action !== 'saveBook') throw new ApiError('BAD_REQUEST', 'Requisição grande demais.'); route = Object.prototype.hasOwnProperty.call(ROUTES, action) ? ROUTES[action] : null; if (!route) throw new ApiError('NOT_FOUND', 'Ação desconhecida.');
    if (route.auth) { user = auth_(req.token); if (route.auth !== 'any' && !can_(user, route.auth)) { audit_(user.email, 'NEGADO:' + action, '', 'NEGADO'); throw new ApiError('FORBIDDEN', 'Você não tem permissão para esta operação.'); } }
    out = { ok: true, data: route.fn(req.data || {}, user) };
  } catch (err) {
    if (err instanceof ApiError) out = { ok: false, error: { code: err.code, message: err.message } };
    else { console.error(err && err.stack || err); out = { ok: false, error: { code: 'ERROR', message: 'Erro inesperado. Tente novamente.' } }; }
  }
  return json_(out);
}
