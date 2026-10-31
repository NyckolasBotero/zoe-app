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
const PAPEIS = ['admin', 'pastor', 'professor', 'membro', 'frequentador'];
const PAPEIS_BASE = PAPEIS;
const ROTULOS_TIPO = { admin: 'Administrador', pastor: 'Pastor', professor: 'Professor', membro: 'Membro', frequentador: 'Frequentador' };
// guias do menu que o administrador pode esconder por tipo de acesso (Início, Editar perfil, Aprovações e Administração seguem regras próprias)
const ABAS_APP = ['membro', 'biblioteca', 'celula', 'familia', 'ministerios', 'buscar', 'licoes', 'dinamicas', 'cursos', 'eventos', 'aniversarios', 'tutoriais', 'loja', 'aulas'];
const GUIAS_CEL = ['freq', 'plan', 'papeis', 'oracao', 'ind', 'membros', 'perfilc', 'priv', 'pres', 'hist', 'mural', 'org'];
const PERMS = ['eventos', 'transf', 'celulas', 'min', 'config', 'prof', 'cursos'];
const DEFAULT_PERMS = {
  admin: { eventos: 1, transf: 1, celulas: 1, min: 1, config: 1, prof: 1, cursos: 1 },
  pastor: { eventos: 1, transf: 1, celulas: 1, min: 1, config: 0, prof: 1, cursos: 1 },
  professor: { eventos: 0, transf: 0, celulas: 0, min: 0, config: 0, prof: 1, cursos: 0 },
  membro: { eventos: 0, transf: 0, celulas: 0, min: 0, config: 0, prof: 0, cursos: 0 },
  frequentador: { eventos: 0, transf: 0, celulas: 0, min: 0, config: 0, prof: 0, cursos: 0 }
};
const PERMS_ZERO = { eventos: 0, transf: 0, celulas: 0, min: 0, config: 0, prof: 0, cursos: 0 };
const SHEETS = {
  Usuarios: ['Email', 'SenhaHash', 'Salt', 'Papel', 'Status', 'MembroID', 'TrocarSenha', 'CriadoEm', 'UltimoAcesso', 'GuiaVisto'],
  Membros: ['MembroID', 'Nome', 'Simples', 'Apelido', 'Sexo', 'Nascimento', 'Nacionalidade', 'Naturalidade', 'Sangue', 'Doador', 'Profissao', 'Telefone', 'Email', 'CEP', 'UF', 'Cidade', 'Endereco', 'Bairro', 'DataDecisao', 'Batizado', 'DataBatismo', 'IgrejaBatismo', 'Mae', 'Pai', 'EstadoCivil', 'Conjuge', 'DataCasamento', 'Filhos', 'Foto', 'CelulaID', 'EhMembro', 'Status', 'DataSaida', 'Extras', 'AceitePrivacidade', 'AceiteTermos', 'CriadoEm'],
  Celulas: ['CelulaID', 'Nome', 'Descricao', 'Foto', 'LiderID', 'SupervisorID', 'Dia', 'Inicio', 'Fim', 'Categoria', 'Faixa', 'Bairro', 'Cidade', 'UF', 'Endereco', 'TreinamentoID', 'MaeID', 'PrivGrupo', 'PrivTel', 'PrivEmail', 'PrivEnd', 'Status', 'Lat', 'Lng'],
  Reunioes: ['ReuniaoID', 'CelulaID', 'Data', 'Presentes', 'PresencaDeDeus', 'Obs', 'ForaDoDia', 'Elenco', 'Termometro', 'Foto'],
  Posts: ['PostID', 'Tipo', 'Escopo', 'CelulaID', 'AutorID', 'Titulo', 'Texto', 'Foto', 'Meta', 'Data', 'Status'],
  Comentarios: ['ComentID', 'PostID', 'MembroID', 'Texto', 'Data'],
  Visitantes: ['VisitanteID', 'Nome', 'Apelido', 'Telefone', 'Email', 'Nascimento', 'Endereco', 'Bairro', 'Cidade', 'UF', 'Lat', 'Lng', 'Data', 'RegistradoPor', 'CelulaID', 'Distancia', 'Contatado', 'ContatadoPor', 'ContatoData', 'Msg', 'Obs', 'Decisao'],
  BibMarcas: ['MembroID', 'Ref', 'Cor', 'Tipo', 'Comentario', 'Publico', 'Data'],
  Presencas: ['ReuniaoID', 'CelulaID', 'Data', 'MembroID'],
  Papeis: ['CelulaID', 'MembroID', 'Papel'],
  Oracoes: ['OracaoID', 'CelulaID', 'MembroID', 'Tema', 'Titulo', 'Texto', 'Data'],
  Eventos: ['EventoID', 'Titulo', 'Data', 'Hora', 'Local', 'Descricao', 'Programacao', 'Escopo', 'CelulaID', 'CriadoPor', 'Status', 'Foto', 'Insignia'],
  EventoPresenca: ['EventoID', 'MembroID', 'Data'],
  Rostos: ['MembroID', 'Descritor', 'AtualizadoEm', 'Autorizado', 'AutorizadoPor', 'AutorizadoEm'],
  Corridas: ['CorridaID', 'Titulo', 'Ano', 'Inicio', 'Fim', 'CapDia', 'TotalCap', 'Status'],
  CorridaLeitura: ['CorridaID', 'MembroID', 'Data', 'Capitulos', 'Resumo', 'Status', 'ValidadoPor', 'Obs'],
  CorridaConc: ['CorridaID', 'MembroID', 'Fim', 'Faltas', 'Faixa', 'Pos'],
  Inscricoes: ['EventoID', 'MembroID', 'Data'],
  Ministerios: ['MinisterioID', 'Nome', 'Ordem', 'Ativo', 'Descricao', 'Foto'],
  Interesses: ['InteresseID', 'MinisterioID', 'MembroID', 'Data', 'Status', 'DecididoPor', 'DataDecisao'],
  Membresias: ['MembresiaID', 'MembroID', 'CelulaID', 'Frequencias', 'Status', 'DecididoPor', 'Data', 'DataDecisao'],
  AprovLog: ['Tipo', 'RefID', 'Acao', 'Por', 'Data', 'Motivo'],
  Escalas: ['EscalaID', 'MinisterioID', 'MembroID', 'Data', 'Hora', 'Funcao', 'Status', 'Motivo', 'TrocaMembroID', 'TrocaEscalaID', 'TrocaMsg', 'OrigemMembroID', 'SerieID', 'CriadoPor', 'ConfirmadoEm', 'Reesc', 'Presente', 'Avisos'],
  EscalaPedidos: ['PedidoID', 'MinisterioID', 'MembroID', 'Data', 'Msg', 'Status', 'DecididoPor', 'DataDecisao', 'CriadoEm'],
  Musicas: ['MusicaID', 'Titulo', 'Artista', 'Youtube', 'Letra', 'Layout', 'CriadoPor', 'CriadoEm', 'AtualizadoPor', 'AtualizadoEm', 'Ativo'],
  Sod: ['MembroID', 'Pedra', 'Livre', 'LivreDesde', 'UltimoDia', 'Seq', 'Atraso', 'Caixas', 'CaixaBonus', 'Orou', 'MinAte', 'Golpes', 'Soltos', 'Abertas', 'Talentos', 'Itens', 'Equip', 'Aparencia', 'Sala'],
  Notificacoes: ['NotifID', 'MembroID', 'Tipo', 'Titulo', 'Texto', 'Ref', 'Data', 'Lida'],
  Uso: ['Mes', 'MembroID', 'Tela', 'Segundos', 'Visitas'],
  Livros: ['LivroID', 'Titulo', 'Autor', 'Descricao', 'Capa', 'ArquivoID', 'Tamanho', 'Status', 'CriadoEm'],
  LivroComentarios: ['ComentarioID', 'LivroID', 'MembroID', 'Texto', 'Pagina', 'Data', 'Status'],
  Testemunhos: ['TestemunhoID', 'MembroID', 'Titulo', 'Texto', 'Data', 'Status'],
  LivroNotas: ['LivroID', 'MembroID', 'Nota', 'Data'],
  Curtidas: ['Tipo', 'AlvoID', 'MembroID', 'Data'],
  Saidas: ['SaidaID', 'MembroID', 'CelulaID', 'Motivo', 'SolicitadoPor', 'Status', 'DecididoPor', 'Data', 'DataDecisao'],
  Transferencias: ['TransfID', 'MembroID', 'DeCelulaID', 'ParaCelulaID', 'SolicitadoPor', 'Status', 'DecididoPor', 'Data', 'DataDecisao', 'Motivo'],
  Cursos: ['CursoID', 'Nome', 'Ativo', 'Descricao', 'ProfessorID', 'ExigeAprovacao', 'PresencaMin', 'CargaHoras', 'Status', 'InicioStatus', 'Motivo', 'Foto', 'CriadoEm', 'DecididoPor', 'DataDecisao'],
  Matriculas: ['MatriculaID', 'CursoID', 'MembroID', 'Status', 'Data', 'DecididoPor', 'DataDecisao', 'Motivo', 'PresencaPct', 'Cert', 'CertCodigo', 'CertData', 'CertPor'],
  Aulas: ['AulaID', 'CursoID', 'Numero', 'Titulo', 'Descricao', 'Data', 'Inicio', 'Fim', 'ArquivoID', 'PdfNome', 'Foto', 'Dada', 'Status'],
  AulaPresenca: ['AulaID', 'MembroID', 'Presente'],
  AulaAval: ['AulaID', 'CursoID', 'MembroID', 'Nota', 'Feedback', 'Duvida', 'Obs', 'Data'],
  CertLayout: ['MembroID', 'Dados', 'Atualizado'],
  Insignias: ['MembroID', 'Codigo', 'Titulo', 'Ano', 'Data', 'Ref'],
  XpLog: ['MembroID', 'Ref', 'Pontos', 'Motivo', 'Data'],
  Perfis: ['MembroID', 'Bio', 'Capa', 'Fundo', 'Moldura', 'Versiculo', 'Oculto', 'Contorno', 'Quadro', 'Top'],
  InsigniaDefs: ['DefID', 'Nome', 'Descricao', 'Estilo', 'Forma', 'Cor1', 'Cor2', 'Icone', 'Texto', 'XP', 'Criterio', 'Ativo', 'CriadoPor', 'Niveis', 'Som'],
  Servicos: ['Atividade', 'MembroID', 'Mes', 'RegistradoPor'],
  ChatMsgs: ['MsgID', 'ConvID', 'De', 'Para', 'Texto', 'Ts', 'Lida'],
  PerfilFotos: ['MembroID', 'FotoID', 'Foto', 'Legenda', 'Ordem'],
  Assinaturas: ['MembroID', 'Tipo', 'Dado', 'Cargo', 'Atualizado', 'Fonte'],
  Noticias: ['NoticiaID', 'Titulo', 'Texto', 'Data', 'CriadoPor', 'Status'],
  Licoes: ['LicaoID', 'Titulo', 'Resumo', 'Categoria', 'Url', 'Status'],
  Dinamicas: ['DinamicaID', 'Titulo', 'Descricao', 'Minutos', 'MembroID', 'Data'],
  Produtos: ['ProdutoID', 'Nome', 'Categoria', 'Preco', 'Descricao', 'Foto', 'Opcoes', 'Ativo', 'Ordem', 'Disponivel', 'PromoPreco', 'PromoAte'],
  Pastores: ['PastorID', 'Nome', 'Cargo', 'Foto', 'Ordem', 'Ativo'],
  Agendas: ['AgendaID', 'Data', 'Nome', 'Itens', 'CriadoPor', 'CriadoEm', 'AtualizadoPor', 'AtualizadoEm'],
  MidiasTelao: ['MidiaID', 'Titulo', 'Foto', 'Mini', 'Ativo', 'CriadoPor', 'CriadoEm'],
  MuralFam: ['ItemID', 'Pagina', 'Tipo', 'X', 'Y', 'W', 'R', 'Z', 'Texto', 'Cor', 'Foto', 'Dados', 'CriadoEm'],
  FamiliaMidia: ['MidiaID', 'Tipo', 'Url', 'Foto', 'Legenda', 'Ordem', 'Ativo'],
  Videos: ['VideoID', 'Titulo', 'Url', 'Ordem', 'Status', 'Tipo', 'AoVivo', 'Hls', 'Links'],
  PushSubs: ['SubID', 'MembroID', 'Endpoint', 'P256dh', 'Auth', 'Agente', 'CriadoEm'],
  LiveComent: ['ComID', 'LiveID', 'MembroID', 'Nome', 'Texto', 'Ts'],
  Permissoes: ['Papel'].concat(PERMS),
  Config: ['Chave', 'Valor'],
  Auditoria: ['Data', 'Usuario', 'Acao', 'Alvo', 'Resultado']
};
const DEFAULT_CONFIG = { NomeIgreja: 'Ministério Cristão Zoe', WhatsApp: '', LocalNome: 'Templo Zoe', LocalEndereco: '', LinkMapa: 'https://maps.app.goo.gl/RZWqr2FkSz8aux2t7', ColunasExtras: '["Quem convidou"]', CanalYoutube: 'https://youtube.com/@zoe.digital.1', FrequenciasParaMembro: '4', LojaWhatsApp: '', FrequentadorPct: '70', FrequentadorJanela: '8', CelulasParaSupervisor: '0', SeedFiel: '0', SodAtivo: '1' };
const DEFAULT_MIN = ['Gourmet', 'Infantil', 'Mídia', 'Música', 'Som', 'Limpeza', 'Recepção'];

class ApiError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

/* ============================== SETUP ============================== */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SHEET_ID');
  if (!id) { const s = SpreadsheetApp.create(CFG.SHEET_NAME); id = s.getId(); props.setProperty('SHEET_ID', id); }
  SS_ = null; const ss = SpreadsheetApp.openById(id);
  Object.keys(SHEETS).forEach(function (n) { ensureSheet_(ss, n, SHEETS[n]); });
  const p = table_('Permissoes'), have = {}; p.rows.forEach(function (r) { have[r.Papel] = 1; });
  PAPEIS.forEach(function (r) { if (!have[r]) appendRow_(p, Object.assign({ Papel: r }, DEFAULT_PERMS[r])); });
  const c = table_('Config'), hc = {}; c.rows.forEach(function (r) { hc[r.Chave] = 1; });
  Object.keys(DEFAULT_CONFIG).forEach(function (k) { if (!hc[k]) appendRow_(c, { Chave: k, Valor: DEFAULT_CONFIG[k] }); });
  const m = table_('Ministerios');
  if (!m.rows.length) DEFAULT_MIN.forEach(function (n, i) { appendRow_(m, { MinisterioID: id_('MIN'), Nome: n, Ordem: i + 1, Ativo: '1' }); });
  const cf = table_('Config').rows.filter(function (r) { return r.Chave === 'SeedFiel'; })[0];
  if (cf && cf.Valor !== '1') { // insígnia "Usuário Fiel" (sequência de acessos), criada uma vez; depois é editável como qualquer outra
    const nv = [[5, 'Bronze', 'bronze', '#a5602c', '#f8e1c9', 50], [10, 'Prata', 'prata', '#8b97a5', '#f3f6fa', 80], [20, 'Ouro', 'ouro', '#d6a21d', '#fff1b8', 120], [50, 'Diamante', 'ouro', '#1d5f91', '#e4f1fa', 250], [100, 'Lendário', 'bordado', '#8c2f2f', '#f7e6b8', 500]].map(function (x) { return { nome: x[1], n: x[0], xp: x[5], visual: { estilo: x[2], forma: 'esc', icone: 'flame', cor1: x[3], cor2: x[4], texto: String(x[0]) } }; });
    appendRow_(table_('InsigniaDefs'), { DefID: 'IBFIEL', Nome: 'Usuário Fiel', Descricao: 'Entre no aplicativo todos os dias, sem faltar.', Estilo: 'bordado', Forma: 'esc', Cor1: '#a5602c', Cor2: '#f8e1c9', Icone: 'flame', Texto: '', XP: '50', Criterio: JSON.stringify({ tipo: 'sequencia', n: 1 }), Niveis: JSON.stringify(nv), Ativo: '1', CriadoPor: 'sistema' });
    writeRow_(table_('Config'), cf._row, { Valor: '1' });
  }
  instalaGatilhos_();
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
  appendRow_(u, { Email: email, SenhaHash: hash_(salt, String(senha)), Salt: salt, Papel: 'admin', Status: 'Ativo', GuiaVisto: '0', MembroID: mid, TrocarSenha: '', CriadoEm: now_() });
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
let SS_ = null, TMEMO_ = null;
function ss_() { if (SS_) return SS_; const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID'); if (!id) throw new ApiError('SETUP', 'Rode setup() no Apps Script.'); SS_ = SpreadsheetApp.openById(id); return SS_; }
function table_(name) {
  if (TMEMO_ && TMEMO_[name]) return TMEMO_[name];
  const sh = ss_().getSheetByName(name); if (!sh) throw new ApiError('SETUP', 'Aba ausente: ' + name + '. Rode setup().');
  const v = sh.getDataRange().getValues(), headers = (v[0] || []).map(String);
  const rows = v.slice(1).map(function (r, i) { const o = { _row: i + 2 }; headers.forEach(function (h, j) { o[h] = str_(r[j]); }); return o; }).filter(function (o) { return headers.some(function (h) { return o[h] !== ''; }); });
  const t = { name: name, sh: sh, headers: headers, rows: rows }; if (TMEMO_) TMEMO_[name] = t; return t;
}
let TZ_SHEET_ = null;
function tzSheet_() { if (TZ_SHEET_) return TZ_SHEET_; try { TZ_SHEET_ = ss_().getSpreadsheetTimeZone() || CFG.TZ; } catch (e) { TZ_SHEET_ = CFG.TZ; } return TZ_SHEET_; }
// O Google Sheets converte "20:00" em hora (ano 1899) quando a célula não é texto. Aqui devolvemos sempre texto legível.
function str_(x) { if (x instanceof Date) { if (x.getFullYear() < 1950) return Utilities.formatDate(x, tzSheet_(), 'HH:mm'); return Utilities.formatDate(x, CFG.TZ, 'yyyy-MM-dd'); } return x === null || x === undefined ? '' : String(x); }
function appendRow_(t, o) { if (TMEMO_ && t.name) delete TMEMO_[t.name]; const vals = t.headers.map(function (h) { return o[h] === undefined ? '' : o[h]; }); const rg = t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, vals.length); rg.setNumberFormat('@'); rg.setValues([vals]); } // formato texto antes de gravar: horas e datas não viram Date
function writeRow_(t, row, patch) { if (TMEMO_ && t.name) delete TMEMO_[t.name]; Object.keys(patch).forEach(function (k) { const c = t.headers.indexOf(k); if (c >= 0) { const rg = t.sh.getRange(row, c + 1, 1, 1); rg.setNumberFormat('@'); rg.setValues([[patch[k]]]); } }); }
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
function permMatrix_() { const o = {}, ps = papeis_(); table_('Permissoes').rows.forEach(function (r) { if (ps.indexOf(r.Papel) < 0) return; o[r.Papel] = {}; PERMS.forEach(function (k) { o[r.Papel][k] = (r[k] === '' || r[k] === undefined) && (DEFAULT_PERMS[r.Papel] || {})[k] !== undefined ? (DEFAULT_PERMS[r.Papel][k] ? 1 : 0) : (r[k] === '1' || r[k] === 'true' || r[k] === 1 || r[k] === true ? 1 : 0); }); }); ps.forEach(function (p) { if (!o[p]) o[p] = Object.assign({}, DEFAULT_PERMS[p] || PERMS_ZERO); }); o.admin.config = 1; o.admin.prof = 1; o.admin.cursos = 1; return o; }
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
  const d = { supervisor: all(1, 1), lider: all(1, 1), treinamento: so(['freq', 'plan', 'oracao', 'ind', 'membros', 'pres', 'hist', 'mural'], ['freq', 'pres', 'oracao']), pastor: all(1, 1), professor: JSON.parse(JSON.stringify(base)), membro: base, frequentador: JSON.parse(JSON.stringify(base)) };
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
  const urow = table_('Usuarios').rows.filter(function (r) { return String(r.Email).toLowerCase() === u.email; })[0] || {};
  return { multimidia: multiOk_(u), xp: xpResumo_(u.membroId), guiaVisto: urow.GuiaVisto !== '0', usuario: { email: u.email, papel: u.papel, tipo: tef }, abas: abas, permCelula: cp, membro: memberFull_(mm), celula: cel ? cellOut_(cel, nivelCel !== 'membro') : null, nivelCelula: nivelCel, cargos: cg, minhasCelulas: minhas, permissoes: permMatrix_()[tef], config: publicConfig_(), interesses: interessesDe_(u.membroId), membresia: membresiaDe_(u.membroId) };
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
    writeRow_(g.t, g.m._row, p); audit_(u.email, 'MEMBRO_SALVO', u.membroId, 'OK'); const novo = Object.assign({}, g.m, p); conquistasMembro_(novo); return memberFull_(novo);
  });
}
function acceptLegal_(d, u) { return withLock_(function () { const g = getMember_(u.membroId), k = d.tipo === 'termos' ? 'AceiteTermos' : 'AceitePrivacidade'; writeRow_(g.t, g.m._row, (function () { const o = {}; o[k] = now_(); return o; })()); return { ok: true }; }); }
function birthdays_(d, u) {
  const hoje = today_(), mes = hoje.slice(5, 7), dia = hoje.slice(8, 10);
  const l = table_('Membros').rows.filter(function (m) { return m.Nascimento && m.Nascimento.slice(5, 7) === mes && m.Status !== 'Inativo'; }).map(function (m) { return { id: m.MembroID, apelido: m.Apelido || m.Simples || m.Nome.split(' ')[0], dia: m.Nascimento.slice(8, 10), hoje: m.Nascimento.slice(8, 10) === dia }; });
  l.sort(function (a, b) { return a.dia < b.dia ? -1 : 1; }); return { mes: mes, lista: l };
}

// Parabéns de aniversário: só no dia, uma vez por pessoa por dia, avisa o aniversariante com uma notificação
function greet_(d, u) {
  return withLock_(function () {
    const id = clip_(d.membroId, 30), m = table_('Membros').rows.filter(function (x) { return x.MembroID === id && x.Status !== 'Inativo'; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Pessoa não encontrada.');
    const hoje = today_(); if (!m.Nascimento || m.Nascimento.slice(5) !== hoje.slice(5)) throw new ApiError('VALIDATION', 'Hoje não é o aniversário dessa pessoa.'); if (id === u.membroId) throw new ApiError('VALIDATION', 'Esse parabéns é para os outros. 😉');
    const ref = 'greet:' + u.membroId + ':' + hoje; if (table_('Notificacoes').rows.some(function (n) { return n.MembroID === id && n.Ref === ref; })) return { ok: true, repetido: true };
    notify_(id, 'parabens', (nomes_()[u.membroId] || 'Alguém') + ' te parabenizou! 🎂', 'Feliz aniversário! “Este é o dia que o Senhor fez; regozijemo-nos e alegremo-nos nele.” (Salmos 118:24)', ref); return { ok: true };
  });
}
/* ============================== CONFIG PÚBLICA ============================== */
function cfgMap_() { const o = {}; table_('Config').rows.forEach(function (r) { o[r.Chave] = r.Valor; }); return o; }
function publicConfig_() { const c = cfgMap_(); return { nomeIgreja: c.NomeIgreja, whatsapp: c.WhatsApp, localNome: c.LocalNome, localEndereco: c.LocalEndereco, linkMapa: c.LinkMapa || '', colunasExtras: jparse_(c.ColunasExtras, []), canalYoutube: c.CanalYoutube || '', lojaWhatsapp: c.LojaWhatsApp || '', frequentadorPct: Number(c.FrequentadorPct) || 70, frequentadorJanela: Number(c.FrequentadorJanela) || 8, celulasParaSupervisor: Math.max(0, Number(c.CelulasParaSupervisor) || 0), frequenciasParaMembro: freqMembro_(), sodAtivo: c.SodAtivo !== '0', notifTipos: notifTipos_(c), homeLayout: homeLayoutOk_(jparse_(c.HomeLayout, null)) }; }
const HOME_BLOCOS = ['hero', 'escalas', 'eventos', 'corrida', 'mural', 'proxevento', 'celula', 'aniv', 'domingo', 'cultos', 'testemunhos', 'noticias'];
/* Layout do Início definido pelo administrador: lista de blocos {id,on,w (2-12 colunas),h (3-80 linhas)} */
function homeLayoutOk_(l) {
  if (!Array.isArray(l)) return null; const seen = {}, out = [];
  l.slice(0, 40).forEach(function (b) { if (!b || HOME_BLOCOS.indexOf(b.id) < 0 || seen[b.id]) return; seen[b.id] = 1; const w = Math.round(Number(b.w)), h = Math.round(Number(b.h)); const fh = Math.round(Number(b.fh)), it = { id: b.id, on: b.on !== false, w: Math.max(2, Math.min(12, isFinite(w) ? w : 6)), h: Math.max(3, Math.min(80, isFinite(h) ? h : 12)) }; if (isFinite(fh) && fh > 0) it.fh = Math.max(80, Math.min(700, fh)); if (b.fit === 'contain' || b.fit === 'cover') it.fit = b.fit; out.push(it); });
  return out.length ? out : null;
}
function saveHomeLayout_(d, u) {
  return withLock_(function () {
    const lay = d.reset ? null : homeLayoutOk_(d.layout); if (!d.reset && !lay) throw new ApiError('VALIDATION', 'Layout inválido.');
    const t = table_('Config'), r = t.rows.filter(function (x) { return x.Chave === 'HomeLayout'; })[0], v = lay ? JSON.stringify(lay) : '';
    if (r) writeRow_(t, r._row, { Valor: v }); else appendRow_(t, { Chave: 'HomeLayout', Valor: v });
    audit_(u.email, 'HOME_LAYOUT', lay ? lay.length + ' blocos' : 'padrão', 'OK'); return { ok: true, layout: lay };
  });
}
const NOTIF_CATS = ['aniv', 'celula', 'eventos', 'oracao', 'cursos', 'transf', 'escala'];
function notifTipos_(c) { const o = jparse_((c || cfgMap_()).NotifTipos, {}), r = {}; NOTIF_CATS.forEach(function (k) { r[k] = o[k] !== false; }); return r; }
function saveConfig_(d, u) {
  return withLock_(function () {
    const t = table_('Config'), allow = { NomeIgreja: 120, WhatsApp: 20, LojaWhatsApp: 20, LocalNome: 120, LocalEndereco: 250, LinkMapa: 300 };
    [['FrequentadorPct', 1, 100, 'O limite de presença precisa estar entre 1 e 100.'], ['FrequentadorJanela', 1, 52, 'Informe de 1 a 52 reuniões.'], ['CelulasParaSupervisor', 0, 50, 'Informe de 0 a 50 células.']].forEach(function (q) {
      if (d[q[0]] === undefined) return; const n = Number(d[q[0]]); if (!isFinite(n) || n < q[1] || n > q[2] || Math.round(n) !== n) throw new ApiError('VALIDATION', q[3]);
      const r0 = t.rows.filter(function (x) { return x.Chave === q[0]; })[0]; if (r0) writeRow_(t, r0._row, { Valor: String(n) }); else appendRow_(t, { Chave: q[0], Valor: String(n) });
    });
    if (d.SodAtivo !== undefined) { const v = d.SodAtivo === false || d.SodAtivo === '0' || d.SodAtivo === 0 ? '0' : '1', r1 = t.rows.filter(function (x) { return x.Chave === 'SodAtivo'; })[0]; if (r1) writeRow_(t, r1._row, { Valor: v }); else appendRow_(t, { Chave: 'SodAtivo', Valor: v }); audit_(u.email, 'SOD_ATIVO', v, 'OK'); }
    if (d.FrequenciasParaMembro !== undefined) {
      const n = Number(d.FrequenciasParaMembro); if (!isFinite(n) || n < 1 || n > 50 || Math.round(n) !== n) throw new ApiError('VALIDATION', 'Informe um número inteiro de 1 a 50.');
      const r0 = t.rows.filter(function (x) { return x.Chave === 'FrequenciasParaMembro'; })[0]; if (r0) writeRow_(t, r0._row, { Valor: String(n) }); else appendRow_(t, { Chave: 'FrequenciasParaMembro', Valor: String(n) });
    }
    Object.keys(allow).forEach(function (k) {
      if (d[k] === undefined) return; let v = clip_(d[k], allow[k]); if (k === 'WhatsApp' || k === 'LojaWhatsApp') v = v.replace(/\D/g, '');
      if (k === 'LinkMapa' && v && !/^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps|google\.com\/maps|maps\.google\.com)\//.test(v)) throw new ApiError('VALIDATION', 'Use um link do Google Maps (https://maps.app.goo.gl/...).');
      const r = t.rows.filter(function (x) { return x.Chave === k; })[0]; if (r) writeRow_(t, r._row, { Valor: v }); else appendRow_(t, { Chave: k, Valor: v });
    });
    if (d.notifTipos !== undefined) { const o = {}; NOTIF_CATS.forEach(function (k) { o[k] = !(d.notifTipos && d.notifTipos[k] === false); }); const v = JSON.stringify(o), r = t.rows.filter(function (x) { return x.Chave === 'NotifTipos'; })[0]; if (r) writeRow_(t, r._row, { Valor: v }); else appendRow_(t, { Chave: 'NotifTipos', Valor: v }); }
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
function termo_(r) { return r.Termometro !== '' && r.Termometro !== undefined ? Math.max(0, Math.min(100, Number(r.Termometro) || 0)) : (r.PresencaDeDeus === '1' ? 80 : 0); }
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
    // Termômetro da presença de Deus: 0 (frio) a 100 (forte manifestação). "PresencaDeDeus" continua marcado a partir de 50 para os indicadores antigos.
    let term = d.termometro !== undefined && d.termometro !== '' ? Math.round(Number(d.termometro)) : (d.deus ? 80 : 0); if (!isFinite(term)) throw new ApiError('VALIDATION', 'Termômetro inválido.'); term = Math.max(0, Math.min(100, term));
    const patch = { Presentes: String(pres.length), PresencaDeDeus: term >= 50 ? '1' : '0', Termometro: String(term), Obs: clip_(d.obs, 500), ForaDoDia: fora ? '1' : '0', Elenco: elenco.join(','), Foto: d.foto !== undefined ? fotoOk_(d.foto) : (ex ? ex.Foto || '' : '') };
    if (ex) writeRow_(rt, ex._row, patch); else appendRow_(rt, Object.assign({ ReuniaoID: rid, CelulaID: id, Data: data }, patch));
    const pt2 = table_('Presencas'); pres.forEach(function (m) { appendRow_(pt2, { ReuniaoID: rid, CelulaID: id, Data: data, MembroID: m }); awardXp_(m, 'celula:' + id + ':' + data, 10, 'Presença na célula'); });
    membresiaCheck_(id, pres); const novas = [];
    (Array.isArray(d.decisoes) ? d.decisoes : []).slice(0, 10).forEach(function (x) { try { const r = decisaoCore_({ membroId: clip_(x.membroId, 30), nome: x.nome, telefone: x.telefone, data: data, origem: 'celula', celulaId: id, termometro: term, foto: patch.Foto }, u); novas.push(r.nome); } catch (e) { if (!(e instanceof ApiError) || e.code !== 'DUPLICATE') throw e; } });
    pres.forEach(function (m) { avaliaDefs_(m); });
    audit_(u.email, 'FREQUENCIA', id + ' ' + data + (fora ? ' (fora do dia)' : ''), 'OK'); return { reuniaoId: rid, presentes: pres.length, total: mem.length, foraDoDia: fora, atualizada: !!ex, decisoes: novas };
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
    return { data: r.Data, dia: r.Data ? diaDe_(r.Data) : '', presentes: ids.length, total: Math.max(1, el.length), deus: r.PresencaDeDeus === '1', termometro: termo_(r), obs: r.Obs || '', foraDoDia: r.ForaDoDia === '1', nomesPresentes: ids.map(function (i) { return nome[i] || '?'; }), nomesAusentes: aus };
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
  const rs = table_('Reunioes').rows.filter(function (r) { return r.CelulaID === id; }).sort(function (a, b) { return a.Data < b.Data ? -1 : 1; }), serie = rs.slice(-8).map(function (r) { return { data: r.Data, valor: termo_(r) }; });
  return { cursos: byC, eventos: byE, termometro: { media: rs.length ? Math.round(rs.reduce(function (a, r) { return a + termo_(r); }, 0) / rs.length) : null, serie: serie } };
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
    o.podeReverter = !o.semDesfazer && o.status !== 'pendente' && (o.minha || o.admOk); delete o.admOk;
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
  if (can_(u, 'cursos')) {
    const aulasC = {}; table_('Aulas').rows.forEach(function (a) { if (a.Status !== 'Removida') (aulasC[a.CursoID] = aulasC[a.CursoID] || []).push(a); }); const cursosM = {};
    table_('Cursos').rows.forEach(function (c) {
      cursosM[c.CursoID] = c; if (!c.ProfessorID) return; const au = aulasC[c.CursoID] || [], ds = au.map(function (a) { return a.Data; }).sort(), ctx = { curso: c.Nome, professor: nm(c.ProfessorID), descricao: c.Descricao || '', aulas: au.length, periodo: ds.length ? dBR_(ds[0]) + ' a ' + dBR_(ds[ds.length - 1]) : '', carga: horasTxt_(cargaMin_(c, au)), exige: c.ExigeAprovacao === '1', presencaMin: Number(c.PresencaMin) || 75 }, s0 = cursoSt_(c);
      add({ tipo: 'curso', id: c.CursoID, pessoaId: c.ProfessorID, titulo: 'Curso: ' + c.Nome, detalhe: 'Professor ' + nm(c.ProfessorID) + ' pede para publicar este curso.', status: s0 === 'pendente' ? 'pendente' : s0 === 'recusado' ? 'negado' : 'autorizado', data: c.CriadoEm || '', solicitante: nm(c.ProfessorID), decididoPorId: c.DecididoPor, decididoPor: nm(c.DecididoPor), dataDecisao: c.DataDecisao, pode: true, semDesfazer: 1, ctx: ctx });
      if (c.InicioStatus) add({ tipo: 'inicio', id: c.CursoID, pessoaId: c.ProfessorID, titulo: 'Início das aulas: ' + c.Nome, detalhe: 'Professor ' + nm(c.ProfessorID) + ' pede para começar as aulas.', status: c.InicioStatus === 'solicitado' ? 'pendente' : c.InicioStatus, data: c.CriadoEm || '', solicitante: nm(c.ProfessorID), decididoPorId: '', decididoPor: '', dataDecisao: '', pode: true, semDesfazer: 1, ctx: ctx });
    });
    table_('Matriculas').rows.forEach(function (r) { const c = cursosM[r.CursoID]; if (!c || !c.ProfessorID || c.ExigeAprovacao !== '1') return; const st = mstat_(r); if (st === 'concluido') return;
      add({ tipo: 'matricula', id: r.MatriculaID, pessoaId: r.MembroID, titulo: nm(r.MembroID) + ' quer fazer o curso ' + c.Nome, detalhe: 'Professor ' + nm(c.ProfessorID), status: st, data: r.Data, solicitante: nm(r.MembroID), decididoPorId: r.DecididoPor, decididoPor: nm(r.DecididoPor), dataDecisao: r.DataDecisao, pode: true, semDesfazer: 1, ctx: { curso: c.Nome, professor: nm(c.ProfessorID) } }); });
  }
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
const PUSHQ_ = [];
function notify_(mid, tipo, titulo, texto, ref) { if (!mid) return; PUSHQ_.push({ m: mid, t: titulo, b: texto, k: tipo }); appendRow_(table_('Notificacoes'), { NotifID: id_('NT'), MembroID: mid, Tipo: tipo, Titulo: clip_(titulo, 160), Texto: clip_(texto, 400), Ref: clip_(ref, 40), Data: now_(), Lida: '0' }); }
function listNotifications_(d, u) {
  try { escAvisos_(u); } catch (e) { }
  const l = table_('Notificacoes').rows.filter(function (n) { return n.MembroID === u.membroId; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 60);
  return { itens: l.map(function (n) { return { id: n.NotifID, tipo: n.Tipo, titulo: n.Titulo, texto: n.Texto, ref: n.Ref || '', data: n.Data, lida: n.Lida === '1' }; }), naoLidas: l.filter(function (n) { return n.Lida !== '1'; }).length };
}
function readNotifications_(d, u) {
  return withLock_(function () {
    const t = table_('Notificacoes'), ids = Array.isArray(d.ids) ? d.ids : null;
    t.rows.forEach(function (n) { if (n.MembroID === u.membroId && n.Lida !== '1' && (!ids || ids.indexOf(n.NotifID) >= 0)) writeRow_(t, n._row, { Lida: '1' }); });
    return listNotifications_({}, u);
  });
}
function clearNotifications_(d, u) {
  return withLock_(function () {
    const t = table_('Notificacoes'), ids = Array.isArray(d.ids) ? d.ids : null;
    for (let i = t.rows.length - 1; i >= 0; i--) { const n = t.rows[i]; if (n.MembroID === u.membroId && (!ids || ids.indexOf(n.NotifID) >= 0)) t.sh.deleteRow(n._row); }
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
  else if (tipo === 'curso' || tipo === 'inicio') { const r = table_('Cursos').rows.filter(function (x) { return x.CursoID === id; })[0]; if (!r) return; pessoa = r.Nome; rot = (tipo === 'curso' ? 'Curso ' : 'Início das aulas de ') + r.Nome; dest = [r.ProfessorID]; }
  else if (tipo === 'matricula') { const r = table_('Matriculas').rows.filter(function (x) { return x.MatriculaID === id; })[0]; if (!r) return; const c = table_('Cursos').rows.filter(function (x) { return x.CursoID === r.CursoID; })[0] || {}; rot = 'Matrícula no curso ' + (c.Nome || ''); dest = [r.MembroID]; }
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
  if (tipo === 'transferencia') r = decideTransfer_(d, u); else if (tipo === 'saida') r = decideExit_(d, u); else if (tipo === 'interesse') r = decideInterest_(d, u); else if (tipo === 'membresia') r = decideMembership_(d, u); else if (tipo === 'curso') r = decideCourse_(d, u); else if (tipo === 'inicio') r = decideStart_(d, u); else if (tipo === 'matricula') r = decideEnroll_(d, u); else throw new ApiError('VALIDATION', 'Tipo de pedido inválido.');
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
    if (awardXp_(u.membroId, 'dia:' + today_(), 5, 'Acesso diário')) avaliaDefs_(u.membroId); return { ok: true, n: n };
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
    .map(function (e) { return { id: e.EventoID, titulo: e.Titulo, data: e.Data, hora: e.Hora, local: e.Local, descricao: e.Descricao, programacao: jparse_(e.Programacao, []), escopo: e.Escopo, celulaId: e.CelulaID, foto: e.Foto || '', insignia: e.Insignia || '', inscrito: !!ins[e.EventoID], adm: e.Escopo !== 'celula' }; });
}
function fotoOk_(v) { v = String(v || ''); if (v && (!/^data:image\/(jpeg|png|webp);base64,/.test(v) || v.length > 45000)) throw new ApiError('VALIDATION', 'Foto inválida ou muito grande.'); return v; }
function createEvent_(d, u) {
  return withLock_(function () {
    const t = clip_(d.titulo, 120), data = clip_(d.data, 10); if (!t || !data || !dateOk_(data)) throw new ApiError('VALIDATION', 'Informe título e data válida.');
    appendRow_(table_('Eventos'), { EventoID: id_('E'), Titulo: t, Data: data, Hora: clip_(d.hora, 5), Local: clip_(d.local, 150), Descricao: clip_(d.descricao, 1000), Programacao: JSON.stringify((d.programacao || []).slice(0, 30).map(function (x) { return clip_(x, 120); })), Escopo: 'igreja', CriadoPor: u.membroId, Status: 'Ativo', Foto: fotoOk_(d.foto), Insignia: clip_(d.insignia, 60) });
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
function listLessons_() { return table_('Licoes').rows.filter(function (l) { return l.Status !== 'Removida'; }).map(function (l) { return { id: l.LicaoID, titulo: l.Titulo, resumo: l.Resumo, categoria: l.Categoria, url: l.Url }; }); }
function listDyn_() { return table_('Dinamicas').rows.map(function (x) { return { id: x.DinamicaID, titulo: x.Titulo, descricao: x.Descricao, minutos: Number(x.Minutos || 10), meu: false, membroId: x.MembroID }; }); }
function addDyn_(d, u) { const t = clip_(d.titulo, 100); if (!t) throw new ApiError('VALIDATION', 'Dê um nome à dinâmica.'); appendRow_(table_('Dinamicas'), { DinamicaID: id_('D'), Titulo: t, Descricao: clip_(d.descricao, 800), Minutos: String(Math.max(1, Math.min(240, Number(d.minutos) || 10))), MembroID: u.membroId, Data: now_() }); return { ok: true }; }
function saveLesson_(d, u) { const t = clip_(d.titulo, 120), url = clip_(d.url, 300); if (!t) throw new ApiError('VALIDATION', 'Informe o título da lição.'); if (url && !/^https:\/\//.test(url)) throw new ApiError('VALIDATION', 'O link precisa começar com https://.'); appendRow_(table_('Licoes'), { LicaoID: id_('L'), Titulo: t, Resumo: clip_(d.resumo, 400), Categoria: clip_(d.categoria, 40), Url: url, Status: 'Ativa' }); audit_(u.email, 'LICAO', t, 'OK'); return { ok: true }; }
function listVideos_() { return table_('Videos').rows.filter(function (v) { return v.Status !== 'Removido'; }).sort(function (a, b) { return Number(a.Ordem) - Number(b.Ordem); }).map(function (v) { return { id: v.VideoID, titulo: v.Titulo, url: v.Url, tipo: v.Tipo === 'live' ? 'live' : 'video', aoVivo: v.AoVivo === '1', hls: v.AoVivo === '1' ? (v.Hls || '') : '', links: jparse_(v.Links, []) }; }); }
function saveVideo_(d, u) { const t = clip_(d.titulo, 120), url = clip_(d.url, 300); if (!t || !/^https:\/\//.test(url)) throw new ApiError('VALIDATION', 'Informe título e link https.'); const v = table_('Videos'); appendRow_(v, { VideoID: id_('V'), Titulo: t, Url: url, Ordem: String(v.rows.length + 1), Status: 'Ativo', Tipo: d.tipo === 'live' ? 'live' : 'video', AoVivo: d.tipo === 'live' && d.aoVivo ? '1' : '0' }); audit_(u.email, 'VIDEO', t, 'OK'); return { ok: true }; }
function updateVideo_(d, u) { return withLock_(function () { const t = table_('Videos'), r = t.rows.filter(function (x) { return x.VideoID === d.id && x.Status !== 'Removido'; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Vídeo não encontrado.'); const p = {}; if (d.titulo !== undefined) { p.Titulo = clip_(d.titulo, 120); if (!p.Titulo) throw new ApiError('VALIDATION', 'Informe o título.'); } if (d.tipo !== undefined) p.Tipo = d.tipo === 'live' ? 'live' : 'video'; if (d.aoVivo !== undefined) p.AoVivo = d.aoVivo ? '1' : '0'; if ((p.Tipo || r.Tipo) !== 'live') p.AoVivo = '0'; writeRow_(t, r._row, p); audit_(u.email, 'VIDEO_EDIT', r.Titulo, 'OK'); return { ok: true }; }); }
/* ============================== LOJA ZOE ============================== */
const CATEGORIAS_LOJA = ['Camisetas', 'Pulseiras', 'Bonés', 'Garrafas', 'Marca-texto', 'Marcador de página', 'Porta-copos', 'Outros'];
function promoVale_(p) { const v = Number(p.PromoPreco), o = Number(p.Preco); return !!(p.PromoPreco && isFinite(v) && v > 0 && v < o && (!p.PromoAte || String(p.PromoAte) >= today_())); }
function prodOut_(p) { const pv = promoVale_(p); return { promo: pv ? Number(p.PromoPreco) : null, promoAte: pv ? String(p.PromoAte || '') : '', id: p.ProdutoID, nome: p.Nome, categoria: p.Categoria || 'Outros', preco: Number(p.Preco) || 0, descricao: p.Descricao || '', foto: p.Foto || '', opcoes: p.Opcoes || '', disponivel: p.Disponivel !== '0' }; }
function listFamilia_() {
  const ord = function (a, b) { return Number(a.Ordem || 999) - Number(b.Ordem || 999); }, on = function (r) { return r.Ativo !== '0'; };
  return {
    pastores: table_('Pastores').rows.filter(on).sort(ord).map(function (r) { return { id: r.PastorID, nome: r.Nome, cargo: r.Cargo || '', foto: r.Foto || '' }; }),
    midia: table_('FamiliaMidia').rows.filter(on).sort(ord).map(function (r) { return { id: r.MidiaID, tipo: r.Tipo === 'video' ? 'video' : 'foto', url: r.Url || '', foto: r.Foto || '', legenda: r.Legenda || '' }; })
  };
}
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
/* Promoções: escopo 'item' | 'lote' (ids marcados) | 'categoria' | 'todos'. tipo 'percent' (1–90) ou 'valor' (preço promocional fixo, só item/lote). limpar:true remove. */
function setPromo_(d, u) {
  return withLock_(function () {
    const t = table_('Produtos'), esc = String(d.escopo || '');
    if (['item', 'lote', 'categoria', 'todos'].indexOf(esc) < 0) throw new ApiError('VALIDATION', 'Escolha onde aplicar a promoção.');
    let alvo = t.rows.filter(function (r) { return r.Ativo !== '0'; });
    if (esc === 'item' || esc === 'lote') { const ids = (Array.isArray(d.ids) ? d.ids : [d.id]).map(String); alvo = alvo.filter(function (r) { return ids.indexOf(r.ProdutoID) >= 0; }); if (esc === 'item' && alvo.length !== 1) throw new ApiError('NOT_FOUND', 'Produto não encontrado.'); if (!alvo.length) throw new ApiError('VALIDATION', 'Marque ao menos um produto.'); }
    if (esc === 'categoria') { if (CATEGORIAS_LOJA.indexOf(d.categoria) < 0) throw new ApiError('VALIDATION', 'Escolha a categoria.'); alvo = alvo.filter(function (r) { return (r.Categoria || 'Outros') === d.categoria; }); if (!alvo.length) throw new ApiError('VALIDATION', 'Não há produtos nessa categoria.'); }
    if (d.limpar) { alvo.forEach(function (r) { writeRow_(t, r._row, { PromoPreco: '', PromoAte: '' }); }); audit_(u.email, 'PROMO_REMOVIDA', esc + ':' + alvo.length, 'OK'); return { n: alvo.length }; }
    const ate = d.ate ? String(d.ate) : ''; if (ate && !/^\d{4}-\d{2}-\d{2}$/.test(ate)) throw new ApiError('VALIDATION', 'Data final inválida.'); if (ate && ate < today_()) throw new ApiError('VALIDATION', 'A data final já passou.');
    const tipo = d.tipo === 'valor' ? 'valor' : 'percent', val = Number(d.valor);
    if (tipo === 'percent') { if (!isFinite(val) || val < 1 || val > 90) throw new ApiError('VALIDATION', 'Informe um desconto entre 1% e 90%.'); }
    else { if (esc === 'categoria' || esc === 'todos') throw new ApiError('VALIDATION', 'Preço fixo só vale para produtos escolhidos; use porcentagem.'); if (!isFinite(val) || val <= 0) throw new ApiError('VALIDATION', 'Informe o preço promocional.'); }
    alvo.forEach(function (r) { const o = Number(r.Preco) || 0, pr = tipo === 'percent' ? Math.round(o * (1 - val / 100) * 100) / 100 : Math.round(val * 100) / 100; if (pr >= o || pr <= 0) { if (esc === 'item') throw new ApiError('VALIDATION', 'O preço promocional precisa ser menor que o preço normal.'); return; } writeRow_(t, r._row, { PromoPreco: String(pr), PromoAte: ate }); });
    audit_(u.email, 'PROMO', esc + ':' + alvo.length, 'OK'); return { n: alvo.length };
  });
}
function deleteProduct_(d, u) { return withLock_(function () { const t = table_('Produtos'), r = t.rows.filter(function (x) { return x.ProdutoID === d.id; })[0]; if (r) writeRow_(t, r._row, { Ativo: '0' }); audit_(u.email, 'PRODUTO_REMOVIDO', d.id, 'OK'); return { ok: true }; }); }
function deleteVideo_(d, u) { return withLock_(function () { const t = table_('Videos'), r = t.rows.filter(function (x) { return x.VideoID === d.id; })[0]; if (r) writeRow_(t, r._row, { Status: 'Removido' }); return { ok: true }; }); }

/* ============================== CURSOS, AULAS E CERTIFICADOS ==============================
   Fluxo: professor cria o curso (pendente) → supervisor/pastor aprova (aprovado) → professor monta as aulas e pede o início →
   supervisor autoriza (andamento) → aulas com chamada e foto → professor encerra → avalia e emite os certificados. */
function hm_(s) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
function hmOk_(s) { s = String(s || '').trim(); if (!s) return ''; const v = hm_(s); if (v === null || v > 1439) throw new ApiError('VALIDATION', 'Horário inválido. Use HH:mm.'); return ('0' + Math.floor(v / 60)).slice(-2) + ':' + ('0' + (v % 60)).slice(-2); }
function dataOk_(s, obrig) { s = String(s || '').trim(); if (!s && !obrig) return ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + 'T12:00:00').getTime())) throw new ApiError('VALIDATION', 'Data inválida.'); return s; }
function mstat_(r) { const s = String(r.Status || '').toLowerCase(); return (s === 'matriculado' || s === 'autorizado') ? 'autorizado' : (s === 'negado' || s === 'recusada') ? 'negado' : s === 'concluido' ? 'concluido' : 'pendente'; }
function cursoSt_(c) { return c.Status || 'aprovado'; }
function cursoNoAr_(c) { const s = cursoSt_(c); return c.Ativo !== '0' && (s === 'aprovado' || s === 'andamento' || s === 'encerrado'); }
function donoCurso_(u, c) { return !!c.ProfessorID && c.ProfessorID === u.membroId; }
function gereCurso_(u, c) { return (donoCurso_(u, c) && can_(u, 'prof')) || can_(u, 'config'); }
function verCurso_(u, c) { return cursoNoAr_(c) || donoCurso_(u, c) || can_(u, 'cursos') || can_(u, 'config'); }
function getCurso_(id) { const c = table_('Cursos').rows.filter(function (r) { return r.CursoID === id; })[0]; if (!c) throw new ApiError('NOT_FOUND', 'Curso não encontrado.'); return c; }
function aulasDe_(cid) { return table_('Aulas').rows.filter(function (a) { return a.CursoID === cid && a.Status !== 'Removida'; }).sort(function (a, b) { return (a.Data + (a.Inicio || '')) < (b.Data + (b.Inicio || '')) ? -1 : 1; }); }
function cargaMin_(c, aulas) { if (c.CargaHoras && Number(c.CargaHoras) > 0) return Math.round(Number(c.CargaHoras) * 60); let t = 0; aulas.forEach(function (a) { const i = hm_(a.Inicio), f = hm_(a.Fim); if (i !== null && f !== null && f > i) t += f - i; }); return t; }
function supervisoresCursos_() { const m = permMatrix_(), ps = papeis_().filter(function (p) { return m[p] && m[p].cursos; }); const seen = {}; return table_('Usuarios').rows.filter(function (r) { return r.Status !== 'Inativo' && r.MembroID && ps.indexOf(r.Papel) >= 0 && !seen[r.MembroID] && (seen[r.MembroID] = 1); }).map(function (r) { return r.MembroID; }); }
function avisaSupervisores_(titulo, texto, ref, exceto) { supervisoresCursos_().forEach(function (m) { if (m !== exceto) notify_(m, 'curso', titulo, texto, ref); }); }
function dBR_(s) { return s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : ''; }
function horasTxt_(min) { if (!min) return ''; const h = Math.floor(min / 60), m = min % 60; return h + 'h' + (m ? ('0' + m).slice(-2) : ''); }
function resumoCurso_(c, aulas, nome) {
  const ds = aulas.map(function (a) { return a.Data; }).sort(), carga = cargaMin_(c, aulas);
  return [c.Descricao ? c.Descricao : 'Sem descrição', 'Professor: ' + (nome[c.ProfessorID] || '—'), aulas.length + ' aula(s)' + (ds.length ? ' de ' + dBR_(ds[0]) + ' a ' + dBR_(ds[ds.length - 1]) : ''), carga ? 'Carga horária: ' + horasTxt_(carga) : '', c.ExigeAprovacao === '1' ? 'Matrícula exige aprovação do supervisor' : 'Matrícula livre', 'Certificado com ' + (c.PresencaMin || 75) + '% de presença'].filter(String).join(' · ');
}
function cursoOut_(c, u, aulas, mats, nm) {
  const mine = mats.filter(function (r) { return r.MembroID === u.membroId; })[0], ds = aulas.map(function (a) { return a.Data; }).sort();
  const ativos = mats.filter(ativa_);
  return { id: c.CursoID, nome: c.Nome, descricao: c.Descricao || '', foto: c.Foto || '', professorId: c.ProfessorID || '', professor: nm[c.ProfessorID] || '', exigeAprovacao: c.ExigeAprovacao === '1', presencaMin: Number(c.PresencaMin) || 75, cargaHoras: c.CargaHoras || '', cargaMin: cargaMin_(c, aulas),
    status: cursoSt_(c), inicioStatus: c.InicioStatus || '', motivo: c.Motivo || '', legado: !c.ProfessorID, nAulas: aulas.length, de: ds[0] || '', ate: ds[ds.length - 1] || '', nAlunos: ativos.length, meu: donoCurso_(u, c),
    minha: mine ? { id: mine.MatriculaID, status: mstat_(mine), cert: mine.Cert || '', presenca: mine.PresencaPct === '' || mine.PresencaPct === undefined ? null : Number(mine.PresencaPct), motivo: mine.Motivo || '' } : null };
}
function listCourses_(d, u) {
  const nm = nomes_(), aulas = {}, mats = {}; table_('Aulas').rows.forEach(function (a) { if (a.Status !== 'Removida') (aulas[a.CursoID] = aulas[a.CursoID] || []).push(a); }); table_('Matriculas').rows.forEach(function (r) { (mats[r.CursoID] = mats[r.CursoID] || []).push(r); });
  return table_('Cursos').rows.filter(function (c) { return verCurso_(u, c); }).map(function (c) { return cursoOut_(c, u, aulas[c.CursoID] || [], mats[c.CursoID] || [], nm); });
}
function saveCourse_(d, u) {
  if (!can_(u, 'prof') && !can_(u, 'config')) throw new ApiError('FORBIDDEN', 'Só professores cadastrados criam cursos.');
  return withLock_(function () {
    const nome = clip_(d.nome, 120); if (!nome) throw new ApiError('VALIDATION', 'Informe o nome do curso.');
    let pres = d.presencaMin === undefined || d.presencaMin === '' ? 75 : Number(d.presencaMin); if (!isFinite(pres) || pres < 0 || pres > 100) throw new ApiError('VALIDATION', 'A presença mínima vai de 0 a 100%.');
    let carga = ''; if (d.cargaHoras !== undefined && d.cargaHoras !== '' && d.cargaHoras !== null) { carga = Number(d.cargaHoras); if (!isFinite(carga) || carga <= 0 || carga > 2000) throw new ApiError('VALIDATION', 'Carga horária inválida.'); carga = String(carga); }
    const patch = { Nome: nome, Descricao: clip_(d.descricao, 1200), ExigeAprovacao: d.exigeAprovacao ? '1' : '0', PresencaMin: String(Math.round(pres)), CargaHoras: carga };
    if (d.foto !== undefined && d.foto !== '__keep') patch.Foto = fotoOk_(d.foto);
    const t = table_('Cursos');
    if (d.id) {
      const c = t.rows.filter(function (r) { return r.CursoID === d.id; })[0]; if (!c) throw new ApiError('NOT_FOUND', 'Curso não encontrado.'); if (!gereCurso_(u, c)) throw new ApiError('FORBIDDEN', 'Só o professor do curso edita.');
      if (cursoSt_(c) === 'recusado') { patch.Status = 'pendente'; patch.Motivo = ''; }
      writeRow_(t, c._row, patch); audit_(u.email, 'CURSO_EDITADO', c.CursoID, 'OK');
      if (patch.Status === 'pendente') avisaSupervisores_('Curso reenviado para aprovação', nome + ' · ' + resumoCurso_(Object.assign({}, c, patch), aulasDe_(c.CursoID), nomes_()), 'curso:' + c.CursoID, u.membroId);
      return { id: c.CursoID };
    }
    const id = id_('CUR'); appendRow_(t, Object.assign({ CursoID: id, Ativo: '1', ProfessorID: u.membroId, Status: 'pendente', CriadoEm: now_() }, patch));
    audit_(u.email, 'CURSO_NOVO', id, 'OK'); avisaSupervisores_('Novo curso para aprovar', nome + ' · ' + resumoCurso_(Object.assign({ ProfessorID: u.membroId }, patch), [], nomes_()), 'curso:' + id, u.membroId);
    return { id: id };
  });
}
function renumera_(cid) { const t = table_('Aulas'); aulasDe_(cid).forEach(function (a, i) { if (String(a.Numero) !== String(i + 1)) writeRow_(t, a._row, { Numero: String(i + 1) }); }); }
function saveAula_(d, u) {
  return withLock_(function () {
    const c = getCurso_(clip_(d.cursoId, 30)); if (!gereCurso_(u, c)) throw new ApiError('FORBIDDEN', 'Só o professor do curso monta as aulas.');
    const st = cursoSt_(c); if (st === 'encerrado' || st === 'recusado') throw new ApiError('VALIDATION', 'Esse curso não aceita mais alterações nas aulas.');
    const titulo = clip_(d.titulo, 150); if (!titulo) throw new ApiError('VALIDATION', 'Informe o título da aula.');
    const patch = { Titulo: titulo, Descricao: clip_(d.descricao, 800), Data: dataOk_(d.data, true), Inicio: hmOk_(d.inicio), Fim: hmOk_(d.fim) };
    if (patch.Inicio && patch.Fim && hm_(patch.Fim) <= hm_(patch.Inicio)) throw new ApiError('VALIDATION', 'O fim precisa ser depois do início.');
    if (d.foto !== undefined && d.foto !== '__keep') patch.Foto = fotoOk_(d.foto);
    const t = table_('Aulas'), ex = d.id ? t.rows.filter(function (r) { return r.AulaID === d.id && r.CursoID === c.CursoID && r.Status !== 'Removida'; })[0] : null; if (d.id && !ex) throw new ApiError('NOT_FOUND', 'Aula não encontrada.');
    const pdf = String(d.pdf || '');
    if (pdf) {
      if (pdf.length > MAX_PDF_B64) throw new ApiError('VALIDATION', 'PDF muito grande (máximo ~10 MB).'); if (pdf.slice(0, 5) !== 'JVBER') throw new ApiError('VALIDATION', 'O arquivo precisa ser um PDF.');
      const bytes = Utilities.base64Decode(pdf), nomeArq = clip_(d.pdfNome, 120) || (titulo + '.pdf'), file = pastaLivros_().createFile(Utilities.newBlob(bytes, 'application/pdf', nomeArq));
      if (ex && ex.ArquivoID) { try { DriveApp.getFileById(ex.ArquivoID).setTrashed(true); } catch (e) { /* já removido */ } }
      patch.ArquivoID = file.getId(); patch.PdfNome = nomeArq;
    }
    let id;
    if (ex) { writeRow_(t, ex._row, patch); id = ex.AulaID; audit_(u.email, 'AULA_EDITADA', id, 'OK'); }
    else { id = id_('AU'); appendRow_(t, Object.assign({ AulaID: id, CursoID: c.CursoID, Numero: '0', Status: 'Ativa' }, patch)); audit_(u.email, 'AULA_NOVA', id, 'OK'); }
    renumera_(c.CursoID); return { id: id };
  });
}
function deleteAula_(d, u) {
  return withLock_(function () {
    const t = table_('Aulas'), a = t.rows.filter(function (r) { return r.AulaID === d.id && r.Status !== 'Removida'; })[0]; if (!a) throw new ApiError('NOT_FOUND', 'Aula não encontrada.');
    const c = getCurso_(a.CursoID); if (!gereCurso_(u, c)) throw new ApiError('FORBIDDEN', 'Só o professor do curso remove aulas.'); if (a.Dada === '1') throw new ApiError('VALIDATION', 'Essa aula já foi dada e tem chamada lançada.');
    if (a.ArquivoID) { try { DriveApp.getFileById(a.ArquivoID).setTrashed(true); } catch (e) { /* já removido */ } }
    writeRow_(t, a._row, { Status: 'Removida', ArquivoID: '' }); renumera_(c.CursoID); audit_(u.email, 'AULA_REMOVIDA', a.AulaID, 'OK'); return { ok: true };
  });
}
function ativa_(r) { const s = mstat_(r); return s === 'autorizado' || s === 'concluido'; }
function acessoMatricula_(u, c) { return table_('Matriculas').rows.some(function (r) { return r.CursoID === c.CursoID && r.MembroID === u.membroId && ativa_(r); }); }
function courseDetail_(d, u) {
  const c = getCurso_(clip_(d.cursoId, 30)); if (!verCurso_(u, c)) throw new ApiError('FORBIDDEN', 'Curso indisponível.');
  const nm = nomes_(), aulas = aulasDe_(c.CursoID), mats = table_('Matriculas').rows.filter(function (r) { return r.CursoID === c.CursoID; });
  const staff = gereCurso_(u, c) || can_(u, 'cursos'), aluno = acessoMatricula_(u, c), full = staff || aluno;
  const pres = {}, av = {}, stats = {};
  table_('AulaPresenca').rows.forEach(function (p) { if (p.MembroID === u.membroId) pres[p.AulaID] = p.Presente === '1'; });
  table_('AulaAval').rows.forEach(function (a) { if (a.CursoID !== c.CursoID) return; if (a.MembroID === u.membroId) av[a.AulaID] = { nota: a.Nota ? Number(a.Nota) : null, feedback: a.Feedback || '', duvida: a.Duvida || '', obs: a.Obs || '' }; const s = (stats[a.AulaID] = stats[a.AulaID] || { n: 0, soma: 0, c: 0 }); s.c++; if (a.Nota) { s.n++; s.soma += Number(a.Nota); } });
  const hoje = today_();
  return { curso: cursoOut_(c, u, aulas, mats, nm), pode: { gerir: gereCurso_(u, c), supervisor: can_(u, 'cursos'), aluno: aluno }, resumo: resumoCurso_(c, aulas, nm),
    aulas: aulas.map(function (a) { const o = { id: a.AulaID, numero: Number(a.Numero) || 0, titulo: a.Titulo, data: a.Data, inicio: a.Inicio || '', fim: a.Fim || '', dada: a.Dada === '1', passou: a.Data < hoje };
      if (full) { o.descricao = a.Descricao || ''; o.temPdf = !!a.ArquivoID; o.pdfNome = a.PdfNome || ''; o.foto = a.Foto || ''; o.presente = pres[a.AulaID] === undefined ? null : pres[a.AulaID]; o.minha = av[a.AulaID] || null; }
      if (staff) { const s = stats[a.AulaID]; o.media = s && s.n ? Math.round(s.soma / s.n * 10) / 10 : null; o.nAval = s ? s.c : 0; } return o; }) };
}
function getAulaPdf_(d, u) {
  const a = table_('Aulas').rows.filter(function (r) { return r.AulaID === d.id && r.Status !== 'Removida'; })[0]; if (!a || !a.ArquivoID) throw new ApiError('NOT_FOUND', 'Arquivo não encontrado.');
  const c = getCurso_(a.CursoID); if (!(gereCurso_(u, c) || can_(u, 'cursos') || acessoMatricula_(u, c))) throw new ApiError('FORBIDDEN', 'O material é só para quem está matriculado.');
  return { pdf: Utilities.base64Encode(DriveApp.getFileById(a.ArquivoID).getBlob().getBytes()), nome: a.PdfNome || 'aula.pdf' };
}
function enrollCourse_(d, u) {
  return withLock_(function () {
    const c = getCurso_(clip_(d.cursoId, 30)); if (!cursoNoAr_(c) || cursoSt_(c) === 'encerrado') throw new ApiError('VALIDATION', 'Esse curso não está aberto para matrícula.');
    if (donoCurso_(u, c)) throw new ApiError('VALIDATION', 'Você é o professor deste curso.');
    const t = table_('Matriculas'), ex = t.rows.filter(function (r) { return r.CursoID === c.CursoID && r.MembroID === u.membroId; })[0]; if (ex) return { status: mstat_(ex), id: ex.MatriculaID };
    const exige = c.ExigeAprovacao === '1', st = exige ? 'pendente' : 'autorizado', id = id_('MAT');
    appendRow_(t, { MatriculaID: id, CursoID: c.CursoID, MembroID: u.membroId, Status: st, Data: now_() });
    if (exige) avisaSupervisores_('Matrícula para aprovar', (nomes_()[u.membroId] || 'Membro') + ' quer fazer o curso ' + c.Nome, 'matricula:' + id, u.membroId);
    else notify_(c.ProfessorID, 'curso', 'Novo aluno em ' + c.Nome, (nomes_()[u.membroId] || 'Membro') + ' se matriculou.', 'curso:' + c.CursoID);
    return { status: st, id: id };
  });
}
function requestStart_(d, u) {
  return withLock_(function () {
    const c = getCurso_(clip_(d.cursoId, 30)); if (!gereCurso_(u, c)) throw new ApiError('FORBIDDEN', 'Só o professor do curso.'); if (cursoSt_(c) !== 'aprovado') throw new ApiError('VALIDATION', 'O curso precisa estar aprovado e ainda não iniciado.');
    if (c.InicioStatus === 'solicitado') throw new ApiError('VALIDATION', 'O pedido de início já foi enviado.'); const aulas = aulasDe_(c.CursoID); if (!aulas.length) throw new ApiError('VALIDATION', 'Cadastre ao menos uma aula antes de pedir o início.');
    writeRow_(table_('Cursos'), c._row, { InicioStatus: 'solicitado', Motivo: '' }); avisaSupervisores_('Pedido de início de aulas', c.Nome + ' · ' + resumoCurso_(c, aulas, nomes_()), 'inicio:' + c.CursoID, u.membroId); return { ok: true };
  });
}
function decideCourse_(d, u) {
  return withLock_(function () {
    if (!can_(u, 'cursos')) throw new ApiError('FORBIDDEN', 'Só supervisores aprovam cursos.');
    const t = table_('Cursos'), c = getCurso_(d.id); if (cursoSt_(c) !== 'pendente' || !c.ProfessorID) throw new ApiError('VALIDATION', 'Esse curso já foi decidido.');
    const st = d.decisao === 'autorizado' ? 'autorizado' : 'negado'; writeRow_(t, c._row, { Status: st === 'autorizado' ? 'aprovado' : 'recusado', DecididoPor: u.membroId, DataDecisao: now_(), Motivo: st === 'negado' ? clip_(d.motivo, 300) : '' }); audit_(u.email, 'CURSO_' + st.toUpperCase(), c.CursoID, 'OK'); return { status: st };
  });
}
function decideStart_(d, u) {
  return withLock_(function () {
    if (!can_(u, 'cursos')) throw new ApiError('FORBIDDEN', 'Só supervisores autorizam o início.');
    const t = table_('Cursos'), c = getCurso_(d.id); if (c.InicioStatus !== 'solicitado') throw new ApiError('VALIDATION', 'Esse pedido já foi decidido.');
    const st = d.decisao === 'autorizado' ? 'autorizado' : 'negado'; writeRow_(t, c._row, st === 'autorizado' ? { InicioStatus: 'autorizado', Status: 'andamento', Motivo: '' } : { InicioStatus: 'negado', Motivo: clip_(d.motivo, 300) }); audit_(u.email, 'CURSO_INICIO_' + st.toUpperCase(), c.CursoID, 'OK'); return { status: st };
  });
}
function decideEnroll_(d, u) {
  return withLock_(function () {
    if (!can_(u, 'cursos')) throw new ApiError('FORBIDDEN', 'Só supervisores permitem matrículas.');
    const t = table_('Matriculas'), r = t.rows.filter(function (x) { return x.MatriculaID === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Matrícula não encontrada.'); if (mstat_(r) !== 'pendente') throw new ApiError('VALIDATION', 'Essa matrícula já foi decidida.');
    const st = d.decisao === 'autorizado' ? 'autorizado' : 'negado'; writeRow_(t, r._row, { Status: st, DecididoPor: u.membroId, DataDecisao: now_(), Motivo: st === 'negado' ? clip_(d.motivo, 300) : '' }); audit_(u.email, 'MATRICULA_' + st.toUpperCase(), r.MatriculaID, 'OK'); return { status: st };
  });
}
function getClassRoll_(d, u) {
  const a = table_('Aulas').rows.filter(function (r) { return r.AulaID === d.aulaId && r.Status !== 'Removida'; })[0]; if (!a) throw new ApiError('NOT_FOUND', 'Aula não encontrada.'); const c = getCurso_(a.CursoID); if (!gereCurso_(u, c)) throw new ApiError('FORBIDDEN', 'Só o professor do curso lança a chamada.');
  const nm = nomes_(), pr = {}; table_('AulaPresenca').rows.forEach(function (p) { if (p.AulaID === a.AulaID) pr[p.MembroID] = p.Presente === '1'; });
  return { aula: { id: a.AulaID, titulo: a.Titulo, data: a.Data, dada: a.Dada === '1', foto: a.Foto || '' }, curso: c.Nome, alunos: table_('Matriculas').rows.filter(function (r) { return r.CursoID === c.CursoID && mstat_(r) === 'autorizado'; }).map(function (r) { return { id: r.MembroID, nome: nm[r.MembroID] || 'Membro', presente: !!pr[r.MembroID] }; }).sort(function (x, y) { return x.nome.localeCompare(y.nome); }) };
}
function saveClassRoll_(d, u) {
  return withLock_(function () {
    const ta = table_('Aulas'), a = ta.rows.filter(function (r) { return r.AulaID === d.aulaId && r.Status !== 'Removida'; })[0]; if (!a) throw new ApiError('NOT_FOUND', 'Aula não encontrada.'); const c = getCurso_(a.CursoID); if (!gereCurso_(u, c)) throw new ApiError('FORBIDDEN', 'Só o professor do curso lança a chamada.');
    if (cursoSt_(c) !== 'andamento') throw new ApiError('VALIDATION', 'A chamada só é lançada com o curso em andamento (depois que o supervisor autoriza o início).');
    const ok = {}; table_('Matriculas').rows.forEach(function (r) { if (r.CursoID === c.CursoID && mstat_(r) === 'autorizado') ok[r.MembroID] = 1; });
    const pres = {}; (Array.isArray(d.presentes) ? d.presentes : []).forEach(function (m) { if (ok[m]) pres[m] = 1; });
    const t = table_('AulaPresenca'), mine = t.rows.filter(function (p) { return p.AulaID === a.AulaID; }); Object.keys(ok).forEach(function (m) { const ex = mine.filter(function (p) { return p.MembroID === m; })[0], v = pres[m] ? '1' : '0'; if (ex) writeRow_(t, ex._row, { Presente: v }); else appendRow_(t, { AulaID: a.AulaID, MembroID: m, Presente: v }); });
    const patch = { Dada: '1' }; if (d.foto !== undefined && d.foto !== '__keep') patch.Foto = fotoOk_(d.foto); writeRow_(ta, a._row, patch); audit_(u.email, 'CHAMADA_AULA', a.AulaID, 'OK'); return { presentes: Object.keys(pres).length, total: Object.keys(ok).length };
  });
}
function presencaPct_(cid, mid, nAulas, presRows) { if (!nAulas) return 0; let n = 0; presRows.forEach(function (p) { if (p.MembroID === mid && p.Presente === '1') n++; }); return Math.round(n / nAulas * 1000) / 10; }
function finishCourse_(d, u) {
  return withLock_(function () {
    const c = getCurso_(clip_(d.cursoId, 30)); if (!gereCurso_(u, c)) throw new ApiError('FORBIDDEN', 'Só o professor do curso.'); if (cursoSt_(c) !== 'andamento') throw new ApiError('VALIDATION', 'Só é possível encerrar um curso em andamento.');
    const aulas = aulasDe_(c.CursoID), ids = {}; aulas.forEach(function (a) { ids[a.AulaID] = 1; }); const pr = table_('AulaPresenca').rows.filter(function (p) { return ids[p.AulaID]; }), tm = table_('Matriculas');
    tm.rows.forEach(function (r) { if (r.CursoID !== c.CursoID || mstat_(r) !== 'autorizado') return; writeRow_(tm, r._row, { PresencaPct: String(presencaPct_(c.CursoID, r.MembroID, aulas.length, pr)), Cert: 'pendente' }); notify_(r.MembroID, 'curso', 'Curso encerrado: ' + c.Nome, 'O professor vai avaliar a sua presença e liberar o certificado.', 'curso:' + c.CursoID); });
    writeRow_(table_('Cursos'), c._row, { Status: 'encerrado' }); audit_(u.email, 'CURSO_ENCERRADO', c.CursoID, 'OK'); return { ok: true };
  });
}
function certCodigo_(mid) { let h = 0; const s = String(mid) + 'zoe'; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1679616; return 'ZOE-' + today_().slice(0, 4) + '-' + ('0000' + String(mid).replace(/\D/g, '')).slice(-4) + ('00' + h.toString(36).toUpperCase()).slice(-4); }
function listCertificates_(d, u) {
  const c = getCurso_(clip_(d.cursoId, 30)); if (!(gereCurso_(u, c) || can_(u, 'cursos'))) throw new ApiError('FORBIDDEN', 'Só o professor do curso.');
  const nm = nomes_(), aulas = aulasDe_(c.CursoID), ids = {}; aulas.forEach(function (a) { ids[a.AulaID] = 1; }); const pr = table_('AulaPresenca').rows.filter(function (p) { return ids[p.AulaID]; }), min = Number(c.PresencaMin) || 75;
  return { curso: c.Nome, presencaMin: min, encerrado: cursoSt_(c) === 'encerrado', alunos: table_('Matriculas').rows.filter(function (r) { return r.CursoID === c.CursoID && ativa_(r); }).map(function (r) { const p = r.PresencaPct !== '' && r.PresencaPct !== undefined ? Number(r.PresencaPct) : presencaPct_(c.CursoID, r.MembroID, aulas.length, pr); return { id: r.MatriculaID, membroId: r.MembroID, nome: nm[r.MembroID] || 'Membro', presenca: p, atinge: p >= min, cert: r.Cert || '' }; }).sort(function (a, b) { return a.nome.localeCompare(b.nome); }) };
}
function decideCert_(d, u) {
  return withLock_(function () {
    const t = table_('Matriculas'), tc = table_('Cursos'); const ids = Array.isArray(d.ids) ? d.ids : [d.id]; let n = 0, c0 = null;
    const ass = table_('Assinaturas').rows.filter(function (r) { return r.MembroID === u.membroId; })[0];
    if (d.decisao === 'autorizado' && !ass) throw new ApiError('VALIDATION', 'Cadastre a sua assinatura antes de emitir certificados.');
    ids.forEach(function (id) {
      const r = t.rows.filter(function (x) { return x.MatriculaID === id; })[0]; if (!r) return; const c = tc.rows.filter(function (x) { return x.CursoID === r.CursoID; })[0]; if (!c || !gereCurso_(u, c)) throw new ApiError('FORBIDDEN', 'Só o professor do curso avalia.'); if (cursoSt_(c) !== 'encerrado') throw new ApiError('VALIDATION', 'Encerre o curso antes de emitir certificados.'); c0 = c;
      if (d.decisao === 'autorizado') { writeRow_(t, r._row, { Cert: 'emitido', CertCodigo: certCodigo_(r.MatriculaID), CertData: today_(), CertPor: u.membroId, Status: 'concluido' }); awardBadge_(r.MembroID, 'curso:' + c.CursoID, c.Nome, today_().slice(0, 4), 300); avaliaDefs_(r.MembroID); notify_(r.MembroID, 'curso', 'Seu certificado está pronto', 'Curso ' + c.Nome + '. Veja em Cursos › Cursos que você fez.', 'curso:' + c.CursoID); }
      else writeRow_(t, r._row, { Cert: 'negado', Motivo: clip_(d.motivo, 300) });
      n++;
    });
    audit_(u.email, 'CERTIFICADO_' + (d.decisao === 'autorizado' ? 'EMITIDO' : 'NEGADO'), c0 ? c0.CursoID : '', 'OK'); return { n: n };
  });
}
function sigOut_(mid) { const s = table_('Assinaturas').rows.filter(function (r) { return r.MembroID === mid; })[0]; return s ? { tipo: s.Tipo, dado: s.Dado, cargo: s.Cargo || '', fonte: s.Fonte || 'great' } : null; }
function getSignature_(d, u) { return { assinatura: sigOut_(u.membroId) }; }
const SIG_FONTES = ['great', 'dancing', 'allura', 'sacramento', 'mrdafoe', 'homemade', 'caveat', 'satisfy'];
function saveSignature_(d, u) {
  if (!(can_(u, 'prof') || can_(u, 'cursos') || can_(u, 'config'))) throw new ApiError('FORBIDDEN', 'Só professores e supervisores cadastram assinatura.');
  return withLock_(function () {
    const tipo = d.tipo === 'texto' ? 'texto' : 'desenho'; let dado = String(d.dado || ''); const cargo = clip_(d.cargo, 60);
    if (tipo === 'desenho') { if (!/^data:image\/png;base64,/.test(dado) || dado.length > 40000) throw new ApiError('VALIDATION', 'Assinatura inválida ou grande demais. Desenhe de novo.'); } else { dado = clip_(dado, 60); if (!dado) throw new ApiError('VALIDATION', 'Digite o nome da assinatura.'); }
    const t = table_('Assinaturas'), ex = t.rows.filter(function (r) { return r.MembroID === u.membroId; })[0], row = { Tipo: tipo, Dado: dado, Cargo: cargo, Atualizado: now_(), Fonte: SIG_FONTES.indexOf(d.fonte) >= 0 ? d.fonte : 'great' };
    if (ex) writeRow_(t, ex._row, row); else appendRow_(t, Object.assign({ MembroID: u.membroId }, row)); return { ok: true };
  });
}
// ---- layout do certificado (cada professor edita o seu) ----
const CERT_PAD = { cor1: '#0B6B35', cor2: '#DD3326', fundo: '#FFFDF6', moldura: 'dupla', fonte: 'cursiva', titulo: 'CERTIFICADO', subtitulo: 'de conclusão de curso', abertura: 'Certificamos que', rodape: 'Ministério Zoe · Vida de Deus', logo: '1', descricao: '1', carga: '1', periodo: '1', presenca: '1', assinEstilo: 'cadastrada', assinFonte: 'great', assinCor: '#16336b' };
function layoutLimpo_(d) {
  const o = {}, cor = function (k) { if (d[k] === undefined) return; if (!/^#[0-9a-fA-F]{6}$/.test(String(d[k]))) throw new ApiError('VALIDATION', 'Cor inválida.'); o[k] = String(d[k]).toLowerCase(); };
  ['cor1', 'cor2', 'fundo', 'assinCor'].forEach(cor);
  if (d.assinEstilo !== undefined) { if (['cadastrada', 'cursiva'].indexOf(d.assinEstilo) < 0) throw new ApiError('VALIDATION', 'Estilo de assinatura inválido.'); o.assinEstilo = d.assinEstilo; }
  if (d.assinFonte !== undefined) { if (SIG_FONTES.indexOf(d.assinFonte) < 0) throw new ApiError('VALIDATION', 'Fonte de assinatura inválida.'); o.assinFonte = d.assinFonte; }
  if (d.moldura !== undefined) { if (['dupla', 'simples', 'ornamental', 'nenhuma'].indexOf(d.moldura) < 0) throw new ApiError('VALIDATION', 'Moldura inválida.'); o.moldura = d.moldura; }
  if (d.fonte !== undefined) { if (['cursiva', 'serifada', 'moderna'].indexOf(d.fonte) < 0) throw new ApiError('VALIDATION', 'Fonte inválida.'); o.fonte = d.fonte; }
  [['titulo', 40], ['subtitulo', 60], ['abertura', 60], ['rodape', 90]].forEach(function (p) { if (d[p[0]] !== undefined) o[p[0]] = clip_(d[p[0]], p[1]); });
  ['logo', 'descricao', 'carga', 'periodo', 'presenca'].forEach(function (k) { if (d[k] !== undefined) o[k] = (d[k] === true || d[k] === '1' || d[k] === 1) ? '1' : '0'; });
  return o;
}
function layoutDe_(mid) { const r = table_('CertLayout').rows.filter(function (x) { return x.MembroID === mid; })[0]; return Object.assign({}, CERT_PAD, r ? jparse_(r.Dados, {}) : {}); }
function podeLayout_(u) { if (!(can_(u, 'prof') || can_(u, 'cursos') || can_(u, 'config'))) throw new ApiError('FORBIDDEN', 'Só professores e supervisores editam o layout.'); }
function getCertLayout_(d, u) { podeLayout_(u); return { layout: layoutDe_(u.membroId), padrao: CERT_PAD }; }
function saveCertLayout_(d, u) {
  podeLayout_(u);
  return withLock_(function () {
    const t = table_('CertLayout'), ex = t.rows.filter(function (x) { return x.MembroID === u.membroId; })[0], dados = d.reset ? '{}' : JSON.stringify(layoutLimpo_(d.layout || {}));
    if (ex) writeRow_(t, ex._row, { Dados: dados, Atualizado: now_() }); else appendRow_(t, { MembroID: u.membroId, Dados: dados, Atualizado: now_() }); return { layout: layoutDe_(u.membroId) };
  });
}
function certData_(c, r, aluno, lay) {
  const mem = {}; table_('Membros').rows.forEach(function (m) { mem[m.MembroID] = m; }); const aulas = aulasDe_(c.CursoID), ds = aulas.map(function (a) { return a.Data; }).sort();
  const us = {}; table_('Usuarios').rows.forEach(function (x) { us[x.MembroID] = x; });
  const pess = function (mid, pad) { if (!mid) return null; const m = mem[mid] || {}, sg = sigOut_(mid), papel = (us[mid] || {}).Papel || ''; return { nome: m.Nome || m.Simples || '', cargo: (sg && sg.cargo) || pad(papel), assinatura: sg ? { tipo: sg.tipo, dado: sg.dado, fonte: sg.fonte } : null }; };
  const prof = pess(c.ProfessorID, function () { return 'Professor'; });
  const sup = c.DecididoPor && c.DecididoPor !== c.ProfessorID ? pess(c.DecididoPor, function (p) { return p === 'pastor' ? 'Pastor e Supervisor' : p === 'admin' ? 'Administração e Supervisor' : 'Supervisor'; }) : null;
  return { codigo: r && r.CertCodigo ? r.CertCodigo : 'PRÉVIA', data: r && r.CertData ? r.CertData : today_(), aluno: aluno, presenca: r ? Number(r.PresencaPct) || 0 : 100, layout: lay || layoutDe_(c.ProfessorID), curso: { nome: c.Nome, descricao: c.Descricao || '', cargaMin: cargaMin_(c, aulas), nAulas: aulas.length, inicio: ds[0] || '', fim: ds[ds.length - 1] || '', presencaMin: Number(c.PresencaMin) || 75 }, professor: prof, supervisor: sup };
}
function certificate_(d, u) {
  const r = table_('Matriculas').rows.filter(function (x) { return x.MatriculaID === d.id; })[0]; if (!r || r.Cert !== 'emitido') throw new ApiError('NOT_FOUND', 'Certificado não encontrado.');
  const c = getCurso_(r.CursoID); if (!(r.MembroID === u.membroId || gereCurso_(u, c) || can_(u, 'cursos'))) throw new ApiError('FORBIDDEN', 'Este certificado é de outra pessoa.');
  const m = table_('Membros').rows.filter(function (x) { return x.MembroID === r.MembroID; })[0] || {}; return certData_(c, r, m.Nome || '', null);
}
// prévia: vale a qualquer momento (curso em andamento ou encerrado), com um aluno de verdade ou um nome de exemplo, e com o layout ainda não salvo
function previewCert_(d, u) {
  const c = getCurso_(clip_(d.cursoId, 30)); if (!(gereCurso_(u, c) || can_(u, 'cursos'))) throw new ApiError('FORBIDDEN', 'Só o professor do curso.');
  const r = d.matriculaId ? table_('Matriculas').rows.filter(function (x) { return x.MatriculaID === d.matriculaId && x.CursoID === c.CursoID; })[0] : null; let nome = 'Nome do Aluno', reg = null;
  if (r) { const m = table_('Membros').rows.filter(function (x) { return x.MembroID === r.MembroID; })[0] || {}; nome = m.Nome || nome; const aulas = aulasDe_(c.CursoID), ids = {}; aulas.forEach(function (a) { ids[a.AulaID] = 1; }); reg = { PresencaPct: String(r.PresencaPct !== '' && r.PresencaPct !== undefined ? r.PresencaPct : presencaPct_(c.CursoID, r.MembroID, aulas.length, table_('AulaPresenca').rows.filter(function (p) { return ids[p.AulaID]; }))) }; }
  const lay = d.layout ? Object.assign({}, CERT_PAD, layoutLimpo_(d.layout)) : layoutDe_(c.ProfessorID); return certData_(c, reg, nome, lay);
}
// exclui um certificado emitido por engano: o aluno volta a "a avaliar", a insígnia e o XP daquele curso saem
function revokeCert_(d, u) {
  return withLock_(function () {
    const t = table_('Matriculas'), r = t.rows.filter(function (x) { return x.MatriculaID === d.id; })[0]; if (!r || r.Cert !== 'emitido') throw new ApiError('NOT_FOUND', 'Certificado não encontrado.');
    const c = getCurso_(r.CursoID); if (!(gereCurso_(u, c) || can_(u, 'cursos'))) throw new ApiError('FORBIDDEN', 'Só o professor do curso.');
    const ano = String(r.CertData || '').slice(0, 4), ref = 'curso:' + c.CursoID + ':' + ano;
    writeRow_(t, r._row, { Cert: 'pendente', CertCodigo: '', CertData: '', CertPor: '', Status: 'autorizado' });
    const ti = table_('Insignias'), tx = table_('XpLog');
    ti.rows.filter(function (x) { return x.MembroID === r.MembroID && x.Ref === ref; }).sort(function (a, b) { return b._row - a._row; }).forEach(function (x) { ti.sh.deleteRow(x._row); });
    tx.rows.filter(function (x) { return x.MembroID === r.MembroID && x.Ref === 'insignia:' + ref; }).sort(function (a, b) { return b._row - a._row; }).forEach(function (x) { tx.sh.deleteRow(x._row); });
    notify_(r.MembroID, 'curso', 'Certificado removido', 'O certificado de ' + c.Nome + ' foi retirado pelo professor. Ele pode ser emitido de novo depois.', 'curso:' + c.CursoID);
    audit_(u.email, 'CERTIFICADO_REVOGADO', c.CursoID + ':' + r.MatriculaID, 'OK'); return { ok: true };
  });
}
function rateAula_(d, u) {
  return withLock_(function () {
    const a = table_('Aulas').rows.filter(function (r) { return r.AulaID === d.aulaId && r.Status !== 'Removida'; })[0]; if (!a) throw new ApiError('NOT_FOUND', 'Aula não encontrada.'); const c = getCurso_(a.CursoID);
    if (!acessoMatricula_(u, c)) throw new ApiError('FORBIDDEN', 'Só quem está matriculado avalia as aulas.'); if (a.Data > today_() && a.Dada !== '1') throw new ApiError('VALIDATION', 'Você poderá avaliar depois que a aula acontecer.');
    let nota = ''; if (d.nota !== undefined && d.nota !== '' && d.nota !== null) { nota = Math.round(Number(d.nota)); if (!isFinite(nota) || nota < 1 || nota > 10) throw new ApiError('VALIDATION', 'A nota vai de 1 a 10.'); nota = String(nota); }
    const fb = clip_(d.feedback, 500), dv = clip_(d.duvida, 500), ob = clip_(d.obs, 500); if (!nota && !fb && !dv && !ob) throw new ApiError('VALIDATION', 'Dê uma nota ou escreva um comentário.');
    const t = table_('AulaAval'), ex = t.rows.filter(function (r) { return r.AulaID === a.AulaID && r.MembroID === u.membroId; })[0], row = { Nota: nota, Feedback: fb, Duvida: dv, Obs: ob, Data: now_() };
    if (ex) writeRow_(t, ex._row, row); else appendRow_(t, Object.assign({ AulaID: a.AulaID, CursoID: c.CursoID, MembroID: u.membroId }, row));
    if (dv) notify_(c.ProfessorID, 'curso', 'Dúvida na aula ' + a.Titulo, (nomes_()[u.membroId] || 'Aluno') + ': ' + dv, 'curso:' + c.CursoID); return { ok: true };
  });
}
function aulaFeedback_(d, u) {
  const a = table_('Aulas').rows.filter(function (r) { return r.AulaID === d.aulaId; })[0]; if (!a) throw new ApiError('NOT_FOUND', 'Aula não encontrada.'); const c = getCurso_(a.CursoID); if (!(gereCurso_(u, c) || can_(u, 'cursos'))) throw new ApiError('FORBIDDEN', 'Só o professor e os supervisores veem as avaliações.');
  const nm = nomes_(); return { aula: a.Titulo, itens: table_('AulaAval').rows.filter(function (r) { return r.AulaID === a.AulaID; }).map(function (r) { return { aluno: nm[r.MembroID] || 'Aluno', nota: r.Nota ? Number(r.Nota) : null, feedback: r.Feedback || '', duvida: r.Duvida || '', obs: r.Obs || '', data: r.Data }; }) };
}

/* ============================== INSÍGNIAS, XP E PERFIL ==============================
   XP vem de tarefas e insígnias (cada prêmio é gravado uma única vez, por "ref"). O nível libera personalização do perfil. */
const NV_MAX = 100;
function xpNivel_(n) { return n <= 1 ? 0 : Math.round(30 * Math.pow(n - 1, 1.5)); } // XP necessário para chegar ao nível n
function nivelDe_(xp) { let n = 1; while (n < NV_MAX && xp >= xpNivel_(n + 1)) n++; return n; }
const TIER_NOMES = ['Semente', 'Broto', 'Raiz', 'Tronco', 'Ramo', 'Folha', 'Fruto', 'Árvore', 'Floresta', 'Videira', 'Vida em abundância'];
function tierDe_(nv) { return Math.min(10, Math.floor(nv / 10)); }
// Personalização libera de 10 em 10 níveis: o item de posição i abre no nível i*10 (posição 0 já vem liberada)
const CONTORNOS = ['simples', 'verde', 'dourada', 'arco', 'chama', 'luz', 'neon', 'gelo', 'coroa', 'galaxia', 'eterno'];
const MOLDURAS = ['nenhuma', 'fio', 'dupla', 'bordado', 'dourada', 'ornamental', 'luz', 'chama', 'arco', 'realeza', 'eterna'];
const FUNDOS = ['zoe', 'aurora', 'solpoente', 'oceano', 'noite', 'bordado', 'ouro', 'floresta', 'neon', 'galaxia', 'vida'];
function reqMap_(lista) { const o = {}; lista.forEach(function (k, i) { o[k] = i * 10; }); return o; }
function slotsMural_(nv) { return Math.min(12, tierDe_(nv) * 2); }
const NV_CAPA = 10, NV_VERSICULO = 10, NV_MURAL = 10;
function xpDe_(mid) { let t = 0; table_('XpLog').rows.forEach(function (r) { if (r.MembroID === mid) t += Number(r.Pontos) || 0; }); return t; }
function xpResumo_(mid) { const xp = xpDe_(mid), nv = nivelDe_(xp); return { xp: xp, nivel: nv, tier: tierDe_(nv), nome: TIER_NOMES[tierDe_(nv)], base: xpNivel_(nv), proximo: nv >= NV_MAX ? null : xpNivel_(nv + 1) }; }
function awardXp_(mid, ref, pts, motivo) {
  if (!mid || !ref) return false; const t = table_('XpLog'); if (t.rows.some(function (r) { return r.MembroID === mid && r.Ref === ref; })) return false;
  appendRow_(t, { MembroID: mid, Ref: ref, Pontos: String(pts), Motivo: clip_(motivo, 120), Data: now_() }); t.rows.push({ MembroID: mid, Ref: ref, Pontos: String(pts) }); return true;
}
// Insígnia: grava uma vez por (pessoa, código, ano), soma o XP e avisa a pessoa (a Zoe comemora na tela)
function awardBadge_(mid, codigo, titulo, ano, pts) {
  if (!mid || !codigo) return false; const t = table_('Insignias'), ref = codigo + (ano ? ':' + ano : '');
  if (t.rows.some(function (r) { return r.MembroID === mid && r.Ref === ref; })) return false;
  appendRow_(t, { MembroID: mid, Codigo: codigo, Titulo: clip_(titulo, 80), Ano: String(ano || ''), Data: today_(), Ref: ref }); t.rows.push({ MembroID: mid, Ref: ref });
  awardXp_(mid, 'insignia:' + ref, pts || 50, 'Insígnia: ' + titulo); notify_(mid, 'insignia', 'Nova insígnia: ' + titulo, 'Você ganhou +' + (pts || 50) + ' XP. Veja em Meu perfil › Insígnias.', 'insignia:' + codigo); return true;
}
const PERFIL_COMPLETO = ['Nome', 'Simples', 'Apelido', 'Sexo', 'Nascimento', 'Nacionalidade', 'Naturalidade', 'Sangue', 'Profissao', 'Telefone', 'Email', 'CEP', 'UF', 'Cidade', 'Endereco', 'Bairro', 'Mae', 'Pai', 'EstadoCivil', 'Foto'];
function conquistasMembro_(m) {
  if (!m) return; const mid = m.MembroID;
  if (PERFIL_COMPLETO.every(function (k) { return String(m[k] || '').trim(); })) { awardBadge_(mid, 'perfil', 'Perfil completo', '', 100); }
  if (m.DataDecisao) awardBadge_(mid, 'decisao', 'Decisão por Cristo', String(m.DataDecisao).slice(0, 4), 150);
  if (m.DataBatismo) awardBadge_(mid, 'batismo', 'Batizado', String(m.DataBatismo).slice(0, 4), 200);
}
/* ---- insígnias criadas pelos supervisores: o que precisa ser feito (critério) e o visual ---- */
const ICONES_BD = ['estrela', 'user', 'flame', 'gota', 'livro', 'coroa', 'cruz', 'coracao', 'pomba', 'trigo', 'chave', 'escudo', 'sino', 'maos', 'arado', 'ancora', 'vela', 'raio', 'caneta', 'pergaminho', 'biblia', 'microfone', 'violao', 'nota', 'camera', 'casa', 'mundo', 'presente', 'taca', 'peixe', 'arvore', 'folha', 'sol', 'lua', 'montanha', 'olho', 'relogio', 'medalha', 'trofeu', 'megafone', 'asa', 'tenda', 'barco', 'cordeiro', 'leao', 'calendario', 'balao', 'pegada', 'bandeira', 'diamante', 'semente', 'foguete', 'alvo', 'bussola', 'lanterna', 'harpa', 'trombeta', 'candelabro', 'tabuas', 'sorriso', 'joia', 'pao', 'fogueira', 'carta', 'convite', 'abraco', 'cafe'];
const FORMAS_BD = ['circ', 'esc', 'hex', 'oct', 'losango'];
const SONS_BD = ['', 'sino', 'moeda', 'harpa', 'fanfarra', 'celestial', 'magico', 'epico', 'coral'];
const ESTILOS_BD = ['bordado', 'bronze', 'prata', 'ouro', 'celeste'];
function podeCurar_(u) { return can_(u, 'config') || can_(u, 'eventos') || can_(u, 'celulas') || (u.supervisiona && u.supervisiona.length > 0) || u.papel === 'pastor' || u.papel === 'admin'; }
function exigeCurar_(u) { if (!podeCurar_(u)) throw new ApiError('FORBIDDEN', 'Só supervisores e a administração criam insígnias.'); }
function ehLider_(u) { return can_(u, 'celulas') || (u.lidera && u.lidera.length > 0) || (u.supervisiona && u.supervisiona.length > 0) || u.papel === 'pastor' || u.papel === 'admin'; }
const CRIT_CONT = ['eventos_total', 'reunioes', 'cursos', 'acessos', 'sequencia', 'devocionais', 'capitulos', 'posts', 'anotacoes', 'oracoes', 'escalas'];
function criterioLimpo_(c, comNiveis) {
  c = c || {}; const t = String(c.tipo || 'manual'), n = comNiveis ? 1 : Math.floor(Number(c.n)), o = { tipo: t };
  if (['manual'].indexOf(t) >= 0) return o;
  if (t === 'eventos_ultimos') { o.palavra = clip_(c.palavra, 40); o.n = n; if (!o.palavra || !(n >= 1 && n <= 50)) throw new ApiError('VALIDATION', 'Informe a palavra do evento (ex.: retiro) e quantos dos últimos.'); return o; }
  if (t === 'servico') { o.atividade = clip_(c.atividade, 60); o.meses = comNiveis ? 1 : Math.floor(Number(c.meses)); o.consecutivos = c.consecutivos ? 1 : 0; if (!o.atividade || !(o.meses >= 1 && o.meses <= 120)) throw new ApiError('VALIDATION', 'Informe a atividade/escala e quantos meses.'); return o; }
  if (CRIT_CONT.indexOf(t) >= 0) { if (!(n >= 1 && n <= 5000)) throw new ApiError('VALIDATION', 'Informe a quantidade necessária.'); o.n = n; return o; }
  throw new ApiError('VALIDATION', 'Tipo de critério inválido.');
}
function critTexto_(c) {
  switch (c.tipo) {
    case 'eventos_ultimos': return 'Ir aos ' + c.n + ' últimos eventos de “' + c.palavra + '”';
    case 'servico': return 'Servir em “' + c.atividade + '” por ' + c.meses + ' ' + (c.consecutivos ? 'meses seguidos' : 'meses');
    case 'eventos_total': return 'Ir a ' + c.n + ' eventos da igreja'; case 'reunioes': return 'Estar em ' + c.n + ' reuniões de célula';
    case 'cursos': return 'Concluir ' + c.n + ' curso(s)'; case 'acessos': return 'Acessar o app em ' + c.n + ' dias'; case 'sequencia': return 'Entrar ' + c.n + ' dias consecutivos no aplicativo'; case 'devocionais': return 'Postar ' + c.n + ' devocionais'; case 'capitulos': return 'Ler ' + c.n + ' capítulos da Bíblia'; case 'posts': return 'Publicar ' + c.n + ' vezes no feed'; case 'anotacoes': return 'Fazer ' + c.n + ' anotações na Bíblia'; case 'oracoes': return 'Postar ' + c.n + ' pedidos de oração'; case 'escalas': return 'Servir em ' + c.n + ' escalas'; default: return 'Concedida pelos líderes';
  }
}
function seqMeses_(meses) { const s = {}; meses.forEach(function (m) { s[m] = 1; }); let melhor = 0; meses.slice().sort().forEach(function (m) { let n = 0, y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)); while (s[y + '-' + ('0' + mo).slice(-2)]) { n++; mo--; if (mo < 1) { mo = 12; y--; } } if (n > melhor) melhor = n; }); return melhor; }
function diaNum_(s) { const p = s.split('-'); return Math.round(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000); }
function streakDe_(mid) {
  const dias = {}; table_('XpLog').rows.forEach(function (r) { if (r.MembroID === mid && String(r.Ref).indexOf('dia:') === 0) dias[diaNum_(String(r.Ref).slice(4))] = 1; });
  const ns = Object.keys(dias).map(Number).sort(function (a, b) { return a - b; }); let melhor = 0, run = 0, prev = null;
  ns.forEach(function (n) { run = prev !== null && n === prev + 1 ? run + 1 : 1; if (run > melhor) melhor = run; prev = n; });
  const hj = diaNum_(today_()); let atual = 0, x = dias[hj] ? hj : hj - 1; while (dias[x]) { atual++; x--; }
  return { atual: atual, melhor: melhor, total: ns.length };
}
function critProg_(c, mid) {
  const meta = c.tipo === 'servico' ? c.meses : (c.tipo === 'manual' ? 1 : c.n);
  if (c.tipo === 'eventos_ultimos') {
    const q = norm_(c.palavra), hj = today_(), evs = table_('Eventos').rows.filter(function (e) { return e.Escopo !== 'celula' && e.Status !== 'Cancelado' && e.Data <= hj && norm_(e.Titulo).indexOf(q) >= 0; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, c.n);
    const meus = {}; table_('EventoPresenca').rows.forEach(function (r) { if (r.MembroID === mid) meus[r.EventoID] = 1; }); return { atual: evs.filter(function (e) { return meus[e.EventoID]; }).length, meta: meta };
  }
  if (c.tipo === 'servico') {
    const q = norm_(c.atividade), ms = {}; table_('Servicos').rows.forEach(function (r) { if (r.MembroID === mid && norm_(r.Atividade) === q) ms[r.Mes] = 1; }); const lista = Object.keys(ms);
    return { atual: c.consecutivos ? seqMeses_(lista) : lista.length, meta: meta };
  }
  if (c.tipo === 'eventos_total') { const s = {}; table_('EventoPresenca').rows.forEach(function (r) { if (r.MembroID === mid) s[r.EventoID] = 1; }); return { atual: Object.keys(s).length, meta: meta }; }
  if (c.tipo === 'reunioes') return { atual: table_('Presencas').rows.filter(function (r) { return r.MembroID === mid; }).length, meta: meta };
  if (c.tipo === 'cursos') return { atual: table_('Matriculas').rows.filter(function (r) { return r.MembroID === mid && r.Cert === 'emitido'; }).length, meta: meta };
  if (c.tipo === 'sequencia') { const q = streakDe_(mid); return { atual: Math.max(q.atual, q.melhor), meta: meta, seqAtual: q.atual }; }
  if (c.tipo === 'devocionais') return { atual: table_('CorridaLeitura').rows.filter(function (r) { return r.MembroID === mid && r.Status !== 'Recusado' && String(r.Resumo || '').trim(); }).length, meta: meta };
  if (c.tipo === 'capitulos') { let n = 0; table_('CorridaLeitura').rows.forEach(function (r) { if (r.MembroID === mid && r.Status !== 'Recusado') n += Number(r.Capitulos) || 0; }); return { atual: n, meta: meta }; }
  if (c.tipo === 'posts') return { atual: table_('Posts').rows.filter(function (r) { return r.AutorID === mid && r.Status !== 'Removido' && r.Tipo === 'nota'; }).length, meta: meta };
  if (c.tipo === 'anotacoes') return { atual: table_('BibMarcas').rows.filter(function (r) { return r.MembroID === mid && String(r.Comentario || '').trim(); }).length, meta: meta };
  if (c.tipo === 'oracoes') return { atual: table_('Oracoes').rows.filter(function (r) { return r.MembroID === mid; }).length, meta: meta };
  if (c.tipo === 'escalas') return { atual: table_('Escalas').rows.filter(function (r) { return r.MembroID === mid && r.Presente === '1'; }).length, meta: meta };
  if (c.tipo === 'acessos') return { atual: table_('XpLog').rows.filter(function (r) { return r.MembroID === mid && String(r.Ref).indexOf('dia:') === 0; }).length, meta: meta };
  return { atual: 0, meta: meta };
}
function visualLimpo_(v, base) {
  v = v || {}; base = base || {}; const cor = function (x, pad) { x = String(x || pad); if (!/^#[0-9a-fA-F]{6}$/.test(x)) throw new ApiError('VALIDATION', 'Cor inválida.'); return x.toLowerCase(); };
  const o = { estilo: v.estilo || base.estilo || 'bordado', forma: v.forma || base.forma || 'circ', icone: v.icone || base.icone || 'estrela', cor1: cor(v.cor1, base.cor1 || '#2f6b3a'), cor2: cor(v.cor2, base.cor2 || '#efe3b0'), texto: clip_(v.texto === undefined ? (base.texto || '') : v.texto, 4), som: SONS_BD.indexOf(v.som === undefined ? (base.som || '') : v.som) >= 0 ? (v.som === undefined ? (base.som || '') : v.som) : '' };
  if (ESTILOS_BD.indexOf(o.estilo) < 0 || FORMAS_BD.indexOf(o.forma) < 0 || ICONES_BD.indexOf(o.icone) < 0) throw new ApiError('VALIDATION', 'Visual inválido.'); return o;
}
// níveis (variações) da insígnia: cada um com nome, parâmetro (n), XP e visual próprios
function niveisLimpo_(arr, base, xpBase) {
  if (!Array.isArray(arr) || !arr.length) return [];
  if (arr.length > 10) throw new ApiError('VALIDATION', 'No máximo 10 níveis.');
  const out = arr.map(function (x, i) { const n = Math.floor(Number(x.n)); if (!(n >= 1 && n <= 5000)) throw new ApiError('VALIDATION', 'Nível ' + (i + 1) + ': informe o parâmetro (quantidade) de 1 a 5000.'); return { nome: clip_(x.nome, 30), n: n, xp: Math.max(10, Math.min(1000, Math.floor(Number(x.xp) || xpBase || 100))), visual: visualLimpo_(x.visual, base) }; });
  out.sort(function (a, b) { return a.n - b.n; });
  for (let i = 1; i < out.length; i++) if (out[i].n === out[i - 1].n) throw new ApiError('VALIDATION', 'Dois níveis não podem ter o mesmo parâmetro.');
  return out;
}
function defNiveis_(r) {
  const base = { estilo: r.Estilo || 'bordado', forma: r.Forma || 'circ', cor1: r.Cor1 || '#2f6b3a', cor2: r.Cor2 || '#efe3b0', icone: r.Icone || 'estrela', texto: r.Texto || '', som: r.Som || '' }, c = jparse_(r.Criterio, { tipo: 'manual' }), ex = jparse_(r.Niveis, []);
  if (ex.length) return ex.map(function (x, i) { return { k: i + 1, nome: x.nome || '', n: x.n, xp: x.xp, visual: Object.assign({}, base, x.visual || {}) }; });
  return [{ k: 1, nome: '', n: c.tipo === 'servico' ? c.meses : c.n, xp: Number(r.XP) || 100, visual: base }];
}
const nivelCod_ = function (defId, k) { return 'cust:' + defId + (k > 1 ? '#' + k : ''); };
const nivelTitulo_ = function (r, nv, total) { return total > 1 || nv.nome ? r.Nome + ' · ' + (nv.nome || ('Nível ' + nv.k)) : r.Nome; };
function defOut_(r) {
  const c = jparse_(r.Criterio, { tipo: 'manual' }), ex = jparse_(r.Niveis, []), nvs = defNiveis_(r), cc = Object.assign({}, c);
  if (ex.length && c.tipo !== 'manual') { if (c.tipo === 'servico') cc.meses = nvs[0].n; else cc.n = nvs[0].n; }
  const o = { id: r.DefID, codigo: 'cust:' + r.DefID, titulo: r.Nome, descricao: r.Descricao || '', criterio: c, regra: critTexto_(cc) + (ex.length > 1 ? ' (' + ex.length + ' níveis)' : ''), xp: Number(r.XP) || 100, ativo: r.Ativo !== '0', visual: { estilo: r.Estilo || 'bordado', forma: r.Forma || 'circ', cor1: r.Cor1 || '#2f6b3a', cor2: r.Cor2 || '#efe3b0', icone: r.Icone || 'estrela', texto: r.Texto || '', som: r.Som || '' } };
  if (ex.length) o.niveis = nvs.map(function (x) { return { k: x.k, nome: x.nome, n: x.n, xp: x.xp, visual: x.visual }; });
  return o;
}
function defsAtivas_() { return table_('InsigniaDefs').rows.filter(function (r) { return r.Ativo !== '0'; }); }
// confere as insígnias criadas pelos supervisores e entrega as que a pessoa já alcançou (chamada dentro dos pontos em que algo muda)
function avaliaDefs_(mid) {
  if (!mid) return 0; let n = 0; const meus = {}; table_('Insignias').rows.forEach(function (r) { if (r.MembroID === mid) meus[r.Ref] = 1; });
  defsAtivas_().forEach(function (r) {
    const c = jparse_(r.Criterio, { tipo: 'manual' }); if (c.tipo === 'manual') return;
    const nvs = defNiveis_(r); if (nvs.every(function (nv) { return meus[nivelCod_(r.DefID, nv.k)]; })) return;
    const atual = critProg_(c, mid).atual;
    nvs.forEach(function (nv) { const cod = nivelCod_(r.DefID, nv.k); if (!meus[cod] && atual >= nv.n && awardBadge_(mid, cod, nivelTitulo_(r, nv, nvs.length), '', nv.xp)) n++; });
  });
  return n;
}
function listInsigniaDefs_(d, u) {
  exigeCurar_(u); const ganhou = {}; table_('Insignias').rows.forEach(function (r) { if (String(r.Codigo).indexOf('cust:') === 0) ganhou[r.Codigo] = (ganhou[r.Codigo] || 0) + 1; });
  return { defs: table_('InsigniaDefs').rows.map(function (r) { const o = defOut_(r); o.ganharam = ganhou[o.codigo] || 0; return o; }), icones: ICONES_BD, formas: FORMAS_BD, estilos: ESTILOS_BD };
}
function saveInsigniaDef_(d, u) {
  exigeCurar_(u);
  return withLock_(function () {
    const nome = clip_(d.titulo, 40), cor = function (v, pad) { v = String(v || pad); if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new ApiError('VALIDATION', 'Cor inválida.'); return v.toLowerCase(); };
    if (nome.length < 2) throw new ApiError('VALIDATION', 'Dê um nome à insígnia.');
    const v = d.visual || {}, estilo = v.estilo || 'bordado', forma = v.forma || 'circ', icone = v.icone || 'estrela';
    if (ESTILOS_BD.indexOf(estilo) < 0 || FORMAS_BD.indexOf(forma) < 0 || ICONES_BD.indexOf(icone) < 0) throw new ApiError('VALIDATION', 'Visual inválido.');
    const crit0 = d.criterio || {}, vb = { estilo: estilo, forma: forma, icone: icone, cor1: cor(v.cor1, '#2f6b3a'), cor2: cor(v.cor2, '#efe3b0'), texto: clip_(v.texto, 4), som: SONS_BD.indexOf(String(v.som || '')) >= 0 ? String(v.som || '') : '' };
    const niv = niveisLimpo_(d.niveis, vb, Number(d.xp)); if (niv.length && String(crit0.tipo || 'manual') === 'eventos_ultimos') throw new ApiError('VALIDATION', 'Esta regra não tem níveis.');
    const xp = Math.max(10, Math.min(1000, Math.floor(Number(d.xp) || 100))), t = table_('InsigniaDefs'), ex = d.id ? t.rows.filter(function (r) { return r.DefID === d.id; })[0] : null; if (d.id && !ex) throw new ApiError('NOT_FOUND', 'Insígnia não encontrada.');
    const row = { Nome: nome, Descricao: clip_(d.descricao, 200), Estilo: estilo, Forma: forma, Cor1: cor(v.cor1, '#2f6b3a'), Cor2: cor(v.cor2, '#efe3b0'), Icone: icone, Texto: clip_(v.texto, 4), Som: vb.som, XP: String(xp), Criterio: JSON.stringify(criterioLimpo_(d.criterio, niv.length > 0)), Niveis: niv.length ? JSON.stringify(niv) : '', Ativo: d.ativo === false ? '0' : '1' };
    let id; if (ex) { writeRow_(t, ex._row, row); id = ex.DefID; } else { id = id_('IB'); appendRow_(t, Object.assign({ DefID: id, CriadoPor: u.membroId }, row)); }
    audit_(u.email, 'INSIGNIA_DEF', id + ' ' + nome, 'OK'); return { id: id };
  });
}
function grantBadge_(d, u) {
  exigeCurar_(u);
  return withLock_(function () {
    const r = table_('InsigniaDefs').rows.filter(function (x) { return x.DefID === d.defId; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Insígnia não encontrada.');
    const mem = {}; table_('Membros').rows.forEach(function (m) { mem[m.MembroID] = 1; }); let n = 0;
    const nvs = defNiveis_(r), nv = nvs[Math.max(0, Math.min(nvs.length - 1, Math.floor(Number(d.nivel) || 1) - 1))];
    (Array.isArray(d.membros) ? d.membros : []).slice(0, 200).forEach(function (mid) { mid = clip_(mid, 30); if (mem[mid] && awardBadge_(mid, nivelCod_(r.DefID, nv.k), nivelTitulo_(r, nv, nvs.length), '', nv.xp)) n++; }); audit_(u.email, 'INSIGNIA_CONCEDIDA', r.DefID + ' x' + n, 'OK'); return { n: n };
  });
}
// registro de participação em escalas/atividades (ex.: limpeza), um lançamento por pessoa e mês
function logServico_(d, u) {
  exigeCurar_(u);
  return withLock_(function () {
    const ativ = clip_(d.atividade, 60), mes = clip_(d.mes, 7); if (!ativ || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ApiError('VALIDATION', 'Informe a atividade e o mês (AAAA-MM).');
    const t = table_('Servicos'), mem = {}; table_('Membros').rows.forEach(function (m) { mem[m.MembroID] = 1; }); let n = 0;
    (Array.isArray(d.membros) ? d.membros : []).slice(0, 200).forEach(function (mid) { mid = clip_(mid, 30); if (!mem[mid]) return; if (t.rows.some(function (r) { return r.MembroID === mid && r.Mes === mes && norm_(r.Atividade) === norm_(ativ); })) return; appendRow_(t, { Atividade: ativ, MembroID: mid, Mes: mes, RegistradoPor: u.membroId }); t.rows.push({ Atividade: ativ, MembroID: mid, Mes: mes }); n++; avaliaDefs_(mid); });
    audit_(u.email, 'SERVICO', ativ + ' ' + mes + ' x' + n, 'OK'); return { n: n };
  });
}
function listServicos_(d, u) {
  exigeCurar_(u); const nome = nomes_(), rows = table_('Servicos').rows, ativ = {}; rows.forEach(function (r) { ativ[r.Atividade] = 1; });
  const q = norm_(d.atividade || ''); return { atividades: Object.keys(ativ).sort(), itens: rows.filter(function (r) { return !q || norm_(r.Atividade) === q; }).slice(-200).reverse().map(function (r) { return { atividade: r.Atividade, mes: r.Mes, membroId: r.MembroID, nome: nome[r.MembroID] || '—' }; }) };
}
function listInsignias_(mid) {
  const defs = {}; table_('InsigniaDefs').rows.forEach(function (r) { defs[r.DefID] = r; });
  const parte = function (cod) { const m = /^cust:([^#]+)(?:#(\d+))?$/.exec(String(cod)); return m ? { id: m[1], k: Number(m[2] || 1) } : null; };
  const rows = table_('Insignias').rows.filter(function (r) { return r.MembroID === mid; }), melhor = {};
  rows.forEach(function (r) { const p = parte(r.Codigo); if (p && defs[p.id] && jparse_(defs[p.id].Niveis, []).length) melhor[p.id] = Math.max(melhor[p.id] || 0, p.k); });
  return rows.filter(function (r) { const p = parte(r.Codigo); return !(p && melhor[p.id] && p.k < melhor[p.id]); }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).map(function (r) {
    const o = { codigo: r.Codigo, titulo: r.Titulo, ano: r.Ano || '', data: r.Data }, p = parte(r.Codigo);
    if (p && defs[p.id]) { const x = defOut_(defs[p.id]); o.visual = x.visual; o.descricao = x.descricao; o.regra = x.regra; if (x.niveis) { const nv = x.niveis[p.k - 1]; if (nv) { o.visual = nv.visual; o.nivel = p.k; o.niveis = x.niveis.length; o.regra = critTexto_(Object.assign({}, x.criterio, x.criterio.tipo === 'servico' ? { meses: nv.n } : { n: nv.n })); } } }
    return o;
  });
}
// as que ainda não foram conquistadas aparecem escuras no perfil
function bloqueadas_(mid, meu, ganhas) {
  const tem = {}; ganhas.forEach(function (g) { tem[g.codigo + (g.ano ? ':' + g.ano : '')] = 1; tem[g.codigo] = 1; }); table_('Insignias').rows.forEach(function (r) { if (r.MembroID === mid) { tem[r.Codigo] = 1; tem[r.Ref] = 1; } }); const out = [], ano = today_().slice(0, 4);
  [['perfil', 'Perfil completo', 'Preencha todos os dados em Editar perfil.', ''], ['decisao', 'Decisão por Cristo', 'Registre a sua decisão por Cristo.', ''], ['batismo', 'Batizado', 'Registre a data do seu batismo.', ''], ['presenca', 'Presença total', 'Compareça a todos os eventos do ano.', ano]].forEach(function (b) {
    if (!ganhas.some(function (g) { return g.codigo === b[0] && (b[0] !== 'presenca' || g.ano === ano); })) out.push({ codigo: b[0], titulo: b[1], descricao: b[2], ano: b[3] });
  });
  table_('Eventos').rows.forEach(function (e) { if (!e.Insignia || e.Status === 'Cancelado' || String(e.Data).slice(0, 4) !== ano) return; if (!ganhas.some(function (g) { return g.codigo === 'evento:' + e.EventoID; })) out.push({ codigo: 'evento:' + e.EventoID, titulo: e.Insignia, descricao: 'Compareça a ' + e.Titulo + '.', ano: ano }); });
  defsAtivas_().forEach(function (r) {
    const nvs = defNiveis_(r), prox = nvs.filter(function (nv) { return !tem[nivelCod_(r.DefID, nv.k)]; })[0]; if (!prox) return;
    const x = defOut_(r), explicito = !!x.niveis, o = { codigo: nivelCod_(r.DefID, prox.k), titulo: nivelTitulo_(r, prox, nvs.length), descricao: x.descricao, regra: explicito ? critTexto_(Object.assign({}, x.criterio, x.criterio.tipo === 'servico' ? { meses: prox.n } : { n: prox.n })) : x.regra, visual: explicito ? prox.visual : x.visual, ano: '' };
    if (explicito) { o.nivel = prox.k; o.niveis = nvs.length; }
    if (meu) { const p = critProg_(x.criterio, mid); const meta = explicito ? prox.n : p.meta; o.progresso = { atual: Math.min(p.atual, meta), meta: meta }; } out.push(o);
  });
  return out;
}
function perfilRow_(mid) { return table_('Perfis').rows.filter(function (r) { return r.MembroID === mid; })[0]; }
function profileView_(d, u) {
  const mid = clip_(d.membroId, 30) || u.membroId, m = table_('Membros').rows.filter(function (x) { return x.MembroID === mid && x.Status !== 'Inativo'; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Perfil não encontrado.');
  const meu = mid === u.membroId; if (meu) withLock_(function () { avaliaDefs_(mid); });
  const p = perfilRow_(mid) || {}, rs = xpResumo_(mid), ganhas = listInsignias_(mid);
  const contorno = CONTORNOS.indexOf(p.Contorno) >= 0 ? p.Contorno : (CONTORNOS.indexOf(p.Moldura) >= 0 ? p.Moldura : 'simples');
  const out = { id: mid, meu: meu, nome: m.Simples || m.Nome, apelido: m.Apelido || '', foto: m.Foto || '', bio: p.Bio || '', capa: p.Capa || '', fundo: FUNDOS.indexOf(p.Fundo) >= 0 ? p.Fundo : 'zoe', contorno: contorno, moldura: MOLDURAS.indexOf(p.Quadro) >= 0 ? p.Quadro : 'nenhuma', versiculo: p.Versiculo || '', xp: rs, insignias: ganhas, top: jparse_(p.Top, []).map(function (r) { return ganhas.filter(function (g) { return g.codigo + (g.ano ? ':' + g.ano : '') === r; })[0]; }).filter(Boolean).slice(0, 3), bloqueadas: bloqueadas_(mid, meu, ganhas), oculto: p.Oculto === '1', envolvimento: (p.Oculto === '1' && !meu) ? null : envolvimento_(m),
    destaques: table_('PerfilFotos').rows.filter(function (r) { return r.MembroID === mid; }).sort(function (a, b) { return Number(a.Ordem) - Number(b.Ordem); }).map(function (r) { return { id: r.FotoID, foto: r.Foto, legenda: r.Legenda || '' }; }) };
  if (meu) out.libera = { fundos: reqMap_(FUNDOS), contornos: reqMap_(CONTORNOS), molduras: reqMap_(MOLDURAS), capa: NV_CAPA, versiculo: NV_VERSICULO, mural: NV_MURAL, slots: slotsMural_(rs.nivel), tiers: TIER_NOMES };
  return out;
}
function saveProfile_(d, u) {
  return withLock_(function () {
    const nv = xpResumo_(u.membroId).nivel, t = table_('Perfis'), ex = perfilRow_(u.membroId), patch = {};
    const escolha = function (campo, lista, col, rot) { if (d[campo] === undefined) return; const i = lista.indexOf(d[campo]); if (i < 0) throw new ApiError('VALIDATION', rot + ' inválido(a).'); if (nv < i * 10) throw new ApiError('FORBIDDEN', rot + ' abre no nível ' + (i * 10) + '.'); patch[col] = d[campo]; };
    if (d.bio !== undefined) patch.Bio = clip_(d.bio, 280);
    escolha('fundo', FUNDOS, 'Fundo', 'Esse fundo'); escolha('contorno', CONTORNOS, 'Contorno', 'Esse contorno'); escolha('moldura', MOLDURAS, 'Quadro', 'Essa moldura');
    if (d.capa !== undefined && d.capa !== '__keep') { if (d.capa && nv < NV_CAPA) throw new ApiError('FORBIDDEN', 'A capa personalizada abre no nível ' + NV_CAPA + '.'); patch.Capa = fotoOk_(d.capa); }
    if (d.insigniasTop !== undefined) {
      const tem = {}; listInsignias_(u.membroId).forEach(function (g) { tem[g.codigo + (g.ano ? ':' + g.ano : '')] = 1; });
      const top = (Array.isArray(d.insigniasTop) ? d.insigniasTop : []).map(function (x) { return clip_(x, 60); }).filter(function (x, i, a) { return tem[x] && a.indexOf(x) === i; }).slice(0, 3); patch.Top = JSON.stringify(top);
    }
    if (d.oculto !== undefined) patch.Oculto = d.oculto ? '1' : '0';
    if (d.versiculo !== undefined) { if (d.versiculo && nv < NV_VERSICULO) throw new ApiError('FORBIDDEN', 'O versículo em destaque abre no nível ' + NV_VERSICULO + '.'); patch.Versiculo = clip_(d.versiculo, 200); }
    if (ex) writeRow_(t, ex._row, patch); else appendRow_(t, Object.assign({ MembroID: u.membroId }, patch)); return { ok: true };
  });
}
function saveHighlight_(d, u) {
  return withLock_(function () {
    const nv = xpResumo_(u.membroId).nivel, slots = slotsMural_(nv), t = table_('PerfilFotos'), meus = t.rows.filter(function (r) { return r.MembroID === u.membroId; });
    if (!slots) throw new ApiError('FORBIDDEN', 'O mural do perfil abre no nível ' + NV_MURAL + '.'); if (meus.length >= slots) throw new ApiError('FORBIDDEN', 'Você usou todo o seu mural (' + slots + ' fotos). Suba de nível para ganhar mais espaço.');
    const foto = fotoOk_(d.foto); if (!foto) throw new ApiError('VALIDATION', 'Escolha uma foto.');
    const id = id_('PF'); appendRow_(t, { MembroID: u.membroId, FotoID: id, Foto: foto, Legenda: clip_(d.legenda, 80), Ordem: String(meus.length + 1) }); return { id: id };
  });
}
function deleteHighlight_(d, u) { return withLock_(function () { const t = table_('PerfilFotos'), r = t.rows.filter(function (x) { return x.FotoID === d.id && x.MembroID === u.membroId; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Foto não encontrada.'); t.sh.deleteRow(r._row); return { ok: true }; }); }

/* ============================== EVENTOS (BOTONS) E CORRIDA DA BÍBLIA ============================== */
function presencaTotal_(mid, ano) {
  const hj = today_(), evs = table_('Eventos').rows.filter(function (e) { return e.Escopo !== 'celula' && e.Status !== 'Cancelado' && String(e.Data).slice(0, 4) === ano && e.Data <= hj; }); if (evs.length < 3) return false;
  const meus = {}; table_('EventoPresenca').rows.forEach(function (r) { if (r.MembroID === mid) meus[r.EventoID] = 1; });
  return evs.every(function (e) { return meus[e.EventoID]; }) ? awardBadge_(mid, 'presenca', 'Presença total', ano, 150) : false;
}
function checkinEvento_(d, u) {
  return withLock_(function () {
    const ev = table_('Eventos').rows.filter(function (e) { return e.EventoID === d.eventoId; })[0]; if (!ev) throw new ApiError('NOT_FOUND', 'Evento não encontrado.');
    const ids = (Array.isArray(d.membros) ? d.membros : []).slice(0, 500).map(function (x) { return clip_(x, 30); }).filter(String), t = table_('EventoPresenca'), ja = {}, mem = {};
    t.rows.forEach(function (r) { if (r.EventoID === ev.EventoID) ja[r.MembroID] = 1; }); table_('Membros').rows.forEach(function (m) { mem[m.MembroID] = 1; });
    const ano = String(ev.Data).slice(0, 4); let n = 0;
    ids.forEach(function (mid) {
      if (!mem[mid] || ja[mid]) return; ja[mid] = 1; appendRow_(t, { EventoID: ev.EventoID, MembroID: mid, Data: today_() }); t.rows.push({ EventoID: ev.EventoID, MembroID: mid }); n++;
      awardXp_(mid, 'evento:' + ev.EventoID, 20, 'Presença em ' + ev.Titulo);
      if (ev.Insignia) awardBadge_(mid, 'evento:' + ev.EventoID, ev.Insignia, ano, 60);
      presencaTotal_(mid, ano); avaliaDefs_(mid);
    });
    audit_(u.email, 'EVENTO_CHECKIN', ev.EventoID, 'OK'); return { n: n };
  });
}
// ---- Presença por rosto: o aparelho calcula a "assinatura" numérica (128 números) da foto de perfil; a imagem do rosto nunca é guardada pela câmera
function descOk_(v) { if (!Array.isArray(v) || v.length !== 128) return ''; const o = []; for (let i = 0; i < 128; i++) { const n = Number(v[i]); if (!isFinite(n) || Math.abs(n) > 5) return ''; o.push(Math.round(n * 1000) / 1000); } return JSON.stringify(o); }
// Lista de autorizados (whitelist): só quem está autorizado tem o rosto indexado e reconhecido. Linhas antigas sem marca valem como autorizadas.
const rostoAut_ = function (r) { return !!r && r.Autorizado !== '0'; };
function faceRoster_(d, u) {
  const lin = {}; table_('Rostos').rows.forEach(function (r) { lin[r.MembroID] = r; });
  const itens = table_('Membros').rows.filter(function (m) { return m.Status !== 'Inativo'; }).map(function (m) { const r = lin[m.MembroID]; return { id: m.MembroID, nome: m.Nome, foto: m.Foto ? 1 : 0, aut: rostoAut_(r), idx: !!(r && r.Descritor), em: r && r.AutorizadoEm || '' }; });
  itens.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome)); }); return { itens: itens };
}
function setFaceAuth_(d, u) {
  return withLock_(function () {
    const t = table_('Rostos'), lin = {}, mem = {}; t.rows.forEach(function (r) { lin[r.MembroID] = r; }); table_('Membros').rows.forEach(function (m) { if (m.Status !== 'Inativo') mem[m.MembroID] = 1; });
    const on = d.on === true || d.on === 'true' || d.on === 1; let n = 0;
    (Array.isArray(d.ids) ? d.ids : []).slice(0, 600).forEach(function (x) {
      const id = clip_(x, 30); if (!mem[id]) return; const r = lin[id];
      if (on) { if (r) { if (!rostoAut_(r)) { writeRow_(t, r._row, { Autorizado: '1', AutorizadoPor: u.email, AutorizadoEm: today_() }); n++; } } else { appendRow_(t, { MembroID: id, Descritor: '', AtualizadoEm: '', Autorizado: '1', AutorizadoPor: u.email, AutorizadoEm: today_() }); t.rows.push({ MembroID: id }); lin[id] = { _row: t.rows.length + 1, Autorizado: '1' }; n++; } }
      else if (r) { writeRow_(t, r._row, { Descritor: '', Autorizado: '0', AutorizadoPor: u.email, AutorizadoEm: today_() }); n++; } // desautorizar apaga a assinatura do rosto
    });
    audit_(u.email, on ? 'ROSTOS_AUTORIZADOS' : 'ROSTOS_DESAUTORIZADOS', String(n), 'OK'); return { n: n };
  });
}
function saveFaces_(d, u) {
  return withLock_(function () {
    const t = table_('Rostos'), ex = {}; t.rows.forEach(function (r) { ex[r.MembroID] = r; });
    let n = 0; (Array.isArray(d.itens) ? d.itens : []).slice(0, 60).forEach(function (it) {
      const id = clip_(it && it.id, 30), ds = descOk_(it && it.d), r = ex[id]; if (!id || !ds || !rostoAut_(r)) return;
      writeRow_(t, r._row, { Descritor: ds, AtualizadoEm: today_() }); n++;
    });
    audit_(u.email, 'ROSTOS_SALVOS', String(n), 'OK'); return { n: n };
  });
}
function listFaces_(d, u) {
  const nome = {}, foto = {}; table_('Membros').rows.forEach(function (m) { if (m.Status !== 'Inativo') { nome[m.MembroID] = m.Nome; foto[m.MembroID] = m.Foto ? 1 : 0; } });
  const idx = {}, itens = [], aut = {}; table_('Rostos').rows.forEach(function (r) { if (nome[r.MembroID] === undefined || !rostoAut_(r)) return; aut[r.MembroID] = 1; let ds; try { ds = JSON.parse(r.Descritor); } catch (e) { return; } if (!Array.isArray(ds) || ds.length !== 128) return; idx[r.MembroID] = 1; itens.push({ id: r.MembroID, nome: nome[r.MembroID], d: ds }); });
  const ids = Object.keys(aut);
  return { itens: itens, falta: ids.filter(function (i) { return foto[i] && !idx[i]; }), semFoto: ids.filter(function (i) { return !foto[i]; }).length, total: ids.length };
}
function clearFaces_(d, u) {
  return withLock_(function () {
    const t = table_('Rostos'), n = t.rows.length; t.rows.map(function (r) { return r._row; }).sort(function (a, b) { return b - a; }).forEach(function (rw) { t.sh.deleteRow(rw); });
    audit_(u.email, 'ROSTOS_APAGADOS', String(n), 'OK'); return { n: n };
  });
}
function eventoPresenca_(d, u) {
  const ev = table_('Eventos').rows.filter(function (e) { return e.EventoID === d.eventoId; })[0]; if (!ev) throw new ApiError('NOT_FOUND', 'Evento não encontrado.');
  const pres = [], ins = []; table_('EventoPresenca').rows.forEach(function (r) { if (r.EventoID === ev.EventoID) pres.push(r.MembroID); }); table_('Inscricoes').rows.forEach(function (r) { if (r.EventoID === ev.EventoID) ins.push(r.MembroID); });
  return { titulo: ev.Titulo, insignia: ev.Insignia || '', presentes: pres, inscritos: ins, membros: table_('Membros').rows.filter(function (m) { return m.Status !== 'Inativo'; }).map(function (m) { return { id: m.MembroID, nome: m.Nome }; }).sort(function (a, b) { return a.nome < b.nome ? -1 : 1; }) };
}
// ---- Maratona Bíblica: todos começam no dia 1º; só dá para registrar a leitura do dia, com limite de capítulos e devocional validado pelo líder
const COR_TOTAL = 1189, COR_CAP = 5;
function corAtiva_() { const h = today_(); return table_('Corridas').rows.filter(function (c) { return c.Status === 'Ativo' && (!c.Fim || c.Fim >= h); }).sort(function (a, b) { return a.Inicio < b.Inicio ? 1 : -1; })[0]; }
function corDias_(a, b) { const out = []; let d = new Date(a + 'T12:00:00Z'); const f = new Date(b + 'T12:00:00Z'); while (d <= f && out.length < 800) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); } return out; }
function corTotal_(c) { return Number(c.TotalCap) || COR_TOTAL; }
function corCap_(c) { return Number(c.CapDia) || COR_CAP; }
function corEntradas_(cid, mid) { return table_('CorridaLeitura').rows.filter(function (r) { return r.CorridaID === cid && r.MembroID === mid; }); }
function corFaltas_(c, ent, ate) { const dias = {}; ent.forEach(function (r) { if (r.Status !== 'Recusado') dias[r.Data] = 1; }); let f = 0; corDias_(c.Inicio, ate).forEach(function (dd) { if (!dias[dd]) f++; }); return f; }
function corFaixa_(f) { return f === 0 ? 'ouro' : f === 1 ? 'prata' : 'bronze'; }
function corLider_(mid) { const m = table_('Membros').rows.filter(function (x) { return x.MembroID === mid; })[0]; if (!m || !m.CelulaID) return null; const c = table_('Celulas').rows.filter(function (x) { return x.CelulaID === m.CelulaID; })[0]; return c || null; }
function corPodeValidar_(u, mid) { if (mid === u.membroId) return false; if (can_(u, 'eventos')) return true; const c = corLider_(mid); return !!c && (c.LiderID === u.membroId || c.SupervisorID === u.membroId); }
function corFecha_(c, mid) {
  const t = table_('CorridaConc'); if (t.rows.some(function (r) { return r.CorridaID === c.CorridaID && r.MembroID === mid; })) return false;
  const ent = corEntradas_(c.CorridaID, mid); if (ent.some(function (r) { return r.Status === 'Pendente'; })) return false;
  const ok = ent.filter(function (r) { return r.Status === 'Validado'; }), lidos = ok.reduce(function (a, r) { return a + Number(r.Capitulos); }, 0); if (lidos < corTotal_(c)) return false;
  const fim = ok.map(function (r) { return r.Data; }).sort().pop(), faltas = corFaltas_(c, ok, fim), faixa = corFaixa_(faltas), pos = t.rows.filter(function (r) { return r.CorridaID === c.CorridaID && r.Faixa === faixa; }).length + 1;
  appendRow_(t, { CorridaID: c.CorridaID, MembroID: mid, Fim: fim, Faltas: String(faltas), Faixa: faixa, Pos: String(pos) }); t.rows.push({ CorridaID: c.CorridaID, MembroID: mid, Faixa: faixa });
  if (pos <= 3) awardBadge_(mid, 'corrida-' + faixa + '-' + pos, 'Maratona Bíblica', c.Ano || fim.slice(0, 4), ({ ouro: 600, prata: 400, bronze: 250 })[faixa] - (pos - 1) * 50);
  else { awardXp_(mid, 'corrida:' + c.CorridaID, 150, 'Concluiu a Maratona Bíblica'); notify_(mid, 'corrida', 'Você terminou a Maratona Bíblica!', 'Parabéns! Você leu a Bíblia toda.', 'corf:' + c.CorridaID); }
  return true;
}
function getCorrida_(d, u) {
  const c = corAtiva_(); if (!c) return { ativa: false };
  const hj = today_(), ent = corEntradas_(c.CorridaID, u.membroId), vivos = ent.filter(function (r) { return r.Status !== 'Recusado'; }), lidos = vivos.reduce(function (a, r) { return a + Number(r.Capitulos); }, 0);
  const hoje = ent.filter(function (r) { return r.Data === hj; })[0], conc = table_('CorridaConc').rows.filter(function (r) { return r.CorridaID === c.CorridaID; });
  const meuC = conc.filter(function (r) { return r.MembroID === u.membroId; })[0], ontem = new Date(new Date(hj + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10);
  const comecou = c.Inicio <= hj, faltas = comecou && ontem >= c.Inicio ? corFaltas_(c, vivos, ontem) - (vivos.some(function (r) { return r.Data === hj; }) ? 0 : 0) : 0;
  const nome = {}; table_('Membros').rows.forEach(function (m) { nome[m.MembroID] = m.Simples || m.Nome; });
  const soma = {}; table_('CorridaLeitura').rows.forEach(function (r) { if (r.CorridaID === c.CorridaID && r.Status !== 'Recusado') soma[r.MembroID] = (soma[r.MembroID] || 0) + Number(r.Capitulos); });
  const rank = Object.keys(soma).map(function (k) { const cc = conc.filter(function (r) { return r.MembroID === k; })[0]; return { nome: nome[k] || '—', lidos: soma[k], faixa: cc ? cc.Faixa : '', pos: cc ? Number(cc.Pos) : 0, eu: k === u.membroId }; }).sort(function (a, b) { return b.lidos - a.lidos; }).slice(0, 10);
  let pend = 0; if (true) { const sa = table_('CorridaLeitura').rows.filter(function (r) { return r.Status === 'Pendente' && r.CorridaID === c.CorridaID && corPodeValidar_(u, r.MembroID); }); pend = sa.length; }
  return { ativa: true, id: c.CorridaID, titulo: c.Titulo, ano: c.Ano, inicio: c.Inicio, fim: c.Fim || '', capDia: corCap_(c), total: corTotal_(c), comecou: comecou, lidos: lidos, faltas: faltas, faixa: corFaixa_(faltas), hoje: hoje ? { cap: Number(hoje.Capitulos), status: hoje.Status, resumo: hoje.Resumo, obs: hoje.Obs || '' } : null,
    concluiu: meuC ? { faixa: meuC.Faixa, pos: Number(meuC.Pos), fim: meuC.Fim } : null, ranking: rank, paraValidar: pend,
    historico: ent.slice().sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 10).map(function (r) { return { data: r.Data, cap: Number(r.Capitulos), status: r.Status, obs: r.Obs || '' }; }) };
}
function corridaLer_(d, u) {
  return withLock_(function () {
    const c = corAtiva_(); if (!c || c.CorridaID !== d.corridaId) throw new ApiError('NOT_FOUND', 'Não há corrida ativa.'); const hj = today_(); if (c.Inicio > hj) throw new ApiError('VALIDATION', 'A corrida ainda não começou.');
    const cap = Math.floor(Number(d.capitulos)), resumo = clip_(d.resumo, 800); if (!(cap >= 1)) throw new ApiError('VALIDATION', 'Informe quantos capítulos leu.');
    if (cap > corCap_(c)) throw new ApiError('VALIDATION', 'O máximo é ' + corCap_(c) + ' capítulos por dia.');
    if (resumo.length < 30) throw new ApiError('VALIDATION', 'Escreva seu devocional: um resumo, com pelo menos 30 letras, do que você entendeu da leitura.');
    const t = table_('CorridaLeitura'), ent = corEntradas_(c.CorridaID, u.membroId), ex = ent.filter(function (r) { return r.Data === hj; })[0];
    if (ex && ex.Status !== 'Recusado') throw new ApiError('VALIDATION', 'Você já registrou a leitura de hoje.');
    if (table_('CorridaConc').rows.some(function (r) { return r.CorridaID === c.CorridaID && r.MembroID === u.membroId; })) throw new ApiError('VALIDATION', 'Você já terminou a corrida.');
    const lidos = ent.filter(function (r) { return r.Status !== 'Recusado'; }).reduce(function (a, r) { return a + Number(r.Capitulos); }, 0), falta = corTotal_(c) - lidos; if (falta <= 0) throw new ApiError('VALIDATION', 'Você já leu todos os capítulos; aguarde a validação.');
    const reg = { Capitulos: String(Math.min(cap, falta)), Resumo: resumo, Status: 'Pendente', ValidadoPor: '', Obs: '' };
    if (ex) writeRow_(t, ex._row, reg); else appendRow_(t, Object.assign({ CorridaID: c.CorridaID, MembroID: u.membroId, Data: hj }, reg));
    const cel = corLider_(u.membroId), nm = (table_('Membros').rows.filter(function (m) { return m.MembroID === u.membroId; })[0] || {}).Simples || '';
    if (cel && cel.LiderID && cel.LiderID !== u.membroId) notify_(cel.LiderID, 'corrida', 'Devocional para validar', nm + ' registrou a leitura de hoje na Maratona Bíblica.', 'cor:' + u.membroId + ':' + hj);
    awardXp_(u.membroId, 'corrida-dia:' + c.CorridaID + ':' + hj, 5, 'Leitura do dia'); return { ok: true, cap: Number(reg.Capitulos) };
  });
}
function listCorridaValidar_(d, u) {
  const nome = {}; table_('Membros').rows.forEach(function (m) { nome[m.MembroID] = m.Simples || m.Nome; });
  return table_('CorridaLeitura').rows.filter(function (r) { return r.Status === 'Pendente' && corPodeValidar_(u, r.MembroID); }).sort(function (a, b) { return a.Data < b.Data ? -1 : 1; }).slice(0, 100)
    .map(function (r) { return { corridaId: r.CorridaID, membroId: r.MembroID, nome: nome[r.MembroID] || '—', data: r.Data, capitulos: Number(r.Capitulos), resumo: r.Resumo }; });
}
function decideLeitura_(d, u) {
  return withLock_(function () {
    const t = table_('CorridaLeitura'), r = t.rows.filter(function (x) { return x.CorridaID === d.corridaId && x.MembroID === d.membroId && x.Data === d.data; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Registro não encontrado.');
    if (!corPodeValidar_(u, r.MembroID)) throw new ApiError('FORBIDDEN', 'Só o líder da célula (ou a administração) valida este devocional.'); if (r.Status !== 'Pendente') throw new ApiError('VALIDATION', 'Esse registro já foi decidido.');
    const obs = clip_(d.obs, 300); if (!d.ok && !obs) throw new ApiError('VALIDATION', 'Explique ao membro por que recusou.');
    writeRow_(t, r._row, { Status: d.ok ? 'Validado' : 'Recusado', ValidadoPor: u.membroId, Obs: obs }); r.Status = d.ok ? 'Validado' : 'Recusado';
    notify_(r.MembroID, 'corrida', d.ok ? 'Devocional validado ✔' : 'Devocional recusado', d.ok ? 'Sua leitura de ' + r.Data + ' foi validada.' : 'Sua leitura de ' + r.Data + ' não foi aceita: ' + obs, 'cor:' + r.Data);
    const c = table_('Corridas').rows.filter(function (x) { return x.CorridaID === r.CorridaID; })[0]; let fim = false; if (c && d.ok) fim = corFecha_(c, r.MembroID); return { ok: true, terminou: fim };
  });
}

/* ============================== PESSOAS (perfis abertos) E CHAT ============================== */
function semAcento_(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function usuarioAtivo_(mid) { return table_('Usuarios').rows.some(function (r) { return r.MembroID === mid && r.Status === 'Ativo'; }); }
function envolvimento_(m) {
  const mid = m.MembroID, cel = m.CelulaID ? table_('Celulas').rows.filter(function (c) { return c.CelulaID === m.CelulaID && c.Status !== 'Inativa'; })[0] : null;
  const mi = {}; table_('Ministerios').rows.forEach(function (x) { mi[x.MinisterioID] = x.Nome; }); const cu = {}; table_('Cursos').rows.forEach(function (x) { cu[x.CursoID] = x.Nome; });
  return { celula: cel ? cel.Nome : '', ministerios: table_('Interesses').rows.filter(function (r) { return r.MembroID === mid && stN_(r.Status) === 'autorizado' && mi[r.MinisterioID]; }).map(function (r) { return mi[r.MinisterioID]; }),
    cursos: table_('Matriculas').rows.filter(function (r) { return r.MembroID === mid && r.Cert === 'emitido' && cu[r.CursoID]; }).map(function (r) { return { nome: cu[r.CursoID], ano: String(r.CertData || '').slice(0, 4) }; }),
    desde: String(m.CriadoEm || '').slice(0, 10), reunioes: table_('Presencas').rows.filter(function (r) { return r.MembroID === mid; }).length, eventos: table_('EventoPresenca').rows.filter(function (r) { return r.MembroID === mid; }).length };
}
function findPeople_(d, u) {
  const q = semAcento_(clip_(d.q, 40)).trim(); if (q.length < 2) return [];
  const ativos = {}; table_('Usuarios').rows.forEach(function (r) { if (r.Status === 'Ativo' && r.MembroID) ativos[r.MembroID] = 1; });
  return table_('Membros').rows.filter(function (m) { return ativos[m.MembroID] && m.MembroID !== u.membroId && m.Status !== 'Inativo' && semAcento_((m.Nome || '') + ' ' + (m.Simples || '') + ' ' + (m.Apelido || '')).indexOf(q) >= 0; }).slice(0, 15)
    .map(function (m) { const p = presDe_(m.MembroID, d); return { id: m.MembroID, nome: m.Simples || m.Apelido || m.Nome, online: p.online, visto: p.visto }; });
}
const CHAT_MAX = 1000, CHAT_POR_MIN = 20, PRES_MS = 90000, DIG_MS = 6000;
/* presença (online) e "digitando": ficam só no cache temporário, sem gravar na planilha */
function presTouch_(u, d) { const c = CacheService.getScriptCache(); if (d && d.inv) c.remove('p:' + u.membroId); else c.put('p:' + u.membroId, String(Date.now()), 21600); }
function presDe_(id, d) { if (d && d.inv) return { online: false, visto: 0 }; const v = Number(CacheService.getScriptCache().get('p:' + id) || 0); return { online: v > 0 && Date.now() - v < PRES_MS, visto: v }; }
function chatTyping_(d, u) { if (d && d.inv) return { ok: true }; CacheService.getScriptCache().put('t:' + u.membroId + ':' + clip_(d.para, 30), String(Date.now()), 30); return { ok: true }; }
function convId_(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
function sendChat_(d, u) {
  return withLock_(function () {
    const para = clip_(d.para, 30), texto = clip_(d.texto, CHAT_MAX).trim(); if (!texto) throw new ApiError('VALIDATION', 'Escreva a mensagem.');
    if (para === u.membroId) throw new ApiError('VALIDATION', 'Você não pode conversar consigo mesmo.'); if (!usuarioAtivo_(para)) throw new ApiError('NOT_FOUND', 'Essa pessoa não está disponível para conversar.');
    const t = table_('ChatMsgs'), agora = Date.now(); let n = 0; for (let i = t.rows.length - 1; i >= 0 && i > t.rows.length - 200; i--) { const r = t.rows[i]; if (r.De === u.membroId && agora - Number(r.Ts) < 60000) n++; }
    if (n >= CHAT_POR_MIN) throw new ApiError('RATE', 'Muitas mensagens seguidas. Espere um minuto.');
    CacheService.getScriptCache().remove('t:' + u.membroId + ':' + para); const id = id_('MS'); appendRow_(t, { MsgID: id, ConvID: convId_(u.membroId, para), De: u.membroId, Para: para, Texto: texto, Ts: String(agora), Lida: '0' });
    { const eu = table_('Membros').rows.filter(function (x) { return x.MembroID === u.membroId; })[0]; PUSHQ_.push({ m: para, t: (eu && (eu.Simples || eu.Apelido || eu.Nome)) || 'Nova mensagem', b: texto.length > 90 ? texto.slice(0, 90) + '…' : texto, k: 'chat' }); }
    return { id: id, ts: agora };
  });
}
function msgOut_(r, eu) { return { id: r.MsgID, minha: r.De === eu, texto: r.Texto, ts: Number(r.Ts), lida: r.Lida === '1' }; }
function getChat_(d, u) {
  const com = clip_(d.com, 30), cid = convId_(u.membroId, com), depois = Number(d.depois) || 0; presTouch_(u, d);
  const m = table_('Membros').rows.filter(function (x) { return x.MembroID === com; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Pessoa não encontrada.');
  const ms = table_('ChatMsgs').rows.filter(function (r) { return r.ConvID === cid && Number(r.Ts) > depois; }).slice(-100).map(function (r) { return msgOut_(r, u.membroId); });
  const pr = presDe_(com, d), dg = !(d && d.inv) && Date.now() - Number(CacheService.getScriptCache().get('t:' + com + ':' + u.membroId) || 0) < DIG_MS;
  return { com: { id: com, nome: m.Simples || m.Apelido || m.Nome }, msgs: ms, online: pr.online, visto: pr.visto, digitando: dg };
}
function chatRead_(d, u) {
  return withLock_(function () { const t = table_('ChatMsgs'), cid = convId_(u.membroId, clip_(d.com, 30)); let n = 0; t.rows.forEach(function (r) { if (r.ConvID === cid && r.Para === u.membroId && r.Lida !== '1') { writeRow_(t, r._row, { Lida: '1' }); n++; } }); return { n: n }; });
}
function listChats_(d, u) {
  const por = {}, nome = nomes_(); let nao = 0; presTouch_(u, d);
  table_('ChatMsgs').rows.forEach(function (r) { if (r.De !== u.membroId && r.Para !== u.membroId) return; const outro = r.De === u.membroId ? r.Para : r.De, c = por[outro] || (por[outro] = { id: outro, nome: nome[outro] || '—', ultima: '', ts: 0, minha: false, naoLidas: 0 });
    if (Number(r.Ts) >= c.ts) { c.ts = Number(r.Ts); c.ultima = String(r.Texto).slice(0, 80); c.minha = r.De === u.membroId; } if (r.Para === u.membroId && r.Lida !== '1') { c.naoLidas++; nao++; } });
  return { naoLidas: nao, conversas: Object.keys(por).map(function (k) { return por[k]; }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 40).map(function (c) { const p = presDe_(c.id, d); c.online = p.online; c.visto = p.visto; return c; }) };
}

/* ============================== USUÁRIOS / PERMISSÕES ============================== */
function listUsers_() { const mem = {}; table_('Membros').rows.forEach(function (m) { mem[m.MembroID] = m; }); return table_('Usuarios').rows.map(function (r) { return { email: r.Email, nome: (mem[r.MembroID] || {}).Nome || '', papel: r.Papel, status: r.Status || 'Ativo', ultimoAcesso: r.UltimoAcesso, membroId: r.MembroID }; }); }
function createUser_(d, u) {
  return withLock_(function () {
    const email = clip_(d.email, 120).toLowerCase(), nome = clip_(d.nome, 150), pw = String(d.senha || ''), papel = String(d.papel || 'membro');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError('VALIDATION', 'E-mail inválido.'); if (pw.length < 8) throw new ApiError('VALIDATION', 'A senha temporária precisa ter 8+ caracteres.');
    if (!papelValido_(papel)) throw new ApiError('VALIDATION', 'Papel inválido.'); if (papel === 'admin' && u.papel !== 'admin') throw new ApiError('FORBIDDEN', 'Só administrador cria administrador.');
    const t = table_('Usuarios'); if (t.rows.some(function (r) { return String(r.Email).toLowerCase() === email; })) throw new ApiError('VALIDATION', 'Já existe usuário com esse e-mail.');
    // um acesso = uma pessoa: o vínculo é o MembroID. Se já existe cadastro com este e-mail (e sem acesso), o acesso é ligado a ele em vez de criar outra pessoa.
    let mid = d.membroId ? getMember_(d.membroId).m.MembroID : '', novo = false;
    if (!mid) { const ja = table_('Membros').rows.filter(function (m) { return String(m.Email).toLowerCase() === email && m.Status !== 'Inativo'; })[0]; if (ja) mid = ja.MembroID; }
    if (!mid && nome && !d.forcarNovo) { const nn = nome.toLowerCase().trim(), igual = table_('Membros').rows.filter(function (m) { return m.Status !== 'Inativo' && String(m.Nome || '').toLowerCase().trim() === nn && !t.rows.some(function (r) { return r.MembroID === m.MembroID; }); })[0]; if (igual) throw new ApiError('VALIDATION', 'Já existe o cadastro de "' + igual.Nome + '" sem acesso. Em Membros cadastrados use "Criar acesso" nessa pessoa (assim não duplica).'); }
    if (mid && t.rows.some(function (r) { return r.MembroID === mid; })) throw new ApiError('VALIDATION', 'Esta pessoa já tem um acesso. Cada pessoa tem um só acesso.');
    if (mid) { const g = getMember_(mid); if (!g.m.Email) writeRow_(g.t, g.m._row, { Email: email }); }
    if (!mid) { mid = id_('M'); novo = true; }
    if (novo) appendRow_(table_('Membros'), { MembroID: mid, Nome: nome || email, Simples: nome || email, Apelido: (nome || email).split(' ')[0], Email: email, CelulaID: clip_(d.celulaId, 30), EhMembro: '1', Status: 'Ativo', CriadoEm: now_() });
    const salt = Utilities.getUuid(); appendRow_(t, { Email: email, SenhaHash: hash_(salt, pw), Salt: salt, Papel: papel, Status: 'Ativo', GuiaVisto: '0', MembroID: mid, TrocarSenha: '1', CriadoEm: now_() }); audit_(u.email, 'USUARIO_CRIADO', email + ':' + papel, 'OK'); return { ok: true, membroId: mid };
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

// guia de primeiro acesso (Zoe): marcado quando a pessoa conclui o tutorial
function guideDone_(d, u) { return withLock_(function () { const t = table_('Usuarios'), r = t.rows.filter(function (x) { return String(x.Email).toLowerCase() === u.email; })[0]; if (r) writeRow_(t, r._row, { GuiaVisto: '1' }); return { guiaVisto: true }; }); }
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
    { k: 'Descricao', l: 'Descrição', t: 'area', max: 1000 }, { k: 'Programacao', l: 'Programação (uma linha por item)', t: 'lines' }, { k: 'Foto', l: 'Foto do evento', t: 'foto' }, { k: 'Insignia', l: 'Insígnia exclusiva do evento (nome; deixe vazio se não houver)', t: 'text', max: 60 },
    { k: 'Status', l: 'Situação', t: 'sel', op: [['Ativo', 'Ativo'], ['Cancelado', 'Cancelado']] }] },
  corridas: { titulo: 'Maratona Bíblica', aba: 'Corridas', id: 'CorridaID', pre: 'CR', perm: 'eventos', rotulo: 'Titulo', sub: 'Inicio', status: { col: 'Status', ativo: 'Ativo', off: 'Encerrada' }, defaults: { Status: 'Ativo', CapDia: '5', TotalCap: '1189' }, campos: [
    { k: 'Titulo', l: 'Título', t: 'text', max: 80, req: 1 }, { k: 'Ano', l: 'Ano', t: 'num' }, { k: 'Inicio', l: 'Início (1º de janeiro)', t: 'date', req: 1 }, { k: 'Fim', l: 'Fim (opcional)', t: 'date' },
    { k: 'CapDia', l: 'Máximo de capítulos por dia', t: 'num' }, { k: 'TotalCap', l: 'Total de capítulos (Bíblia inteira = 1189)', t: 'num' },
    { k: 'Status', l: 'Situação', t: 'sel', op: [['Ativo', 'Ativa'], ['Encerrada', 'Encerrada']] }] },
  noticias: { titulo: 'Notícias', aba: 'Noticias', id: 'NoticiaID', pre: 'N', perm: 'eventos', rotulo: 'Titulo', sub: 'Data', status: { col: 'Status', ativo: 'Ativo', off: 'Removida' }, defaults: {}, campos: [
    { k: 'Titulo', l: 'Título', t: 'text', max: 120, req: 1 }, { k: 'Texto', l: 'Texto', t: 'area', max: 1500 }, { k: 'Status', l: 'Situação', t: 'sel', op: [['Ativo', 'Publicada'], ['Removida', 'Removida']] }] },
  ministerios: { titulo: 'Ministérios', aba: 'Ministerios', id: 'MinisterioID', pre: 'MIN', perm: 'min', rotulo: 'Nome', status: { col: 'Ativo', ativo: '1', off: '0' }, campos: [
    { k: 'Nome', l: 'Nome', t: 'text', max: 60, req: 1 }, { k: 'Descricao', l: 'Descrição curta', t: 'area', max: 300 }, { k: 'Foto', l: 'Foto do ministério', t: 'foto' }, { k: 'Ordem', l: 'Ordem', t: 'num' }, { k: 'Ativo', l: 'Situação', t: 'sel', op: [['1', 'Ativo'], ['0', 'Inativo']] }] },
  membros: { titulo: 'Membros', aba: 'Membros', id: 'MembroID', pre: 'M', perm: 'config', rotulo: 'Nome', sub: 'Telefone', status: { col: 'Status', ativo: 'Ativo', off: 'Inativo' }, defaults: { EhMembro: '1' }, campos: [
    { k: 'Nome', l: 'Nome completo', t: 'text', max: 120, req: 1 }, { k: 'Simples', l: 'Nome simplificado', t: 'text', max: 60 }, { k: 'Apelido', l: 'Apelido', t: 'text', max: 40 }, { k: 'Email', l: 'E-mail (será o login se você liberar o acesso)', t: 'text', max: 120 }, { k: 'Sexo', l: 'Sexo', t: 'sel', op: ['Feminino', 'Masculino'] },
    { k: 'Nascimento', l: 'Nascimento', t: 'date' }, { k: 'Telefone', l: 'Celular', t: 'text', max: 25 }, { k: 'Profissao', l: 'Profissão', t: 'text', max: 60 }, { k: 'CEP', l: 'CEP', t: 'text', max: 9 }, { k: 'Endereco', l: 'Endereço', t: 'text', max: 200 },
    { k: 'Bairro', l: 'Bairro', t: 'text', max: 80 }, { k: 'Cidade', l: 'Cidade', t: 'text', max: 80 }, { k: 'UF', l: 'UF', t: 'text', max: 2 }, { k: 'EstadoCivil', l: 'Estado civil', t: 'text', max: 30 },
    { k: 'DataBatismo', l: 'Data do batismo', t: 'date' }, { k: 'CelulaID', l: 'Célula', t: 'celula' }, { k: 'Foto', l: 'Foto', t: 'foto' },
    { k: 'Status', l: 'Situação', t: 'sel', op: [['Ativo', 'Ativo'], ['Inativo', 'Inativo']] }] },
  pastores: { titulo: 'Nossos Pastores', aba: 'Pastores', id: 'PastorID', pre: 'PAS', perm: 'config', rotulo: 'Nome', sub: 'Cargo', status: { col: 'Ativo', ativo: '1', off: '0' }, campos: [
    { k: 'Nome', l: 'Nome', t: 'text', max: 80, req: 1 }, { k: 'Cargo', l: 'Cargo (ex.: Pastor titular)', t: 'text', max: 60 }, { k: 'Foto', l: 'Foto', t: 'foto' }, { k: 'Ordem', l: 'Ordem', t: 'num' }, { k: 'Ativo', l: 'Situação', t: 'sel', op: [['1', 'Ativo'], ['0', 'Inativo']] }] },
  familia: { titulo: 'Quem somos (fotos e vídeos)', aba: 'FamiliaMidia', id: 'MidiaID', pre: 'FM', perm: 'config', rotulo: 'Legenda', sub: 'Tipo', status: { col: 'Ativo', ativo: '1', off: '0' }, campos: [
    { k: 'Tipo', l: 'Tipo', t: 'sel', op: [['foto', 'Foto (carrossel)'], ['video', 'Vídeo (toca sozinho)']] }, { k: 'Foto', l: 'Foto (para o tipo Foto)', t: 'foto' }, { k: 'Url', l: 'Link do vídeo (YouTube https:// ou arquivo .mp4)', t: 'url' }, { k: 'Legenda', l: 'Legenda', t: 'text', max: 120 }, { k: 'Ordem', l: 'Ordem', t: 'num' }, { k: 'Ativo', l: 'Situação', t: 'sel', op: [['1', 'Ativo'], ['0', 'Inativo']] }] },
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
  const acessoPorMembro = {}; if (e.aba === 'Membros') table_('Usuarios').rows.forEach(function (x) { if (x.MembroID) acessoPorMembro[x.MembroID] = x; });
  const itens = t.rows.map(function (r) {
    const v = {}; e.campos.forEach(function (f) { v[f.k] = f.t === 'lines' ? jparse_(r[f.k], []).join('\n') : f.t === 'foto' ? (r[f.k] ? '__keep' : '') : r[f.k]; });
    const off = e.status ? r[e.status.col] === e.status.off : false;
    const it = { id: r[e.id], rotulo: r[e.rotulo] || '(sem nome)', sub: e.sub ? r[e.sub] : '', off: off, valores: v }; if (e.aba === 'Membros') { const ac = acessoPorMembro[r[e.id]]; it.acesso = ac ? { email: ac.Email, papel: ac.Papel, status: ac.Status || 'Ativo' } : null; it.email = r.Email || ''; } return it;
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
    if (e.aba === 'Membros' && patch.Email !== undefined) {
      patch.Email = String(patch.Email).toLowerCase().trim(); if (patch.Email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patch.Email)) throw new ApiError('VALIDATION', 'E-mail inválido.');
      if (row && table_('Usuarios').rows.some(function (x) { return x.MembroID === row.MembroID; })) delete patch.Email; // quem já tem acesso mantém o e-mail do login
      else if (patch.Email && t.rows.some(function (m) { return m.Email === patch.Email && m.MembroID !== (row && row.MembroID) && m.Status !== 'Inativo'; })) throw new ApiError('VALIDATION', 'Já existe uma pessoa com este e-mail.');
    }
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
/* exclusão permanente de pessoa: só depois de marcada como inativa (e com o acesso ao app já desativado) */
function purgePessoa_(d, u) {
  if (!can_(u, 'config') && u.papel !== 'admin') throw new ApiError('FORBIDDEN', 'Sem permissão para excluir pessoas.');
  return withLock_(function () {
    const id = clip_(d.membroId, 30), tm = table_('Membros'), m = tm.rows.filter(function (r) { return r.MembroID === id; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Pessoa não encontrada.');
    if (id === u.membroId) throw new ApiError('VALIDATION', 'Você não pode excluir a si mesmo.');
    if (m.Status !== 'Inativo') throw new ApiError('VALIDATION', 'Defina a pessoa como inativa antes de excluir de vez.');
    const tu = table_('Usuarios'), us = tu.rows.filter(function (r) { return r.MembroID === id; });
    if (us.some(function (r) { return r.Status !== 'Inativo'; })) throw new ApiError('VALIDATION', 'Desative o acesso ao app dessa pessoa antes de excluir.');
    const conf = String(d.confirmar || '').trim().toLowerCase(); if (conf !== String(m.Nome || '').trim().toLowerCase()) throw new ApiError('VALIDATION', 'Digite o nome completo da pessoa para confirmar.');
    const nome = m.Nome, tc = table_('Celulas');
    tc.rows.forEach(function (c) { const p = {}; if (c.LiderID === id) p.LiderID = ''; if (c.SupervisorID === id) p.SupervisorID = ''; if (c.TreinamentoID === id) p.TreinamentoID = ''; if (Object.keys(p).length) writeRow_(tc, c._row, p); });
    const apaga = function (aba, col) { const t = table_(aba); t.rows.filter(function (r) { return r[col] === id; }).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; }).forEach(function (rw) { t.sh.deleteRow(rw); }); };
    us.map(function (r) { return r._row; }).sort(function (a, b) { return b - a; }).forEach(function (rw) { tu.sh.deleteRow(rw); });
    apaga('Notificacoes', 'MembroID'); apaga('Rostos', 'MembroID');
    tm.sh.deleteRow(m._row);
    audit_(u.email, 'PESSOA_EXCLUIDA', id + ' ' + nome, 'OK'); return { ok: true };
  });
}

/* ============================== TRANSMISSÕES AO VIVO (Estúdio) ==============================
   O Estúdio roda no navegador (cenas, câmeras, transições, letras e versículos do telão) e envia o vídeo a um servidor de
   retransmissão (relay/, com ffmpeg) que entrega ao YouTube, Facebook etc. e gera o endereço HLS para assistir no próprio site.
   Aqui ficam: cadastro das plataformas e do relay (LiveCfg), o estado da live (LiveState), o aviso em "Lives e Vídeos",
   espectadores do site e comentários. As chaves de transmissão só são lidas por quem usa o Multimídia. */
const LIVE_PLAT_TIPOS = ['youtube', 'facebook', 'twitch', 'instagram', 'tiktok', 'rtmp'];
function liveCfgLer_() { const o = jparse_(cfgMap_().LiveCfg, {}); return { relay: { url: String((o.relay || {}).url || ''), token: String((o.relay || {}).token || '') }, plats: Array.isArray(o.plats) ? o.plats : [], q: { res: Number((o.q || {}).res) || 720, fps: Number((o.q || {}).fps) || 30, kbps: Number((o.q || {}).kbps) || 2500 } }; }
function getLiveCfg_(d, u) { multiExige_(u); return liveCfgLer_(); }
function saveLiveCfg_(d, u) {
  return withLock_(function () {
    const ant = liveCfgLer_(), old = {}; ant.plats.forEach(function (p) { old[p.id] = p; });
    const rl = d.relay || {}, url = clip_(rl.url, 200); if (url && !/^wss?:\/\//.test(url)) throw new ApiError('VALIDATION', 'O endereço do servidor de retransmissão deve começar com wss:// (ou ws:// em teste).');
    const plats = (Array.isArray(d.plats) ? d.plats : []).slice(0, 12).map(function (p) {
      const id = /^[A-Za-z0-9_-]{3,24}$/.test(String(p.id || '')) ? p.id : id_('PL'), tipo = LIVE_PLAT_TIPOS.indexOf(p.tipo) >= 0 ? p.tipo : 'rtmp', o = old[id] || {};
      const rtmp = clip_(p.rtmp, 300); if (rtmp && !/^rtmps?:\/\//.test(rtmp)) throw new ApiError('VALIDATION', 'O endereço RTMP de "' + clip_(p.nome, 40) + '" deve começar com rtmp:// ou rtmps://.');
      const assistir = clip_(p.assistir, 300); if (assistir && !/^https:\/\//.test(assistir)) throw new ApiError('VALIDATION', 'O link para assistir de "' + clip_(p.nome, 40) + '" deve começar com https://.');
      const seg = function (k, n) { return p[k] === '__keep' ? (o[k] || '') : clip_(p[k], n); };
      return { id: id, nome: clip_(p.nome, 40) || tipo, tipo: tipo, rtmp: rtmp, chave: seg('chave', 200), assistir: assistir, ativo: p.ativo !== false, apiKey: seg('apiKey', 200), videoId: clip_(p.videoId, 60), chatId: clip_(p.chatId, 120) };
    });
    const tok = rl.token === '__keep' ? ant.relay.token : clip_(rl.token, 200), q = d.q || {};
    const val = JSON.stringify({ relay: { url: url, token: tok }, plats: plats, q: { res: [480, 720, 1080].indexOf(Number(q.res)) >= 0 ? Number(q.res) : 720, fps: [24, 30, 60].indexOf(Number(q.fps)) >= 0 ? Number(q.fps) : 30, kbps: Math.max(500, Math.min(12000, Math.floor(Number(q.kbps) || 2500))) } });
    const t = table_('Config'), r = t.rows.filter(function (x) { return x.Chave === 'LiveCfg'; })[0]; if (r) writeRow_(t, r._row, { Valor: val }); else appendRow_(t, { Chave: 'LiveCfg', Valor: val });
    audit_(u.email, 'LIVE_CFG', plats.length + ' plataformas', 'OK'); return liveCfgLer_();
  });
}
function liveEstado_() { const o = jparse_(cfgMap_().LiveState, {}); return { ativa: !!o.ativa, inicio: Number(o.inicio) || 0, titulo: String(o.titulo || ''), videoId: String(o.videoId || ''), hls: String(o.hls || ''), links: Array.isArray(o.links) ? o.links : [], by: String(o.by || '') }; }
function liveGravaEstado_(o) { const t = table_('Config'), r = t.rows.filter(function (x) { return x.Chave === 'LiveState'; })[0], val = JSON.stringify(o); if (r) writeRow_(t, r._row, { Valor: val }); else appendRow_(t, { Chave: 'LiveState', Valor: val }); }
function liveStart_(d, u) {
  multiExige_(u);
  return withLock_(function () {
    const titulo = clip_(d.titulo, 120) || 'Transmissão ao vivo', hls = clip_(d.hls, 300); if (hls && !/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:\/])/.test(hls)) throw new ApiError('VALIDATION', 'O endereço HLS deve começar com https://.');
    const links = (Array.isArray(d.links) ? d.links : []).slice(0, 12).filter(function (l) { return l && /^https:\/\//.test(String(l.url || '')); }).map(function (l) { return { nome: clip_(l.nome, 40), url: clip_(l.url, 300) }; });
    const est = liveEstado_(), tv = table_('Videos'); let r = est.videoId && tv.rows.filter(function (x) { return x.VideoID === est.videoId; })[0];
    const url = (links[0] && links[0].url) || hls; if (!url) throw new ApiError('VALIDATION', 'Informe ao menos um link para assistir (plataforma ou HLS do site).');
    const vals = { Titulo: titulo, Url: url, Status: 'Ativo', Tipo: 'live', AoVivo: '1', Hls: hls, Links: JSON.stringify(links) };
    let vid; if (r) { writeRow_(tv, r._row, vals); vid = r.VideoID; } else { vid = id_('V'); vals.VideoID = vid; vals.Ordem = String(tv.rows.length + 1); appendRow_(tv, vals); }
    liveGravaEstado_({ ativa: true, inicio: Date.now(), titulo: titulo, videoId: vid, hls: hls, links: links, by: u.membroId });
    audit_(u.email, 'LIVE_INICIO', titulo, 'OK'); return liveEstado_();
  });
}
function liveStop_(d, u) {
  multiExige_(u);
  return withLock_(function () {
    const est = liveEstado_(), tv = table_('Videos'), r = est.videoId && tv.rows.filter(function (x) { return x.VideoID === est.videoId; })[0]; if (r) writeRow_(tv, r._row, { AoVivo: '0', Hls: '' });
    liveGravaEstado_({ ativa: false, inicio: 0, titulo: est.titulo, videoId: est.videoId, hls: '', links: est.links, by: u.membroId }); CacheService.getScriptCache().remove('lvs');
    audit_(u.email, 'LIVE_FIM', est.titulo, 'OK'); return liveEstado_();
  });
}
function liveWatchers_(touch) {
  const c = CacheService.getScriptCache(), now = Date.now(), o = jparse_(c.get('lvs'), {}), out = {}; Object.keys(o).forEach(function (k) { if (now - o[k] < 45000) out[k] = o[k]; });
  if (touch) out[touch] = now; c.put('lvs', JSON.stringify(out), 120); return Object.keys(out).length;
}
function getLive_(d, u) { const e = liveEstado_(); e.espectadores = e.ativa ? liveWatchers_(d && d.assistindo ? u.membroId : '') : 0; e.agora = Date.now(); return e; }
function liveSend_(d, u) {
  return withLock_(function () {
    const e = liveEstado_(); if (!e.ativa) throw new ApiError('VALIDATION', 'A transmissão não está no ar.'); const texto = clip_(d.texto, 300).trim(); if (!texto) throw new ApiError('VALIDATION', 'Escreva o comentário.');
    const t = table_('LiveComent'), agora = Date.now(); for (let i = t.rows.length - 1; i >= 0 && i > t.rows.length - 60; i--) { const r = t.rows[i]; if (r.MembroID === u.membroId && agora - Number(r.Ts) < 3000) throw new ApiError('RATE', 'Calma, espere um instante para comentar de novo.'); }
    appendRow_(t, { ComID: id_('LC'), LiveID: e.videoId, MembroID: u.membroId, Nome: nomes_()[u.membroId] || 'Membro', Texto: texto, Ts: String(agora) }); return { ok: true };
  });
}
function liveComments_(d, u) { const e = liveEstado_(), depois = Number(d.depois) || 0; return { itens: table_('LiveComent').rows.filter(function (r) { return r.LiveID === e.videoId && Number(r.Ts) > depois; }).slice(-80).map(function (r) { return { id: r.ComID, nome: r.Nome, texto: r.Texto, ts: Number(r.Ts) }; }) }; }
/* ============================== FEED SOCIAL, CONSOLIDAÇÃO, DECISÕES E BÍBLIA ============================== */
function minhaCelula_(u) { const m = table_('Membros').rows.filter(function (x) { return x.MembroID === u.membroId; })[0]; return m ? m.CelulaID : ''; }
function postVisivel_(p, u) {
  if (p.Status === 'removido') return false; if (p.Escopo === 'igreja') return true; if (p.AutorID === u.membroId) return true; if (p.Escopo === 'pessoal') return false;
  const c = p.CelulaID; return !!c && (minhaCelula_(u) === c || (u.lidera || []).indexOf(c) >= 0 || (u.treina || []).indexOf(c) >= 0 || (u.supervisiona || []).indexOf(c) >= 0 || u.papel === 'admin' || u.papel === 'pastor');
}
function postOut_(p, u, nm, curt, com) {
  return { id: p.PostID, tipo: p.Tipo, escopo: p.Escopo, celulaId: p.CelulaID, autorId: p.AutorID, autor: nm[p.AutorID] || '—', titulo: p.Titulo, texto: p.Texto, foto: p.Foto || '', meta: jparse_(p.Meta, {}), data: p.Data,
    curtidas: (curt[p.PostID] || []).length, curti: (curt[p.PostID] || []).indexOf(u.membroId) >= 0, comentarios: com[p.PostID] || 0, meu: p.AutorID === u.membroId };
}
function listFeed_(d, u) {
  const esc = d.escopo === 'celula' ? 'celula' : (d.escopo === 'pessoal' ? 'pessoal' : 'igreja'), nm = nomes_(), curt = {}, com = {};
  table_('Curtidas').rows.forEach(function (r) { if (r.Tipo === 'post') (curt[r.AlvoID] = curt[r.AlvoID] || []).push(r.MembroID); }); table_('Comentarios').rows.forEach(function (r) { com[r.PostID] = (com[r.PostID] || 0) + 1; });
  const lim = Math.max(1, Math.min(100, Math.floor(Number(d.limite) || 40)));
  const itens = table_('Posts').rows.filter(function (p) { return p.Escopo === esc && postVisivel_(p, u); }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, lim).map(function (p) { return postOut_(p, u, nm, curt, com); });
  return { itens: itens, celulaId: minhaCelula_(u) };
}
function acharPost_(id, u) { const p = table_('Posts').rows.filter(function (x) { return x.PostID === clip_(id, 30); })[0]; if (!p || !postVisivel_(p, u)) throw new ApiError('NOT_FOUND', 'Publicação não encontrada.'); return p; }
function likePost_(d, u) {
  return withLock_(function () {
    const p = acharPost_(d.id, u), t = table_('Curtidas'), ex = t.rows.filter(function (r) { return r.Tipo === 'post' && r.AlvoID === p.PostID && r.MembroID === u.membroId; })[0], on = d.on !== false;
    if (ex && !on) t.sh.deleteRow(ex._row); else if (!ex && on) appendRow_(t, { Tipo: 'post', AlvoID: p.PostID, MembroID: u.membroId, Data: now_() });
    return { curtidas: table_('Curtidas').rows.filter(function (r) { return r.Tipo === 'post' && r.AlvoID === p.PostID; }).length, curti: on };
  });
}
function commentPost_(d, u) {
  return withLock_(function () {
    const p = acharPost_(d.id, u), tx = clip_(d.texto, 400); if (!tx) throw new ApiError('VALIDATION', 'Escreva o comentário.');
    const id = id_('CM'); appendRow_(table_('Comentarios'), { ComentID: id, PostID: p.PostID, MembroID: u.membroId, Texto: tx, Data: now_() });
    if (p.AutorID && p.AutorID !== u.membroId) notify_(p.AutorID, 'comentario', (nomes_()[u.membroId] || 'Alguém') + ' comentou na sua publicação', tx, 'post:' + p.PostID);
    return { id: id };
  });
}
function listComments_(d, u) {
  const p = acharPost_(d.id, u), nm = nomes_(), fotos = {}; return { itens: table_('Comentarios').rows.filter(function (r) { return r.PostID === p.PostID; }).sort(function (a, b) { return a.Data < b.Data ? -1 : 1; }).map(function (r) { return { id: r.ComentID, autorId: r.MembroID, autor: nm[r.MembroID] || '—', texto: r.Texto, data: r.Data, meu: r.MembroID === u.membroId }; }) };
}
function deletePost_(d, u) {
  return withLock_(function () {
    const t = table_('Posts'), p = t.rows.filter(function (x) { return x.PostID === clip_(d.id, 30); })[0]; if (!p) throw new ApiError('NOT_FOUND', 'Publicação não encontrada.');
    if (p.AutorID !== u.membroId && !can_(u, 'config') && u.papel !== 'admin') throw new ApiError('FORBIDDEN', 'Só quem publicou (ou a administração) pode apagar.');
    writeRow_(t, p._row, { Status: 'removido' }); return { ok: true };
  });
}
function deleteComment_(d, u) {
  return withLock_(function () {
    const t = table_('Comentarios'), r = t.rows.filter(function (x) { return x.ComentID === clip_(d.id, 30); })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Comentário não encontrado.');
    if (r.MembroID !== u.membroId && !can_(u, 'config') && u.papel !== 'admin') throw new ApiError('FORBIDDEN', 'Só quem comentou pode apagar.'); t.sh.deleteRow(r._row); return { ok: true };
  });
}
function novoPost_(o) { const id = id_('PO'); appendRow_(table_('Posts'), { PostID: id, Tipo: o.tipo, Escopo: o.escopo, CelulaID: o.celulaId || '', AutorID: o.autorId || '', Titulo: clip_(o.titulo, 140), Texto: clip_(o.texto, 1000), Foto: o.foto || '', Meta: JSON.stringify(o.meta || {}), Data: now_(), Status: 'ok' }); return id; }
/* ---- decisão por Cristo: cria a publicação no feed principal (sem lock próprio; use dentro de withLock_) ---- */
function decisaoCore_(o, u) {
  const mt = table_('Membros'); let mem = o.membroId ? mt.rows.filter(function (m) { return m.MembroID === o.membroId; })[0] : null; if (o.membroId && !mem) throw new ApiError('NOT_FOUND', 'Membro não encontrado.');
  const data = clip_(o.data, 10) || today_(); if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > today_()) throw new ApiError('VALIDATION', 'Data inválida.');
  let nome = mem ? (mem.Apelido || mem.Simples || mem.Nome) : clip_(o.nome, 80); if (!nome) throw new ApiError('VALIDATION', 'Informe o nome de quem aceitou Jesus.');
  const pt = table_('Posts'); if (pt.rows.some(function (p) { return p.Tipo === 'decisao' && p.Status !== 'removido' && jparse_(p.Meta, {}).data === data && ((mem && jparse_(p.Meta, {}).membroId === mem.MembroID) || (!mem && norm_(jparse_(p.Meta, {}).nome || '') === norm_(nome))); })) throw new ApiError('DUPLICATE', nome + ' já foi lançado(a) nessa data.');
  let vid = '';
  if (mem) { writeRow_(mt, mem._row, { DataDecisao: mem.DataDecisao || data }); mem.DataDecisao = mem.DataDecisao || data; conquistasMembro_(mem); }
  else { vid = id_('V'); appendRow_(table_('Visitantes'), { VisitanteID: vid, Nome: nome, Apelido: nome.split(' ')[0], Telefone: clip_(o.telefone, 25), Data: data, RegistradoPor: u.membroId, CelulaID: clip_(o.celulaId, 30), Decisao: '1', Contatado: '0' }); }
  const cel = o.celulaId ? table_('Celulas').rows.filter(function (c) { return c.CelulaID === o.celulaId; })[0] : null, term = o.termometro === undefined || o.termometro === '' || o.termometro === null ? null : Math.max(0, Math.min(100, Math.round(Number(o.termometro) || 0)));
  const origem = o.origem === 'celula' ? 'celula' : 'culto', foto = fotoOk_(o.foto);
  const txt = origem === 'celula' ? nome + ' aceitou Jesus' + (cel ? ' na célula ' + cel.Nome : ' na célula') + '! Glória a Deus!' : nome + ' aceitou Jesus no culto! Glória a Deus!';
  const pid = novoPost_({ tipo: 'decisao', escopo: 'igreja', celulaId: o.celulaId || '', autorId: u.membroId, titulo: nome + ' aceitou Jesus!', texto: txt, foto: foto, meta: { nome: nome, membroId: mem ? mem.MembroID : '', visitanteId: vid, data: data, origem: origem, celula: cel ? cel.Nome : '', termometro: term } });
  return { postId: pid, nome: nome };
}
function registerDecision_(d, u) {
  if (!ehLider_(u)) throw new ApiError('FORBIDDEN', 'Só líderes lançam decisões.');
  return withLock_(function () { const r = decisaoCore_({ membroId: clip_(d.membroId, 30), nome: d.nome, telefone: d.telefone, data: d.data, origem: 'culto', celulaId: clip_(d.celulaId, 30), foto: d.foto }, u); audit_(u.email, 'DECISAO', r.nome, 'OK'); return r; });
}
/* ---- Consolidação: visitantes, célula mais próxima e alerta ao líder ---- */
function kmEntre_(la1, lo1, la2, lo2) { const R = 6371, rad = Math.PI / 180, dl = (la2 - la1) * rad, dn = (lo2 - lo1) * rad, a = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dn / 2) * Math.sin(dn / 2); return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
function celulaProxima_(lat, lng) {
  let best = null; table_('Celulas').rows.forEach(function (c) { if (c.Status === 'Inativa' || c.Lat === '' || c.Lat === undefined || c.Lng === '' || c.Lng === undefined) return; const km = kmEntre_(lat, lng, Number(c.Lat), Number(c.Lng)); if (isFinite(km) && (!best || km < best.km)) best = { cel: c, km: km }; }); return best;
}
function msgPadrao_(apelido) { return 'Paz, ' + apelido + '! Aqui é da Igreja Ministério Zoe. Ficamos muito alegres com a sua presença no culto! Que Deus te abençoe. Quando quiser, tem uma célula pertinho de você e vamos adorar te receber. 🙏'; }
function saveVisitor_(d, u) {
  if (!ehLider_(u)) throw new ApiError('FORBIDDEN', 'Só líderes lançam visitantes.');
  return withLock_(function () {
    const nome = clip_(d.nome, 80); if (nome.length < 2) throw new ApiError('VALIDATION', 'Informe o nome do visitante.');
    const tel = clip_(d.telefone, 25).replace(/[^\d+()\s-]/g, ''); if (tel.replace(/\D/g, '').length < 10) throw new ApiError('VALIDATION', 'Informe o celular com DDD.');
    const lat = Number(d.lat), lng = Number(d.lng); if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) throw new ApiError('VALIDATION', 'Marque no mapa onde o visitante mora.');
    const ap = clip_(d.apelido, 40) || nome.split(' ')[0], pr = celulaProxima_(lat, lng), id = id_('V');
    appendRow_(table_('Visitantes'), { VisitanteID: id, Nome: nome, Apelido: ap, Telefone: tel, Email: clip_(d.email, 80), Nascimento: clip_(d.nascimento, 10), Endereco: clip_(d.endereco, 200), Bairro: clip_(d.bairro, 80), Cidade: clip_(d.cidade, 80), UF: clip_(d.uf, 2), Lat: String(Math.round(lat * 1e6) / 1e6), Lng: String(Math.round(lng * 1e6) / 1e6), Data: today_(), RegistradoPor: u.membroId, CelulaID: pr ? pr.cel.CelulaID : '', Distancia: pr ? String(Math.round(pr.km * 10) / 10) : '', Contatado: '0', Msg: msgPadrao_(ap), Obs: clip_(d.obs, 300), Decisao: '0' });
    if (pr) {
      const km = Math.round(pr.km * 10) / 10, avisados = {}, nomes = nomes_();
      if (pr.cel.LiderID && pr.cel.LiderID !== u.membroId) { avisados[pr.cel.LiderID] = 1; notify_(pr.cel.LiderID, 'visitante', 'Novo visitante perto da sua célula: ' + nome, ap + ' esteve no culto e mora a ' + km + ' km. Abra Consolidação para chamar no WhatsApp.', 'visitante:' + id); }
      if (pr.cel.SupervisorID && pr.cel.SupervisorID !== u.membroId && !avisados[pr.cel.SupervisorID]) notify_(pr.cel.SupervisorID, 'visitante', 'Novo visitante na célula ' + pr.cel.Nome + ': ' + nome, ap + ' mora a ' + km + ' km da célula' + (pr.cel.LiderID ? ' de ' + (nomes[pr.cel.LiderID] || 'seu líder') : '') + '. O líder já foi avisado.', 'visitante:' + id);
    }
    audit_(u.email, 'VISITANTE', id + ' ' + nome, 'OK'); return { id: id, celula: pr ? { id: pr.cel.CelulaID, nome: pr.cel.Nome, km: Math.round(pr.km * 10) / 10 } : null, avisados: pr ? [pr.cel.LiderID, pr.cel.SupervisorID].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).length : 0 };
  });
}
function nearCell_(d, u) {
  if (!ehLider_(u)) throw new ApiError('FORBIDDEN', 'Só líderes usam a consolidação.');
  const lat = Number(d.lat), lng = Number(d.lng); if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new ApiError('VALIDATION', 'Marque o local no mapa.');
  const pr = celulaProxima_(lat, lng); if (!pr) return { celula: null };
  const nm = nomes_(); return { celula: { id: pr.cel.CelulaID, nome: pr.cel.Nome, km: Math.round(pr.km * 10) / 10, dia: pr.cel.Dia || '', inicio: pr.cel.Inicio || '', bairro: pr.cel.Bairro || '', lider: nm[pr.cel.LiderID] || '', supervisor: nm[pr.cel.SupervisorID] || '' } };
}
function visitorOut_(v, cn) { return { id: v.VisitanteID, nome: v.Nome, apelido: v.Apelido, telefone: v.Telefone, email: v.Email || '', endereco: [v.Endereco, v.Bairro, v.Cidade].filter(String).join(', '), lat: v.Lat === '' ? null : Number(v.Lat), lng: v.Lng === '' ? null : Number(v.Lng), data: v.Data, celulaId: v.CelulaID, celula: cn[v.CelulaID] || '', km: v.Distancia === '' ? null : Number(v.Distancia), contatado: v.Contatado === '1', contatadoEm: v.ContatoData || '', msg: v.Msg || msgPadrao_(v.Apelido || v.Nome), obs: v.Obs || '', decisao: v.Decisao === '1' }; }
function listVisitors_(d, u) {
  if (!ehLider_(u)) throw new ApiError('FORBIDDEN', 'Só líderes veem a consolidação.');
  const cn = {}, cels = table_('Celulas').rows; cels.forEach(function (c) { cn[c.CelulaID] = c.Nome; });
  const todos = u.papel === 'admin' || u.papel === 'pastor' || can_(u, 'celulas'), minhas = (u.lidera || []).concat(u.supervisiona || []);
  const itens = table_('Visitantes').rows.filter(function (v) { return todos || v.RegistradoPor === u.membroId || (v.CelulaID && minhas.indexOf(v.CelulaID) >= 0); }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 200).map(function (v) { return visitorOut_(v, cn); });
  return { itens: itens, celulas: cels.filter(function (c) { return c.Status !== 'Inativa' && c.Lat !== '' && c.Lat !== undefined; }).map(function (c) { return { id: c.CelulaID, nome: c.Nome, lat: Number(c.Lat), lng: Number(c.Lng) }; }), msgPadrao: msgPadrao_('{apelido}') };
}
function contactVisitor_(d, u) {
  if (!ehLider_(u)) throw new ApiError('FORBIDDEN', 'Só líderes.');
  return withLock_(function () {
    const t = table_('Visitantes'), v = t.rows.filter(function (x) { return x.VisitanteID === clip_(d.id, 30); })[0]; if (!v) throw new ApiError('NOT_FOUND', 'Visitante não encontrado.');
    const patch = { Contatado: d.contatado === false ? '0' : '1', ContatadoPor: u.membroId, ContatoData: now_() }; if (d.msg !== undefined) patch.Msg = clip_(d.msg, 500); writeRow_(t, v._row, patch); return { ok: true };
  });
}
/* ---- Bíblia: marcações, comentários e anotações do culto ---- */
function listMarks_(d, u) {
  const pre = clip_(d.b, 6) + ':' + clip_(d.c, 4) + ':', nm = nomes_(), rows = table_('BibMarcas').rows.filter(function (r) { return String(r.Ref).indexOf(pre) === 0; });
  return { minhas: rows.filter(function (r) { return r.MembroID === u.membroId; }).map(function (r) { return { ref: r.Ref, cor: r.Cor, tipo: r.Tipo, coment: r.Comentario, publico: r.Publico === '1' }; }),
    publicos: rows.filter(function (r) { return r.MembroID !== u.membroId && r.Publico === '1' && r.Comentario; }).slice(-60).map(function (r) { return { ref: r.Ref, autor: nm[r.MembroID] || '—', autorId: r.MembroID, coment: r.Comentario }; }) };
}
function saveMark_(d, u) {
  return withLock_(function () {
    const ref = clip_(d.ref, 20); if (!/^\d{1,3}:\d{1,3}:\d{1,3}$/.test(ref)) throw new ApiError('VALIDATION', 'Versículo inválido.');
    const cores = ['amarelo', 'verde', 'azul', 'rosa', 'laranja', 'roxo'], cor = d.cor ? String(d.cor) : '', tipo = d.tipo === 'sublinhado' ? 'sublinhado' : 'marca', com = clip_(d.coment, 500); if (cor && cores.indexOf(cor) < 0) throw new ApiError('VALIDATION', 'Cor inválida.');
    const t = table_('BibMarcas'), ex = t.rows.filter(function (r) { return r.MembroID === u.membroId && r.Ref === ref; })[0];
    if (!cor && !com) { if (ex) t.sh.deleteRow(ex._row); return { removida: true }; }
    const row = { Cor: cor, Tipo: tipo, Comentario: com, Publico: d.publico && com ? '1' : '0', Data: today_() };
    if (ex) writeRow_(t, ex._row, row); else appendRow_(t, Object.assign({ MembroID: u.membroId, Ref: ref }, row)); return { ok: true };
  });
}
function saveNote_(d, u) {
  return withLock_(function () {
    const data = clip_(d.data, 10) || today_(); if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ApiError('VALIDATION', 'Data inválida.');
    const itens = (Array.isArray(d.itens) ? d.itens : []).slice(0, 40).map(function (i) { return { ref: clip_(i.ref, 20), livro: clip_(i.livro, 40), texto: clip_(i.texto, 400), coment: clip_(i.coment, 400) }; }).filter(function (i) { return i.ref; });
    const tema = clip_(d.tema, 80); if (!itens.length && !clip_(d.texto, 1000)) throw new ApiError('VALIDATION', 'Adicione ao menos um versículo ou escreva a anotação.');
    const p = data.split('-'), titulo = p[2] + '/' + p[1] + '/' + p[0] + ' ' + diaDe_(data) + (tema ? ' - Tema ' + tema : ''), cel = minhaCelula_(u);
    const t = table_('Posts'), ex = d.id ? t.rows.filter(function (x) { return x.PostID === d.id && x.AutorID === u.membroId && x.Tipo === 'nota'; })[0] : null;
    const igreja = d.igreja === true, row = { Titulo: titulo, Texto: clip_(d.texto, 1000), Meta: JSON.stringify({ data: data, dia: diaDe_(data), tema: tema, itens: itens, igreja: igreja }) };
    if (ex) { writeRow_(t, ex._row, row); return { id: ex.PostID, titulo: titulo }; }
    const id = novoPost_({ tipo: 'nota', escopo: cel ? 'celula' : 'pessoal', celulaId: cel, autorId: u.membroId, titulo: titulo, texto: row.Texto, meta: { data: data, dia: diaDe_(data), tema: tema, itens: itens, igreja: igreja } }); return { id: id, titulo: titulo, escopo: cel ? 'celula' : 'pessoal' };
  });
}


/* Anotações do culto que o autor escolheu mostrar para toda a igreja: só dos 3 últimos cultos (datas) com anotação compartilhada */
function listCultoNotes_(d, u) {
  const nm = nomes_(), hoje = today_(), lim = new Date(); lim.setDate(lim.getDate() - 70); const minData = lim.getFullYear() + '-' + escPad_(lim.getMonth() + 1) + '-' + escPad_(lim.getDate());
  const todas = table_('Posts').rows.filter(function (p) { if (p.Tipo !== 'nota' || p.Status === 'removido') return false; const m = jparse_(p.Meta, {}); return m.igreja === true && m.data && m.data <= hoje && m.data >= minData; });
  const datas = []; todas.forEach(function (p) { const dt = jparse_(p.Meta, {}).data; if (datas.indexOf(dt) < 0) datas.push(dt); }); datas.sort().reverse(); const ult = datas.slice(0, 3);
  const itens = todas.filter(function (p) { return ult.indexOf(jparse_(p.Meta, {}).data) >= 0; }).sort(function (a, b) { const da = jparse_(a.Meta, {}).data, db = jparse_(b.Meta, {}).data; return da === db ? (a.Data < b.Data ? 1 : -1) : (da < db ? 1 : -1); }).slice(0, 40).map(function (p) {
    const m = jparse_(p.Meta, {}); return { id: p.PostID, autor: nm[p.AutorID] || '—', data: m.data, dia: m.dia || '', tema: m.tema || '', texto: clip_(p.Texto, 400), versiculos: (m.itens || []).slice(0, 3).map(function (i) { return { ref: i.ref, livro: i.livro, texto: clip_(i.texto, 160), coment: clip_(i.coment, 200) }; }) };
  });
  return { cultos: ult, itens: itens };
}

/* ===== Mural livre da Família Zoe (Nossos Pastores) e foto da frente da igreja (Onde estamos): só quem tem permissão de configuração edita; todos veem ===== */
const MURAL_PAGS = ['pastores', 'onde'];
function muralOut_(r) { const dd = jparse_(r.Dados, {}); return { id: r.ItemID, t: r.Tipo, x: Number(r.X) || 0, y: Number(r.Y) || 0, w: Number(r.W) || 0, r: Number(r.R) || 0, z: Number(r.Z) || 0, l: r.Texto || '', c: r.Cor || '', img: r.Foto || '', k: dd.k || '', s: dd.s || 0, tl: dd.tl || '', p: dd.p || [] }; }
function getMural_(d, u) {
  const pg = clip_(d.pagina, 20); if (MURAL_PAGS.indexOf(pg) < 0) throw new ApiError('VALIDATION', 'Página inválida.');
  return { itens: table_('MuralFam').rows.filter(function (r) { return r.Pagina === pg; }).sort(function (a, b) { return (Number(a.Z) || 0) - (Number(b.Z) || 0) || a._row - b._row; }).map(muralOut_) };
}
function saveMural_(d, u) {
  return withLock_(function () {
    const pg = clip_(d.pagina, 20); if (MURAL_PAGS.indexOf(pg) < 0) throw new ApiError('VALIDATION', 'Página inválida.');
    const arr = Array.isArray(d.itens) ? d.itens : []; if (arr.length > 500) throw new ApiError('VALIDATION', 'Itens demais no mural.');
    const t = table_('MuralFam'), ex = {}; t.rows.forEach(function (r) { if (r.Pagina === pg) ex[r.ItemID] = r; });
    const num = function (v, lo, hi, def) { v = Math.round(Number(v)); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def; };
    const out = []; let fotos = 0, outros = 0, ids = {};
    arr.forEach(function (i) {
      if (!i || ['foto', 'adesivo', 'texto', 'traco'].indexOf(i.t) < 0) return; let id = clip_(String(i.id || ''), 30).replace(/[^A-Za-z0-9_-]/g, ''); if (!id || ids[id]) id = id_('MF'); ids[id] = 1;
      const row = { ItemID: id, Pagina: pg, Tipo: i.t, X: num(i.x, -300, 1500, 0), Y: num(i.y, -300, 1100, 0), W: num(i.w, 0, 1400, 0), R: num(i.r, -45, 45, 0), Z: num(i.z, 0, 999, 0), Texto: '', Cor: /^#[0-9a-fA-F]{6}$/.test(String(i.c || '')) ? i.c : '#FFFFFF', Foto: '', Dados: '', CriadoEm: now_() };
      if (i.t === 'foto') {
        if (++fotos > 30) throw new ApiError('VALIDATION', 'No máximo 30 fotos no mural.'); row.Texto = clip_(i.l, 60);
        if (i.img === '__keep' && ex[id]) row.Foto = ex[id].Foto; else { const f = String(i.img || ''); if (!/^data:image\/(jpeg|png|webp);base64,/.test(f) || f.length > 45000) throw new ApiError('VALIDATION', 'Foto inválida ou muito grande.'); row.Foto = f; }
      } else if (i.t === 'adesivo') { if (++outros > 300) return; row.Dados = JSON.stringify({ k: ['star', 'heart', 'circle', 'cross'].indexOf(i.k) >= 0 ? i.k : 'star' }); }
      else if (i.t === 'texto') { if (++outros > 300) return; row.Texto = clip_(i.l, 120); if (!row.Texto) return; row.Dados = JSON.stringify({ s: num(i.s, 10, 120, 28) }); }
      else { if (++outros > 300) return; const pts = (Array.isArray(i.p) ? i.p : []).slice(0, 4000).map(function (n) { return Math.round(Number(n)) || 0; }); if (pts.length < 2) return; const dd = JSON.stringify({ tl: ['pincel', 'giz', 'borracha'].indexOf(i.tl) >= 0 ? i.tl : 'pincel', s: num(i.s, 1, 80, 5), p: pts }); if (dd.length > 45000) throw new ApiError('VALIDATION', 'Um traço ficou grande demais; faça traços menores.'); row.Dados = dd; }
      out.push(row);
    });
    t.rows.filter(function (r) { return r.Pagina === pg; }).sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { t.sh.deleteRow(r._row); });
    out.forEach(function (r) { appendRow_(t, r); });
    audit_(u.email, 'MURAL_FAM:' + pg, out.length + ' itens', 'OK'); return { ok: true, itens: out.map(muralOut_) };
  });
}

/* ===== Escalas de ministérios ===== */
function escPad_(n) { return (n < 10 ? '0' : '') + n; }
function escFmt_(d) { return d.getFullYear() + '-' + escPad_(d.getMonth() + 1) + '-' + escPad_(d.getDate()); }
function escDatas_(ini, dias, meses) {
  const p = ini.split('-'), d0 = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12), fim = new Date(d0.getTime()); fim.setMonth(fim.getMonth() + meses);
  const out = []; for (let x = new Date(d0.getTime()); x < fim && out.length < 120; x.setDate(x.getDate() + 1)) { if (dias.indexOf(x.getDay()) >= 0) out.push(escFmt_(x)); } return out;
}
function escDiasAte_(data) { const a = today_().split('-'), b = data.split('-'); return Math.round((new Date(Number(b[0]), Number(b[1]) - 1, Number(b[2]), 12) - new Date(Number(a[0]), Number(a[1]) - 1, Number(a[2]), 12)) / 86400000); }
function escBr_(data) { const p = data.split('-'); return p[2] + '/' + p[1]; }
function escGestor_(u) { return podeCurar_(u); }
function escGestoresDe_(membroId, extra) {
  const ids = {}; (extra || []).forEach(function (x) { if (x) ids[x] = 1; });
  table_('Usuarios').rows.forEach(function (r) { if (r.MembroID && (r.Papel === 'admin' || r.Papel === 'pastor') && r.Status !== 'Inativo') ids[r.MembroID] = 1; });
  const m = table_('Membros').rows.filter(function (x) { return x.MembroID === membroId; })[0];
  if (m && m.CelulaID) { const c = table_('Celulas').rows.filter(function (x) { return x.CelulaID === m.CelulaID; })[0]; if (c) { if (c.SupervisorID) ids[c.SupervisorID] = 1; } }
  delete ids[membroId]; return Object.keys(ids);
}
function escRow_(id) { const t = table_('Escalas'), r = t.rows.filter(function (x) { return x.EscalaID === id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Escala não encontrada.'); return { t: t, r: r }; }
function escAvisos_(u) {
  if (!u || !u.membroId) return;
  const t = table_('Escalas'), mi = {}; table_('Ministerios').rows.forEach(function (m) { mi[m.MinisterioID] = m.Nome; });
  t.rows.forEach(function (r) {
    if (r.MembroID !== u.membroId || r.Status === 'cancelada' || r.Status === 'reescalar' || !r.Data) return;
    const dd = escDiasAte_(r.Data); if (dd < 0 || dd > 7) return;
    const marca = dd <= 1 ? '1' : dd <= 3 ? '3' : '7', ja = String(r.Avisos || '').split(',');
    if (ja.indexOf(marca) >= 0) return;
    const quando = marca === '1' ? 'amanhã' : marca === '3' ? 'em 3 dias' : 'em 1 semana';
    notify_(u.membroId, 'escala_lembrete', 'Você está escalado ' + (dd <= 0 ? 'hoje' : quando) + ': ' + (mi[r.MinisterioID] || 'Ministério') + ' (' + escBr_(r.Data) + (r.Hora ? ' às ' + r.Hora : '') + ')', r.Status === 'confirmada' ? 'Sua presença já está confirmada. Deus abençoe!' : 'Confirme sua presença ou peça uma re-escalação.', r.EscalaID);
    writeRow_(t, r._row, { Avisos: ja.filter(Boolean).concat([marca]).join(',') });
  });
}
function escOut_(r, nm, mi, u, gestor) {
  const dono = !!r.MembroID && r.MembroID === u.membroId, vis = gestor || dono;
  return { id: r.EscalaID, ministerioId: r.MinisterioID, ministerio: mi[r.MinisterioID] || '', membroId: r.MembroID, nome: r.MembroID ? (nm[r.MembroID] || '') : '', data: r.Data, hora: r.Hora || '', funcao: r.Funcao || '', status: r.MembroID ? (r.Status || 'pendente') : 'aberta', motivo: vis ? (r.Motivo || '') : '', meu: dono,
    troca: r.Status === 'troca' ? { membroId: r.TrocaMembroID, nome: nm[r.TrocaMembroID] || '', escalaId: r.TrocaEscalaID || '', msg: vis ? (r.TrocaMsg || '') : '' } : null,
    origem: r.OrigemMembroID ? (nm[r.OrigemMembroID] || '') : '', serie: r.SerieID || '', reesc: Number(r.Reesc || 0), presente: r.Presente === '' || r.Presente === undefined ? null : r.Presente === '1' };
}
function listScales_(d, u) {
  escAvisos_(u);
  const gestor = escGestor_(u), nm = nomes_(), mi = {}; table_('Ministerios').rows.forEach(function (m) { mi[m.MinisterioID] = m.Nome; });
  const hoje = today_(), ini = escFmt_(new Date(new Date().getTime() - 60 * 86400000));
  const rows = table_('Escalas').rows.filter(function (r) { return r.Status !== 'cancelada' && r.Data >= ini && (!d.ministerioId || r.MinisterioID === d.ministerioId); }).sort(function (a, b) { return a.Data === b.Data ? (a.Hora < b.Hora ? -1 : 1) : (a.Data < b.Data ? -1 : 1); }).slice(0, 700);
  const out = { gestor: gestor, hoje: hoje, ministerios: listMin_().map(function (m) { return { id: m.id, nome: m.nome }; }), itens: rows.map(function (r) { return escOut_(r, nm, mi, u, gestor); }) };
  const pd = table_('EscalaPedidos').rows.filter(function (p) { return gestor ? p.Status === 'pendente' : p.MembroID === u.membroId; }).slice(-60);
  out.pedidos = pd.map(function (p) { return { id: p.PedidoID, ministerioId: p.MinisterioID, ministerio: mi[p.MinisterioID] || '', membroId: p.MembroID, nome: nm[p.MembroID] || '', data: p.Data, msg: p.Msg, status: p.Status, criadoEm: p.CriadoEm }; });
  if (gestor) {
    const all = table_('Escalas').rows.filter(function (r) { return r.Status !== 'cancelada'; }), fut = all.filter(function (r) { return r.Data >= hoje; }), pass = all.filter(function (r) { return r.Data < hoje; });
    const por = {}; fut.forEach(function (r) { const k = r.MinisterioID; por[k] = por[k] || { ministerio: mi[k] || '?', pessoas: {}, escalas: 0 }; if (r.MembroID) { por[k].pessoas[r.MembroID] = 1; por[k].escalas++; } });
    out.ind = {
      porMinisterio: Object.keys(por).map(function (k) { return { ministerio: por[k].ministerio, pessoas: Object.keys(por[k].pessoas).length, escalas: por[k].escalas }; }).sort(function (a, b) { return b.escalas - a.escalas; }),
      proximas: fut.filter(function (r) { return r.MembroID; }).length, abertas: fut.filter(function (r) { return !r.MembroID; }).length, confirmadas: fut.filter(function (r) { return r.Status === 'confirmada'; }).length, pendentes: fut.filter(function (r) { return r.Status === 'pendente' && r.MembroID; }).length,
      reescalar: fut.filter(function (r) { return r.Status === 'reescalar'; }).length, trocas: fut.filter(function (r) { return r.Status === 'troca'; }).length,
      reescTotal: all.reduce(function (a, r) { return a + Number(r.Reesc || 0); }, 0),
      confirmouFoi: pass.filter(function (r) { return r.Presente === '1' && r.ConfirmadoEm; }).length, foram: pass.filter(function (r) { return r.Presente === '1'; }).length, faltaram: pass.filter(function (r) { return r.Presente === '0'; }).length, passadas: pass.length
    };
  }
  return out;
}
function saveScale_(d, u) {
  if (!escGestor_(u)) throw new ApiError('FORBIDDEN', 'Só supervisores lançam escalas.');
  return withLock_(function () {
    const min = table_('Ministerios').rows.filter(function (m) { return m.MinisterioID === d.ministerioId && m.Ativo !== '0'; })[0]; if (!min) throw new ApiError('VALIDATION', 'Escolha o ministério.');
    const ids = (Array.isArray(d.membros) ? d.membros : [d.membroId]).map(function (x) { return clip_(x, 30); }).filter(Boolean);
    const vagas = ids.length ? 0 : Math.max(0, Math.min(20, Math.floor(Number(d.vagas) || 0)));
    if (!ids.length && !vagas) throw new ApiError('VALIDATION', 'Escolha pessoas ou informe quantas vagas ficam abertas.');
    const mem = {}; table_('Membros').rows.forEach(function (m) { mem[m.MembroID] = m; }); ids.forEach(function (x) { if (!mem[x]) throw new ApiError('VALIDATION', 'Pessoa não encontrada.'); });
    const data = clip_(d.data, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ApiError('VALIDATION', 'Informe a data.');
    const hora = clip_(d.hora, 5); if (hora && !/^\d{2}:\d{2}$/.test(hora)) throw new ApiError('VALIDATION', 'Hora inválida.');
    let datas = [data], serie = '';
    if (d.repetir && Array.isArray(d.repetir.dias) && d.repetir.dias.length) {
      const dias = d.repetir.dias.map(Number).filter(function (x) { return x >= 0 && x <= 6; }), meses = Math.max(1, Math.min(12, Math.floor(Number(d.repetir.meses) || 1)));
      datas = escDatas_(data, dias, meses); if (!datas.length) throw new ApiError('VALIDATION', 'Nenhuma data nesse período.'); serie = id_('SE');
    }
    const t = table_('Escalas'); let n = 0;
    if (vagas) {
      datas.forEach(function (dt) { for (let k = 0; k < vagas; k++) { appendRow_(t, { EscalaID: id_('ES'), MinisterioID: min.MinisterioID, MembroID: '', Data: dt, Hora: hora, Funcao: clip_(d.funcao, 40), Status: 'aberta', SerieID: serie, CriadoPor: u.membroId, Reesc: 0, Avisos: '' }); n++; } });
      audit_(u.email, 'saveScale', min.Nome + ' vagas abertas x' + n); return { criadas: n, abertas: n };
    }
    ids.forEach(function (mid) {
      let primeira = '';
      datas.forEach(function (dt) {
        if (t.rows.some(function (r) { return r.MembroID === mid && r.MinisterioID === min.MinisterioID && r.Data === dt && r.Hora === hora && r.Status !== 'cancelada'; })) return;
        appendRow_(t, { EscalaID: id_('ES'), MinisterioID: min.MinisterioID, MembroID: mid, Data: dt, Hora: hora, Funcao: clip_(d.funcao, 40), Status: 'pendente', SerieID: serie, CriadoPor: u.membroId, Reesc: 0, Avisos: '' }); n++; if (!primeira) primeira = dt;
      });
      if (primeira) notify_(mid, 'escala', 'Você foi escalado: ' + min.Nome, datas.length > 1 ? 'Primeira data ' + escBr_(primeira) + ' e mais ' + (datas.length - 1) + ' escala(s). Abra Escalas para confirmar.' : 'Dia ' + escBr_(primeira) + (hora ? ' às ' + hora : '') + '. Abra Escalas para confirmar.', 'escala');
    });
    audit_(u.email, 'saveScale', min.Nome + ' x' + n); return { criadas: n };
  });
}
function claimScale_(d, u) {
  return withLock_(function () {
    const x = escRow_(clip_(d.id, 30)); if (x.r.MembroID || x.r.Status !== 'aberta') throw new ApiError('VALIDATION', 'Esta vaga já foi preenchida.');
    if (x.r.Data < today_()) throw new ApiError('VALIDATION', 'Esta data já passou.');
    if (table_('Escalas').rows.some(function (r) { return r.MembroID === u.membroId && r.MinisterioID === x.r.MinisterioID && r.Data === x.r.Data && r.Hora === x.r.Hora && r.Status !== 'cancelada'; })) throw new ApiError('VALIDATION', 'Você já está nesta escala.');
    writeRow_(x.t, x.r._row, { MembroID: u.membroId, Status: 'confirmada', ConfirmadoEm: now_(), Avisos: '' });
    const mi = table_('Ministerios').rows.filter(function (m) { return m.MinisterioID === x.r.MinisterioID; })[0];
    escGestoresDe_(u.membroId, [x.r.CriadoPor]).forEach(function (m) { notify_(m, 'escala', (nomes_()[u.membroId] || '') + ' se ofereceu para servir', (mi ? mi.Nome : '') + ' · ' + escBr_(x.r.Data) + (x.r.Hora ? ' às ' + x.r.Hora : ''), 'escala'); });
    audit_(u.email, 'claimScale', x.r.EscalaID, 'OK'); return { ok: true };
  });
}
function rescheduleScale_(d, u) {
  if (!escGestor_(u)) throw new ApiError('FORBIDDEN', 'Só supervisores remarcam escalas.');
  return withLock_(function () {
    const x = escRow_(clip_(d.id, 30)), data = clip_(d.data, 10) || x.r.Data, hora = d.hora === undefined ? x.r.Hora : clip_(d.hora, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ApiError('VALIDATION', 'Data inválida.');
    const p = { Data: data, Hora: hora, Status: x.r.MembroID || d.membroId ? 'pendente' : 'aberta', Motivo: '', TrocaMembroID: '', TrocaEscalaID: '', TrocaMsg: '', ConfirmadoEm: '', Avisos: '', Presente: '' };
    if (d.membroId) { if (!table_('Membros').rows.some(function (m) { return m.MembroID === d.membroId; })) throw new ApiError('VALIDATION', 'Pessoa não encontrada.'); p.MembroID = d.membroId; p.OrigemMembroID = x.r.MembroID; }
    writeRow_(x.t, x.r._row, p);
    notify_(p.MembroID || x.r.MembroID, 'escala', 'Sua escala foi remarcada', 'Nova data: ' + escBr_(data) + (hora ? ' às ' + hora : '') + '. Abra Escalas para confirmar.', 'escala'); return { ok: true };
  });
}
function deleteScale_(d, u) {
  if (!escGestor_(u)) throw new ApiError('FORBIDDEN', 'Só supervisores removem escalas.');
  return withLock_(function () {
    const t = table_('Escalas'); const alvo = d.serie ? t.rows.filter(function (r) { return r.SerieID === d.serie && r.Data >= today_(); }) : [escRow_(clip_(d.id, 30)).r];
    alvo.forEach(function (r) { writeRow_(t, r._row, { Status: 'cancelada' }); }); return { removidas: alvo.length };
  });
}
function respondScale_(d, u) {
  return withLock_(function () {
    const x = escRow_(clip_(d.id, 30)); if (x.r.MembroID !== u.membroId) throw new ApiError('FORBIDDEN', 'Esta escala não é sua.');
    const nome = nomes_()[u.membroId] || '', mi = {}; table_('Ministerios').rows.forEach(function (m) { mi[m.MinisterioID] = m.Nome; });
    const min = mi[x.r.MinisterioID] || 'ministério', dest = escGestoresDe_(u.membroId, [x.r.CriadoPor]);
    if (d.acao === 'confirmar') {
      writeRow_(x.t, x.r._row, { Status: 'confirmada', Motivo: '', ConfirmadoEm: now_(), TrocaMembroID: '', TrocaEscalaID: '' });
      dest.forEach(function (m) { notify_(m, 'escala', nome + ' confirmou presença', min + ' · ' + escBr_(x.r.Data), 'escala'); }); return { ok: true, status: 'confirmada' };
    }
    if (d.acao === 'reescalar') {
      const mo = clip_(d.motivo, 300); if (mo.length < 3) throw new ApiError('VALIDATION', 'Explique o motivo.');
      writeRow_(x.t, x.r._row, { Status: 'reescalar', Motivo: mo, ConfirmadoEm: '', Reesc: Number(x.r.Reesc || 0) + 1 });
      dest.forEach(function (m) { notify_(m, 'escala', nome + ' pediu re-escalação', min + ' · ' + escBr_(x.r.Data) + ' — ' + mo, 'escala'); }); return { ok: true, status: 'reescalar' };
    }
    throw new ApiError('VALIDATION', 'Ação inválida.');
  });
}
function requestSwap_(d, u) {
  return withLock_(function () {
    const x = escRow_(clip_(d.id, 30)); if (x.r.MembroID !== u.membroId) throw new ApiError('FORBIDDEN', 'Esta escala não é sua.');
    const com = clip_(d.comMembroId, 30); if (!com || com === u.membroId || !table_('Membros').rows.some(function (m) { return m.MembroID === com; })) throw new ApiError('VALIDATION', 'Escolha a pessoa para a troca.');
    let te = clip_(d.comEscalaId, 30); if (te) { const o = escRow_(te); if (o.r.MembroID !== com) throw new ApiError('VALIDATION', 'Essa escala não é dessa pessoa.'); }
    writeRow_(x.t, x.r._row, { Status: 'troca', TrocaMembroID: com, TrocaEscalaID: te, TrocaMsg: clip_(d.msg, 200), ConfirmadoEm: '' });
    const nome = nomes_()[u.membroId] || '';
    notify_(com, 'escala_troca', nome + ' pediu troca de escala com você', escBr_(x.r.Data) + (te ? ' ⇄ ' + escBr_(escRow_(te).r.Data) : '') + '. Abra Escalas para aceitar ou recusar.', x.r.EscalaID);
    escGestoresDe_(u.membroId, [x.r.CriadoPor]).forEach(function (m) { notify_(m, 'escala', nome + ' pediu troca de escala', escBr_(x.r.Data), 'escala'); }); return { ok: true };
  });
}
function answerSwap_(d, u) {
  return withLock_(function () {
    const x = escRow_(clip_(d.id, 30)); if (x.r.Status !== 'troca' || x.r.TrocaMembroID !== u.membroId) throw new ApiError('FORBIDDEN', 'Não há troca pendente para você.');
    const orig = x.r.MembroID;
    if (!d.aceita) { writeRow_(x.t, x.r._row, { Status: 'pendente', TrocaMembroID: '', TrocaEscalaID: '', TrocaMsg: '' }); notify_(orig, 'escala', 'Troca recusada', (nomes_()[u.membroId] || '') + ' não pôde trocar a escala de ' + escBr_(x.r.Data) + '.', 'escala'); return { ok: true, aceita: false }; }
    writeRow_(x.t, x.r._row, { MembroID: u.membroId, OrigemMembroID: orig, Status: 'pendente', TrocaMembroID: '', TrocaEscalaID: '', TrocaMsg: '', ConfirmadoEm: '', Avisos: '', Motivo: '' });
    if (x.r.TrocaEscalaID) { const o = escRow_(x.r.TrocaEscalaID); writeRow_(o.t, o.r._row, { MembroID: orig, OrigemMembroID: u.membroId, Status: 'pendente', ConfirmadoEm: '', Avisos: '', Motivo: '' }); }
    notify_(orig, 'escala', 'Troca aceita', (nomes_()[u.membroId] || '') + ' aceitou a troca. Confira a nova agenda em Escalas.', 'escala');
    escGestoresDe_(u.membroId, [x.r.CriadoPor]).forEach(function (m) { notify_(m, 'escala', 'Troca de escala realizada', (nomes_()[orig] || '') + ' ⇄ ' + (nomes_()[u.membroId] || '') + ' · ' + escBr_(x.r.Data), 'escala'); });
    return { ok: true, aceita: true };
  });
}
function markScale_(d, u) {
  if (!escGestor_(u)) throw new ApiError('FORBIDDEN', 'Só supervisores marcam presença.');
  return withLock_(function () { const x = escRow_(clip_(d.id, 30)); writeRow_(x.t, x.r._row, { Presente: d.presente === null || d.presente === undefined ? '' : (d.presente ? '1' : '0') }); return { ok: true }; });
}
function requestJoin_(d, u) {
  return withLock_(function () {
    const min = table_('Ministerios').rows.filter(function (m) { return m.MinisterioID === d.ministerioId && m.Ativo !== '0'; })[0]; if (!min) throw new ApiError('VALIDATION', 'Escolha o ministério.');
    const t = table_('EscalaPedidos'); if (t.rows.some(function (p) { return p.MembroID === u.membroId && p.MinisterioID === min.MinisterioID && p.Status === 'pendente'; })) throw new ApiError('VALIDATION', 'Você já tem um pedido pendente para este ministério.');
    const data = clip_(d.data, 10); if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ApiError('VALIDATION', 'Data inválida.');
    appendRow_(t, { PedidoID: id_('EP'), MinisterioID: min.MinisterioID, MembroID: u.membroId, Data: data, Msg: clip_(d.msg, 300), Status: 'pendente', CriadoEm: now_() });
    escGestoresDe_(u.membroId, []).forEach(function (m) { notify_(m, 'escala', (nomes_()[u.membroId] || '') + ' quer entrar na escala', min.Nome + (data ? ' · ' + escBr_(data) : ''), 'escala'); }); return { ok: true };
  });
}
function decideJoin_(d, u) {
  if (!escGestor_(u)) throw new ApiError('FORBIDDEN', 'Só supervisores decidem pedidos.');
  return withLock_(function () {
    const t = table_('EscalaPedidos'), p = t.rows.filter(function (x) { return x.PedidoID === d.id && x.Status === 'pendente'; })[0]; if (!p) throw new ApiError('NOT_FOUND', 'Pedido não encontrado.');
    const aprova = !!d.aprovar, mi = {}; table_('Ministerios').rows.forEach(function (m) { mi[m.MinisterioID] = m.Nome; });
    writeRow_(t, p._row, { Status: aprova ? 'aprovado' : 'recusado', DecididoPor: u.membroId, DataDecisao: now_() });
    const data = clip_(d.data, 10) || p.Data;
    if (aprova && data) { appendRow_(table_('Escalas'), { EscalaID: id_('ES'), MinisterioID: p.MinisterioID, MembroID: p.MembroID, Data: data, Hora: clip_(d.hora, 5), Status: 'pendente', CriadoPor: u.membroId, Reesc: 0, Avisos: '' }); }
    notify_(p.MembroID, 'escala', aprova ? 'Pedido de escala aprovado! 🎉' : 'Pedido de escala não aprovado', (mi[p.MinisterioID] || '') + (aprova && data ? ' · ' + escBr_(data) + '. Confirme em Escalas.' : aprova ? '. O supervisor vai te escalar em breve.' : '. Converse com seu supervisor.'), 'escala'); return { ok: true };
  });
}


/* ===== Multimídia (projetor de letras) ===== */
const MM_ESPEC = {
  luzesOn: ['b'], luzesQtd: ['n', 0, 14], luzesBrilho: ['n', 5, 100], luzesVel: ['n', 0, 300],
  parts: ['e', ['nenhuma', 'bokeh', 'estrelas', 'neve', 'bolhas', 'coracoes', 'cruzes', 'notas', 'poeira']], partQtd: ['n', 0, 160], partTam: ['n', 40, 400], partVel: ['n', 0, 300], partDesf: ['n', 0, 30], partCor: ['c'],
  fonte: ['e', ['montserrat', 'poppins', 'playfair', 'bebas', 'oswald', 'lora', 'cinzel', 'figtree', 'caveat', 'georgia', 'arial']], tam: ['n', 2, 12], cor: ['c'], neg: ['b'], ita: ['b'], contorno: ['b'], contCor: ['c'], contLarg: ['n', 0, 12], sombra: ['b'], alinha: ['e', ['center', 'left', 'right']], caixa: ['b'], entre: ['n', 1, 2],
  fundoTipo: ['e', ['degrade', 'cor', 'imagem', 'video']], fundoAnim: ['e', ['luzes', 'aurora', 'ondas', 'estrelas', 'nenhuma']], fundoVel: ['n', 0, 300], fundoEscuro: ['n', 0, 85], fundoImg: ['s'], fundoVideo: ['u'],
  logoOn: ['b'], logoTam: ['n', 4, 60], logoPos: ['e', ['tl', 'tc', 'tr', 'bl', 'bc', 'br', 'c']], logoOp: ['n', 10, 100], info: ['e', ['primeiro', 'sempre', 'nunca']]
};
function mmLayout_(l) {
  const o = {}; if (!l || typeof l !== 'object') return o;
  Object.keys(MM_ESPEC).forEach(function (k) {
    const e = MM_ESPEC[k], v = l[k]; if (v === undefined || v === null) return;
    if (e[0] === 'b') o[k] = !!v; else if (e[0] === 'n') { const n = Number(v); if (isFinite(n)) o[k] = Math.max(e[1], Math.min(e[2], n)); }
    else if (e[0] === 'e') { if (e[1].indexOf(String(v)) >= 0) o[k] = String(v); } else if (e[0] === 'c') { if (/^#[0-9a-fA-F]{6}$/.test(String(v))) o[k] = String(v); }
    else if (e[0] === 's') { if (v === '' || /^i:[A-Za-z0-9_-]{1,30}$/.test(String(v))) o[k] = String(v); } else if (e[0] === 'u') { if (v === '' || /^https:\/\/[^\s"'<>]{4,290}$/.test(String(v))) o[k] = String(v); }
  });
  ['cores', 'luzesCores'].forEach(function (k) { if (Array.isArray(l[k])) { const a = l[k].filter(function (c) { return /^#[0-9a-fA-F]{6}$/.test(String(c)); }).slice(0, k === 'cores' ? 3 : 5); if (a.length >= (k === 'cores' ? 2 : 1)) o[k] = a; } });
  return o;
}
function multiOk_(u) {
  if (podeCurar_(u)) return true;
  const som = table_('Ministerios').rows.filter(function (m) { return norm_(m.Nome) === 'som' && m.Ativo !== '0'; }).map(function (m) { return m.MinisterioID; });
  return table_('Interesses').rows.some(function (i) { return i.MembroID === u.membroId && stN_(i.Status) === 'autorizado' && som.indexOf(i.MinisterioID) >= 0; });
}
function multiExige_(u) { if (!multiOk_(u)) throw new ApiError('FORBIDDEN', 'A Área do Multimídia é do ministério Som.'); }
// Controle remoto do telão: o estado (item da agenda, slide, pausa) fica no servidor; o celular escreve e o computador do projetor acompanha
// item = 'm:ID' (música) · 'i:ID' (imagem da biblioteca) · 'e:ID' (evento da igreja)
function telaoLer_() { const o = jparse_(cfgMap_().Telao, {}), it = String(o.item || (o.songId ? 'm:' + o.songId : '')); return { v: Number(o.v) || 0, item: it, songId: it.indexOf('m:') === 0 ? it.slice(2) : '', agendaId: String(o.agendaId || ''), i: Math.max(0, Number(o.i) || 0), pausado: !!o.pausado, ativa: !!o.ativa, by: String(o.by || ''), em: o.em || '' }; }
function getTelao_(d, u) { multiExige_(u); return telaoLer_(); }
function itemOk_(it) {
  if (/^v:(AL|ARC|ARA|NTLH|NVT)_\d{1,2}_\d{1,3}_\d{1,3}(-\d{1,3})?$/.test(String(it))) return true; // versículo: v:VERSÃO_livro_capítulo_verso[-verso]
  const m = /^([mie]):([A-Za-z0-9_-]{1,30})$/.exec(String(it)); if (!m) return false;
  if (m[1] === 'm') return table_('Musicas').rows.some(function (r) { return r.MusicaID === m[2] && r.Ativo !== '0' && r.MusicaID !== 'PADRAO'; });
  if (m[1] === 'i') return table_('MidiasTelao').rows.some(function (r) { return r.MidiaID === m[2] && r.Ativo !== '0'; });
  return table_('Eventos').rows.some(function (r) { return r.EventoID === m[2] && r.Status !== 'Cancelado'; });
}
function setTelao_(d, u) {
  multiExige_(u);
  return withLock_(function () {
    const st = telaoLer_(); let item = d.item;
    if (item === undefined && d.songId !== undefined) item = d.songId ? 'm:' + clip_(d.songId, 30) : '';
    if (item !== undefined) { item = clip_(item, 40); if (item && !itemOk_(item)) throw new ApiError('NOT_FOUND', 'Item não encontrado.'); if (item !== st.item) st.i = 0; st.item = item; }
    if (d.agendaId !== undefined) st.agendaId = clip_(d.agendaId, 30);
    if (d.i !== undefined) { const n = Math.floor(Number(d.i)); if (!(n >= 0 && n <= 400)) throw new ApiError('VALIDATION', 'Slide inválido.'); st.i = n; }
    if (d.pausado !== undefined) st.pausado = !!d.pausado;
    if (d.ativa !== undefined) st.ativa = !!d.ativa;
    st.by = clip_(d.by, 12); st.v += 1; st.em = now_();
    const t = table_('Config'), r = t.rows.filter(function (x) { return x.Chave === 'Telao'; })[0], val = JSON.stringify({ v: st.v, item: st.item, agendaId: st.agendaId, i: st.i, pausado: st.pausado, ativa: st.ativa, by: st.by, em: st.em });
    if (r) writeRow_(t, r._row, { Valor: val }); else appendRow_(t, { Chave: 'Telao', Valor: val });
    return telaoLer_();
  });
}
// Tela de pausa (o que aparece quando a transmissão é interrompida)
const PAUSA_PAD = { tipo: 'radial', c1: '#10203f', c2: '#04070d', dir: 135, fade: 'nenhum', vel: 100, logoOn: true, logoPos: 'c', logoTam: 34, logoOp: 100, texto: '', textoCor: '#ffffff', textoTam: 5, imagem: '' };
function pausaLimpa_(v) {
  v = v || {}; const o = Object.assign({}, PAUSA_PAD, jparse_(cfgMap_().TelaoPausa, {})), cor = function (x, pad) { x = String(x === undefined ? pad : x); if (!/^#[0-9a-fA-F]{6}$/.test(x)) throw new ApiError('VALIDATION', 'Cor inválida.'); return x.toLowerCase(); }, num = function (x, lo, hi, pad) { x = Number(x === undefined ? pad : x); return isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : pad; }, en = function (x, L, pad) { x = String(x === undefined ? pad : x); return L.indexOf(x) >= 0 ? x : pad; };
  const r = { tipo: en(v.tipo, ['radial', 'linear', 'solido'], o.tipo), c1: cor(v.c1, o.c1), c2: cor(v.c2, o.c2), dir: num(v.dir, 0, 360, o.dir), fade: en(v.fade, ['nenhum', 'respirar', 'aurora', 'luz', 'pulso'], o.fade), vel: num(v.vel, 20, 300, o.vel), logoOn: v.logoOn === undefined ? !!o.logoOn : !!v.logoOn, logoPos: en(v.logoPos, ['c', 'tl', 'tc', 'tr', 'bl', 'bc', 'br'], o.logoPos), logoTam: num(v.logoTam, 5, 80, o.logoTam), logoOp: num(v.logoOp, 10, 100, o.logoOp), texto: clip_(v.texto === undefined ? o.texto : v.texto, 60), textoCor: cor(v.textoCor, o.textoCor), textoTam: num(v.textoTam, 2, 12, o.textoTam), imagem: v.imagem === undefined ? String(o.imagem || '') : String(v.imagem || '') };
  if (r.imagem && (!/^data:image\/(jpeg|png|webp);base64,/.test(r.imagem) || r.imagem.length > 44000)) throw new ApiError('VALIDATION', 'Imagem de fundo inválida ou muito grande.'); return r;
}
function saveTelaoPausa_(d, u) {
  multiExige_(u);
  return withLock_(function () {
    const r = d.reset ? PAUSA_PAD : pausaLimpa_(d.pausa), t = table_('Config'), x = t.rows.filter(function (q) { return q.Chave === 'TelaoPausa'; })[0], val = d.reset ? '' : JSON.stringify(r);
    if (x) writeRow_(t, x._row, { Valor: val }); else appendRow_(t, { Chave: 'TelaoPausa', Valor: val }); audit_(u.email, 'TELAO_PAUSA', d.reset ? 'padrão' : 'salva', 'OK'); return { pausa: r };
  });
}
// Biblioteca de imagens para transmitir (cada imagem fica salva e pode entrar em qualquer agenda)
function listMidias_(d, u) { multiExige_(u); return table_('MidiasTelao').rows.filter(function (r) { return r.Ativo !== '0'; }).sort(function (a, b) { return a._row < b._row ? 1 : -1; }).slice(0, 200).map(function (r) { return { id: r.MidiaID, titulo: r.Titulo, mini: r.Mini || '' }; }); }
function getMidia_(d, u) { multiExige_(u); const r = table_('MidiasTelao').rows.filter(function (x) { return x.MidiaID === d.id && x.Ativo !== '0'; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Imagem não encontrada.'); return { id: r.MidiaID, titulo: r.Titulo, foto: r.Foto }; }
function saveMidia_(d, u) {
  multiExige_(u);
  return withLock_(function () {
    const f = String(d.foto || ''), mini = String(d.mini || ''), titulo = clip_(d.titulo, 60) || 'Imagem';
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(f) || f.length > 45000) throw new ApiError('VALIDATION', 'Imagem inválida ou muito grande.');
    if (mini && (!/^data:image\/(jpeg|png|webp);base64,/.test(mini) || mini.length > 6000)) throw new ApiError('VALIDATION', 'Miniatura inválida.');
    const t = table_('MidiasTelao'), id = id_('MI'); appendRow_(t, { MidiaID: id, Titulo: titulo, Foto: f, Mini: mini, Ativo: '1', CriadoPor: u.membroId, CriadoEm: now_() }); return { id: id };
  });
}
function deleteMidia_(d, u) { multiExige_(u); return withLock_(function () { const t = table_('MidiasTelao'), r = t.rows.filter(function (x) { return x.MidiaID === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Imagem não encontrada.'); writeRow_(t, r._row, { Ativo: '0' }); return { ok: true }; }); }
// Agendas de transmissão: sequência de músicas, imagens e eventos de um dia de culto
function itensAgenda_(arr) {
  if (!Array.isArray(arr)) return []; if (arr.length > 150) throw new ApiError('VALIDATION', 'Itens demais na agenda.'); const seen = {}, out = [];
  arr.forEach(function (x) { const it = String(x && x.t === 'musica' ? 'm:' + x.id : x && x.t === 'imagem' ? 'i:' + x.id : x && x.t === 'evento' ? 'e:' + x.id : ''); if (!it || seen[it]) return; if (!itemOk_(it)) return; seen[it] = 1; out.push({ t: x.t, id: String(x.id) }); });
  return out;
}
function agOut_(r) { return { id: r.AgendaID, data: r.Data, nome: r.Nome, itens: jparse_(r.Itens, []), atualizadoEm: r.AtualizadoEm || r.CriadoEm || '' }; }
function listAgendas_(d, u) { multiExige_(u); return table_('Agendas').rows.sort(function (a, b) { return a.Data < b.Data ? 1 : a.Data > b.Data ? -1 : (a._row < b._row ? 1 : -1); }).slice(0, 400).map(agOut_); }
function saveAgenda_(d, u) {
  multiExige_(u);
  return withLock_(function () {
    const data = String(d.data || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ApiError('VALIDATION', 'Informe a data da agenda.');
    const nome = clip_(d.nome, 60) || 'Culto', t = table_('Agendas'), ex = d.id ? t.rows.filter(function (r) { return r.AgendaID === d.id; })[0] : null; if (d.id && !ex) throw new ApiError('NOT_FOUND', 'Agenda não encontrada.');
    const itens = itensAgenda_(d.itens), row = { Data: data, Nome: nome, Itens: JSON.stringify(itens), AtualizadoPor: u.membroId, AtualizadoEm: now_() }; let id;
    if (ex) { writeRow_(t, ex._row, row); id = ex.AgendaID; } else { id = id_('AG'); appendRow_(t, Object.assign({ AgendaID: id, CriadoPor: u.membroId, CriadoEm: now_() }, row)); }
    audit_(u.email, 'AGENDA', id + ' ' + data + ' ' + itens.length, 'OK'); return { id: id, n: itens.length };
  });
}
function deleteAgenda_(d, u) { multiExige_(u); return withLock_(function () { const t = table_('Agendas'), r = t.rows.filter(function (x) { return x.AgendaID === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Agenda não encontrada.'); t.sh.deleteRow(r._row); audit_(u.email, 'AGENDA_DEL', r.AgendaID, 'OK'); return { ok: true }; }); }
// transmitir uma imagem/evento na hora: entra na agenda do dia (cria se preciso) e fica salvo lá
function addAgendaItem_(d, u) {
  multiExige_(u);
  return withLock_(function () {
    const it = { t: d.t, id: String(d.id || '') }, ok = itensAgenda_([it]); if (!ok.length) throw new ApiError('NOT_FOUND', 'Item não encontrado.');
    const t = table_('Agendas'), hoje = today_(); let r = d.agendaId ? t.rows.filter(function (x) { return x.AgendaID === d.agendaId; })[0] : null;
    if (!r) r = t.rows.filter(function (x) { return x.Data === hoje; })[0];
    if (!r) { const id = id_('AG'); appendRow_(t, { AgendaID: id, Data: hoje, Nome: 'Culto', Itens: JSON.stringify(ok), CriadoPor: u.membroId, CriadoEm: now_(), AtualizadoPor: u.membroId, AtualizadoEm: now_() }); return agOut_(table_('Agendas').rows.filter(function (x) { return x.AgendaID === id; })[0]); }
    const its = jparse_(r.Itens, []); if (!its.some(function (x) { return x.t === it.t && x.id === it.id; })) { its.push(ok[0]); writeRow_(t, r._row, { Itens: JSON.stringify(its), AtualizadoPor: u.membroId, AtualizadoEm: now_() }); }
    return agOut_(table_('Agendas').rows.filter(function (x) { return x.AgendaID === r.AgendaID; })[0]);
  });
}
function ytOk_(v) { v = clip_(v, 200); if (v && !/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(v)) throw new ApiError('VALIDATION', 'O link do YouTube precisa começar com https://youtube.com ou https://youtu.be.'); return v; }
function songOut_(r, nm) { return { id: r.MusicaID, titulo: r.Titulo, artista: r.Artista, youtube: r.Youtube, letra: r.Letra, layout: jparse_(r.Layout, null), criadoPor: nm[r.CriadoPor] || '', atualizadoPor: nm[r.AtualizadoPor] || '', atualizadoEm: r.AtualizadoEm }; }
function listSongs_(d, u) {
  multiExige_(u); const nm = nomes_(), rows = table_('Musicas').rows.filter(function (r) { return r.Ativo !== '0'; });
  const pad = rows.filter(function (r) { return r.MusicaID === 'PADRAO'; })[0];
  return { pausa: Object.assign({}, PAUSA_PAD, jparse_(cfgMap_().TelaoPausa, {})), itens: rows.filter(function (r) { return r.MusicaID !== 'PADRAO'; }).sort(function (a, b) { return norm_(a.Titulo) < norm_(b.Titulo) ? -1 : 1; }).map(function (r) { return songOut_(r, nm); }), padrao: pad ? jparse_(pad.Layout, {}) : {}, layoutVers: jparse_(cfgMap_().LayoutVers, {}) };
}
function saveSong_(d, u) {
  multiExige_(u);
  return withLock_(function () {
    const t = table_('Musicas'), titulo = clip_(d.titulo, 120), letra = String(d.letra || '').replace(/\r/g, '').slice(0, 20000);
    if (!titulo) throw new ApiError('VALIDATION', 'Informe o nome da música.'); if (!letra.trim()) throw new ApiError('VALIDATION', 'A letra está vazia.');
    const p = { Titulo: titulo, Artista: clip_(d.artista, 120), Youtube: ytOk_(d.youtube), Letra: letra, Layout: d.layout ? JSON.stringify(mmLayout_(d.layout)) : '', AtualizadoPor: u.membroId, AtualizadoEm: now_() };
    if (d.id) { const r = t.rows.filter(function (x) { return x.MusicaID === d.id && x.Ativo !== '0' && x.MusicaID !== 'PADRAO'; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Música não encontrada.'); writeRow_(t, r._row, p); return { id: r.MusicaID }; }
    const id = id_('MU'); appendRow_(t, Object.assign({ MusicaID: id, CriadoPor: u.membroId, CriadoEm: now_(), Ativo: '1' }, p)); audit_(u.email, 'saveSong', titulo); return { id: id };
  });
}
function deleteSong_(d, u) {
  multiExige_(u);
  return withLock_(function () { const t = table_('Musicas'), r = t.rows.filter(function (x) { return x.MusicaID === d.id && x.MusicaID !== 'PADRAO'; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Música não encontrada.'); writeRow_(t, r._row, { Ativo: '0', AtualizadoPor: u.membroId, AtualizadoEm: now_() }); audit_(u.email, 'deleteSong', r.Titulo); return { ok: true }; });
}
function saveSongDefault_(d, u) {
  multiExige_(u);
  return withLock_(function () {
    const t = table_('Musicas'), lay = JSON.stringify(mmLayout_(d.layout)), r = t.rows.filter(function (x) { return x.MusicaID === 'PADRAO'; })[0];
    if (r) writeRow_(t, r._row, { Layout: lay, AtualizadoPor: u.membroId, AtualizadoEm: now_() }); else appendRow_(t, { MusicaID: 'PADRAO', Titulo: '(layout padrão)', Layout: lay, CriadoPor: u.membroId, CriadoEm: now_(), AtualizadoPor: u.membroId, AtualizadoEm: now_(), Ativo: '1' });
    return { ok: true };
  });
}
function saveLayoutVers_(d, u) {
  multiExige_(u);
  return withLock_(function () {
    const val = JSON.stringify(mmLayout_(d.layout)), t = table_('Config'), r = t.rows.filter(function (x) { return x.Chave === 'LayoutVers'; })[0]; if (r) writeRow_(t, r._row, { Valor: val }); else appendRow_(t, { Chave: 'LayoutVers', Valor: val });
    audit_(u.email, 'LAYOUT_VERSICULO', 'salvo', 'OK'); return { ok: true };
  });
}
function lyricsGet_(url) { const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true }); if (r.getResponseCode() !== 200) return null; try { return JSON.parse(r.getContentText()); } catch (e) { return null; } }
function searchLyrics_(d, u) {
  multiExige_(u); const q = clip_(d.q, 100); if (q.length < 2) throw new ApiError('VALIDATION', 'Digite o nome da música ou do cantor.');
  const j = lyricsGet_('https://api.lyrics.ovh/suggest/' + encodeURIComponent(q)); if (!j || !Array.isArray(j.data)) throw new ApiError('UPSTREAM', 'A busca de letras não respondeu agora. Tente de novo ou cole a letra.');
  const vistos = {}, out = []; j.data.forEach(function (x) { const t = clip_(x.title_short || x.title, 120), a = clip_(x.artist && x.artist.name, 120), k = norm_(t + '|' + a); if (t && a && !vistos[k] && out.length < 12) { vistos[k] = 1; out.push({ titulo: t, artista: a }); } });
  return { itens: out };
}
function limpaLetra_(t) {
  t = String(t || '').replace(/\r/g, '').replace(/^Paroles de la chanson[^\n]*\n+/i, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return t.slice(0, 20000);
}
function importLyrics_(d, u) {
  multiExige_(u); const a = clip_(d.artista, 120), t = clip_(d.titulo, 120); if (!a || !t) throw new ApiError('VALIDATION', 'Escolha uma música da lista.');
  const j = lyricsGet_('https://api.lyrics.ovh/v1/' + encodeURIComponent(a) + '/' + encodeURIComponent(t)); if (!j || !j.lyrics) throw new ApiError('NOT_FOUND', 'Não achei a letra dessa música. Cole manualmente.');
  return { titulo: t, artista: a, letra: limpaLetra_(j.lyrics) };
}


/* ============================== SOD ADONAI (a vida com Deus, estilo Tamagotchi) ==============================
   O Sod é um orbe de luz branca (o Espírito Santo no centro). Pedras o cobrem quando a pessoa se afasta; o personagem
   em pixel art minera com as ferramentas ganhas nas caixas diárias. Tudo é calculado AQUI (o app só desenha). */
const SOD_MAX = 3000, SOD_INI = 700, SOD_SEMANA = 7, SOD_NERF = [1, 0.6, 0.3, 0], SOD_OFFLINE = 1200, SOD_BAG = 40;
const SOD_RARS = { comum: 60, raro: 28, epico: 10, lendario: 2 }, SOD_MULT = { comum: 1, raro: 1.4, epico: 2, lendario: 3 };
const SOD_QUAL = { comum: [0, 5], raro: [5, 12], epico: [12, 22], lendario: [22, 35] };
const SOD_FERR = {
  pa: { nome: 'Pá', v: 1.0, d: 2, min: 'comum' }, picareta: { nome: 'Picareta', v: 0.9, d: 3, min: 'comum' }, marreta: { nome: 'Marreta', v: 0.6, d: 8, min: 'comum' },
  martelete: { nome: 'Martelete', v: 2.2, d: 2, min: 'raro' }, broca: { nome: 'Furadeira de impacto', v: 2.6, d: 2, min: 'epico' }, britadeira: { nome: 'Britadeira', v: 3.0, d: 2.5, min: 'lendario' }
};
const SOD_ROUPAS = {
  'blusa:gola_v': ['Camiseta gola V', 'comum'], 'blusa:polo': ['Camisa polo', 'comum'], 'blusa:regata': ['Regata', 'comum'], 'blusa:manga_longa': ['Manga longa', 'comum'], 'blusa:cardigan': ['Cardigã', 'raro'], 'blusa:social': ['Camisa social', 'raro'],
  'sobre:suspensorio': ['Suspensório', 'comum'], 'sobre:jardineira': ['Jardineira', 'raro'], 'sobre:couro': ['Colete de couro', 'epico'], 'sobre:cota': ['Cota de malha', 'epico'], 'sobre:couraca': ['Couraça da justiça', 'lendario'],
  'calca:bermuda': ['Bermuda', 'comum'], 'calca:dobrada': ['Calça dobrada', 'comum'], 'calca:legging': ['Legging', 'comum'], 'calca:saia': ['Saia', 'comum'], 'calca:social': ['Calça social', 'raro'], 'calca:listrada': ['Calça listrada', 'raro'],
  'tenis:bota': ['Bota', 'comum'], 'tenis:sandalia': ['Sandália', 'comum'], 'tenis:chinelo': ['Chinelo', 'comum'], 'tenis:bota_dobrada': ['Bota dobrada', 'raro'], 'tenis:botina': ['Botina', 'raro'], 'tenis:armadura': ['Calçado da paz', 'lendario'],
  'bone:bandana': ['Bandana', 'comum'], 'bone:faixa': ['Faixa', 'comum'], 'bone:boina': ['Boina de couro', 'comum'], 'bone:capuz': ['Capuz', 'raro'], 'bone:chapeu': ['Chapéu-coco', 'raro'], 'bone:cartola': ['Cartola', 'epico'], 'bone:tiara': ['Tiara', 'epico'], 'bone:capacete': ['Capacete da salvação', 'epico'], 'bone:coroa': ['Coroa', 'lendario'],
  'oculos:classico': ['Óculos', 'comum'], 'oculos:redondo': ['Óculos redondo', 'comum'], 'oculos:nerd': ['Óculos nerd', 'raro'], 'oculos:sol': ['Óculos de sol', 'raro'], 'oculos:escuro': ['Óculos escuro', 'epico'],
  'pescoco:gravata': ['Gravata', 'comum'], 'pescoco:cachecol': ['Cachecol', 'comum'], 'pescoco:borboleta': ['Gravata-borboleta', 'raro'], 'pescoco:colar': ['Colar', 'raro'], 'luvas:luvas': ['Luvas', 'raro']
};
const SOD_PRECO = { comum: 40, raro: 100, epico: 250, lendario: 600 }, SOD_CAIXA_PRECO = 80;
// Aparência do personagem (arte LPC): uma peça por parte do corpo; cores são nomes de paletas (pele, cabelo, tecido, metal)
const SOD_APAR = { corpo: 'm', pele: 'light', olhos: 'blue', cabelo: 'curto', corCabelo: 'chestnut', blusa: 'camiseta', corBlusa: 'blue', sobre: 'nenhum', corSobre: 'steel', calca: 'calca', corCalca: 'navy', tenis: 'sapato', corTenis: 'brown', bone: 'nenhum', corBone: 'red', oculos: 'nenhum', pescoco: 'nenhum', corPescoco: 'red', luvas: 'nenhum', corLuvas: 'brown' };
const SOD_CAB = ['curto', 'repartido', 'franja', 'rabo', 'coque', 'cacheado', 'afro', 'longo', 'chanel', 'moicano', 'raspado', 'espetado', 'tranca', 'pixie', 'dreads', 'ondulado', 'careca'];
const SOD_LIVRE = { blusa: ['camiseta'], sobre: ['nenhum'], calca: ['calca'], tenis: ['sapato'], bone: ['nenhum'], oculos: ['nenhum'], pescoco: ['nenhum'], luvas: ['nenhum'] };
function sodAparOk_(a) { const o = Object.assign({}, SOD_APAR); Object.keys(SOD_APAR).forEach(function (k) { const v = String(a && a[k] !== undefined ? a[k] : ''); if (/^[a-z_]{1,20}$/.test(v)) o[k] = v; }); if (o.corpo !== 'm' && o.corpo !== 'f') o.corpo = 'm'; return o; }
function sodTab_() {
  try { return table_('Sod'); } catch (e) { if (e.code !== 'SETUP') throw e; ensureSheet_(ss_(), 'Sod', SHEETS.Sod); return table_('Sod'); }
}
function sodAdd_(iso, n) { const p = iso.split('-'), d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n)); return d.toISOString().slice(0, 10); }
function sodDow_(iso) { const p = iso.split('-'); return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay(); }
function sodDifDias_(a, b) { const f = function (s) { const p = s.split('-'); return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }; return Math.round((f(b) - f(a)) / 86400000); }
function sodSorteio_(pesos) { const ks = Object.keys(pesos), tot = ks.reduce(function (a, k) { return a + pesos[k]; }, 0); let x = Math.random() * tot; for (let i = 0; i < ks.length; i++) { x -= pesos[ks[i]]; if (x < 0) return ks[i]; } return ks[0]; }
function sodRound_(x, n) { const k = Math.pow(10, n); return Math.round(x * k) / k; }
// Uma ferramenta nova: tipo sorteado entre os que a raridade permite, atributos variam ±15%
function sodFerramenta_(rar, tipo) {
  const ordem = ['comum', 'raro', 'epico', 'lendario'], ok = Object.keys(SOD_FERR).filter(function (k) { return ordem.indexOf(SOD_FERR[k].min) <= ordem.indexOf(rar); });
  const k = tipo || ok[Math.floor(Math.random() * ok.length)], f = SOD_FERR[k], m = SOD_MULT[rar], j = function () { return 0.85 + Math.random() * 0.3; }, q = SOD_QUAL[rar];
  return { i: id_('IT'), k: 'ferr', c: k, r: rar, v: sodRound_(f.v * Math.sqrt(m) * j(), 2), d: sodRound_(f.d * m * j(), 1), q: Math.round(q[0] + Math.random() * (q[1] - q[0])) };
}
function sodRoupa_(rar, tem) {
  const l = Object.keys(SOD_ROUPAS).filter(function (k) { return SOD_ROUPAS[k][1] === rar && tem.indexOf(k) < 0; }); if (!l.length) return null;
  return { i: id_('IT'), k: 'rou', c: l[Math.floor(Math.random() * l.length)], r: rar };
}
function sodTaxa_(it) { return it ? it.v * it.d * (1 + it.q / 100) : 0; }
// Missões do dia verificadas nos dados que já existem (nada de “confie em mim” além da oração, que a pessoa marca)
function sodMiss_(mid, dia, orou) {
  const dd = function (x) { return String(x || '').slice(0, 10) === dia; };
  const biblia = table_('BibMarcas').rows.some(function (r) { return r.MembroID === mid && dd(r.Data); }) || table_('CorridaLeitura').rows.some(function (r) { return r.MembroID === mid && dd(r.Data); });
  const anotar = table_('BibMarcas').rows.some(function (r) { return r.MembroID === mid && dd(r.Data) && String(r.Comentario || '').trim(); }) || table_('Posts').rows.some(function (r) { return r.AutorID === mid && r.Tipo === 'nota' && dd(r.Data); });
  const oracao = orou === dia || table_('Oracoes').rows.some(function (r) { return r.MembroID === mid && dd(r.Data); });
  const entrou = table_('XpLog').rows.some(function (r) { return r.MembroID === mid && r.Ref === 'dia:' + dia; }) || dia === today_();
  return { entrar: entrou, biblia: biblia, oracao: oracao, anotar: anotar, completo: entrou && biblia && oracao };
}
function sodComunhao_(mid, ate) { // presença em célula/evento nos 7 dias que terminam em “ate” (inclusive)
  const de = sodAdd_(ate, -6), ok = function (x) { const s = String(x || '').slice(0, 10); return s >= de && s <= ate; };
  return table_('Presencas').rows.some(function (r) { return r.MembroID === mid && ok(r.Data); }) || table_('EventoPresenca').rows.some(function (r) { return r.MembroID === mid && ok(r.Data); });
}
function sodNivelPedra_(p) { return p <= 0 ? 0 : p < 400 ? 1 : p < 1000 ? 2 : p < 1800 ? 3 : p < 2500 ? 4 : 5; }
function sodEst_(r) {
  return { Pedra: Number(r.Pedra || 0), Livre: r.Livre === '1', LivreDesde: r.LivreDesde || '', UltimoDia: r.UltimoDia || '', Seq: Number(r.Seq || 0), Atraso: Number(r.Atraso || 0), Caixas: Number(r.Caixas || 0), CaixaBonus: r.CaixaBonus || '', Orou: r.Orou || '', MinAte: Number(r.MinAte || 0), Golpes: Number(r.Golpes || 0), Talentos: Number(r.Talentos || 0), Soltos: Number(r.Soltos || 0), Abertas: Number(r.Abertas || 0),
    itens: jparse_(r.Itens, []), equip: jparse_(r.Equip, {}), apar: sodAparOk_(jparse_(r.Aparencia, {})), sala: jparse_(r.Sala, {}) };
}
function sodSalva_(t, r, e) {
  writeRow_(t, r._row, { Pedra: String(Math.round(e.Pedra)), Livre: e.Livre ? '1' : '0', LivreDesde: e.LivreDesde, UltimoDia: e.UltimoDia, Seq: String(e.Seq), Atraso: String(e.Atraso), Caixas: String(e.Caixas), CaixaBonus: e.CaixaBonus, Orou: e.Orou, MinAte: String(e.MinAte), Golpes: String(Math.round(e.Golpes)), Talentos: String(Math.round(e.Talentos * 100) / 100), Soltos: String(e.Soltos), Abertas: String(e.Abertas), Itens: JSON.stringify(e.itens), Equip: JSON.stringify(e.equip), Aparencia: JSON.stringify(e.apar), Sala: JSON.stringify(e.sala) });
}
// Sincroniza o Sod: vira o dia (atrasos, pedras, domingo), entrega a caixa do dia, minera o que passou e confere a liberdade
function sodSync_(mid, salvar) {
  if (!sodAtivo_()) throw new ApiError('FORBIDDEN', 'O Sod está desativado pela administração.');
  const t = sodTab_(), hoje = today_(), agora = Date.now(); let r = t.rows.filter(function (x) { return x.MembroID === mid; })[0];
  if (!r) {
    const ini = { i: 'INICIAL', k: 'ferr', c: 'picareta', r: 'comum', v: 0.8, d: 2, q: 0 };
    appendRow_(t, { MembroID: mid, Pedra: String(SOD_INI), Livre: '0', Seq: '0', Atraso: '0', Caixas: '0', Itens: JSON.stringify([ini]), Equip: JSON.stringify({ ferr: 'INICIAL' }), Aparencia: JSON.stringify(SOD_APAR), MinAte: String(agora), UltimoDia: '' });
    r = table_('Sod').rows.filter(function (x) { return x.MembroID === mid; })[0];
  }
  const e = sodEst_(r), aviso = []; let preso = false;
  if (e.UltimoDia !== hoje) {
    if (e.UltimoDia) {
      const m0 = sodMiss_(mid, e.UltimoDia, e.Orou);
      if (m0.completo) { e.Seq++; e.Atraso = Math.max(0, e.Atraso - 1); } else { e.Seq = 0; e.Pedra += 250; }
      let d = e.UltimoDia, n = Math.min(60, sodDifDias_(e.UltimoDia, hoje));
      for (let i = 1; i <= n; i++) {
        d = sodAdd_(e.UltimoDia, i);
        if (d < hoje) { e.Atraso = Math.min(3, e.Atraso + 1); e.Pedra += 400; e.Seq = 0; }
        if (sodDow_(d) === 0) { // domingo: fecha a semana e prende o Sod de novo se estava solto
          if (!sodComunhao_(mid, sodAdd_(d, -1))) { e.Pedra += 500; aviso.push('semana'); }
          if (e.Livre) { e.Livre = false; e.LivreDesde = ''; e.Seq = 0; e.Pedra = Math.max(e.Pedra, 1200); preso = true; }
        }
      }
    }
    e.Pedra = Math.min(SOD_MAX, e.Pedra); e.UltimoDia = hoje; e.Caixas++; e.MinAte = agora;
    if (preso) notify_(mid, 'sod_preso', 'O Sod foi preso de novo 🪨', 'Domingo ele voltou para dentro das pedras. Entre todos os dias e cumpra as missões por 7 dias para libertá-lo outra vez!', 'sod:' + hoje);
  }
  if (!e.Livre) { // mineração: tempo desde a última visita (até 20 min), com o castigo por dias sem entrar
    const seg = Math.max(0, Math.min(SOD_OFFLINE, (agora - e.MinAte) / 1000)), it = e.itens.filter(function (x) { return x.i === e.equip.ferr; })[0] || e.itens.filter(function (x) { return x.k === 'ferr'; })[0];
    const hp = seg * sodTaxa_(it) * SOD_NERF[Math.min(3, e.Atraso)]; if (hp > 0 && e.Pedra > 0) { e.Talentos += Math.min(hp, e.Pedra) / 40; e.Pedra = Math.max(0, e.Pedra - hp); e.Golpes += seg * (it ? it.v : 0) * SOD_NERF[Math.min(3, e.Atraso)]; }
  }
  e.MinAte = agora;
  const mis = sodMiss_(mid, hoje, e.Orou);
  if (mis.completo && e.CaixaBonus !== hoje) { e.CaixaBonus = hoje; e.Caixas++; e.Talentos += 10; aviso.push('bonus'); }
  if (!e.Livre && e.Pedra <= 0 && e.Seq + (mis.completo ? 1 : 0) >= SOD_SEMANA) {
    e.Livre = true; e.LivreDesde = hoje; e.Soltos++; e.Talentos += 50; awardXp_(mid, 'sod:livre:' + hoje, 50, 'Sod libertado'); notify_(mid, 'sod_livre', 'O Sod está livre! ✨', 'Sete dias firmes com Deus: a luz saiu das pedras e agora brinca com o seu personagem. Domingo ele pode ser preso de novo, continue entrando!', 'sod:' + hoje); aviso.push('livre');
  }
  if (salvar !== false) sodSalva_(t, r, e);
  return { t: t, r: r, e: e, mis: mis, aviso: aviso };
}
function sodView_(mid, s) {
  const e = s.e, hoje = today_(), it = e.itens.filter(function (x) { return x.i === e.equip.ferr; })[0] || null, nerf = SOD_NERF[Math.min(3, e.Atraso)];
  const com = sodComunhao_(mid, hoje), dom = sodDow_(hoje);
  const missoes = [
    { k: 'entrar', t: 'Entrar no app hoje', ok: true, g: 'dia' }, { k: 'biblia', t: 'Ler a Bíblia (marcar versículo ou capítulo)', ok: s.mis.biblia, g: 'dia' },
    { k: 'oracao', t: 'Orar hoje (toque em “Já orei”)', ok: s.mis.oracao, g: 'dia' }, { k: 'anotar', t: 'Escrever uma anotação ou devocional', ok: s.mis.anotar, g: 'bonus' },
    { k: 'comunhao', t: 'Ir à célula ou ao culto nesta semana', ok: com, g: 'semana' }];
  return { hoje: hoje, domingo: dom === 0, pedra: Math.round(e.Pedra), pedraMax: SOD_MAX, nivelPedra: sodNivelPedra_(e.Pedra), atraso: e.Atraso, nerf: nerf, sentado: e.Atraso >= 3 && !e.Livre, seq: e.Seq + (s.mis.completo ? 1 : 0), seqMeta: SOD_SEMANA, livre: e.Livre, livreDesde: e.LivreDesde, soltos: e.Soltos,
    caixas: e.Caixas, abertas: e.Abertas, golpes: Math.round(e.Golpes), taxa: sodRound_(sodTaxa_(it) * nerf, 2), ferramenta: it, itens: e.itens, equip: e.equip, aparencia: e.apar, sala: e.sala, missoes: missoes, aviso: s.aviso, bag: SOD_BAG, talentos: Math.floor(e.Talentos), loja: { precos: SOD_PRECO, caixa: SOD_CAIXA_PRECO, roupas: SOD_ROUPAS } };
}
function sodAtivo_() { return cfgMap_().SodAtivo !== '0'; }
function sodGet_(d, u) { if (!sodAtivo_()) return { off: true }; return withLock_(function () { const s = sodSync_(u.membroId); return sodView_(u.membroId, s); }); }
function sodAbrir_(d, u) {
  return withLock_(function () {
    const s = sodSync_(u.membroId), e = s.e; if (e.Caixas < 1) throw new ApiError('VALIDATION', 'Você não tem caixas para abrir hoje.');
    if (e.itens.length >= SOD_BAG) throw new ApiError('VALIDATION', 'Mochila cheia (' + SOD_BAG + '). Descarte itens antes de abrir.');
    const rar = sodSorteio_(SOD_RARS), tem = e.itens.filter(function (x) { return x.k === 'rou'; }).map(function (x) { return x.c; });
    let it = Math.random() < 0.6 ? sodFerramenta_(rar) : sodRoupa_(rar, tem); if (!it) it = sodFerramenta_(rar);
    e.itens.push(it); e.Caixas--; e.Abertas++; sodSalva_(s.t, s.r, e); const v = sodView_(u.membroId, s); v.novo = it; return v;
  });
}
function sodEquipar_(d, u) {
  return withLock_(function () {
    const s = sodSync_(u.membroId), e = s.e, id = clip_(d.id, 30), it = e.itens.filter(function (x) { return x.i === id && x.k === 'ferr'; })[0]; if (!it) throw new ApiError('NOT_FOUND', 'Ferramenta não encontrada.');
    e.equip.ferr = id; sodSalva_(s.t, s.r, e); return sodView_(u.membroId, s);
  });
}
function sodDescartar_(d, u) {
  return withLock_(function () {
    const s = sodSync_(u.membroId), e = s.e, id = clip_(d.id, 30); if (id === 'INICIAL') throw new ApiError('VALIDATION', 'A picareta inicial não pode ser descartada.');
    const n = e.itens.length; e.itens = e.itens.filter(function (x) { return x.i !== id; }); if (e.itens.length === n) throw new ApiError('NOT_FOUND', 'Item não encontrado.');
    if (e.equip.ferr === id) e.equip.ferr = 'INICIAL'; sodSalva_(s.t, s.r, e); return sodView_(u.membroId, s);
  });
}
function sodAparencia_(d, u) {
  return withLock_(function () {
    const s = sodSync_(u.membroId), e = s.e, src = d.aparencia || {}, a = Object.assign({}, e.apar), nome = function (x) { const v = String(x === undefined ? '' : x); return /^[a-z_]{1,20}$/.test(v) ? v : ''; };
    const tem = function (slot, est) { return SOD_LIVRE[slot].indexOf(est) >= 0 || e.itens.some(function (x) { return x.k === 'rou' && x.c === slot + ':' + est; }); };
    ['pele', 'corCabelo', 'corBlusa', 'corSobre', 'corCalca', 'corTenis', 'corBone', 'corPescoco', 'corLuvas'].forEach(function (k) { const v = nome(src[k]); if (v) a[k] = v; });
    if (src.corpo === 'm' || src.corpo === 'f') a.corpo = src.corpo;
    if (['blue', 'brown', 'green', 'gray'].indexOf(src.olhos) >= 0) a.olhos = src.olhos;
    if (SOD_CAB.indexOf(src.cabelo) >= 0) a.cabelo = src.cabelo;
    Object.keys(SOD_LIVRE).forEach(function (k) { const v = nome(src[k]); if (v && tem(k, v)) a[k] = v; });
    e.apar = a; sodSalva_(s.t, s.r, e); return sodView_(u.membroId, s);
  });
}
function sodComprar_(d, u) {
  return withLock_(function () {
    const s = sodSync_(u.membroId), e = s.e, c = clip_(d.c, 40); let preco, it;
    if (c === 'caixa') { preco = SOD_CAIXA_PRECO; }
    else {
      const def = SOD_ROUPAS[c]; if (!def) throw new ApiError('NOT_FOUND', 'Item não encontrado na loja.');
      if (e.itens.some(function (x) { return x.k === 'rou' && x.c === c; })) throw new ApiError('VALIDATION', 'Você já tem este item.');
      if (e.itens.length >= SOD_BAG) throw new ApiError('VALIDATION', 'Mochila cheia (' + SOD_BAG + '). Descarte itens antes de comprar.');
      preco = SOD_PRECO[def[1]]; it = { i: id_('IT'), k: 'rou', c: c, r: def[1] };
    }
    if (Math.floor(e.Talentos) < preco) throw new ApiError('VALIDATION', 'Talentos insuficientes: faltam ' + (preco - Math.floor(e.Talentos)) + '.');
    e.Talentos -= preco; if (it) e.itens.push(it); else e.Caixas++;
    sodSalva_(s.t, s.r, e); const v = sodView_(u.membroId, s); v.comprado = it || 'caixa'; return v;
  });
}
function sodOrar_(d, u) { return withLock_(function () { const s = sodSync_(u.membroId, false), e = s.e; e.Orou = today_(); const m = sodMiss_(u.membroId, today_(), e.Orou); s.mis = m; if (m.completo && e.CaixaBonus !== today_()) { e.CaixaBonus = today_(); e.Caixas++; e.Talentos += 10; s.aviso.push('bonus'); } sodSalva_(s.t, s.r, e); return sodView_(u.membroId, s); }); }

/* Carga inicial em UMA requisição (antes eram ~20 idas e voltas ao Apps Script) */
function boot_(d, u) {
  const out = {}; let cid = clip_(d.celulaId, 30);
  const run = function (k, action, data) { try { const r = ROUTES[action]; if (r.auth && r.auth !== 'any' && !can_(u, r.auth)) throw new ApiError('FORBIDDEN', ''); out[k] = r.fn(data || {}, u); } catch (e) { if (k === 'me' && e instanceof ApiError && cid) { cid = ''; return run(k, action, {}); } out[k] = { __erro: e instanceof ApiError ? e.code : 'ERROR' }; } };
  run('me', 'me', cid ? { celulaId: cid } : {}); const me = out.me && !out.me.__erro ? out.me : null; if (!me) throw new ApiError('ERROR', 'Falha ao carregar.');
  ['listEvents', 'listMinistries', 'listNews', 'listVideos', 'listCourses', 'listLessons', 'listDynamics', 'birthdays', 'searchCells', 'listTestimonies', 'listCultoNotes', 'listProducts', 'listFamilia', 'listNotifications'].forEach(function (a) { run(a, a, {}); });
  const cg = me.cargos || {}, pc = me.permCelula || {}, pv = function (g) { return !!(pc[g] && pc[g].v); }, cd = cid ? { celulaId: cid } : {};
  if (can_(u, 'celulas') || cg.supervisor || pv('org')) run('orgTree', 'orgTree', {});
  if (me.celula && me.permCelula) {
    if (pv('membros') || pv('freq') || pv('pres') || pv('papeis')) run('cellMembers', 'cellMembers', cd);
    if (pv('hist') || pv('freq')) run('history', 'history', cd);
    if (pv('papeis')) run('getPapeis', 'getPapeis', cd);
    if (pv('oracao')) run('listPrayers', 'listPrayers', cd);
    if (pv('ind')) run('indicators', 'indicators', cd);
  }
  const pm = me.permissoes || {};
  run('sod', 'sodGet', {});
  if (pm.transf || cg.supervisor) run('listTransfers', 'listTransfers', {});
  if (pm.config) run('getPerms', 'getPerms', {});
  if (pm.transf || pm.min || cg.supervisor) run('listApprovals', 'listApprovals', {});
  return out;
}

const ROUTES = {
  ping: { fn: function () { return { servico: 'Zoe API', status: 'online' }; } },
  login: { fn: login_ },
  logout: { auth: 'any', fn: function (d, u) { bumpVer_(u.email); return { ok: true }; } },
  me: { auth: 'any', fn: me_ }, changePassword: { auth: 'any', write: 1, fn: changePassword_ },
  saveMember: { auth: 'any', write: 1, fn: saveMember_ }, acceptLegal: { auth: 'any', write: 1, fn: acceptLegal_ }, birthdays: { auth: 'any', fn: birthdays_ },
  listEvents: { auth: 'any', fn: listEvents_ }, enroll: { auth: 'any', write: 1, fn: enroll_ }, listNews: { auth: 'any', fn: listNews_ },
  listMinistries: { auth: 'any', fn: listMin_ }, interest: { auth: 'any', write: 1, fn: interest_ },
  listCourses: { auth: 'any', fn: listCourses_ }, enrollCourse: { auth: 'any', write: 1, fn: enrollCourse_ }, saveCourse: { auth: 'any', write: 1, fn: saveCourse_ }, courseDetail: { auth: 'any', fn: courseDetail_ }, saveAula: { auth: 'any', write: 1, fn: saveAula_ }, deleteAula: { auth: 'any', write: 1, fn: deleteAula_ }, getAulaPdf: { auth: 'any', fn: getAulaPdf_ },
  requestStart: { auth: 'any', write: 1, fn: requestStart_ }, getClassRoll: { auth: 'any', fn: getClassRoll_ }, saveClassRoll: { auth: 'any', write: 1, fn: saveClassRoll_ }, finishCourse: { auth: 'any', write: 1, fn: finishCourse_ }, listCertificates: { auth: 'any', fn: listCertificates_ }, decideCert: { auth: 'any', write: 1, fn: decideCert_ }, certificate: { auth: 'any', fn: certificate_ },
  getSignature: { auth: 'any', fn: getSignature_ }, saveSignature: { auth: 'any', write: 1, fn: saveSignature_ }, rateAula: { auth: 'any', write: 1, fn: rateAula_ }, aulaFeedback: { auth: 'any', fn: aulaFeedback_ },
  listLessons: { auth: 'any', fn: listLessons_ }, listDynamics: { auth: 'any', fn: listDyn_ }, addDynamic: { auth: 'any', write: 1, fn: addDyn_ }, listVideos: { auth: 'any', fn: listVideos_ }, listProducts: { auth: 'any', fn: listProducts_ }, listFamilia: { auth: 'any', fn: listFamilia_ }, profileView: { auth: 'any', fn: profileView_ }, listFeed: { auth: 'any', fn: listFeed_ }, likePost: { auth: 'any', write: 1, fn: likePost_ }, commentPost: { auth: 'any', write: 1, fn: commentPost_ }, listComments: { auth: 'any', fn: listComments_ }, deletePost: { auth: 'any', write: 1, fn: deletePost_ }, deleteComment: { auth: 'any', write: 1, fn: deleteComment_ },
  registerDecision: { auth: 'any', write: 1, fn: registerDecision_ }, purgePessoa: { auth: 'config', write: 1, fn: purgePessoa_ }, saveLayoutVers: { auth: 'any', write: 1, fn: saveLayoutVers_ }, getLiveCfg: { auth: 'any', fn: getLiveCfg_ }, saveLiveCfg: { auth: 'config', write: 1, fn: saveLiveCfg_ }, liveStart: { auth: 'any', write: 1, fn: liveStart_ }, liveStop: { auth: 'any', write: 1, fn: liveStop_ }, getLive: { auth: 'any', fn: getLive_ }, liveSend: { auth: 'any', write: 1, fn: liveSend_ }, liveComments: { auth: 'any', fn: liveComments_ }, nearCell: { auth: 'any', fn: nearCell_ }, saveVisitor: { auth: 'any', write: 1, fn: saveVisitor_ }, listVisitors: { auth: 'any', fn: listVisitors_ }, contactVisitor: { auth: 'any', write: 1, fn: contactVisitor_ },
  listScales: { auth: 'any', fn: listScales_ }, claimScale: { auth: 'any', write: 1, fn: claimScale_ }, saveScale: { auth: 'any', write: 1, fn: saveScale_ }, rescheduleScale: { auth: 'any', write: 1, fn: rescheduleScale_ }, deleteScale: { auth: 'any', write: 1, fn: deleteScale_ }, respondScale: { auth: 'any', write: 1, fn: respondScale_ }, requestSwap: { auth: 'any', write: 1, fn: requestSwap_ }, answerSwap: { auth: 'any', write: 1, fn: answerSwap_ }, markScale: { auth: 'any', write: 1, fn: markScale_ }, requestJoin: { auth: 'any', write: 1, fn: requestJoin_ }, decideJoin: { auth: 'any', write: 1, fn: decideJoin_ },
  listSongs: { auth: 'any', fn: listSongs_ }, saveSong: { auth: 'any', write: 1, fn: saveSong_ }, deleteSong: { auth: 'any', write: 1, fn: deleteSong_ }, saveSongDefault: { auth: 'any', write: 1, fn: saveSongDefault_ }, searchLyrics: { auth: 'any', fn: searchLyrics_ }, importLyrics: { auth: 'any', fn: importLyrics_ },
  boot: { auth: 'any', fn: boot_ },
  getPushKey: { auth: 'any', fn: getPushKey_ }, pushDiag: { auth: 'any', fn: pushDiag_ }, savePushSub: { auth: 'any', write: 1, fn: savePushSub_ }, delPushSub: { auth: 'any', write: 1, fn: delPushSub_ },
  sodGet: { auth: 'any', write: 1, fn: sodGet_ }, sodAbrir: { auth: 'any', write: 1, fn: sodAbrir_ }, sodEquipar: { auth: 'any', write: 1, fn: sodEquipar_ }, sodDescartar: { auth: 'any', write: 1, fn: sodDescartar_ }, sodAparencia: { auth: 'any', write: 1, fn: sodAparencia_ }, sodOrar: { auth: 'any', write: 1, fn: sodOrar_ }, sodComprar: { auth: 'any', write: 1, fn: sodComprar_ },
  listMarks: { auth: 'any', fn: listMarks_ }, saveMark: { auth: 'any', write: 1, fn: saveMark_ }, saveNote: { auth: 'any', write: 1, fn: saveNote_ }, listCultoNotes: { auth: 'any', fn: listCultoNotes_ }, getMural: { auth: 'any', fn: getMural_ },
  listInsigniaDefs: { auth: 'any', fn: listInsigniaDefs_ }, saveInsigniaDef: { auth: 'any', write: 1, fn: saveInsigniaDef_ }, grantBadge: { auth: 'any', write: 1, fn: grantBadge_ }, logServico: { auth: 'any', write: 1, fn: logServico_ }, listServicos: { auth: 'any', fn: listServicos_ }, searchPeople: { auth: 'any', fn: findPeople_ }, sendChat: { auth: 'any', write: 1, fn: sendChat_ }, getChat: { auth: 'any', fn: getChat_ }, chatRead: { auth: 'any', write: 1, fn: chatRead_ }, chatTyping: { auth: 'any', fn: chatTyping_ }, listChats: { auth: 'any', fn: listChats_ }, getCertLayout: { auth: 'any', fn: getCertLayout_ }, saveCertLayout: { auth: 'any', write: 1, fn: saveCertLayout_ }, previewCert: { auth: 'any', fn: previewCert_ }, revokeCert: { auth: 'any', write: 1, fn: revokeCert_ }, getCorrida: { auth: 'any', fn: getCorrida_ }, corridaLer: { auth: 'any', write: 1, fn: corridaLer_ }, listCorridaValidar: { auth: 'any', fn: listCorridaValidar_ }, decideLeitura: { auth: 'any', write: 1, fn: decideLeitura_ }, checkinEvento: { auth: 'eventos', write: 1, fn: checkinEvento_ }, saveFaces: { auth: 'eventos', write: 1, fn: saveFaces_ }, faceRoster: { auth: 'eventos', fn: faceRoster_ }, setFaceAuth: { auth: 'eventos', write: 1, fn: setFaceAuth_ }, listFaces: { auth: 'eventos', fn: listFaces_ }, clearFaces: { auth: 'eventos', write: 1, fn: clearFaces_ }, eventoPresenca: { auth: 'eventos', fn: eventoPresenca_ }, saveProfile: { auth: 'any', write: 1, fn: saveProfile_ }, saveHighlight: { auth: 'any', write: 1, fn: saveHighlight_ }, deleteHighlight: { auth: 'any', write: 1, fn: deleteHighlight_ }, greet: { auth: 'any', write: 1, fn: greet_ }, saveProduct: { auth: 'config', write: 1, fn: saveProduct_ }, setPromo: { auth: 'config', write: 1, fn: setPromo_ }, deleteProduct: { auth: 'config', write: 1, fn: deleteProduct_ },
  searchCells: { auth: 'any', fn: searchCells_ }, addPrayer: { auth: 'any', write: 1, fn: addPrayer_ }, listPrayers: { auth: 'any', fn: listPrayers_ },
  cellMembers: { auth: 'any', fn: cellMembers_ }, saveCell: { auth: 'any', write: 1, fn: saveCell_ }, saveAttendance: { auth: 'any', write: 1, fn: saveAttendance_ }, history: { auth: 'any', fn: history_ },
  indicators: { auth: 'any', fn: indicators_ }, getPapeis: { auth: 'any', fn: getPapeis_ }, savePapeis: { auth: 'any', write: 1, fn: savePapeis_ }, createCellEvent: { auth: 'any', write: 1, fn: createCellEvent_ },
  lookup: { auth: 'any', fn: lookup_ }, requestTransfer: { auth: 'any', write: 1, fn: requestTransfer_ }, requestExit: { auth: 'any', write: 1, fn: requestExit_ }, decideExit: { auth: 'any', write: 1, fn: decideExit_ }, addNewMember: { auth: 'any', write: 1, fn: addNewMember_ }, orgTree: { auth: 'any', fn: orgTree_ },
  listTransfers: { auth: 'any', fn: listTransfers_ }, decideTransfer: { auth: 'any', write: 1, fn: decideTransfer_ },
  createEvent: { auth: 'eventos', write: 1, fn: createEvent_ }, postNews: { auth: 'eventos', write: 1, fn: postNews_ },
  listApprovals: { auth: 'any', fn: listApprovals_ }, guideDone: { auth: 'any', write: 1, fn: guideDone_ }, listNotifications: { auth: 'any', fn: listNotifications_ }, clearNotifications: { auth: 'any', write: 1, fn: clearNotifications_ }, readNotifications: { auth: 'any', write: 1, fn: readNotifications_ }, decideApproval: { auth: 'any', fn: decideApproval_ }, undoApproval: { auth: 'any', fn: undoApproval_ }, track: { auth: 'any', fn: track_ }, usageReport: { auth: 'config', fn: usageReport_ },
  orgMove: { auth: 'any', write: 1, fn: orgMove_ }, saveOrgLayout: { auth: 'any', write: 1, fn: saveOrgLayout_ }, rateBook: { auth: 'any', write: 1, fn: rateBook_ }, fotos: { auth: 'any', fn: fotos_ },
  listBooks: { auth: 'any', fn: listBooks_ }, saveBook: { auth: 'any', write: 1, fn: saveBook_ }, deleteBook: { auth: 'any', write: 1, fn: deleteBook_ }, getBookFile: { auth: 'any', fn: getBookFile_ },
  listBookComments: { auth: 'any', fn: listBookComments_ }, addBookComment: { auth: 'any', write: 1, fn: addBookComment_ }, deleteBookComment: { auth: 'any', write: 1, fn: deleteBookComment_ },
  listTestimonies: { auth: 'any', fn: listTestimonies_ }, addTestimony: { auth: 'any', write: 1, fn: addTestimony_ }, deleteTestimony: { auth: 'any', write: 1, fn: deleteTestimony_ }, toggleLike: { auth: 'any', write: 1, fn: toggleLike_ },
  saveMinistry: { auth: 'min', write: 1, fn: saveMinistry_ }, deleteMinistry: { auth: 'min', write: 1, fn: deleteMinistry_ }, listInterests: { auth: 'min', fn: listInterests_ },
  saveConfig: { auth: 'config', write: 1, fn: saveConfig_ }, saveHomeLayout: { auth: 'config', write: 1, fn: saveHomeLayout_ }, saveMural: { auth: 'config', write: 1, fn: saveMural_ }, getTelao: { auth: 'any', fn: getTelao_ }, setTelao: { auth: 'any', write: 1, fn: setTelao_ }, saveTelaoPausa: { auth: 'any', write: 1, fn: saveTelaoPausa_ }, listMidias: { auth: 'any', fn: listMidias_ }, getMidia: { auth: 'any', fn: getMidia_ }, saveMidia: { auth: 'any', write: 1, fn: saveMidia_ }, deleteMidia: { auth: 'any', write: 1, fn: deleteMidia_ }, listAgendas: { auth: 'any', fn: listAgendas_ }, saveAgenda: { auth: 'any', write: 1, fn: saveAgenda_ }, deleteAgenda: { auth: 'any', write: 1, fn: deleteAgenda_ }, addAgendaItem: { auth: 'any', write: 1, fn: addAgendaItem_ }, getAccessRules: { auth: 'config', fn: accessRules_ }, saveAccessRules: { auth: 'config', write: 1, fn: saveAccessRules_ }, saveVideo: { auth: 'config', write: 1, fn: saveVideo_ }, deleteVideo: { auth: 'config', write: 1, fn: deleteVideo_ }, updateVideo: { auth: 'config', write: 1, fn: updateVideo_ },
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
    TMEMO_ = /^(list|get|search|boot|me$|birthdays|orgTree|cellMembers|history|indicators|profileView|lookup|track|usageReport|fotos|certData|courseDetail|aulaFeedback)/.test(action) ? {} : null;
    out = { ok: true, data: route.fn(req.data || {}, user) };
  } catch (err) {
    if (err instanceof ApiError) out = { ok: false, error: { code: err.code, message: err.message } };
    else { console.error(err && err.stack || err); out = { ok: false, error: { code: 'ERROR', message: 'Erro inesperado. Tente novamente.' } }; }
  }
  TMEMO_ = null;
  try { pushFlush_(); } catch (err2) { console.error(err2 && err2.stack || err2); }
  return json_(out);
}


/* ===== Web Push direto do Apps Script (sem servidor externo): VAPID (ES256) + criptografia aes128gcm em JavaScript puro ===== */
const P256_ = (function () {
  const p = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn, n = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
  const b = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn, gx = 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, gy = 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n;
  const mod = function (a, m) { const r = a % m; return r >= 0n ? r : r + m; };
  function inv(a, m) { let lo = mod(a, m), hi = m, x0 = 1n, x1 = 0n; while (hi) { const q = lo / hi; const t = lo - q * hi; lo = hi; hi = t; const u = x0 - q * x1; x0 = x1; x1 = u; } return mod(x0, m); }
  function dbl(P) { const X = P[0], Y = P[1], Z = P[2]; if (!Z || !Y) return [0n, 1n, 0n]; const d = Z * Z % p, g = Y * Y % p, be = X * g % p, al = 3n * mod((X - d) * (X + d), p) % p; const X3 = mod(al * al - 8n * be, p), Z3 = mod((Y + Z) * (Y + Z) - g - d, p), Y3 = mod(al * (4n * be - X3) - 8n * g * g, p); return [X3, Y3, Z3]; }
  function add(P, Q) { if (!P[2]) return Q; if (!Q[2]) return P; const z1 = P[2] * P[2] % p, z2 = Q[2] * Q[2] % p, u1 = P[0] * z2 % p, u2 = Q[0] * z1 % p, s1 = P[1] * Q[2] % p * z2 % p, s2 = Q[1] * P[2] % p * z1 % p; if (u1 === u2) return s1 === s2 ? dbl(P) : [0n, 1n, 0n]; const h = mod(u2 - u1, p), r = mod(s2 - s1, p), h2 = h * h % p, h3 = h2 * h % p, v = u1 * h2 % p; const X3 = mod(r * r - h3 - 2n * v, p); return [X3, mod(r * (v - X3) - s1 * h3, p), P[2] * Q[2] % p * h % p]; }
  function mul(k, P) { let R = [0n, 1n, 0n], i = 255; for (; i >= 0; i--) { R = dbl(R); if ((k >> BigInt(i)) & 1n) R = add(R, P); } return R; }
  function aff(P) { if (!P[2]) throw new Error('infinito'); const zi = inv(P[2], p), z2 = zi * zi % p; return [P[0] * z2 % p, P[1] * z2 % p * zi % p]; }
  return { p: p, n: n, G: [gx, gy, 1n], mod: mod, inv: inv, mul: mul, aff: aff, noCurva: function (x, y) { return mod(y * y - (x * x * x - 3n * x + b), p) !== 0n; } };
})();
const WP_ = {
  hex2big: function (a) { let r = 0n; for (let i = 0; i < a.length; i++) r = (r << 8n) | BigInt(a[i]); return r; },
  big2b: function (v, len) { const o = []; for (let i = 0; i < len; i++) { o.unshift(Number(v & 255n)); v >>= 8n; } return o; },
  sg: function (a) { return a.map(function (x) { return x > 127 ? x - 256 : x; }); },
  us: function (a) { return Array.prototype.map.call(a, function (x) { return x < 0 ? x + 256 : x; }); },
  str: function (s) { return WP_.us(Utilities.newBlob(s).getBytes()); },
  b64u: function (a) { const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; let o = ''; for (let i = 0; i < a.length; i += 3) { const v = (a[i] << 16) | ((a[i + 1] || 0) << 8) | (a[i + 2] || 0); o += T[v >> 18 & 63] + T[v >> 12 & 63] + (i + 1 < a.length ? T[v >> 6 & 63] : '') + (i + 2 < a.length ? T[v & 63] : ''); } return o; },
  unb64u: function (s) { const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; const o = []; let acc = 0, bits = 0; for (let i = 0; i < s.length; i++) { const v = T.indexOf(s[i]); if (v < 0) continue; acc = (acc << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; o.push((acc >> bits) & 255); acc &= (1 << bits) - 1; } } return o; },
  hmac: function (key, data) { return WP_.us(Utilities.computeHmacSha256Signature(WP_.sg(data), WP_.sg(key))); },
  sha: function (data) { return WP_.us(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, WP_.sg(data))); },
  hkdf: function (salt, ikm, info, len) { const prk = WP_.hmac(salt, ikm); let t = [], o = [], i = 1; while (o.length < len) { t = WP_.hmac(prk, t.concat(info, [i++])); o = o.concat(t); } return o.slice(0, len); },
  rand: function (len) { let o = []; while (o.length < len) o = o.concat(WP_.hmac(WP_.str(Utilities.getUuid() + Utilities.getUuid()), WP_.str(String(Date.now()) + Math.random() + Utilities.getUuid()))); return o.slice(0, len); },
  chavePriv: function () { for (;;) { const k = WP_.hex2big(WP_.rand(32)); if (k > 0n && k < P256_.n) return k; } },
  pub: function (d) { const A = P256_.aff(P256_.mul(d, P256_.G)); return [4].concat(WP_.big2b(A[0], 32), WP_.big2b(A[1], 32)); },
  ecdh: function (d, pubB) { const x = WP_.hex2big(pubB.slice(1, 33)), y = WP_.hex2big(pubB.slice(33, 65)); if (pubB.length !== 65 || pubB[0] !== 4 || P256_.noCurva(x, y)) throw new Error('chave inválida'); return WP_.big2b(P256_.aff(P256_.mul(d, [x, y, 1n]))[0], 32); },
  ecdsa: function (d, msg) { const z = WP_.hex2big(WP_.sha(msg)); for (let c = 0; c < 20; c++) { const k = P256_.mod(WP_.hex2big(WP_.hmac(WP_.big2b(d, 32), WP_.sha(msg).concat([c]))), P256_.n - 1n) + 1n; const r = P256_.mod(P256_.aff(P256_.mul(k, P256_.G))[0], P256_.n); if (!r) continue; const s = P256_.mod(P256_.inv(k, P256_.n) * (z + r * d), P256_.n); if (!s) continue; return WP_.big2b(r, 32).concat(WP_.big2b(s, 32)); } throw new Error('assinatura'); },
  jwt: function (aud, d, sub) { const h = WP_.b64u(WP_.str(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))), pl = WP_.b64u(WP_.str(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sub }))); return h + '.' + pl + '.' + WP_.b64u(WP_.ecdsa(d, WP_.str(h + '.' + pl))); },
  // AES-128-GCM
  SB: null,
  sbox: function () { if (WP_.SB) return WP_.SB; const s = new Array(256), xt = function (a) { return ((a << 1) ^ ((a & 128) ? 27 : 0)) & 255; }; let p = 1, q = 1; do { p = p ^ xt(p); q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255; if (q & 128) q ^= 9; const x = q ^ ((q << 1) | (q >> 7)) & 255 ^ ((q << 2) | (q >> 6)) & 255 ^ ((q << 3) | (q >> 5)) & 255 ^ ((q << 4) | (q >> 4)) & 255; s[p] = (x ^ 99) & 255; } while (p !== 1); s[0] = 99; WP_.SB = s; return s; },
  aesKey: function (key) { const S = WP_.sbox(), w = []; for (let i = 0; i < 4; i++) w.push(key.slice(4 * i, 4 * i + 4)); let rc = 1; for (let i = 4; i < 44; i++) { let t = w[i - 1].slice(); if (i % 4 === 0) { t = [S[t[1]] ^ rc, S[t[2]], S[t[3]], S[t[0]]]; rc = ((rc << 1) ^ ((rc & 128) ? 27 : 0)) & 255; } w.push([w[i - 4][0] ^ t[0], w[i - 4][1] ^ t[1], w[i - 4][2] ^ t[2], w[i - 4][3] ^ t[3]]); } const rk = []; for (let r = 0; r < 11; r++) rk.push([].concat(w[4 * r], w[4 * r + 1], w[4 * r + 2], w[4 * r + 3])); return rk; },
  aesBlock: function (rk, blk) { const S = WP_.sbox(), xt = function (a) { return ((a << 1) ^ ((a & 128) ? 27 : 0)) & 255; }; let s = blk.map(function (v, i) { return v ^ rk[0][i]; }); for (let r = 1; r <= 10; r++) { const t = new Array(16); for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) t[4 * c + rr] = S[s[4 * ((c + rr) % 4) + rr]]; if (r < 10) { for (let c = 0; c < 4; c++) { const a = t.slice(4 * c, 4 * c + 4), x = a[0] ^ a[1] ^ a[2] ^ a[3]; s[4 * c] = a[0] ^ x ^ xt(a[0] ^ a[1]); s[4 * c + 1] = a[1] ^ x ^ xt(a[1] ^ a[2]); s[4 * c + 2] = a[2] ^ x ^ xt(a[2] ^ a[3]); s[4 * c + 3] = a[3] ^ x ^ xt(a[3] ^ a[0]); } } else s = t; s = s.map(function (v, i) { return v ^ rk[r][i]; }); } return s; },
  gmul: function (x, y) { const R = 0xe1n << 120n; let z = 0n, v = y; for (let i = 127; i >= 0; i--) { if ((x >> BigInt(i)) & 1n) z ^= v; v = (v & 1n) ? (v >> 1n) ^ R : v >> 1n; } return z; },
  gcm: function (key, iv, pt) { const rk = WP_.aesKey(key), H = WP_.hex2big(WP_.aesBlock(rk, new Array(16).fill(0))), ct = []; for (let i = 0; i < pt.length; i += 16) { const ks = WP_.aesBlock(rk, iv.concat(WP_.big2b(BigInt(2 + i / 16), 4))); for (let j = 0; j < 16 && i + j < pt.length; j++) ct.push(pt[i + j] ^ ks[j]); }
    let g = 0n; for (let i = 0; i < ct.length; i += 16) { const bl = ct.slice(i, i + 16); while (bl.length < 16) bl.push(0); g = WP_.gmul(g ^ WP_.hex2big(bl), H); } g = WP_.gmul(g ^ (BigInt(ct.length) * 8n), H);
    const ej = WP_.hex2big(WP_.aesBlock(rk, iv.concat([0, 0, 0, 1]))); return ct.concat(WP_.big2b(g ^ ej, 16)); },
  cifra: function (payload, sub) { const ua = WP_.unb64u(sub.keys.p256dh), auth = WP_.unb64u(sub.keys.auth), e = WP_.chavePriv(), asPub = WP_.pub(e), shared = WP_.ecdh(e, ua), salt = WP_.rand(16);
    const ikm = WP_.hkdf(auth, shared, WP_.str('WebPush: info\0').concat(ua, asPub), 32), cek = WP_.hkdf(salt, ikm, WP_.str('Content-Encoding: aes128gcm\0'), 16), nonce = WP_.hkdf(salt, ikm, WP_.str('Content-Encoding: nonce\0'), 12);
    return salt.concat([0, 0, 16, 0, asPub.length], asPub, WP_.gcm(cek, nonce, WP_.str(JSON.stringify(payload)).concat([2]))); }
};

/* ===== Notificações no aparelho (Web Push direto, sem servidor) e lembrete diário das missões do Sod ===== */
function pushRelayHttp_() { const u = liveCfgLer_().relay; if (!u.url || !u.token) return null; return { base: u.url.replace(/^ws/, 'http').replace(/\/+$/, ''), token: u.token }; }
function setPushPub_(k) { const t = table_('Config'), r0 = t.rows.filter(function (q) { return q.Chave === 'PushPub'; })[0]; if (r0) writeRow_(t, r0._row, { Valor: k }); else appendRow_(t, { Chave: 'PushPub', Valor: k }); }
// Chaves do servidor de avisos (VAPID): a privada fica só nas propriedades do script (nunca na planilha); a pública vai para o app
function vapid_() {
  const pr = PropertiesService.getScriptProperties(); let hex = pr.getProperty('VAPID_PRIV'), c = cfgMap_();
  if (hex && /^[0-9a-f]{64}$/.test(hex) && c.PushPub) return { d: BigInt('0x' + hex), pub: c.PushPub };
  return withLock_(function () {
    hex = pr.getProperty('VAPID_PRIV'); c = cfgMap_(); let d;
    if (hex && /^[0-9a-f]{64}$/.test(hex)) d = BigInt('0x' + hex); else { d = WP_.chavePriv(); pr.setProperty('VAPID_PRIV', d.toString(16).padStart(64, '0')); }
    const pub = WP_.b64u(WP_.pub(d)); if (c.PushPub !== pub) setPushPub_(pub); return { d: d, pub: pub };
  });
}
function getPushKey_() { return { key: vapid_().pub }; }
function savePushSub_(d, u) {
  const ep = String(d.endpoint || ''), k = d.keys || {}, p = String(k.p256dh || ''), a = String(k.auth || '');
  if (!/^https:\/\/[^\s"'<>]{10,600}$/.test(ep) || !/^[A-Za-z0-9_-]{20,200}$/.test(p) || !/^[A-Za-z0-9_-]{10,60}$/.test(a)) throw new ApiError('VALIDATION', 'Inscrição inválida.');
  return withLock_(function () {
    const t = table_('PushSubs'), r = t.rows.filter(function (x) { return x.Endpoint === ep; })[0], v = { MembroID: u.membroId, Endpoint: ep, P256dh: p, Auth: a, Agente: clip_(d.agente, 80) };
    if (r) writeRow_(t, r._row, v); else { const mine = t.rows.filter(function (x) { return x.MembroID === u.membroId; }); if (mine.length >= 8) writeRow_(t, mine[0]._row, Object.assign({ SubID: mine[0].SubID, CriadoEm: now_() }, v)); else appendRow_(t, Object.assign({ SubID: id_('PS'), CriadoEm: now_() }, v)); }
    return { ok: true };
  });
}
function delPushSub_(d, u) { return withLock_(function () { const t = table_('PushSubs'), r = t.rows.filter(function (x) { return x.Endpoint === String(d.endpoint || '') && x.MembroID === u.membroId; })[0]; if (r) writeRow_(t, r._row, { MembroID: '', Endpoint: '' }); return { ok: true }; }); }
// Diagnóstico das notificações: confere o servidor relay, a chave e as inscrições; com d.teste envia uma notificação de teste aos aparelhos de quem pediu
// Diagnóstico das notificações: confere a chave, as inscrições e, com d.teste, envia uma notificação de teste aos aparelhos de quem pediu
function pushDiag_(d, u) {
  const out = { chave: false, subs: 0, pessoas: 0, meus: 0, teste: null };
  try { out.chave = !!vapid_().pub; } catch (e) { out.chaveMsg = String(e && e.message || e).slice(0, 100); }
  let subs = []; try { subs = table_('PushSubs').rows.filter(function (x) { return x.MembroID && x.Endpoint; }); } catch (e) { subs = []; }
  const quem = {}; subs.forEach(function (x) { quem[x.MembroID] = 1; }); out.subs = subs.length; out.pessoas = Object.keys(quem).length; out.meus = subs.filter(function (x) { return x.MembroID === u.membroId; }).length;
  if (d && d.teste && out.chave) {
    const meus = subs.filter(function (x) { return x.MembroID === u.membroId; });
    if (!meus.length) out.teste = { enviados: 0, ok: 0, msg: 'Este aparelho ainda não está inscrito. Ative as notificações neste celular primeiro.' };
    else {
      try {
        const res = pushEnvia_(meus.map(function (sb) { return { sub: { endpoint: sb.Endpoint, keys: { p256dh: sb.P256dh, auth: sb.Auth } }, payload: { title: 'Teste da Zoe 🔔', body: 'Se você está lendo isto, as notificações funcionam neste aparelho.', tag: 'teste', url: './' } }; }));
        const ok = res.filter(function (x) { return x.status >= 200 && x.status < 300; }).length, st = res.map(function (x) { return x.status + (x.erro ? ' ' + x.erro : ''); });
        out.teste = { enviados: res.length, ok: ok, status: st, msg: ok ? 'Enviada. Ela deve chegar em alguns segundos.' : 'O serviço de entrega recusou o envio (' + st.join('; ') + '). Desative e ative as notificações de novo neste celular.' }; pushMortos_(res);
      } catch (e) { out.teste = { enviados: 0, ok: 0, msg: 'Falha no envio: ' + String(e && e.message || e).slice(0, 120) }; }
    }
  }
  return out;
}
function pushEnvia_(envios) {
  const v = vapid_(), cache = CacheService.getScriptCache(), jw = {}, reqs = [], eps = [], out = [];
  envios.forEach(function (e) {
    try {
      const u = e.sub.endpoint, aud = u.match(/^https:\/\/[^\/]+/)[0]; let tk = jw[aud] || cache.get('vj:' + aud);
      if (!tk) { tk = WP_.jwt(aud, v.d, 'mailto:contato@mczoe.com.br'); cache.put('vj:' + aud, tk, 21600); } jw[aud] = tk;
      reqs.push({ url: u, method: 'post', contentType: 'application/octet-stream', payload: WP_.sg(WP_.cifra(e.payload, e.sub)), headers: { 'Content-Encoding': 'aes128gcm', TTL: '86400', Urgency: 'high', Authorization: 'vapid t=' + tk + ', k=' + v.pub }, muteHttpExceptions: true }); eps.push(u);
    } catch (err) { out.push({ endpoint: e.sub && e.sub.endpoint, status: 0, erro: String(err && err.message || err).slice(0, 80) }); }
  });
  if (!reqs.length) return out;
  let rs; try { rs = UrlFetchApp.fetchAll(reqs); } catch (err) { rs = reqs.map(function (r) { try { return UrlFetchApp.fetch(r.url, r); } catch (e2) { return null; } }); }
  rs.forEach(function (r, i) { let st = 0, txt = ''; try { st = r.getResponseCode(); if (st >= 400) txt = String(r.getContentText()).slice(0, 120); } catch (e3) { /* sem resposta */ } out.push({ endpoint: eps[i], status: st, erro: txt }); });
  return out;
}
function pushMortos_(res) { const m = {}; res.forEach(function (x) { if (x && (x.status === 404 || x.status === 410)) m[x.endpoint] = 1; }); if (Object.keys(m).length) withLock_(function () { const t = table_('PushSubs'); t.rows.forEach(function (sb) { if (m[sb.Endpoint]) writeRow_(t, sb._row, { MembroID: '', Endpoint: '' }); }); }); }
function pushFlush_() {
  if (!PUSHQ_.length) return; const q = PUSHQ_.splice(0, PUSHQ_.length);
  let subs; try { subs = table_('PushSubs').rows; } catch (e) { return; } if (!subs.length) return;
  const por = {}; subs.forEach(function (s) { if (s.MembroID && s.Endpoint) (por[s.MembroID] = por[s.MembroID] || []).push(s); });
  const envios = []; q.forEach(function (n) { (por[n.m] || []).forEach(function (s) { envios.push({ sub: { endpoint: s.Endpoint, keys: { p256dh: s.P256dh, auth: s.Auth } }, payload: { title: clip_(n.t, 80), body: clip_(n.b, 160), tag: n.k, url: './' } }); }); });
  if (!envios.length) return;
  pushMortos_(pushEnvia_(envios.slice(0, 120)));
}
// Roda todos os dias (gatilho criado no setup): avisa quem tem missões do Sod pendentes
function lembreteMissoes() {
  if (!sodAtivo_()) return; const hoje = today_(); let n = 0;
  sodTab_().rows.forEach(function (r) { if (!r.MembroID) return; const m = sodMiss_(r.MembroID, hoje, r.Orou); if (m.completo) return;
    const falta = []; if (!m.biblia) falta.push('ler a Bíblia'); if (!m.oracao) falta.push('orar'); notify_(r.MembroID, 'sod_missao', 'Missões do Sod de hoje 🪨', 'Faltam: ' + (falta.join(' e ') || 'completar o dia') + '. Cada dia firme quebra mais pedras.', hoje); n++; });
  pushFlush_(); Logger.log('Lembretes de missão: ' + n);
}
function instalaGatilhos_() {
  if (typeof ScriptApp === 'undefined') return;
  const tem = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'lembreteMissoes'; });
  if (!tem) ScriptApp.newTrigger('lembreteMissoes').timeBased().everyDays(1).atHour(18).create();
}
