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
const GUIAS_CEL = ['freq', 'plan', 'papeis', 'oracao', 'ind', 'membros', 'perfilc', 'priv', 'pres', 'hist', 'mural', 'org', 'quiz'];
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
  Usuarios: ['Email', 'SenhaHash', 'Salt', 'Papel', 'Status', 'MembroID', 'TrocarSenha', 'CriadoEm', 'UltimoAcesso', 'GuiaVisto', 'SenhaVis'],
  Membros: ['MembroID', 'Nome', 'Simples', 'Apelido', 'Sexo', 'Nascimento', 'Nacionalidade', 'Naturalidade', 'Sangue', 'Doador', 'Profissao', 'Telefone', 'Email', 'CEP', 'UF', 'Cidade', 'Endereco', 'Bairro', 'DataDecisao', 'Batizado', 'DataBatismo', 'IgrejaBatismo', 'Mae', 'Pai', 'EstadoCivil', 'Conjuge', 'DataCasamento', 'Filhos', 'Foto', 'CelulaID', 'EhMembro', 'Status', 'DataSaida', 'Extras', 'AceitePrivacidade', 'AceiteTermos', 'CriadoEm', 'DataEntrada', 'Lat', 'Lng', 'SodOff', 'Crista', 'CongregaZoe', 'Parente'],
  Celulas: ['CelulaID', 'Nome', 'Descricao', 'Foto', 'LiderID', 'SupervisorID', 'Dia', 'Inicio', 'Fim', 'Categoria', 'Faixa', 'Bairro', 'Cidade', 'UF', 'Endereco', 'TreinamentoID', 'MaeID', 'PrivGrupo', 'PrivTel', 'PrivEmail', 'PrivEnd', 'Status', 'Lat', 'Lng'],
  Reunioes: ['ReuniaoID', 'CelulaID', 'Data', 'Presentes', 'PresencaDeDeus', 'Obs', 'ForaDoDia', 'Elenco', 'Termometro', 'Foto', 'LicaoID', 'LicaoTitulo', 'LicaoResumo', 'Papeis'],
  Posts: ['PostID', 'Tipo', 'Escopo', 'CelulaID', 'AutorID', 'Titulo', 'Texto', 'Foto', 'Meta', 'Data', 'Status'],
  Comentarios: ['ComentID', 'PostID', 'MembroID', 'Texto', 'Data'],
  Visitantes: ['VisitanteID', 'Nome', 'Apelido', 'Telefone', 'Email', 'Nascimento', 'Endereco', 'Bairro', 'Cidade', 'UF', 'Lat', 'Lng', 'Data', 'RegistradoPor', 'CelulaID', 'Distancia', 'Contatado', 'ContatadoPor', 'ContatoData', 'Msg', 'Obs', 'Decisao', 'Status', 'SupervisorID', 'LiderID', 'ConsolidadorID', 'TriagemPor', 'EncaminhadoEm', 'AceitoEm', 'AceitoPor', 'MembroID', 'CelulaProximaID'],
  BibMarcas: ['MembroID', 'Ref', 'Cor', 'Tipo', 'Comentario', 'Publico', 'Data'],
  Presencas: ['ReuniaoID', 'CelulaID', 'Data', 'MembroID'],
  Papeis: ['CelulaID', 'MembroID', 'Papel'],
  Supervisao: ['MembroID', 'SuperiorID'],
  UsoDia: ['Dia', 'IACalls', 'IAErros', 'IANeurons', 'WorkerCalls', 'DiretoCalls', 'PushEnvios', 'PushOk', 'PushFalha'],
  PapeisLog: ['LogID', 'CelulaID', 'MembroID', 'Papel', 'Acao', 'Por', 'Data'],
  Oracoes: ['OracaoID', 'CelulaID', 'MembroID', 'Tema', 'Titulo', 'Texto', 'Data'],
  Eventos: ['EventoID', 'Titulo', 'Data', 'Hora', 'Local', 'Descricao', 'Programacao', 'Escopo', 'CelulaID', 'CriadoPor', 'Status', 'Foto', 'Insignia', 'DataOriginal', 'Remarcado', 'MotivoRemarca', 'FotosAvisoEm', 'PostID'],
  EventoPresenca: ['EventoID', 'MembroID', 'Data'],
  Cultos: ['Data', 'Culto', 'MembroID', 'RegistradoPor', 'Hora'],
  Metricas: ['Slot', 'Pagina', 'Acao', 'N', 'Erros', 'RttSoma', 'RttMax', 'SrvSoma', 'SrvMax', 'Lentas', 'Aparelhos', 'Hist', 'LockSoma', 'EsperaSoma'],
  Rostos: ['MembroID', 'Descritor', 'AtualizadoEm', 'Autorizado', 'AutorizadoPor', 'AutorizadoEm', 'Amostras', 'ConsentimentoBio', 'ConsentimentoImagem', 'TermoVersao', 'Revogado'],
  RostoLog: ['Data', 'Hora', 'Por', 'Contexto', 'Acertos', 'Erros', 'Manuais'],
  Corridas: ['CorridaID', 'Titulo', 'Ano', 'Inicio', 'Fim', 'CapDia', 'TotalCap', 'Status'],
  CorridaLeitura: ['CorridaID', 'MembroID', 'Data', 'Capitulos', 'Resumo', 'Status', 'ValidadoPor', 'Obs'],
  CorridaConc: ['CorridaID', 'MembroID', 'Fim', 'Faltas', 'Faixa', 'Pos'],
  Inscricoes: ['EventoID', 'MembroID', 'Data'],
  Ministerios: ['MinisterioID', 'Nome', 'Ordem', 'Ativo', 'Descricao', 'Foto', 'Responsaveis', 'Autonomia'],
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
  InsigniaDefs: ['DefID', 'Nome', 'Descricao', 'Estilo', 'Forma', 'Cor1', 'Cor2', 'Icone', 'Texto', 'XP', 'Criterio', 'Ativo', 'CriadoPor', 'Niveis', 'Som', 'Categoria'],
  AbasVistas: ['MembroID', 'Mapa', 'Total'],
  LivroLeitura: ['LivroID', 'MembroID', 'Pags', 'Total', 'Concluido', 'Data'],
  VideosVistos: ['MembroID', 'VideoID', 'Tipo', 'Seg', 'Data', 'Ultimo'],
  PerfilVisitas: ['MembroID', 'AlvoID', 'Visitas', 'Data'],
  Elogios: ['ElogioID', 'De', 'Para', 'Texto', 'Data'],
  Servicos: ['Atividade', 'MembroID', 'Mes', 'RegistradoPor'],
  ChatMsgs: ['MsgID', 'ConvID', 'De', 'Para', 'Texto', 'Ts', 'Lida'],
  PerfilFotos: ['MembroID', 'FotoID', 'Foto', 'Legenda', 'Ordem'],
  Assinaturas: ['MembroID', 'Tipo', 'Dado', 'Cargo', 'Atualizado', 'Fonte'],
  EventoFotos: ['FotoID', 'EventoID', 'Foto', 'Por', 'Data'],
  Noticias: ['NoticiaID', 'Titulo', 'Texto', 'Data', 'CriadoPor', 'Status'],
  Licoes: ['LicaoID', 'Titulo', 'Resumo', 'Categoria', 'Url', 'Status', 'Conteudo'],
  Quizzes: ['QuizID', 'ReuniaoID', 'CelulaID', 'Data', 'Titulo', 'Texto', 'Fonte', 'Perguntas', 'Status', 'EnviarEm', 'EnviadoEm', 'CriadoEm', 'LicaoID', 'LembreteEm'],
  QuizRespostas: ['QuizID', 'MembroID', 'Acertos', 'Total', 'Respostas', 'Data', 'Pontos', 'Tempo'],
  Dinamicas: ['DinamicaID', 'Titulo', 'Descricao', 'Minutos', 'MembroID', 'Data'],
  Produtos: ['ProdutoID', 'Nome', 'Categoria', 'Preco', 'Descricao', 'Foto', 'Opcoes', 'Ativo', 'Ordem', 'Disponivel', 'PromoPreco', 'PromoAte'],
  Pastores: ['PastorID', 'Nome', 'Cargo', 'Foto', 'Ordem', 'Ativo'],
  Agendas: ['AgendaID', 'Data', 'Nome', 'Itens', 'CriadoPor', 'CriadoEm', 'AtualizadoPor', 'AtualizadoEm'],
  PresVisitas: ['PVID', 'ReuniaoID', 'CelulaID', 'Data', 'MembroID', 'VisitanteID', 'Nome', 'DeCelulaID', 'Tipo'],
  Campanhas: ['CampID', 'Titulo', 'Texto', 'Arte', 'Zoe', 'Preset', 'Inicio', 'Fim', 'Modo', 'Qtd', 'Anual', 'Onde', 'Estado', 'CriadoPor', 'CriadoEm', 'AtualizadoEm'],
  MuralCelula: ['ItemID', 'CelulaID', 'Tipo', 'X', 'Y', 'W', 'R', 'Z', 'Legenda', 'Cor', 'Kind', 'Foto', 'AutorID', 'CriadoEm'],
  VotosDeus: ['CelulaID', 'Data', 'MembroID', 'Valor', 'Quando'],
  Parentes: ['ParID', 'A', 'B', 'Tipo', 'CriadoPor', 'CriadoEm'],
  Galhos: ['GalhoID', 'Tipo', 'Nome', 'Ref', 'Membros', 'DX', 'DY', 'CriadoPor', 'CriadoEm'],
  Artes: ['ArteID', 'Titulo', 'Formato', 'Largura', 'Altura', 'Projeto', 'Foto', 'Mini', 'Status', 'CriadoPor', 'CriadoEm', 'DecididoPor', 'DecididoEm', 'Motivo', 'MidiaID'],
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
  semeiaLote_(); // lote de insígnias (só cria as que ainda não existem)
  migraEstilosLote_(); // v1.96: acabamento em pedras preciosas (uma vez)
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
  appendRow_(ensureCols_('Usuarios', ['SenhaVis']), { Email: email, SenhaVis: pwEnc_(String(senha), salt), SenhaHash: hash_(salt, String(senha)), Salt: salt, Papel: 'admin', Status: 'Ativo', GuiaVisto: '0', MembroID: mid, TrocarSenha: '', CriadoEm: now_() });
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
let DEPREC_ = null; // durante uma rota "sem mudança", anota as abas que ela lê
function table_(name) {
  if (DEPREC_) DEPREC_[name] = 1;
  if (TMEMO_ && TMEMO_[name]) return TMEMO_[name];
  const sh = ss_().getSheetByName(name); if (!sh) throw new ApiError('SETUP', 'Aba ausente: ' + name + '. Rode setup().');
  const v = sh.getDataRange().getValues(), headers = (v[0] || []).map(String);
  const rows = v.slice(1).map(function (r, i) { const o = { _row: i + 2 }; headers.forEach(function (h, j) { o[h] = str_(r[j]); }); return o; }).filter(function (o) { return headers.some(function (h) { return o[h] !== ''; }); });
  const t = { name: name, sh: sh, headers: headers, rows: rows }; if (TMEMO_) TMEMO_[name] = t; return t;
}
/* ===== Marcas de versão por aba (cache temporário) =====
   Cada aba tem uma "marca" (código aleatório) que muda quando alguém grava nela. Quem guardou uma cópia (a identificação do usuário, a resposta de uma rota)
   só a reaproveita se a marca continuar igual. Se a marca sumir do cache, nasce uma nova e tudo é relido: o erro possível é sempre "reler à toa", nunca "mostrar velho".
   A marca só é trocada DEPOIS de gravar de verdade na planilha (SpreadsheetApp.flush), para outra execução nunca ler dado antigo com marca nova. */
const TV_TTL_ = 21600; let TVDIRTY_ = {};
function tvToken_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 8); }
function tvTouch_(name) { if (name) TVDIRTY_[name] = 1; }
function tvFlush_() {
  const nomes = Object.keys(TVDIRTY_); if (!nomes.length) return; TVDIRTY_ = {};
  try { SpreadsheetApp.flush(); } catch (e) { /* ok */ }
  const o = {}; nomes.forEach(function (n) { o['tv:' + n] = tvToken_(); }); try { CacheService.getScriptCache().putAll(o, TV_TTL_); } catch (e) { /* ok */ }
}
function tvStamp_(nomes) {
  const c = CacheService.getScriptCache(), ks = nomes.map(function (n) { return 'tv:' + n; }); let got = {}; try { got = c.getAll(ks) || {}; } catch (e) { got = {}; }
  const novos = {}, partes = ks.map(function (k) { let v = got[k]; if (!v) { v = tvToken_(); novos[k] = v; } return v; });
  if (Object.keys(novos).length) { try { c.putAll(novos, TV_TTL_); } catch (e) { /* ok */ } }
  return partes.join('.');
}
// apagar linha: sempre por aqui, para a aba ser marcada como alterada
function delRow_(t, row) { t.sh.deleteRow(row); if (TMEMO_ && t.name) delete TMEMO_[t.name]; tvTouch_(t.name); }
let TZ_SHEET_ = null;
function tzSheet_() { if (TZ_SHEET_) return TZ_SHEET_; try { TZ_SHEET_ = ss_().getSpreadsheetTimeZone() || CFG.TZ; } catch (e) { TZ_SHEET_ = CFG.TZ; } return TZ_SHEET_; }
// O Google Sheets converte "20:00" em hora (ano 1899) quando a célula não é texto. Aqui devolvemos sempre texto legível.
function str_(x) { if (x instanceof Date) { if (x.getFullYear() < 1950) return Utilities.formatDate(x, tzSheet_(), 'HH:mm'); return Utilities.formatDate(x, CFG.TZ, 'yyyy-MM-dd'); } return x === null || x === undefined ? '' : String(x); }
function appendRow_(t, o) { if (TMEMO_ && t.name) delete TMEMO_[t.name]; tvTouch_(t.name); const vals = t.headers.map(function (h) { return o[h] === undefined ? '' : o[h]; }); const rg = t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, vals.length); rg.setNumberFormat('@'); rg.setValues([vals]); } // formato texto antes de gravar: horas e datas não viram Date
function writeRow_(t, row, patch) { if (TMEMO_ && t.name) delete TMEMO_[t.name]; tvTouch_(t.name); if (t.name === 'Membros' && patch.Foto !== undefined) { const fm = t.rows.filter(function (x) { return x._row === row; })[0]; if (fm) { try { CacheService.getScriptCache().remove('f:' + fm.MembroID); } catch (e) { /* ok */ } } } Object.keys(patch).forEach(function (k) { const c = t.headers.indexOf(k); if (c >= 0) { const rg = t.sh.getRange(row, c + 1, 1, 1); rg.setNumberFormat('@'); rg.setValues([[patch[k]]]); } }); }
// Garante que colunas novas existam mesmo se o setup() ainda não rodou depois de uma atualização (evita gravar "no vazio")
function ensureCols_(name, cols) {
  const t = table_(name), falta = cols.filter(function (c) { return t.headers.indexOf(c) < 0; }); if (!falta.length) return t;
  falta.forEach(function (c, i) { t.sh.getRange(1, t.headers.length + 1 + i, 1, 1).setValue(c); });
  if (TMEMO_) delete TMEMO_[name]; tvTouch_(name); return table_(name);
}
function id_(p) { return p + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); }
function now_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd'); }
function clip_(s, n) { return String(s === undefined || s === null ? '' : s).trim().slice(0, n || 200); }
let LOCKMS_ = 0, WAITMS_ = 0; // tempo segurando / esperando o cadeado nesta execução (painel de desempenho)
function withLock_(fn) { const l = LockService.getScriptLock(), a = Date.now(); l.waitLock(20000); const b = Date.now(); WAITMS_ += b - a; try { return fn(); } finally { try { tvFlush_(); } catch (e) { /* ok */ } l.releaseLock(); LOCKMS_ += Date.now() - b; } } // grava de verdade e troca as marcas antes de soltar a trava
function norm_(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
function jparse_(s, d) { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function audit_(user, action, alvo, res) { try { appendRow_(table_('Auditoria'), { Data: now_(), Usuario: user, Acao: action, Alvo: alvo || '', Resultado: res || 'OK' }); } catch (e) { } }
// Senha visível ao administrador: guardada CIFRADA (nunca em texto puro na planilha), com chave nas Propriedades do script.
function pwKey_() { const p = PropertiesService.getScriptProperties(); let k = p.getProperty('PW_KEY'); if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('PW_KEY', k); } return k; }
function pwStream_(salt, n) { let out = [], h = pwKey_() + salt; while (out.length < n) { h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h)); Utilities.base64Decode(h).forEach(function (b) { out.push(b & 255); }); } return out; }
function pwEnc_(pw, salt) { const t = unescape(encodeURIComponent(String(pw))), ks = pwStream_(salt, t.length), b = []; for (let i = 0; i < t.length; i++) { const x = (t.charCodeAt(i) ^ ks[i]) & 255; b.push(x > 127 ? x - 256 : x); } return Utilities.base64Encode(b); }
function pwDec_(enc, salt) { if (!enc) return null; try { const b = Utilities.base64Decode(enc), ks = pwStream_(salt, b.length); let t = ''; for (let i = 0; i < b.length; i++) t += String.fromCharCode(((b[i] & 255) ^ ks[i]) & 255); return decodeURIComponent(escape(t)); } catch (e) { return null; } }
function viewPasswords_(d, u) {
  if (u.papel !== 'admin') throw new ApiError('FORBIDDEN', 'Só o administrador vê as senhas.');
  const t = table_('Usuarios'), eu = t.rows.filter(function (x) { return String(x.Email).toLowerCase() === u.email; })[0];
  if (!eu || !safeEq_(hash_(eu.Salt, String(d.senhaAdmin || '')), eu.SenhaHash)) throw new ApiError('AUTH', 'Sua senha de administrador não confere.');
  const out = {}; t.rows.forEach(function (r) { out[String(r.Email).toLowerCase()] = pwDec_(r.SenhaVis, r.Salt); });
  audit_(u.email, 'SENHAS_VISTAS', String(t.rows.length), 'OK'); return { senhas: out };
}
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
  const cc = CacheService.getScriptCache(), raw = token && cc.get('s:' + token); if (!raw) throw new ApiError('SESSION', 'Sessão expirada. Entre novamente.');
  const s = JSON.parse(raw); if (s.v !== ver_(s.e)) throw new ApiError('SESSION', 'Sessão encerrada. Entre novamente.');
  /* A identificação (papel, célula, cargos) fica guardada por até 60 s e só vale enquanto as marcas de Usuarios, Membros, Celulas e Config forem as mesmas.
     Antes, TODA requisição lia essas abas inteiras (com as fotos) só para saber quem você é. Desativar alguém pelo app vale na hora (a marca muda). */
  const st = tvStamp_(['Usuarios', 'Membros', 'Celulas', 'Config']) + '|' + s.e; let hit = null; try { hit = cc.get('au:' + token); } catch (e) { hit = null; }
  if (hit) { try { const h = JSON.parse(hit); if (h && h.st === st && h.u) { h.u.token = token; return h.u; } } catch (e) { /* relê */ } }
  const u = table_('Usuarios').rows.filter(function (r) { return String(r.Email).toLowerCase() === s.e; })[0];
  if (!u || u.Status === 'Inativo') throw new ApiError('SESSION', 'Acesso desativado.');
  const m = table_('Membros').rows.filter(function (r) { return r.MembroID === u.MembroID; })[0] || {};
  const cg = cargos_(u.MembroID);
  const out = { email: s.e, papel: papelValido_(u.Papel) ? u.Papel : 'membro', membroId: u.MembroID, celulaId: m.CelulaID || '', lidera: cg.lidera, treina: cg.treina, supervisiona: cg.supervisiona, token: token };
  try { cc.put('au:' + token, JSON.stringify({ st: st, u: out }), 60); } catch (e) { /* ok */ }
  return out;
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
  const base = so(['plan', 'oracao', 'membros', 'perfilc', 'mural', 'org', 'quiz'], ['oracao']);
  const d = { supervisor: all(1, 1), lider: all(1, 1), treinamento: so(['freq', 'plan', 'oracao', 'ind', 'membros', 'pres', 'hist', 'mural', 'quiz'], ['freq', 'pres', 'oracao']), pastor: all(1, 1), professor: JSON.parse(JSON.stringify(base)), membro: base, frequentador: JSON.parse(JSON.stringify(base)) };
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
  const cg = { lider: u.lidera.length > 0, treinamento: u.treina.length > 0, supervisor: u.supervisiona.length > 0, respMin: minhasResp_(u.membroId).length > 0 };
  const nivelCel = !cel ? '' : (full || (cel.LiderID === u.membroId) ? 'lider' : cel.SupervisorID === u.membroId ? 'supervisor' : cel.TreinamentoID === u.membroId ? 'treinamento' : 'membro');
  const tef = tipoEf_(u), abas = abasPorTipo_()[tef] || {}, cp = cel ? (full ? allCelPerm_() : celPermMap_(u, cel)) : null;
  const urow = table_('Usuarios').rows.filter(function (r) { return String(r.Email).toLowerCase() === u.email; })[0] || {};
  return { multimidia: multiOk_(u), artes: { cria: artesCria_(u), aprova: artesAprova_(u) }, xp: xpResumo_(u.membroId), guiaVisto: urow.GuiaVisto !== '0', usuario: { email: u.email, papel: u.papel, tipo: tef }, abas: abas, permCelula: cp, membro: memberFull_(mm), celula: cel ? cellOut_(cel, nivelCel !== 'membro') : null, nivelCelula: nivelCel, cargos: cg, minhasCelulas: minhas, permissoes: permMatrix_()[tef], config: publicConfig_(), interesses: interessesDe_(u.membroId), membresia: membresiaDe_(u.membroId) };
}
function saveMember_(d, u) {
  return withLock_(function () {
    const g = getMember_(u.membroId), p = {}, src = d.membro || {};
    MEMBER_EDIT.forEach(function (k) { if (src[k] !== undefined) p[k] = k === 'Foto' ? fotoParaGravar_(src[k], g.m.Foto, u.membroId) : clip_(src[k], 200); });
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
function publicConfig_() { const c = cfgMap_(); return { sodXp: sodXpCfg_(), nomeIgreja: c.NomeIgreja, whatsapp: c.WhatsApp, localNome: c.LocalNome, localEndereco: c.LocalEndereco, linkMapa: c.LinkMapa || '', colunasExtras: jparse_(c.ColunasExtras, []), canalYoutube: c.CanalYoutube || '', lojaWhatsapp: c.LojaWhatsApp || '', frequentadorPct: Number(c.FrequentadorPct) || 70, frequentadorJanela: Number(c.FrequentadorJanela) || 8, celulasParaSupervisor: Math.max(0, Number(c.CelulasParaSupervisor) || 0), frequenciasParaMembro: freqMembro_(), presencasParticipante: presPart_(), faltasExParticipante: faltasEx_(), sodAtivo: c.SodAtivo !== '0', notifTipos: notifTipos_(c), homeLayout: homeLayoutOk_(jparse_(c.HomeLayout, null)), navCfg: navCfgOk_(jparse_(c.NavCfg, null)), mapa: mapaCfg_(c) }; }
function mapaCfg_(c) { c = c || cfgMap_(); const n = function (k, d) { const v = Number(c[k]); return isFinite(v) && c[k] !== '' && c[k] !== undefined ? v : d; }; return { vis: n('MapaVisitanteVezes', 1), freq: n('MapaFrequentadorVezes', 3), raio: n('MapaRaioKm', 10), longe: n('MapaLongeKm', 10), alerta: n('MapaAlertaPct', 50), sedeLat: c.SedeLat === '' || c.SedeLat === undefined ? null : Number(c.SedeLat), sedeLng: c.SedeLng === '' || c.SedeLng === undefined ? null : Number(c.SedeLng) }; }
const HOME_BLOCOS = ['hero', 'escalas', 'eventos', 'corrida', 'mural', 'proxevento', 'celula', 'aniv', 'domingo', 'cultos', 'testemunhos', 'feed', 'noticias']; // v1.100: o 'feed' faltava e era descartado ao salvar, voltando sempre para o meio da tela
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
/* v1.103: navegação do menu lateral definida pelo administrador {itens:[{id,on,nome}], subs:{secao:{guia:'hv'|'h'|'v'|'-'}}} */
const NAV_IDS = ['feed', 'meu', 'pessoas', 'membro', 'biblioteca', 'celula', 'familia', 'ministerios', 'buscar', 'cursos', 'aulas', 'eventos', 'multimidia', 'rostos', 'insignias', 'consolidacao', 'fichas', 'aniversarios', 'tutoriais', 'loja', 'aprovacoes', 'admin'];
function navCfgOk_(c) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.itens)) return null; const seen = {}, itens = [], subs = {};
  c.itens.slice(0, 40).forEach(function (x) { if (!x || NAV_IDS.indexOf(x.id) < 0 || seen[x.id]) return; seen[x.id] = 1; const it = { id: x.id, on: x.id === 'admin' ? true : x.on !== false }; const nm = String(x.nome || '').trim().slice(0, 30); if (nm) it.nome = nm; itens.push(it); });
  if (!itens.length) return null;
  const s = c.subs && typeof c.subs === 'object' ? c.subs : {};
  Object.keys(s).slice(0, 30).forEach(function (k) { if (NAV_IDS.indexOf(k) < 0 || !s[k] || typeof s[k] !== 'object') return; const o = {}; Object.keys(s[k]).slice(0, 30).forEach(function (g) { if (/^[a-z0-9_]{1,24}$/.test(g) && ['hv', 'h', 'v', '-'].indexOf(s[k][g]) >= 0) o[g] = s[k][g]; }); subs[k] = o; });
  const grupos = {}, g0 = c.grupos && typeof c.grupos === 'object' ? c.grupos : {};
  Object.keys(g0).slice(0, 30).forEach(function (k) {
    if (NAV_IDS.indexOf(k) < 0 || !Array.isArray(g0[k])) return; const vistos = {}, ids = {}, lista = [];
    g0[k].slice(0, 12).forEach(function (g) {
      if (!g || typeof g !== 'object') return; const id = String(g.id || ''); if (!/^[a-z0-9_]{1,12}$/.test(id) || ids[id]) return; ids[id] = 1;
      const modo = ['aberto', 'fechado', 'fixo'].indexOf(g.modo) >= 0 ? g.modo : 'aberto', it = [];
      (Array.isArray(g.itens) ? g.itens : []).slice(0, 30).forEach(function (x) { if (typeof x === 'string' && /^[a-z0-9_]{1,24}$/.test(x) && !vistos[x]) { vistos[x] = 1; it.push(x); } });
      lista.push({ id: id, nome: String(g.nome || '').trim().slice(0, 30) || 'Grupo', modo: modo, itens: it });
    }); grupos[k] = lista;
  });
  return { v: c.v === 2 ? 2 : undefined, itens: itens, subs: subs, grupos: grupos };
}
function saveNavConfig_(d, u) {
  return withLock_(function () {
    const cfg = d.reset ? null : navCfgOk_(d.cfg); if (!d.reset && !cfg) throw new ApiError('VALIDATION', 'Configuração de navegação inválida.');
    const t = table_('Config'), r = t.rows.filter(function (x) { return x.Chave === 'NavCfg'; })[0], v = cfg ? JSON.stringify(cfg) : '';
    if (r) writeRow_(t, r._row, { Valor: v }); else appendRow_(t, { Chave: 'NavCfg', Valor: v });
    audit_(u.email, 'NAV_CFG', cfg ? cfg.itens.length + ' itens' : 'padrão', 'OK'); return { ok: true, cfg: cfg };
  });
}
/* ===== v1.110 — Recuperação de senha pelo próprio usuário =====
   1) "Esqueci minha senha": código de 6 dígitos por e-mail (15 min, uso único, 5 tentativas) e nova senha.
   2) "Falar com meu pastor": avisa (notificação no app + e-mail) o responsável ligado ao usuário (supervisor da célula, depois líder, depois pastor/admin),
      que gera uma senha temporária pelo app. As respostas públicas nunca revelam se o e-mail existe. */
function autorizarEnvioEmail() { Logger.log('Cota diária de e-mails: ' + MailApp.getRemainingDailyQuota()); return MailApp.getRemainingDailyQuota(); }
function rnd_(n, chars) {
  let out = '';
  while (out.length < n) { const h = Utilities.getUuid().replace(/-/g, ''); for (let i = 0; i < h.length - 1 && out.length < n; i += 2) { if (i === 12 || i === 16) continue; const b = parseInt(h.substr(i, 2), 16); if (b < 256 - (256 % chars.length)) out += chars.charAt(b % chars.length); } }
  return out;
}
function nomeIgreja_() { try { return cfgMap_().NomeIgreja || 'Ministério Zoe'; } catch (e) { return 'Ministério Zoe'; } }
function emailSeguro_(to, assunto, corpo) { try { MailApp.sendEmail({ to: to, subject: assunto, body: corpo, name: nomeIgreja_() }); return true; } catch (e) { audit_(to, 'EMAIL_FALHA', assunto, 'FALHA'); return false; } }
function usuarioPorEmail_(email) { const t = table_('Usuarios'); const u = t.rows.filter(function (r) { return String(r.Email).toLowerCase() === email; })[0]; return u && u.Status !== 'Inativo' ? { t: t, u: u } : null; }
function limiteSenha_(chave, max, seg) { const cc = CacheService.getScriptCache(), n = Number(cc.get(chave) || 0); if (n >= max) return false; cc.put(chave, String(n + 1), seg); return true; }
function gravaSenha_(t, u, nova, trocar) { const salt = Utilities.getUuid(); writeRow_(ensureCols_('Usuarios', ['SenhaVis']), u._row, { Salt: salt, SenhaHash: hash_(salt, nova), SenhaVis: pwEnc_(nova, salt), TrocarSenha: trocar ? '1' : '' }); bumpVer_(String(u.Email).toLowerCase()); }
/* Mensagens dos e-mails de recuperação: o administrador pode personalizar. Variáveis: {nome} {igreja} {codigo} (só no e-mail do código) */
const EMAIL_SENHA_PAD = {
  a: 'Seu código para criar uma nova senha',
  c: 'Olá, {nome}!\n\nSeu código para criar uma nova senha no app do {igreja} é:\n\n    {codigo}\n\nEle vale por 15 minutos e só pode ser usado uma vez. Se você não pediu, ignore este e-mail: sua senha continua a mesma.\n\nQue Deus abençoe!',
  pa: 'Pedido de nova senha: {nome}',
  pc: 'Paz do Senhor!\n\n{nome} pediu ajuda para recuperar o acesso ao app do {igreja}.\n\nEntre no app, abra o sino de notificações e toque no pedido para gerar uma senha temporária. Depois é só enviar a senha para a pessoa.\n\nQue Deus abençoe!'
};
function emailSenhaCfg_() { const o = jparse_(cfgMap_().EmailSenha, {}), r = {}; Object.keys(EMAIL_SENHA_PAD).forEach(function (k) { r[k] = typeof o[k] === 'string' && o[k].trim() ? o[k] : EMAIL_SENHA_PAD[k]; }); return r; }
function tplEmail_(txt, v) { return String(txt).replace(/\{(nome|igreja|codigo)\}/g, function (m, k) { return v[k] === undefined ? m : v[k]; }); }
function getEmailSenha_() { return { cfg: emailSenhaCfg_(), padrao: EMAIL_SENHA_PAD }; }
function saveEmailSenha_(d, u) {
  return withLock_(function () {
    let v = '';
    if (!d.reset) {
      const o = {}; ['a', 'c', 'pa', 'pc'].forEach(function (k) { o[k] = String((d.cfg || {})[k] || '').replace(/\r/g, '').trim().slice(0, k === 'a' || k === 'pa' ? 120 : 2000); if (!o[k]) throw new ApiError('VALIDATION', 'Preencha o assunto e a mensagem dos dois e-mails (ou use “Restaurar padrão”).'); });
      if (o.c.indexOf('{codigo}') < 0) throw new ApiError('VALIDATION', 'A mensagem do código precisa ter a palavra {codigo} no texto, senão a pessoa não recebe o código.');
      v = JSON.stringify(o);
    }
    const t = table_('Config'), r = t.rows.filter(function (x) { return x.Chave === 'EmailSenha'; })[0];
    if (r) writeRow_(t, r._row, { Valor: v }); else appendRow_(t, { Chave: 'EmailSenha', Valor: v });
    audit_(u.email, 'EMAIL_SENHA_CFG', d.reset ? 'padrão' : 'personalizado', 'OK'); return getEmailSenha_();
  });
}
function testEmailSenha_(d, u) {
  const c = emailSenhaCfg_(), v = { nome: 'Maria', igreja: nomeIgreja_(), codigo: '123456' }, ok1 = emailSeguro_(u.email, '[TESTE] ' + tplEmail_(c.a, v), tplEmail_(c.c, v)), ok2 = emailSeguro_(u.email, '[TESTE] ' + tplEmail_(c.pa, v), tplEmail_(c.pc, v));
  if (!ok1 || !ok2) throw new ApiError('BAD_REQUEST', 'Não foi possível enviar. Rode autorizarEnvioEmail() no editor do Apps Script e tente de novo.'); return { ok: true, para: u.email };
}
function pwdForgot_(d) {
  const email = clip_(d.email, 120).toLowerCase(), resp = { ok: true };
  if (!email || email.indexOf('@') < 1) return resp;
  if (!limiteSenha_('prq:' + email, 3, 900)) return resp;
  const f = usuarioPorEmail_(email); if (!f) { audit_(email, 'SENHA_ESQUECI', '', 'DESCONHECIDO'); return resp; }
  const codigo = rnd_(6, '0123456789'), salt = Utilities.getUuid();
  CacheService.getScriptCache().put('pr:' + email, JSON.stringify({ h: hash_(salt, codigo), s: salt, n: 0 }), 900);
  const mm = table_('Membros').rows.filter(function (r) { return r.MembroID === f.u.MembroID; })[0] || {}, c = emailSenhaCfg_(), v = { nome: mm.Apelido || mm.Simples || String(mm.Nome || '').split(' ')[0] || 'irmão(ã)', igreja: nomeIgreja_(), codigo: codigo };
  const ok = emailSeguro_(email, tplEmail_(c.a, v), tplEmail_(c.c, v));
  audit_(email, 'SENHA_ESQUECI', '', ok ? 'OK' : 'FALHA'); return resp;
}
function pwdReset_(d) {
  const email = clip_(d.email, 120).toLowerCase(), codigo = String(d.codigo || '').replace(/\D/g, ''), nova = String(d.nova || ''), erro = new ApiError('AUTH', 'Código inválido ou expirado. Peça um novo código.');
  if (nova.length < 8 || nova.length > 200) throw new ApiError('VALIDATION', 'A nova senha precisa ter 8+ caracteres.');
  const cc = CacheService.getScriptCache(), raw = email && cc.get('pr:' + email); if (!raw) throw erro;
  const r = JSON.parse(raw); if (r.n >= 5) { cc.remove('pr:' + email); throw erro; }
  if (!codigo || !safeEq_(hash_(r.s, codigo), r.h)) { r.n++; cc.put('pr:' + email, JSON.stringify(r), 900); audit_(email, 'SENHA_CODIGO', '', 'FALHA'); throw erro; }
  return withLock_(function () {
    const f = usuarioPorEmail_(email); if (!f) throw erro;
    gravaSenha_(f.t, f.u, nova, false); cc.remove('pr:' + email); cc.remove('f:' + email); audit_(email, 'SENHA_REDEFINIDA', 'por código', 'OK');
    return { ok: true };
  });
}
/* quem ajuda o usuário a recuperar o acesso: supervisor da célula, líder, (se for líder) o supervisor da célula que lidera, depois pastor e admin */
function responsavelSenha_(mid) {
  const us = table_('Usuarios').rows.filter(function (x) { return x.Status !== 'Inativo' && x.MembroID; }), cels = table_('Celulas').rows.filter(function (c) { return c.Status !== 'Inativa'; });
  const m = table_('Membros').rows.filter(function (r) { return r.MembroID === mid; })[0] || {}, cand = [];
  const c = cels.filter(function (x) { return x.CelulaID === m.CelulaID; })[0]; if (c) { cand.push(c.SupervisorID, c.LiderID); }
  cels.forEach(function (x) { if (x.LiderID === mid) cand.push(x.SupervisorID); });
  for (let i = 0; i < cand.length; i++) { if (!cand[i] || cand[i] === mid) continue; const u = us.filter(function (x) { return x.MembroID === cand[i]; })[0]; if (u) return u; }
  const por = function (papel) { return us.filter(function (x) { return x.Papel === papel && x.MembroID !== mid; })[0]; };
  return por('pastor') || por('admin') || null;
}
function pwdHelp_(d) {
  const email = clip_(d.email, 120).toLowerCase(), resp = { ok: true };
  if (!email || email.indexOf('@') < 1) return resp;
  if (!limiteSenha_('prh:' + email, 1, 3600)) return resp;
  const f = usuarioPorEmail_(email); if (!f || !f.u.MembroID) { audit_(email, 'SENHA_AJUDA', '', 'DESCONHECIDO'); return resp; }
  const mem = table_('Membros').rows.filter(function (r) { return r.MembroID === f.u.MembroID; })[0] || {}, nome = mem.Apelido || mem.Simples || mem.Nome || email, resp_ = responsavelSenha_(f.u.MembroID);
  if (!resp_) { audit_(email, 'SENHA_AJUDA', '', 'SEM_RESPONSAVEL'); return resp; }
  const txt = nome + ' pediu ajuda para recuperar o acesso. Abra para gerar uma senha temporária e envie a ela(e).';
  withLock_(function () { notify_(resp_.MembroID, 'senha_ajuda', 'Pedido de nova senha: ' + nome, txt, 'senha:' + f.u.MembroID); });
  const c = emailSenhaCfg_(), v = { nome: nome, igreja: nomeIgreja_() }; emailSeguro_(String(resp_.Email), tplEmail_(c.pa, v), tplEmail_(c.pc, v));
  audit_(email, 'SENHA_AJUDA', 'avisou ' + resp_.Email, 'OK'); return resp;
}
function pwdHelpReset_(d, u) {
  const mid = clip_(d.membroId, 30); if (!mid) throw new ApiError('VALIDATION', 'Pessoa inválida.'); if (mid === u.membroId) throw new ApiError('FORBIDDEN', 'Peça a outra pessoa para redefinir a sua senha.');
  const alvo = table_('Usuarios').rows.filter(function (x) { return x.MembroID === mid && x.Status !== 'Inativo'; })[0]; if (!alvo) throw new ApiError('NOT_FOUND', 'Usuário não encontrado ou inativo.');
  const resp = responsavelSenha_(mid); if (!can_(u, 'config') && !(resp && resp.MembroID === u.membroId)) throw new ApiError('FORBIDDEN', 'Você não é o responsável por esta pessoa.');
  return withLock_(function () {
    const t = table_('Usuarios'), r = t.rows.filter(function (x) { return x.Email === alvo.Email; })[0], nova = rnd_(10, 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789');
    gravaSenha_(t, r, nova, true); CacheService.getScriptCache().remove('f:' + String(alvo.Email).toLowerCase()); audit_(u.email, 'SENHA_TEMPORARIA', String(alvo.Email), 'OK');
    const m = table_('Membros').rows.filter(function (x) { return x.MembroID === mid; })[0] || {};
    return { senha: nova, nome: m.Apelido || m.Simples || m.Nome || '', telefone: String(m.Telefone || '').replace(/\D/g, '') };
  });
}
const NOTIF_CATS = ['aniv', 'celula', 'eventos', 'oracao', 'cursos', 'transf', 'escala'];
function notifTipos_(c) { const o = jparse_((c || cfgMap_()).NotifTipos, {}), r = {}; NOTIF_CATS.forEach(function (k) { r[k] = o[k] !== false; }); return r; }
function saveConfig_(d, u) {
  return withLock_(function () {
    const t = table_('Config'), allow = { NomeIgreja: 120, WhatsApp: 20, LojaWhatsApp: 20, LocalNome: 120, LocalEndereco: 250, LinkMapa: 300 };
    [['FrequentadorPct', 1, 100, 'O limite de presença precisa estar entre 1 e 100.'], ['FrequentadorJanela', 1, 52, 'Informe de 1 a 52 reuniões.'], ['CelulasParaSupervisor', 0, 50, 'Informe de 0 a 50 células.'], ['PresencasParaParticipante', 1, 50, 'Informe de 1 a 50 presenças.'], ['FaltasParaExParticipante', 1, 50, 'Informe de 1 a 50 faltas seguidas.'], ['CelulaMultiplicarAcima', 2, 200, 'Informe de 2 a 200 pessoas.']].forEach(function (q) {
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
function cellMembers_(d, u) {
  const id = cellOfAny_(u, d, ['membros', 'freq', 'pres', 'papeis']), P = presPart_(), qt = {}; table_('Presencas').rows.forEach(function (p) { if (p.CelulaID === id) qt[p.MembroID] = (qt[p.MembroID] || 0) + 1; });
  return table_('Membros').rows.filter(function (m) { return m.CelulaID === id && m.Status !== 'Inativo'; }).map(function (m) { const o = memberPub_(m); o.pres = qt[m.MembroID] || 0; o.cat = catParticipante_(m, o.pres, P); return o; });
}
/* faltas seguidas: o participante que falta às últimas N reuniões (em que já fazia parte da célula) sai sozinho para ex-participantes; quem lidera a célula nunca sai por aqui */
function exAutomatico_(id) {
  const F = faltasEx_(), P = presPart_(), cel = table_('Celulas').rows.filter(function (c) { return c.CelulaID === id; })[0] || {}, donos = [cel.LiderID, cel.SupervisorID, cel.TreinamentoID];
  const reun = table_('Reunioes').rows.filter(function (r) { return r.CelulaID === id; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }); if (reun.length < F) return [];
  const pset = {}, tot = {}; table_('Presencas').rows.forEach(function (p) { if (p.CelulaID === id) { pset[p.Data + '|' + p.MembroID] = 1; tot[p.MembroID] = (tot[p.MembroID] || 0) + 1; } });
  const saiu = [], mt = table_('Membros'), st = table_('Saidas');
  ativosDaCelula_(id).forEach(function (m) {
    if (donos.indexOf(m.MembroID) >= 0 || (tot[m.MembroID] || 0) < P) return;
    let f = 0; for (let i = 0; i < reun.length; i++) { const el = reun[i].Elenco ? String(reun[i].Elenco).split(',') : null; if (pset[reun[i].Data + '|' + m.MembroID] || (el && el.indexOf(m.MembroID) < 0)) break; f++; }
    if (f < F) return;
    appendRow_(st, { SaidaID: id_('S'), MembroID: m.MembroID, CelulaID: id, Motivo: 'Automático: ' + f + ' faltas seguidas', SolicitadoPor: 'sistema', Status: 'autorizado', DecididoPor: 'sistema', Data: now_(), DataDecisao: now_() });
    writeRow_(mt, m._row, { CelulaID: '', Status: 'Inativo', DataSaida: today_() }); audit_('sistema', 'EX_PARTICIPANTE_AUTO', m.MembroID + ' ' + id, 'OK'); saiu.push(m);
  });
  saiu.forEach(function (m) { [cel.LiderID, cel.SupervisorID].forEach(function (x) { if (x) notify_(x, 'celula', 'Ex-participante', (m.Apelido || m.Nome) + ' passou para ex-participantes da célula por faltar às últimas ' + F + ' reuniões.', 'celula:' + id); }); });
  return saiu;
}
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
    o.supId = c.SupervisorID || ''; o.supCor = supCores_()[c.SupervisorID] || ''; o.local = c.PrivEnd === '1' ? [c.Endereco, c.Bairro, c.Cidade, c.UF].filter(String).join(', ') : [c.Bairro, c.Cidade, c.UF].filter(String).join(', '); return o;
  });
}
const SEMANA_ = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
function termo_(r) { return r.Termometro !== '' && r.Termometro !== undefined ? Math.max(0, Math.min(100, Number(r.Termometro) || 0)) : (r.PresencaDeDeus === '1' ? 80 : 0); }
// abas novas: se o setup() ainda não rodou, criam-se sozinhas
function lazy_(name) { try { return table_(name); } catch (e) { if (e.code !== 'SETUP') throw e; ensureSheet_(ss_(), name, SHEETS[name]); return table_(name); } }
// presença de Deus da reunião = média da nota do líder com os votos de cada pessoa; quem não votou não entra na conta
function votosMapa_() { const m = {}; lazy_('VotosDeus').rows.forEach(function (v) { const k = v.CelulaID + '|' + v.Data; (m[k] = m[k] || []).push(Math.max(0, Math.min(100, Number(v.Valor) || 0))); }); return m; }
function termMedia_(r, vm) { const lid = termo_(r), vs = (vm && vm[r.CelulaID + '|' + r.Data]) || []; return { media: Math.round((lid + vs.reduce(function (a, x) { return a + x; }, 0)) / (1 + vs.length)), lider: lid, votos: vs.length }; }
function diaDe_(data) { const p = data.split('-'); return SEMANA_[new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay()]; }
function diaIgual_(a, b) { return norm_(String(a || '')).slice(0, 3) === norm_(String(b || '')).slice(0, 3); }
function ativosDaCelula_(id) { return table_('Membros').rows.filter(function (m) { return m.CelulaID === id && m.Status !== 'Inativo'; }); }
function saveAttendance_(d, u) {
  return withLock_(function () {
    const id = cellOf_(u, d, 'presenca', 'freq', 'editar'), data = clip_(d.data, 10) || today_(); if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ApiError('VALIDATION', 'Data inválida.');
    if (data > today_()) throw new ApiError('VALIDATION', 'Não é possível lançar frequência de uma data futura.');
    const cel = table_('Celulas').rows.filter(function (c) { return c.CelulaID === id; })[0] || {}, dia = diaDe_(data), fora = !!cel.Dia && !diaIgual_(cel.Dia, dia);
    if (fora && !d.confirmaDia) throw new ApiError('DIA_DIFERENTE', 'A célula acontece na ' + cel.Dia + ', mas a data escolhida cai em ' + dia + '. Confirme se a reunião foi mesmo nesse dia ou corrija a data.');
    // lição ministrada: uma das lições criadas ou, se não estiver nelas, um breve resumo (obrigatório para quem usa a versão nova do app)
    let licao = { id: '', titulo: '', resumo: '' }; const quer = d.licaoId !== undefined || d.licaoResumo !== undefined;
    if (quer) {
      const lid = clip_(d.licaoId, 30), lc = lid ? table_('Licoes').rows.filter(function (l) { return l.LicaoID === lid && l.Status !== 'Removida'; })[0] : null;
      if (lc) licao = { id: lc.LicaoID, titulo: clip_(lc.Titulo, 120), resumo: '' };
      else { const rs = clip_(d.licaoResumo, 600).trim(); if (rs.length < 10) throw new ApiError('VALIDATION', 'Escolha a lição que foi ministrada ou escreva um breve resumo do que você ministrou (mínimo de 10 letras).'); licao = { id: '', titulo: '', resumo: rs }; }
    }
    const mem = ativosDaCelula_(id).map(function (m) { return m.MembroID; });
    const pres = (d.presentes || []).filter(function (x) { return mem.indexOf(x) >= 0; });
    const pt = table_('Presencas'); for (let i = pt.rows.length - 1; i >= 0; i--) if (pt.rows[i].CelulaID === id && pt.rows[i].Data === data) delRow_(pt, pt.rows[i]._row);
    ensureCols_('Reunioes', ['LicaoID', 'LicaoTitulo', 'LicaoResumo', 'Papeis']); const rt = table_('Reunioes'), ex = rt.rows.filter(function (r) { return r.CelulaID === id && r.Data === data; })[0], rid = ex ? ex.ReuniaoID : id_('R');
    const elenco = (ex && ex.Elenco) ? String(ex.Elenco).split(',').filter(String) : mem.slice(); pres.forEach(function (m) { if (elenco.indexOf(m) < 0) elenco.push(m); });
    // Termômetro da presença de Deus: 0 (frio) a 100 (forte manifestação). "PresencaDeDeus" continua marcado a partir de 50 para os indicadores antigos.
    let term = d.termometro !== undefined && d.termometro !== '' ? Math.round(Number(d.termometro)) : (d.deus ? 80 : 0); if (!isFinite(term)) throw new ApiError('VALIDATION', 'Termômetro inválido.'); term = Math.max(0, Math.min(100, term));
    const patch = { Presentes: String(pres.length), PresencaDeDeus: term >= 50 ? '1' : '0', Termometro: String(term), Obs: clip_(d.obs, 500), ForaDoDia: fora ? '1' : '0', Elenco: elenco.join(','), Foto: d.foto !== undefined ? fotoOk_(d.foto) : (ex ? ex.Foto || '' : '') };
    if (quer) { patch.LicaoID = licao.id; patch.LicaoTitulo = licao.titulo; patch.LicaoResumo = licao.resumo; }
    // quem estava responsável por cada papel nesta reunião (a foto dos papéis do dia; não muda se a reunião for editada depois)
    if (!ex || !ex.Papeis) patch.Papeis = JSON.stringify(table_('Papeis').rows.filter(function (r) { return r.CelulaID === id; }).map(function (r) { return { m: r.MembroID, p: r.Papel }; }));
    if (ex) writeRow_(rt, ex._row, patch); else appendRow_(rt, Object.assign({ ReuniaoID: rid, CelulaID: id, Data: data }, patch));
    const pt2 = table_('Presencas'); pres.forEach(function (m) { appendRow_(pt2, { ReuniaoID: rid, CelulaID: id, Data: data, MembroID: m }); awardXp_(m, 'celula:' + id + ':' + data, 10, 'Presença na célula'); });
    membresiaCheck_(id, pres); exAutomatico_(id); const novas = [];
    if (quer) { try { quizAgenda_(id, rid, data, licao); } catch (eq) { console.error(eq && eq.stack || eq); } }
    // visitantes da reunião: membro de outra célula (só visita, não muda de célula) ou pessoa nova (pré-cadastro)
    const pv = lazy_('PresVisitas'); for (let i = pv.rows.length - 1; i >= 0; i--) if (pv.rows[i].CelulaID === id && pv.rows[i].Data === data) delRow_(pv, pv.rows[i]._row);
    const mt2 = table_('Membros'), vt = table_('Visitantes'), pv2 = lazy_('PresVisitas'), vistos = {}; let nVis = 0;
    (Array.isArray(d.visitas) ? d.visitas : []).slice(0, 30).forEach(function (x) {
      const mid = clip_(x && x.membroId, 30);
      if (mid) { const m = mt2.rows.filter(function (r) { return r.MembroID === mid; })[0]; if (!m || m.CelulaID === id || vistos[mid]) return; vistos[mid] = 1;
        appendRow_(pv2, { PVID: id_('PV'), ReuniaoID: rid, CelulaID: id, Data: data, MembroID: mid, Nome: m.Apelido || m.Simples || m.Nome, DeCelulaID: m.CelulaID || '', Tipo: 'membro' }); nVis++; return; }
      const nome = clip_(x && x.nome, 80); if (nome.length < 2 || vistos['n' + norm_(nome)]) return; vistos['n' + norm_(nome)] = 1;
      let v = vt.rows.filter(function (r) { return r.CelulaID === id && norm_(r.Nome) === norm_(nome); })[0], vid = v ? v.VisitanteID : '';
      if (!v) { vid = id_('V'); const ap = nome.split(' ')[0]; appendRow_(vt, { VisitanteID: vid, Nome: nome, Apelido: ap, Telefone: clip_(x.telefone, 25), Data: data, RegistradoPor: u.membroId, CelulaID: id, CelulaProximaID: id, LiderID: cel.LiderID || '', Status: 'encaminhado', EncaminhadoEm: now_(), Contatado: '0', Decisao: '0', Msg: msgPadrao_(ap), Obs: 'Pré-cadastro feito na chamada da célula ' + (cel.Nome || '') + ' em ' + data + '. Completa os dados ao entrar no app.' }); vt.rows.push({ VisitanteID: vid, CelulaID: id, Nome: nome }); }
      appendRow_(pv2, { PVID: id_('PV'), ReuniaoID: rid, CelulaID: id, Data: data, VisitanteID: vid, Nome: nome, Tipo: 'novo' }); nVis++;
    });
    // a foto da chamada vai sozinha para o mural da célula (uma por reunião)
    if (d.foto && patch.Foto) { const mc = lazy_('MuralCelula'), key = 'MF' + rid, exm = mc.rows.filter(function (r) { return r.ItemID === key; })[0];
      if (exm) writeRow_(mc, exm._row, { Foto: patch.Foto }); else if (mc.rows.filter(function (r) { return r.CelulaID === id; }).length < MURAL_MAX_) appendRow_(mc, { ItemID: key, CelulaID: id, Tipo: 'p', X: String(30 + Math.floor(Math.random() * 150)), Y: String(20 + Math.floor(Math.random() * 120)), W: '170', R: String(Math.floor(Math.random() * 9) - 4), Z: '0', Legenda: 'Célula ' + data.split('-').reverse().slice(0, 2).join('/'), Cor: '#1E9E5A', Foto: patch.Foto, AutorID: u.membroId, CriadoEm: now_() }); }
    // avisa quem estava presente para dar a sua nota da presença de Deus
    pres.forEach(function (m) { if (m !== u.membroId) notify_(m, 'celula', 'Como foi a presença de Deus?', 'Dê a sua nota para a célula de ' + data.split('-').reverse().join('/') + ' no app (Célula).', 'voto:' + id + ':' + data); });
    (Array.isArray(d.decisoes) ? d.decisoes : []).slice(0, 10).forEach(function (x) { try { const r = decisaoCore_({ membroId: clip_(x.membroId, 30), nome: x.nome, telefone: x.telefone, data: data, origem: 'celula', celulaId: id, termometro: term, foto: patch.Foto }, u); novas.push(r.nome); } catch (e) { if (!(e instanceof ApiError) || e.code !== 'DUPLICATE') throw e; } });
    pres.forEach(function (m) { avaliaDefs_(m); });
    audit_(u.email, 'FREQUENCIA', id + ' ' + data + (fora ? ' (fora do dia)' : ''), 'OK'); return { reuniaoId: rid, presentes: pres.length, total: mem.length, foraDoDia: fora, atualizada: !!ex, decisoes: novas, visitantes: nVis };
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
  const vm = votosMapa_(), visPor = {}; lazy_('PresVisitas').rows.forEach(function (x) { if (x.CelulaID === id) (visPor[x.Data] = visPor[x.Data] || []).push({ nome: x.Nome || nome[x.MembroID] || '?', de: x.Tipo === 'membro' ? (cn_()[x.DeCelulaID] || 'sem célula') : '', novo: x.Tipo === 'novo' }); });
  const lista = l.map(function (r) {
    const ids = pres[r.Data] || [], tm = termMedia_(r, vm), el = elencoDe(r, ids), aus = el.filter(function (m) { return ids.indexOf(m) < 0; }).map(function (m) { return nome[m] || '?'; });
    return { data: r.Data, dia: r.Data ? diaDe_(r.Data) : '', presentes: ids.length, total: Math.max(1, el.length), deus: tm.media >= 50, termometro: tm.media, termLider: tm.lider, votos: tm.votos, visitantes: visPor[r.Data] || [], obs: r.Obs || '', foraDoDia: r.ForaDoDia === '1', licao: r.LicaoTitulo || '', licaoOutra: r.LicaoResumo || '', papeis: jparse_(r.Papeis, []).map(function (x) { return { nome: nome[x.m] || '?', papel: x.p }; }), nomesPresentes: ids.map(function (i) { return nome[i] || '?'; }), nomesAusentes: aus };
  });
  const media = lista.length ? Math.round(lista.reduce(function (a, r) { return a + Math.min(1, r.presentes / r.total); }, 0) / lista.length * 100) : 0;
  return { reunioes: lista, indicadores: { participantes: total, exParticipantes: saidas.length, exNomes: saidas.map(function (x) { return { nome: nome[x.MembroID] || '?', data: x.DataDecisao, motivo: x.Motivo }; }), reunioes: l.length, presencaDeDeus: lista.filter(function (r) { return r.deus; }).length, mediaPresenca: media } };
}
function indicators_(d, u) {
  const id = cellOf_(u, d, 'ver', 'ind', 'ver'), mem = table_('Membros').rows.filter(function (m) { return m.CelulaID === id; }), ids = {}; mem.forEach(function (m) { ids[m.MembroID] = m.Apelido || m.Simples || m.Nome; });
  const cursos = {}; table_('Cursos').rows.forEach(function (c) { cursos[c.CursoID] = c.Nome; });
  const ev = {}; table_('Eventos').rows.forEach(function (e) { ev[e.EventoID] = e.Titulo; });
  const byC = {}, byE = {};
  table_('Matriculas').rows.forEach(function (r) { if (ids[r.MembroID] && cursos[r.CursoID]) (byC[cursos[r.CursoID]] = byC[cursos[r.CursoID]] || []).push(ids[r.MembroID]); });
  table_('Inscricoes').rows.forEach(function (r) { if (ids[r.MembroID] && ev[r.EventoID]) (byE[ev[r.EventoID]] = byE[ev[r.EventoID]] || []).push(ids[r.MembroID]); });
  const rs = table_('Reunioes').rows.filter(function (r) { return r.CelulaID === id; }).sort(function (a, b) { return a.Data < b.Data ? -1 : 1; }), vm2 = votosMapa_(), serie = rs.slice(-8).map(function (r) { return { data: r.Data, valor: termMedia_(r, vm2).media }; });
  return { cursos: byC, eventos: byE, termometro: { media: rs.length ? Math.round(rs.reduce(function (a, r) { return a + termMedia_(r, vm2).media; }, 0) / rs.length) : null, serie: serie } };
}
function getPapeis_(d, u) { const id = cellOf_(u, d, 'ver', 'papeis', 'ver'); return table_('Papeis').rows.filter(function (r) { return r.CelulaID === id; }).map(function (r) { return { membroId: r.MembroID, papel: r.Papel }; }); }
function savePapeis_(d, u) {
  return withLock_(function () {
    const id = cellOf_(u, d, 'gerir', 'papeis', 'editar'), t = table_('Papeis'), antes = {}, depois = {};
    t.rows.forEach(function (r) { if (r.CelulaID === id) antes[r.MembroID + '|' + r.Papel] = { m: r.MembroID, p: r.Papel }; });
    for (let i = t.rows.length - 1; i >= 0; i--) if (t.rows[i].CelulaID === id) delRow_(t, t.rows[i]._row);
    const mem = table_('Membros').rows.filter(function (m) { return m.CelulaID === id; }).map(function (m) { return m.MembroID; }), t2 = table_('Papeis');
    (d.itens || []).slice(0, 200).forEach(function (x) { if (mem.indexOf(x.membroId) >= 0) { const p = clip_(x.papel, 60); appendRow_(t2, { CelulaID: id, MembroID: x.membroId, Papel: p }); depois[x.membroId + '|' + p] = { m: x.membroId, p: p }; } });
    // histórico: quem passou a ter e quem deixou de ter cada papel, por quem e quando
    const lg = lazy_('PapeisLog'), reg = function (o, acao) { appendRow_(lg, { LogID: id_('PL'), CelulaID: id, MembroID: o.m, Papel: o.p, Acao: acao, Por: u.membroId, Data: now_() }); };
    Object.keys(depois).forEach(function (k) { if (!antes[k]) reg(depois[k], 'atribuido'); }); Object.keys(antes).forEach(function (k) { if (!depois[k]) reg(antes[k], 'removido'); });
    return { ok: true };
  });
}
function papeisLog_(d, u) {
  const id = cellOf_(u, d, 'ver', 'papeis', 'ver'), nm = nomes_();
  return lazy_('PapeisLog').rows.filter(function (r) { return r.CelulaID === id; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 200).map(function (r) { return { data: r.Data, membro: nm[r.MembroID] || '?', papel: r.Papel, acao: r.Acao, por: nm[r.Por] || '' }; });
}

function addPrayer_(d, u) {
  const texto = clip_(d.texto, 1000); if (!texto) throw new ApiError('VALIDATION', 'Escreva o pedido de oração.');
  const id = prayerCell_(u, d, 'editar'); if (!id) throw new ApiError('VALIDATION', 'Você ainda não está em uma célula.');
  appendRow_(table_('Oracoes'), { OracaoID: id_('O'), CelulaID: id, MembroID: u.membroId, Tema: clip_(d.tema, 80), Titulo: clip_(d.titulo, 100), Texto: texto, Data: now_() }); return { ok: true };
}
function prayerCell_(u, d, acao) { const id = clip_(d.celulaId, 30) || u.celulaId || celulaAtiva_(u); if (id) cellAccess_(u, id, 'ver', 'oracao', acao || 'ver'); return id; }
function listPrayers_(d, u) { const id = prayerCell_(u, d); if (!id) return []; return table_('Oracoes').rows.filter(function (o) { return o.CelulaID === id; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 50).map(function (o) { return { tema: o.Tema, titulo: o.Titulo, texto: o.Texto, data: o.Data }; }); }
/* ===== Painel de células (Administração › Células): visão geral, indicador de multiplicação, multiplicar, supervisão ===== */
// Quantas pessoas (sem contar líder e líder em treinamento) a célula comporta antes de pedir multiplicação. É só um indicador: nunca bloqueia.
function multLimite_() { return cfgInt_('CelulaMultiplicarAcima', 10, 2, 200); }
function superiorDe_() { const o = {}; lazy_('Supervisao').rows.forEach(function (r) { if (r.MembroID && r.SuperiorID) o[r.MembroID] = r.SuperiorID; }); return o; }
function celPainel_() {
  const nome = {}; table_('Membros').rows.forEach(function (m) { nome[m.MembroID] = m.Apelido || m.Simples || m.Nome; });
  const lim = multLimite_(), sup = superiorDe_(), por = {}; table_('Membros').rows.forEach(function (m) { if (m.CelulaID && m.Status !== 'Inativo') (por[m.CelulaID] = por[m.CelulaID] || []).push(m.MembroID); });
  const cs = table_('Celulas').rows.filter(function (c) { return c.Status !== 'Inativa'; }), mae = {}; cs.forEach(function (c) { mae[c.CelulaID] = c.Nome; });
  const celulas = cs.map(function (c) {
    const ids = por[c.CelulaID] || [], cont = ids.filter(function (m) { return m !== c.LiderID && m !== c.TreinamentoID; }).length;
    return { id: c.CelulaID, nome: c.Nome, dia: c.Dia || '', inicio: c.Inicio || '', liderId: c.LiderID || '', lider: nome[c.LiderID] || '', treinamentoId: c.TreinamentoID || '', treinamento: nome[c.TreinamentoID] || '', supervisorId: c.SupervisorID || '', supervisor: nome[c.SupervisorID] || '', superiorId: sup[c.SupervisorID] || '', superior: nome[sup[c.SupervisorID]] || '', total: ids.length, contaveis: cont, precisa: cont >= lim, maeId: c.MaeID || '', mae: mae[c.MaeID] || '', membros: ids.map(function (m) { return { id: m, nome: nome[m] || '?', cargo: m === c.LiderID ? 'lider' : m === c.TreinamentoID ? 'treinamento' : '' }; }) };
  }).sort(function (a, b) { return (b.precisa - a.precisa) || (a.nome < b.nome ? -1 : 1); });
  const sups = {}; celulas.forEach(function (c) { if (c.supervisorId) sups[c.supervisorId] = (sups[c.supervisorId] || 0) + 1; }); Object.keys(sup).forEach(function (k) { if (!sups[k]) sups[k] = 0; });
  const pessoas = table_('Usuarios').rows.filter(function (x) { return x.Status !== 'Inativo' && x.MembroID; }).map(function (x) { return { id: x.MembroID, nome: nome[x.MembroID] || x.Email }; }).sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
  return { limite: lim, celulas: celulas, pessoas: pessoas, resumo: { total: celulas.length, precisam: celulas.filter(function (c) { return c.precisa; }).length, pessoas: celulas.reduce(function (a, c) { return a + c.total; }, 0) },
    supervisores: Object.keys(sups).map(function (k) { return { id: k, nome: nome[k] || '?', celulas: sups[k], superiorId: sup[k] || '', superior: nome[sup[k]] || '' }; }).sort(function (a, b) { return a.nome < b.nome ? -1 : 1; }) };
}
// Define a quem um supervisor responde (supervisor geral). Vazio remove. Não aceita laços (A acima de B acima de A).
function setSuperior_(d) {
  const mid = clip_(d.membroId, 30), sup = clip_(d.superiorId, 30); getMember_(mid); if (sup) getMember_(sup);
  if (sup && sup === mid) throw new ApiError('VALIDATION', 'Ninguém pode ser o próprio supervisor geral.');
  return withLock_(function () {
    const t = lazy_('Supervisao'), m = superiorDe_(); let k = sup, n = 0; while (k && n < 60) { if (k === mid) throw new ApiError('VALIDATION', 'Isso criaria um ciclo na hierarquia de supervisão.'); k = m[k]; n++; }
    const r = t.rows.filter(function (x) { return x.MembroID === mid; })[0];
    if (r) { if (sup) writeRow_(t, r._row, { SuperiorID: sup }); else delRow_(t, r._row); } else if (sup) appendRow_(t, { MembroID: mid, SuperiorID: sup });
    return { ok: true };
  });
}
// Multiplica uma célula: cria a nova (filha), reparte as pessoas e os cargos e define a supervisão das duas.
function multiplyCell_(d, u) {
  return withLock_(function () {
    const ct = table_('Celulas'), c = ct.rows.filter(function (x) { return x.CelulaID === clip_(d.celulaId, 30) && x.Status !== 'Inativa'; })[0]; if (!c) throw new ApiError('NOT_FOUND', 'Célula não encontrada.');
    const nome = clip_(d.nome, 100); if (nome.length < 2) throw new ApiError('VALIDATION', 'Dê um nome à nova célula.');
    const mt = table_('Membros'), noCel = mt.rows.filter(function (m) { return m.CelulaID === c.CelulaID && m.Status !== 'Inativo'; }).map(function (m) { return m.MembroID; });
    const pool = noCel.concat([c.LiderID, c.TreinamentoID].filter(function (x) { return x && noCel.indexOf(x) < 0; }));
    const lo = clip_(d.liderOrigId, 30), to = clip_(d.treinOrigId, 30), ln = clip_(d.liderNovaId, 30), tn = clip_(d.treinNovaId, 30);
    if (!lo || !ln) throw new ApiError('VALIDATION', 'Escolha o líder de cada uma das duas células.');
    const cargos = [lo, to, ln, tn].filter(String); if (cargos.some(function (x, i) { return cargos.indexOf(x) !== i; })) throw new ApiError('VALIDATION', 'A mesma pessoa não pode ter dois cargos. Escolha pessoas diferentes para líder e líder em treinamento.');
    cargos.forEach(function (x) { if (pool.indexOf(x) < 0) throw new ApiError('VALIDATION', 'Os líderes precisam ser pessoas desta célula.'); });
    const vao = (Array.isArray(d.membrosNova) ? d.membrosNova : []).map(function (x) { return clip_(x, 30); }).filter(function (x) { return noCel.indexOf(x) >= 0 && x !== lo && x !== to; });
    [ln, tn].filter(String).forEach(function (x) { if (vao.indexOf(x) < 0) vao.push(x); });
    const sid = d.supervisorId !== undefined && clip_(d.supervisorId, 30) ? clip_(d.supervisorId, 30) : (c.SupervisorID || ''); if (sid) getMember_(sid);
    if (sid && sid !== c.SupervisorID) checarSupervisor_(sid, d, u, c.CelulaID);
    const sup = d.superiorId !== undefined && sid ? clip_(d.superiorId, 30) : undefined;
    if (sup !== undefined) setSuperior_({ membroId: sid, superiorId: sup });
    const nid = id_('C'), dia = clip_(d.dia, 20) || c.Dia || '', ini = clip_(d.inicio, 5) || c.Inicio || '', fim = clip_(d.fim, 5) || c.Fim || '';
    appendRow_(ct, { CelulaID: nid, Nome: nome, Descricao: '', LiderID: ln, SupervisorID: sid, TreinamentoID: tn, MaeID: c.CelulaID, Dia: dia, Inicio: ini, Fim: fim, Categoria: c.Categoria || '', Faixa: c.Faixa || '', Bairro: c.Bairro || '', Cidade: c.Cidade || '', UF: c.UF || '', Endereco: '', PrivGrupo: '1', PrivTel: '0', PrivEmail: '0', PrivEnd: '0', Status: 'Ativa', Lat: '', Lng: '' });
    writeRow_(ct, c._row, { LiderID: lo, TreinamentoID: to, SupervisorID: sid });
    const pt = table_('Papeis'); for (let i = pt.rows.length - 1; i >= 0; i--) if (pt.rows[i].CelulaID === c.CelulaID && vao.indexOf(pt.rows[i].MembroID) >= 0) delRow_(pt, pt.rows[i]._row);
    vao.forEach(function (m) { const g = getMember_(m); writeRow_(g.t, g.m._row, { CelulaID: nid }); });
    [lo, to].filter(String).forEach(function (m) { const g = getMember_(m); if (g.m.CelulaID !== c.CelulaID) writeRow_(g.t, g.m._row, { CelulaID: c.CelulaID }); });
    audit_(u.email, 'CELULA_MULTIPLICADA', c.CelulaID + ' -> ' + nid + ' (' + vao.length + ' pessoas)', 'OK');
    return { ok: true, novaId: nid, ficaram: noCel.filter(function (m) { return vao.indexOf(m) < 0; }).length, foram: vao.length };
  });
}
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
function cfgInt_(k, d, mn, mx) { const n = Number(cfgMap_()[k]); return isFinite(n) && n >= mn && n <= mx ? Math.round(n) : d; }
/* a partir da Nª presença o visitante vira participante; na Nª falta seguida o participante vai para ex-participantes (valores definidos em Administração) */
function presPart_() { return cfgInt_('PresencasParaParticipante', 3, 1, 50); }
function faltasEx_() { return cfgInt_('FaltasParaExParticipante', 6, 1, 50); }
function catParticipante_(m, n, P) { return n < P ? 'Visitante' : m.EhMembro === '1' ? 'Membro da igreja' : m.Batizado === '1' ? 'Batizado não-membro' : 'Não batizado'; }
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
  const meu = function (c) { return !!c && !!u.membroId && c.SupervisorID === u.membroId; }, adm = can_(u, 'transf'), min = can_(u, 'min'), minRows = {}; table_('Ministerios').rows.forEach(function (m) { minRows[m.MinisterioID] = m; });
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
  table_('Interesses').rows.forEach(function (i) {
    const m = mem[i.MembroID] || {}, mn = minRows[i.MinisterioID] || {}, dc = minDec_(mn, i.MembroID, mem, cel), sou = dc.decisores.indexOf(u.membroId) >= 0;
    if (!(min || sou)) return;
    const resp = minResp_(mn).map(nm).filter(String).join(', ');
    add({ tipo: 'interesse', id: i.InteresseID, pessoaId: i.MembroID, titulo: nm(i.MembroID) + ' quer participar do ministério ' + (mi[i.MinisterioID] || '?'), detalhe: (m.Telefone ? 'Telefone ' + m.Telefone : 'Sem telefone cadastrado') + (resp ? ' · Responsável: ' + resp : ''), status: stN_(i.Status), data: i.Data, solicitante: nm(i.MembroID), decididoPorId: i.DecididoPor, decididoPor: nm(i.DecididoPor), dataDecisao: i.DataDecisao, pode: true, admOk: min, ctx: { ministerio: mi[i.MinisterioID] || '' } });
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
    for (let i = t.rows.length - 1; i >= 0; i--) { const n = t.rows[i]; if (n.MembroID === u.membroId && (!ids || ids.indexOf(n.NotifID) >= 0)) delRow_(t, n._row); }
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
    const t = table_('Interesses'), r = t.rows.filter(function (x) { return x.InteresseID === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Pedido não encontrado.'); if (stN_(r.Status) !== 'pendente') throw new ApiError('VALIDATION', 'Esse pedido já foi decidido.');
    const mn = table_('Ministerios').rows.filter(function (x) { return x.MinisterioID === r.MinisterioID; })[0] || {}, dc = minDec_(mn, r.MembroID);
    if (!(can_(u, 'min') || dc.decisores.indexOf(u.membroId) >= 0)) throw new ApiError('FORBIDDEN', 'Só o supervisor da pessoa ou o responsável com autonomia decide este pedido.');
    const st = d.decisao === 'autorizado' ? 'autorizado' : 'negado'; writeRow_(t, r._row, { Status: st, DecididoPor: u.membroId, DataDecisao: now_() }); audit_(u.email, 'INTERESSE_' + st.toUpperCase(), r.InteresseID, 'OK');
    if (st === 'autorizado') { try { const nm = nomes_(); minResp_(mn).forEach(function (rid) { if (rid !== u.membroId && rid !== r.MembroID) notify_(rid, 'ministerio', 'Novo integrante em ' + mn.Nome, (nm[r.MembroID] || 'Uma pessoa') + ' entrou no ministério (aprovado por ' + (nm[u.membroId] || 'a liderança') + ').', 'min:' + mn.MinisterioID); }); } catch (e) { /* a decisão já foi gravada */ } }
    return { status: st };
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
    let avalia = awardXp_(u.membroId, 'dia:' + today_(), sodXpCfg_().entrar, 'Acesso diário');
    if (abasMarca_(u.membroId, d.abas)) avalia = true;
    if (avalia) avaliaDefs_(u.membroId); return { ok: true, n: n };
  });
}
// abas do app que a pessoa abriu: um mapa {aba: vezes} por pessoa (alimenta as insígnias de explorador). Devolve true quando vale conferir insígnias.
function abasMarca_(mid, abas) {
  abas = (Array.isArray(abas) ? abas : []).slice(0, 40); if (!abas.length) return false;
  const t = lazy_('AbasVistas'), r = t.rows.filter(function (x) { return x.MembroID === mid; })[0], mapa = r ? jparse_(r.Mapa, {}) : {}; let tot = r ? Number(r.Total) || 0 : 0, novo = false; const antes = tot;
  abas.forEach(function (x) {
    const k = clip_(x && x.aba, 40); if (!/^[a-z0-9_:-]+$/i.test(k)) return; const q = Math.max(1, Math.min(50, Math.round(Number(x.n)) || 1));
    if (!(k in mapa)) { if (Object.keys(mapa).length >= 400) return; novo = true; mapa[k] = 0; } mapa[k] += q; tot += q;
  });
  const js = JSON.stringify(mapa); if (js.length > 40000) return false;
  if (r) writeRow_(t, r._row, { Mapa: js, Total: String(tot) }); else appendRow_(t, { MembroID: mid, Mapa: js, Total: String(tot) });
  return novo || Math.floor(tot / 100) > Math.floor(antes / 100);
}
/* ===== rastreios das insígnias do lote (v1.95): livros lidos, vídeos assistidos, perfis visitados e elogios ===== */
function rangesParse_(str, max) { // "1-5,9,12-20" -> [[1,5],[9,9],[12,20]] (limitado a 1..max, já unido e ordenado)
  const out = []; String(str || '').split(',').forEach(function (p) { const m = /^\s*(\d{1,5})(?:-(\d{1,5}))?\s*$/.exec(p); if (!m) return; let a = Number(m[1]), b = m[2] ? Number(m[2]) : a; if (a > b) { const x = a; a = b; b = x; } a = Math.max(1, a); b = Math.min(max, b); if (a <= b) out.push([a, b]); });
  out.sort(function (x, y) { return x[0] - y[0]; }); const mer = []; out.forEach(function (r) { const l = mer[mer.length - 1]; if (l && r[0] <= l[1] + 1) l[1] = Math.max(l[1], r[1]); else mer.push([r[0], r[1]]); }); return mer;
}
function rangesStr_(a) { return a.map(function (r) { return r[0] === r[1] ? String(r[0]) : r[0] + '-' + r[1]; }).join(','); }
function rangesCount_(a) { return a.reduce(function (n, r) { return n + (r[1] - r[0] + 1); }, 0); }
function bookProgress_(d, u) {
  const id = clip_(d.livroId, 30), total = Math.floor(Number(d.total) || 0); if (!id || total < 1 || total > 5000) throw new ApiError('VALIDATION', 'Informe o livro e o total de páginas.');
  if (!table_('Livros').rows.some(function (l) { return l.LivroID === id && l.Status !== 'Removido'; })) throw new ApiError('NOT_FOUND', 'Livro não encontrado.');
  return withLock_(function () {
    const t = lazy_('LivroLeitura'), ex = t.rows.filter(function (r) { return r.LivroID === id && r.MembroID === u.membroId; })[0];
    const mer = rangesParse_(rangesStr_(rangesParse_(ex ? ex.Pags : '', total).concat(rangesParse_(d.pags, total))), total), lidas = rangesCount_(mer), fim = ex && ex.Concluido === '1' ? true : lidas >= total;
    const row = { Pags: rangesStr_(mer), Total: String(total), Concluido: fim ? '1' : '0', Data: today_() };
    if (ex) writeRow_(t, ex._row, row); else appendRow_(t, Object.assign({ LivroID: id, MembroID: u.membroId }, row));
    if (fim && !(ex && ex.Concluido === '1')) avaliaDefs_(u.membroId); return { lidas: lidas, total: total, concluido: fim };
  });
}
function videoWatched_(d, u) {
  const id = clip_(d.videoId, 30); let seg = Math.max(0, Math.min(120, Math.round(Number(d.seg) || 0))); if (!id || !seg) return { ok: true };
  const v = table_('Videos').rows.filter(function (x) { return x.VideoID === id && x.Status !== 'Removido'; })[0]; if (!v) throw new ApiError('NOT_FOUND', 'Vídeo não encontrado.');
  return withLock_(function () {
    const t = lazy_('VideosVistos'), ex = t.rows.filter(function (r) { return r.VideoID === id && r.MembroID === u.membroId; })[0], agora = Date.now(), tipo = v.Tipo === 'live' || v.AoVivo === '1' ? 'live' : 'video';
    const max = ex && Number(ex.Ultimo) ? Math.min(120, (agora - Number(ex.Ultimo)) / 1000 + 2) : 40; seg = Math.min(seg, Math.floor(max)); if (seg < 1) return { ok: true }; // contagem não passa do tempo que realmente se passou
    const antes = ex ? Number(ex.Seg) || 0 : 0, tot = Math.min(86400, antes + seg);
    if (ex) writeRow_(t, ex._row, { Seg: String(tot), Tipo: ex.Tipo === 'live' ? 'live' : tipo, Data: today_(), Ultimo: String(agora) }); else appendRow_(t, { MembroID: u.membroId, VideoID: id, Tipo: tipo, Seg: String(tot), Data: today_(), Ultimo: String(agora) });
    if (antes < 60 && tot >= 60) avaliaDefs_(u.membroId); return { ok: true, seg: tot };
  });
}
function profileSeen_(d, u) {
  const alvo = clip_(d.alvoId, 30); if (!alvo || alvo === u.membroId) return { ok: true };
  if (!table_('Membros').rows.some(function (m) { return m.MembroID === alvo && m.Status !== 'Inativo'; })) return { ok: true };
  return withLock_(function () {
    const t = lazy_('PerfilVisitas'), ex = t.rows.filter(function (r) { return r.MembroID === u.membroId && r.AlvoID === alvo; })[0];
    if (ex) { writeRow_(t, ex._row, { Visitas: String((Number(ex.Visitas) || 0) + 1), Data: today_() }); return { ok: true }; }
    appendRow_(t, { MembroID: u.membroId, AlvoID: alvo, Visitas: '1', Data: today_() }); avaliaDefs_(u.membroId); return { ok: true, novo: true };
  });
}
function praiseProfile_(d, u) {
  const alvo = clip_(d.alvoId, 30), texto = clip_(d.texto, 140).trim(); if (!alvo || alvo === u.membroId) throw new ApiError('VALIDATION', 'Escolha outra pessoa para elogiar.');
  if (texto.length < 3 || /https?:|www\./i.test(texto)) throw new ApiError('VALIDATION', 'Escreva um elogio com pelo menos 3 letras, sem links.');
  if (!table_('Membros').rows.some(function (m) { return m.MembroID === alvo && m.Status !== 'Inativo'; })) throw new ApiError('NOT_FOUND', 'Pessoa não encontrada.');
  return withLock_(function () {
    const t = lazy_('Elogios'), hj = today_(), meus = t.rows.filter(function (r) { return r.De === u.membroId && r.Data === hj; });
    if (meus.some(function (r) { return r.Para === alvo; })) throw new ApiError('VALIDATION', 'Você já elogiou essa pessoa hoje. Volte amanhã!');
    if (meus.length >= 10) throw new ApiError('VALIDATION', 'Limite de 10 elogios por dia.');
    appendRow_(t, { ElogioID: id_('EL'), De: u.membroId, Para: alvo, Texto: texto, Data: hj });
    notify_(alvo, 'elogio', (nomes_()[u.membroId] || 'Alguém') + ' elogiou o seu perfil', texto, 'perfil:' + u.membroId);
    avaliaDefs_(u.membroId); avaliaDefs_(alvo); return { ok: true };
  });
}
/* ===== Desempenho e capacidade: o app mede cada requisição e envia somas agregadas (a cada 5 min, por aparelho) ===== */
const MET_SLOT_ = 300000, MET_H_ = [200, 400, 800, 1500, 3000, 6000];
function metNum_(x, max) { const n = Math.round(Number(x) || 0); return n < 0 ? 0 : Math.min(max || 1e9, n); }
function metSoma_(t, key, v, row) { // soma os valores de v na linha existente (key) ou cria
  const r = t.rows.filter(function (x) { return x.Slot === key[0] && x.Pagina === key[1] && x.Acao === key[2]; })[0];
  if (r) {
    const h = jparse_(r.Hist, []), nh = (v.Hist || []).length ? v.Hist.map(function (c, i) { return metNum_(c) + metNum_(h[i]); }) : h;
    writeRow_(t, r._row, { N: String(metNum_(r.N) + v.N), Erros: String(metNum_(r.Erros) + v.Erros), RttSoma: String(metNum_(r.RttSoma) + v.RttSoma), RttMax: String(Math.max(metNum_(r.RttMax), v.RttMax)), SrvSoma: String(metNum_(r.SrvSoma) + v.SrvSoma), SrvMax: String(Math.max(metNum_(r.SrvMax), v.SrvMax)), Lentas: String(metNum_(r.Lentas) + v.Lentas), Aparelhos: String(metNum_(r.Aparelhos) + v.Aparelhos), Hist: nh.length ? JSON.stringify(nh) : '', LockSoma: String(metNum_(r.LockSoma) + v.LockSoma), EsperaSoma: String(metNum_(r.EsperaSoma) + v.EsperaSoma) });
  } else appendRow_(t, { Slot: key[0], Pagina: key[1], Acao: key[2], N: String(v.N), Erros: String(v.Erros), RttSoma: String(v.RttSoma), RttMax: String(v.RttMax), SrvSoma: String(v.SrvSoma), SrvMax: String(v.SrvMax), Lentas: String(v.Lentas), Aparelhos: String(v.Aparelhos), Hist: (v.Hist || []).length ? JSON.stringify(v.Hist) : '', LockSoma: String(v.LockSoma), EsperaSoma: String(v.EsperaSoma) });
}
function metItem_(x, comHist) {
  return { N: metNum_(x.n, 1e6), Erros: metNum_(x.e, 1e6), RttSoma: metNum_(x.rs, 1e10), RttMax: metNum_(x.rm, 1e7), SrvSoma: metNum_(x.ss, 1e10), SrvMax: metNum_(x.sm, 1e7), Lentas: metNum_(x.l, 1e6), LockSoma: metNum_(x.ks, 1e10), EsperaSoma: metNum_(x.ws, 1e10), Aparelhos: 1, Hist: comHist && Array.isArray(x.h) ? x.h.slice(0, MET_H_.length + 1).map(function (c) { return metNum_(c, 1e6); }) : [] };
}
function metricsReport_(d, u) {
  const ser = (Array.isArray(d.ser) ? d.ser : []).slice(0, 40), det = (Array.isArray(d.det) ? d.det : []).slice(0, 120), agora = Date.now(); let n = 0;
  return withLock_(function () {
    const t = table_('Metricas');
    ser.forEach(function (x) { const ts = Number(x.t); if (!(ts > agora - 2 * 86400000 && ts <= agora + 60000)) return; metSoma_(t, [Utilities.formatDate(new Date(ts), CFG.TZ, 'yyyy-MM-dd HH:mm'), '*', '*'], metItem_(x, true)); n++; });
    const dia = today_();
    det.forEach(function (x) { const p = clip_(x.p, 24), a = clip_(x.a, 40); if (!/^[a-z0-9_:-]+$/i.test(p) || !/^[a-z0-9_:-]+$/i.test(a)) return; const v = metItem_(x, false); v.Aparelhos = 0; metSoma_(t, [dia, p, a], v); n++; });
    if (Math.random() < 0.02) metLimpa_(t);
    return { ok: true, n: n };
  });
}
function metLimpa_(t) { // mantém só os últimos 45 dias (apaga de baixo para cima para não deslocar as linhas)
  const lim = Utilities.formatDate(new Date(Date.now() - 45 * 86400000), CFG.TZ, 'yyyy-MM-dd');
  t.rows.filter(function (r) { return String(r.Slot).slice(0, 10) < lim; }).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; }).forEach(function (rw) { delRow_(t, rw); });
}
function getMetrics_(d, u) {
  const horas = Math.max(1, Math.min(72, metNum_(d.horas) || 24)), dias = Math.max(1, Math.min(30, metNum_(d.dias) || 7));
  const desde = Utilities.formatDate(new Date(Date.now() - horas * 3600000), CFG.TZ, 'yyyy-MM-dd HH:mm'), dDesde = Utilities.formatDate(new Date(Date.now() - (dias - 1) * 86400000), CFG.TZ, 'yyyy-MM-dd');
  const serie = [], det = [];
  table_('Metricas').rows.forEach(function (r) {
    const o = { n: metNum_(r.N), e: metNum_(r.Erros), rs: metNum_(r.RttSoma), rm: metNum_(r.RttMax), ss: metNum_(r.SrvSoma), sm: metNum_(r.SrvMax), l: metNum_(r.Lentas), ap: metNum_(r.Aparelhos), ks: metNum_(r.LockSoma), ws: metNum_(r.EsperaSoma) };
    if (r.Pagina === '*') { if (r.Slot.length > 10 && r.Slot >= desde) { o.slot = r.Slot; o.h = jparse_(r.Hist, []); serie.push(o); } }
    else if (r.Slot >= dDesde) { o.dia = r.Slot; o.p = r.Pagina; o.a = r.Acao; det.push(o); }
  });
  serie.sort(function (a, b) { return a.slot < b.slot ? -1 : 1; });
  return { agora: now_(), horas: horas, dias: dias, serie: serie, det: det, limites: { hist: MET_H_ } };
}
function ping_(d, u) { return { t: Date.now() }; }

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
/* ===== Fotos de perfil no Drive (piloto, desligado por padrão: Config FotosDrive = 1) =====
   A foto vira um arquivo numa pasta do Drive e a planilha guarda só o link curto (…/d/<id>=s256).
   ATENÇÃO: o link é "qualquer pessoa com o link pode ver" (necessário para o <img> do app carregar). */
const FOTO_URL_ = 'https://lh3.googleusercontent.com/d/';
const FOTO_MAX_B64_ = 3000000;
function fotosDriveOn_() { return cfgMap_().FotosDrive === '1'; }
function fotoDriveId_(v) { const m = /^https:\/\/lh3\.googleusercontent\.com\/d\/([\w-]+)=s256$/.exec(String(v || '')); return m ? m[1] : ''; }
function pastaFotos_() {
  const p = PropertiesService.getScriptProperties(), fid = p.getProperty('FOTOS_FOLDER');
  if (fid) { try { return DriveApp.getFolderById(fid); } catch (e) { /* recria */ } }
  const f = DriveApp.createFolder('Zoe - Fotos de perfil'); p.setProperty('FOTOS_FOLDER', f.getId()); return f;
}
function fotoLixo_(v) { const id = fotoDriveId_(v); if (!id) return; try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* já não existe */ } }
/* Sobe uma foto (data URI) para o Drive; devolve o link, ou lança erro se o Drive/compartilhamento falhar. */
function fotoSobe_(dataUri, nome) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(dataUri || ''));
  if (!m || m[2].length > FOTO_MAX_B64_) throw new ApiError('VALIDATION', 'Foto inválida ou muito grande.');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), 'image/' + m[1], 'foto-' + nome + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]));
  const f = pastaFotos_().createFile(blob);
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { try { f.setTrashed(true); } catch (e2) { } throw e; }
  return FOTO_URL_ + f.getId() + '=s256';
}
/* Valor que vai para Membros.Foto: com o piloto ligado e foto nova, sobe ao Drive (e apaga a antiga); se o Drive falhar, guarda na planilha como antes. */
function fotoParaGravar_(nova, antiga, membroId) {
  nova = String(nova || '');
  if (!nova) { fotoLixo_(antiga); return ''; }
  if (!/^data:image\//.test(nova) || !fotosDriveOn_()) return nova.slice(0, 45000);
  try { const url = fotoSobe_(nova, membroId); if (antiga !== url) fotoLixo_(antiga); return url; }
  catch (e) { audit_('sistema', 'FOTO_DRIVE_FALHOU', membroId, String(e && e.message || e).slice(0, 120)); return nova.slice(0, 45000); }
}
function fotosDriveStatus_() {
  let drive = 0, planilha = 0, vazias = 0;
  table_('Membros').rows.forEach(function (m) { if (!m.Foto) vazias++; else if (fotoDriveId_(m.Foto)) drive++; else if (/^data:image\//.test(m.Foto)) planilha++; });
  return { ligado: fotosDriveOn_(), drive: drive, planilha: planilha, vazias: vazias };
}
function fotosDriveSet_(d, u) {
  return withLock_(function () {
    const t = table_('Config'), v = d.ligado ? '1' : '0', r = t.rows.filter(function (x) { return x.Chave === 'FotosDrive'; })[0];
    if (v === '1') pastaFotos_(); // falha logo se o Drive não está autorizado (rode setup())
    if (r) writeRow_(t, r._row, { Valor: v }); else appendRow_(t, { Chave: 'FotosDrive', Valor: v });
    audit_(u.email, 'FOTOS_DRIVE', v, 'OK'); return fotosDriveStatus_();
  });
}
/* Migra em lotes (até 15 por chamada). sentido 'drive': planilha → Drive; 'planilha': Drive → planilha (volta ao jeito antigo). */
function fotosDriveMigra_(d, u) {
  const sentido = d.sentido === 'planilha' ? 'planilha' : 'drive'; let feitas = 0, falhas = 0;
  if (sentido === 'drive' && !fotosDriveOn_()) throw new ApiError('VALIDATION', 'Ligue o piloto antes de migrar.');
  withLock_(function () {
    const t = table_('Membros'); let n = 0;
    t.rows.forEach(function (m) {
      if (n >= 15 || !m.Foto) return;
      if (sentido === 'drive') {
        if (!/^data:image\//.test(m.Foto)) return; n++;
        try { const url = fotoSobe_(m.Foto, m.MembroID); writeRow_(t, m._row, { Foto: url }); feitas++; } catch (e) { falhas++; audit_(u.email, 'FOTO_DRIVE_FALHOU', m.MembroID, String(e && e.message || e).slice(0, 120)); }
      } else {
        const id = fotoDriveId_(m.Foto); if (!id) return; n++;
        try { const b = DriveApp.getFileById(id).getBlob(), data = 'data:' + (b.getContentType ? b.getContentType() : 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes()); if (data.length > 45000) { falhas++; return; } writeRow_(t, m._row, { Foto: data }); try { DriveApp.getFileById(id).setTrashed(true); } catch (e2) { } feitas++; } catch (e) { falhas++; }
      }
    });
    audit_(u.email, 'FOTOS_DRIVE_MIGRA', sentido + ':' + feitas + '/' + falhas, 'OK');
  });
  const st = fotosDriveStatus_(); st.feitas = feitas; st.falhas = falhas; return st;
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
/* Fotos de perfil: cada foto fica no cache temporário (1 h). Só quem não está no cache obriga a ler a aba Membros inteira (as fotos pesam). Gravar a foto limpa o cache dela (writeRow_). */
function fotos_(d, u) {
  const ids = (Array.isArray(d.ids) ? d.ids : []).slice(0, 40).map(function (x) { return clip_(x, 30); }), o = {}; ids.forEach(function (i) { o[i] = ''; });
  const c = CacheService.getScriptCache(); let hit = {}; try { hit = c.getAll(ids.map(function (i) { return 'f:' + i; })) || {}; } catch (e) { hit = {}; }
  const falta = []; ids.forEach(function (i) { const v = hit['f:' + i]; if (v === undefined || v === null) falta.push(i); else o[i] = v === '-' ? '' : v; });
  if (falta.length) {
    const quer = {}; falta.forEach(function (i) { quer[i] = 1; });
    table_('Membros').rows.forEach(function (m) { if (quer[m.MembroID]) o[m.MembroID] = m.Foto || ''; });
    const pend = falta.filter(function (i) { return o[i].length < 90000; }); // o cache aceita até 100 KB por item
    for (let k = 0; k < pend.length; k += 10) { const lote = {}; pend.slice(k, k + 10).forEach(function (i) { lote['f:' + i] = o[i] || '-'; }); try { c.putAll(lote, 3600); } catch (e) { /* sem cache: segue */ } }
  }
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
  if (d.arq && String(d.arq) === String(r.ArquivoID)) return { igual: true, arq: r.ArquivoID }; // o aparelho já tem este arquivo: não manda de novo
  return { pdf: Utilities.base64Encode(DriveApp.getFileById(r.ArquivoID).getBlob().getBytes()), arq: r.ArquivoID };
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
    if (ex) { delRow_(t, ex._row); } else appendRow_(t, { Tipo: tipo, AlvoID: alvo, MembroID: u.membroId, Data: now_() });
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
  try { avisosEventosPassados_(); } catch (e) { }
  const ins = {}; table_('Inscricoes').rows.forEach(function (r) { if (r.MembroID === u.membroId) ins[r.EventoID] = 1; }); const lim = Utilities.formatDate(new Date(Date.now() - 30 * 86400000), CFG.TZ, 'yyyy-MM-dd');
  return table_('Eventos').rows.filter(function (e) { return e.Status !== 'Cancelado' && e.Data >= lim && (e.Escopo !== 'celula' || e.CelulaID === u.celulaId || can_(u, 'celulas')); }).sort(function (a, b) { return a.Data < b.Data ? -1 : 1; })
    .map(function (e) { return { id: e.EventoID, titulo: e.Titulo, data: e.Data, hora: e.Hora, local: e.Local, descricao: e.Descricao, programacao: jparse_(e.Programacao, []), escopo: e.Escopo, celulaId: e.CelulaID, foto: e.Foto || '', insignia: e.Insignia || '', inscrito: !!ins[e.EventoID], adm: e.Escopo !== 'celula', remarcado: e.Remarcado === '1', dataOriginal: e.DataOriginal || '', motivo: e.MotivoRemarca || '', postId: e.PostID || '' }; });
}

/* ===== Eventos que passaram: remarcar, avisar a Mídia, fotos do evento e post "Como foi…" ===== */
function midiaEquipe_() {
  const mins = table_('Ministerios').rows.filter(function (m) { const n = norm_(m.Nome); return m.Ativo !== '0' && (n === 'midia' || n.indexOf('social') >= 0 || n.indexOf('redes') >= 0); }).map(function (m) { return m.MinisterioID; }), o = {};
  table_('Interesses').rows.forEach(function (i) { if (stN_(i.Status) === 'autorizado' && mins.indexOf(i.MinisterioID) >= 0 && i.MembroID) o[i.MembroID] = 1; }); return Object.keys(o);
}
function midiaSupervisores_() {
  let a = artesAprovadores_(); if (!a.length) a = table_('Usuarios').rows.filter(function (r) { return (r.Papel === 'pastor' || r.Papel === 'admin') && r.Status !== 'Inativo' && r.MembroID; }).map(function (r) { return r.MembroID; });
  return a;
}
function avisosEventosPassados_() {
  const c = CacheService.getScriptCache(); if (c.get('evav')) return; c.put('evav', '1', 900);
  const hoje = today_(), lim = Utilities.formatDate(new Date(Date.now() - 30 * 86400000), CFG.TZ, 'yyyy-MM-dd'), cand = function (e) { return e.Escopo !== 'celula' && e.Status !== 'Cancelado' && e.Data < hoje && e.Data >= lim && !e.FotosAvisoEm && !e.PostID; };
  if (!table_('Eventos').rows.some(cand)) return;
  withLock_(function () {
    const t = ensureCols_('Eventos', ['DataOriginal', 'Remarcado', 'MotivoRemarca', 'FotosAvisoEm', 'PostID']), pend = t.rows.filter(cand); if (!pend.length) return;
    const eq = midiaEquipe_(); pend.forEach(function (e) {
      eq.forEach(function (mid) { notify_(mid, 'evento_fotos', 'Suba as fotos: ' + e.Titulo, 'O evento já aconteceu (' + e.Data.split('-').reverse().join('/') + '). Suba as fotos para a igreja ver "Como foi".', 'evento:' + e.EventoID); });
      writeRow_(t, e._row, { FotosAvisoEm: now_() });
    });
  });
}
function rescheduleEvent_(d, u) {
  return withLock_(function () {
    const t = ensureCols_('Eventos', ['DataOriginal', 'Remarcado', 'MotivoRemarca', 'FotosAvisoEm', 'PostID']), e = t.rows.filter(function (r) { return r.EventoID === clip_(d.id, 30); })[0];
    if (!e || e.Status === 'Cancelado') throw new ApiError('NOT_FOUND', 'Evento não encontrado.'); if (e.Escopo === 'celula') throw new ApiError('VALIDATION', 'Só eventos da igreja podem ser remarcados aqui.');
    const data = clip_(d.data, 10); if (!data || !dateOk_(data)) throw new ApiError('VALIDATION', 'Informe a nova data.'); if (data < today_()) throw new ApiError('VALIDATION', 'A nova data não pode ser no passado.');
    const hora = d.hora === undefined ? e.Hora : clip_(d.hora, 5), mot = clip_(d.motivo, 200);
    writeRow_(t, e._row, { Data: data, Hora: hora, DataOriginal: e.DataOriginal || e.Data, Remarcado: '1', MotivoRemarca: mot, FotosAvisoEm: '' });
    table_('Inscricoes').rows.forEach(function (r) { if (r.EventoID === e.EventoID && r.MembroID !== u.membroId) notify_(r.MembroID, 'evento_remarcado', e.Titulo + ' foi remarcado', 'Nova data: ' + data.split('-').reverse().join('/') + (hora ? ' às ' + hora : '') + (mot ? '. ' + mot : ''), 'evento:' + e.EventoID); });
    audit_(u.email, 'EVENTO_REMARCADO', e.Titulo + ' ' + (e.DataOriginal || e.Data) + '→' + data, 'OK'); return { ok: true, data: data };
  });
}
function eventoFotosPode_(u) { return artesCria_(u) || can_(u, 'eventos'); }
function saveEventoFotos_(d, u) {
  if (!eventoFotosPode_(u)) throw new ApiError('FORBIDDEN', 'Só a equipe de Mídia sobe as fotos do evento.');
  const fotos = (Array.isArray(d.fotos) ? d.fotos : []).slice(0, 12).map(fotoOk_).filter(Boolean); if (!fotos.length) throw new ApiError('VALIDATION', 'Escolha ao menos uma foto.');
  return withLock_(function () {
    const te = ensureCols_('Eventos', ['DataOriginal', 'Remarcado', 'MotivoRemarca', 'FotosAvisoEm', 'PostID']), e = te.rows.filter(function (r) { return r.EventoID === clip_(d.eventoId, 30) && r.Status !== 'Cancelado'; })[0];
    if (!e || e.Escopo === 'celula') throw new ApiError('NOT_FOUND', 'Evento não encontrado.'); if (e.Data > today_()) throw new ApiError('VALIDATION', 'O evento ainda não aconteceu.');
    const tf = lazy_('EventoFotos'), ja = tf.rows.filter(function (r) { return r.EventoID === e.EventoID; }).length; if (ja + fotos.length > 80) throw new ApiError('VALIDATION', 'Limite de 80 fotos por evento.');
    fotos.forEach(function (f) { appendRow_(tf, { FotoID: id_('EF'), EventoID: e.EventoID, Foto: f, Por: u.membroId, Data: now_() }); });
    const titulo = clip_(d.titulo, 140) || ('Como foi o nosso ' + e.Titulo + '?'), texto = clip_(d.texto, 600) || clip_(e.Descricao, 600), total = ja + fotos.length, tp = table_('Posts'); let pid = e.PostID, p = pid && tp.rows.filter(function (x) { return x.PostID === pid; })[0], criado = false;
    if (!p || p.Status === 'removido') { pid = novoPost_({ tipo: 'evento', escopo: 'igreja', autorId: u.membroId, titulo: titulo, texto: texto, foto: fotos[0], meta: { eventoId: e.EventoID, data: e.Data, fotos: total } }); writeRow_(te, e._row, { PostID: pid }); criado = true; }
    else { const m = jparse_(p.Meta, {}); m.fotos = total; const patch = { Meta: JSON.stringify(m) }; if (!p.Foto) patch.Foto = fotos[0]; if (d.titulo) patch.Titulo = titulo; if (d.texto) patch.Texto = texto; writeRow_(tp, p._row, patch); }
    const quem = nomes_()[u.membroId] || 'Alguém', quando = Utilities.formatDate(new Date(), CFG.TZ, "dd/MM 'às' HH:mm");
    midiaSupervisores_().forEach(function (mid) { if (mid !== u.membroId) notify_(mid, 'evento_fotos_subidas', quem + ' subiu ' + fotos.length + ' foto(s) de ' + e.Titulo, (criado ? 'Postagem "' + titulo + '" criada no feed' : 'Fotos adicionadas à postagem do feed') + ' em ' + quando + '.', 'evento:' + e.EventoID); });
    audit_(u.email, 'EVENTO_FOTOS', e.Titulo + ' +' + fotos.length, 'OK'); return { ok: true, postId: pid, total: total, criado: criado };
  });
}
function listEventoFotos_(d, u) {
  const nm = nomes_(); return { itens: lazy_('EventoFotos').rows.filter(function (r) { return r.EventoID === clip_(d.eventoId, 30); }).slice(0, 80).map(function (r) { return { id: r.FotoID, foto: r.Foto, por: nm[r.Por] || '', data: r.Data, meu: r.Por === u.membroId }; }) };
}
function delEventoFoto_(d, u) {
  return withLock_(function () {
    const t = lazy_('EventoFotos'), r = t.rows.filter(function (x) { return x.FotoID === clip_(d.id, 30); })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Foto não encontrada.');
    if (r.Por !== u.membroId && !can_(u, 'eventos') && u.papel !== 'admin') throw new ApiError('FORBIDDEN', 'Só quem subiu (ou a administração) apaga.');
    t.sh.deleteRow(r._row); const e = table_('Eventos').rows.filter(function (x) { return x.EventoID === r.EventoID; })[0];
    if (e && e.PostID) { const tp = table_('Posts'), p = tp.rows.filter(function (x) { return x.PostID === e.PostID; })[0]; if (p) { const m = jparse_(p.Meta, {}); m.fotos = Math.max(0, (m.fotos || 1) - 1); writeRow_(tp, p._row, { Meta: JSON.stringify(m) }); } }
    return { ok: true };
  });
}
/* ===== Feed único: o que aparece é escolhido pela administração ===== */
const FEED_FONTES_ = ['decisao', 'evento', 'testemunho', 'noticia', 'campanha', 'anotacao', 'proxevento', 'aniv'];
function getFeedFontes_() { const o = jparse_(cfgMap_().FeedFontes, {}), r = {}; FEED_FONTES_.forEach(function (k) { r[k] = o[k] !== false && o[k] !== 0; }); return r; }
function saveFeedFontes_(d, u) {
  return withLock_(function () {
    const o = {}; FEED_FONTES_.forEach(function (k) { o[k] = !(d.fontes && (d.fontes[k] === false || d.fontes[k] === 0)); });
    const t = table_('Config'), r = t.rows.filter(function (x) { return x.Chave === 'FeedFontes'; })[0], v = JSON.stringify(o); if (r) writeRow_(t, r._row, { Valor: v }); else appendRow_(t, { Chave: 'FeedFontes', Valor: v });
    audit_(u.email, 'FEED_FONTES', v, 'OK'); return o;
  });
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
    if (d.on && !ex) appendRow_(t, { EventoID: e.EventoID, MembroID: u.membroId, Data: now_() }); if (!d.on && ex) delRow_(t, ex._row); return { inscrito: !!d.on };
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
    if (!t.rows.some(function (r) { return r.MinisterioID === m.MinisterioID && r.MembroID === u.membroId && r.Status === 'novo'; })) {
      const iid = id_('I'); appendRow_(t, { InteresseID: iid, MinisterioID: m.MinisterioID, MembroID: u.membroId, Data: now_(), Status: 'novo' });
      try { const nm = nomes_(); minDec_(m, u.membroId).decisores.forEach(function (mid) { notify_(mid, 'aprovacao', (nm[u.membroId] || 'Alguém') + ' quer participar de ' + m.Nome, 'Abra Aprovações para decidir.', 'interesse:' + iid); }); } catch (e) { /* o pedido já foi gravado */ }
    }
    return { ok: true };
  });
}
/* ===== Responsáveis por ministério ===== */
// O administrador define os responsáveis de cada ministério. Quem decide o pedido de uma pessoa é o supervisor da célula dela e, só se o supervisor tiver
// dado autonomia, o responsável. Sem autonomia o responsável apenas é avisado quando a pessoa entra. Sem responsável definido, fica com o supervisor.
function minResp_(m) { return String(m && m.Responsaveis || '').split(',').filter(String); }
function minhasResp_(membroId) { if (!membroId) return []; return table_('Ministerios').rows.filter(function (m) { return m.Ativo !== '0' && minResp_(m).indexOf(membroId) >= 0; }).map(function (m) { return m.MinisterioID; }); }
function minDec_(m, pessoaId, mem, cel) {
  const R = minResp_(m).filter(function (r) { return r !== pessoaId; }), au = jparse_(m && m.Autonomia, {});
  let sup = ''; if (pessoaId) { const p = mem ? mem[pessoaId] : table_('Membros').rows.filter(function (x) { return x.MembroID === pessoaId; })[0]; const cid = p && p.CelulaID; if (cid) { const c = cel ? cel[cid] : table_('Celulas').rows.filter(function (x) { return x.CelulaID === cid; })[0]; sup = c && c.Status !== 'Inativa' ? (c.SupervisorID || '') : ''; } }
  const auto = R.filter(function (r) { return sup && (au[r] || []).indexOf(sup) >= 0; });
  return { sup: sup, decisores: (sup ? [sup] : []).concat(auto), soAvisa: R.filter(function (r) { return auto.indexOf(r) < 0; }), responsaveis: R };
}
function minRespOut_(u) {
  const nm = nomes_(), au = function (m, r) { return (jparse_(m.Autonomia, {})[r] || []).indexOf(u.membroId) >= 0; };
  const itens = table_('Ministerios').rows.filter(function (m) { return m.Ativo !== '0'; }).sort(function (a, b) { return Number(a.Ordem) - Number(b.Ordem); }).map(function (m) { return { id: m.MinisterioID, nome: m.Nome, responsaveis: minResp_(m).map(function (r) { return { id: r, nome: nm[r] || r, autonomia: au(m, r) }; }) }; });
  return { admin: can_(u, 'min'), supervisor: (u.supervisiona || []).length > 0, itens: itens };
}
function minResp(d, u) { return minRespOut_(u); }
function saveMinResp_(d, u) {
  if (!can_(u, 'min')) throw new ApiError('FORBIDDEN', 'Só a administração define os responsáveis.');
  const ms = {}; table_('Usuarios').rows.forEach(function (r) { if (r.Status !== 'Inativo' && r.MembroID) ms[r.MembroID] = 1; });
  const ids = (Array.isArray(d.ids) ? d.ids : []).map(function (x) { return clip_(x, 30); }).filter(function (x, i, a) { return x && ms[x] && a.indexOf(x) === i; }).slice(0, 8);
  return withLock_(function () {
    const t = table_('Ministerios'), m = t.rows.filter(function (x) { return x.MinisterioID === clip_(d.ministerioId, 30) && x.Ativo !== '0'; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Ministério não encontrado.');
    const au = jparse_(m.Autonomia, {}), novo = {}; ids.forEach(function (r) { if (au[r]) novo[r] = au[r]; });
    writeRow_(t, m._row, { Responsaveis: ids.join(','), Autonomia: JSON.stringify(novo) }); audit_(u.email, 'MIN_RESPONSAVEIS', m.Nome + ': ' + ids.join(','), 'OK');
    const antes = minResp_(m), nm = nomes_(); ids.forEach(function (r) { if (antes.indexOf(r) < 0) notify_(r, 'ministerio', 'Você é responsável por ' + m.Nome, 'Você será avisado quando alguém entrar. Se o seu supervisor der autonomia, você também decide os pedidos.', 'min:' + m.MinisterioID); });
    return minRespOut_(u);
  });
}
function saveMinAutonomia_(d, u) {
  if (!(u.supervisiona || []).length) throw new ApiError('FORBIDDEN', 'Só supervisores definem a autonomia dos responsáveis.');
  return withLock_(function () {
    const t = table_('Ministerios'), m = t.rows.filter(function (x) { return x.MinisterioID === clip_(d.ministerioId, 30) && x.Ativo !== '0'; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Ministério não encontrado.');
    const rid = clip_(d.responsavelId, 30); if (minResp_(m).indexOf(rid) < 0) throw new ApiError('VALIDATION', 'Essa pessoa não é responsável por este ministério.');
    const au = jparse_(m.Autonomia, {}), l = (au[rid] || []).filter(function (x) { return x !== u.membroId; }); if (d.autonomia) l.push(u.membroId); if (l.length) au[rid] = l; else delete au[rid];
    writeRow_(t, m._row, { Autonomia: JSON.stringify(au) }); audit_(u.email, 'MIN_AUTONOMIA', m.Nome + ':' + rid + ':' + (d.autonomia ? 1 : 0), 'OK');
    const nm = nomes_(); notify_(rid, 'ministerio', d.autonomia ? 'Você ganhou autonomia em ' + m.Nome : 'Autonomia em ' + m.Nome + ' removida', d.autonomia ? (nm[u.membroId] || 'Seu supervisor') + ' permite que você decida os pedidos das pessoas da célula dele. Veja em Aprovações.' : (nm[u.membroId] || 'Seu supervisor') + ' vai decidir os pedidos das pessoas dele; você continua sendo avisado quando alguém entrar.', 'min:' + m.MinisterioID);
    return minRespOut_(u);
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
function saveLesson_(d, u) { const t = clip_(d.titulo, 120), url = clip_(d.url, 300); if (!t) throw new ApiError('VALIDATION', 'Informe o título da lição.'); if (url && !/^https:\/\//.test(url)) throw new ApiError('VALIDATION', 'O link precisa começar com https://.'); ensureCols_('Licoes', ['Conteudo']); appendRow_(table_('Licoes'), { LicaoID: id_('L'), Titulo: t, Resumo: clip_(d.resumo, 400), Categoria: clip_(d.categoria, 40), Url: url, Status: 'Ativa', Conteudo: clip_(d.conteudo, 4000) }); audit_(u.email, 'LICAO', t, 'OK'); return { ok: true }; }
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
  if (d.arq && String(d.arq) === String(a.ArquivoID)) return { igual: true, arq: a.ArquivoID, nome: a.PdfNome || 'aula.pdf' };
  return { pdf: Utilities.base64Encode(DriveApp.getFileById(a.ArquivoID).getBlob().getBytes()), arq: a.ArquivoID, nome: a.PdfNome || 'aula.pdf' };
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
    ti.rows.filter(function (x) { return x.MembroID === r.MembroID && x.Ref === ref; }).sort(function (a, b) { return b._row - a._row; }).forEach(function (x) { delRow_(ti, x._row); });
    tx.rows.filter(function (x) { return x.MembroID === r.MembroID && x.Ref === 'insignia:' + ref; }).sort(function (a, b) { return b._row - a._row; }).forEach(function (x) { delRow_(tx, x._row); });
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
// v1.98: insígnias em destaque (1 a cada 5 níveis, até 5) e efeitos de brilho (a partir do nível 30, um a cada 5 níveis)
const EFEITOS_TOP_ = ['brilho', 'aura', 'pulso', 'chama', 'faiscas', 'arco', 'halo'], NV_FX0_ = 30;
function slotsTop_(nv) { return Math.min(5, Math.floor(nv / 5)); }
function efeitosLib_() { const o = {}; EFEITOS_TOP_.forEach(function (k, i) { o[k] = NV_FX0_ + 5 * i; }); return o; }
function topLista_(raw) { return jparse_(raw, []).map(function (x) { return typeof x === 'string' ? { r: x, fx: '' } : { r: String((x && x.r) || ''), fx: EFEITOS_TOP_.indexOf(x && x.fx) >= 0 ? x.fx : '' }; }).filter(function (x) { return x.r; }); }
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
const SONS_BD = ['', 'sino', 'moeda', 'harpa', 'fanfarra', 'celestial', 'magico', 'epico', 'coral', 'carrilhao', 'gloria', 'aleluia', 'trombetas', 'hosana', 'coroceleste', 'suprema'];
const ESTILOS_BD = ['bordado', 'bronze', 'prata', 'ouro', 'celeste', 'jaspe', 'ametista', 'topazio', 'esmeralda', 'safira', 'rubi', 'diamante'];
function podeCurar_(u) { return can_(u, 'config') || can_(u, 'eventos') || can_(u, 'celulas') || (u.supervisiona && u.supervisiona.length > 0) || u.papel === 'pastor' || u.papel === 'admin'; }
function exigeCurar_(u) { if (!podeCurar_(u)) throw new ApiError('FORBIDDEN', 'Só supervisores e a administração criam insígnias.'); }
function ehLider_(u) { return can_(u, 'celulas') || (u.lidera && u.lidera.length > 0) || (u.supervisiona && u.supervisiona.length > 0) || u.papel === 'pastor' || u.papel === 'admin'; }
// regras de contagem simples (só precisam do número N); as da segunda linha vieram com o lote de insígnias (v1.95)
const CRIT_CONT = ['eventos_total', 'reunioes', 'cursos', 'acessos', 'sequencia', 'devocionais', 'capitulos', 'posts', 'anotacoes', 'oracoes', 'escalas',
  'cultos', 'eventos_celula', 'reunioes_seq', 'lider_reunioes', 'celula_votos', 'celula_mural', 'celula_visitantes', 'celula_multiplicou', 'biblia_dias', 'biblia_seq',
  'sod_soltos', 'sod_golpes', 'sod_caixas', 'sod_missoes', 'sod_roupas', 'sod_lendarios', 'abas_distintas', 'abas_abertas', 'livros_lidos', 'livros_opinioes',
  'videos_vistos', 'lives_vistas', 'videos_min', 'chat_amigos', 'chat_msgs', 'perfis_visitados', 'elogios_dados', 'elogios_recebidos', 'curtidas'];
const CRIT_MAX = 100000;
function criterioLimpo_(c, comNiveis) {
  c = c || {}; const t = String(c.tipo || 'manual'), n = comNiveis ? 1 : Math.floor(Number(c.n)), o = { tipo: t };
  if (['manual'].indexOf(t) >= 0) return o;
  if (t === 'eventos_palavra') { o.palavra = clip_(c.palavra, 40); o.n = n; if (!o.palavra || !(n >= 1 && n <= CRIT_MAX)) throw new ApiError('VALIDATION', 'Informe a palavra do título do evento (ex.: retiro) e a quantidade.'); return o; }
  if (t === 'eventos_ultimos') { o.palavra = clip_(c.palavra, 40); o.n = n; if (!o.palavra || !(n >= 1 && n <= 50)) throw new ApiError('VALIDATION', 'Informe a palavra do evento (ex.: retiro) e quantos dos últimos.'); return o; }
  if (t === 'servico') { o.atividade = clip_(c.atividade, 60); o.meses = comNiveis ? 1 : Math.floor(Number(c.meses)); o.consecutivos = c.consecutivos ? 1 : 0; if (!o.atividade || !(o.meses >= 1 && o.meses <= 120)) throw new ApiError('VALIDATION', 'Informe a atividade/escala e quantos meses.'); return o; }
  if (CRIT_CONT.indexOf(t) >= 0) { if (!(n >= 1 && n <= CRIT_MAX)) throw new ApiError('VALIDATION', 'Informe a quantidade necessária.'); o.n = n; return o; }
  throw new ApiError('VALIDATION', 'Tipo de critério inválido.');
}
function critTexto_(c) {
  switch (c.tipo) {
    case 'eventos_ultimos': return 'Ir aos ' + c.n + ' últimos eventos de “' + c.palavra + '”';
    case 'servico': return 'Servir em “' + c.atividade + '” por ' + c.meses + ' ' + (c.consecutivos ? 'meses seguidos' : 'meses');
    case 'eventos_total': return 'Ir a ' + c.n + ' eventos da igreja'; case 'reunioes': return 'Estar em ' + c.n + ' reuniões de célula';
    case 'cursos': return 'Concluir ' + c.n + ' curso(s)'; case 'acessos': return 'Acessar o app em ' + c.n + ' dias'; case 'sequencia': return 'Entrar ' + c.n + ' dias consecutivos no aplicativo'; case 'devocionais': return 'Postar ' + c.n + ' devocionais'; case 'capitulos': return 'Ler ' + c.n + ' capítulos da Bíblia'; case 'posts': return 'Publicar ' + c.n + ' vezes no feed'; case 'anotacoes': return 'Fazer ' + c.n + ' anotações na Bíblia'; case 'oracoes': return 'Postar ' + c.n + ' pedidos de oração'; case 'escalas': return 'Servir em ' + c.n + ' escalas';
    case 'eventos_palavra': return 'Ir a ' + c.n + ' evento(s) de “' + c.palavra + '”';
    default: return CRIT_TXT[c.tipo] ? CRIT_TXT[c.tipo].replace('{n}', c.n) : 'Concedida pelos líderes';
  }
}
const CRIT_TXT = {
  cultos: 'Estar presente em {n} cultos', eventos_celula: 'Ir a {n} eventos da sua célula', reunioes_seq: 'Ir à célula {n} semanas seguidas', lider_reunioes: 'Dirigir {n} reuniões como líder de célula',
  celula_votos: 'Dar a nota da presença de Deus em {n} reuniões', celula_mural: 'Colocar {n} itens no mural da célula', celula_visitantes: 'Cadastrar {n} visitantes novos', celula_multiplicou: 'Multiplicar a célula {n} vez(es)',
  biblia_dias: 'Ler a Bíblia em {n} dias', biblia_seq: 'Ler a Bíblia {n} dias seguidos', sod_soltos: 'Libertar o Sod {n} vez(es)', sod_golpes: 'Dar {n} golpes nas pedras do Sod', sod_caixas: 'Abrir {n} caixas do Sod',
  sod_missoes: 'Cumprir as missões do Sod em {n} dias', sod_roupas: 'Juntar {n} roupas para o personagem do Sod', sod_lendarios: 'Ter {n} item(ns) lendário(s) no Sod', abas_distintas: 'Visitar {n} abas diferentes do app',
  abas_abertas: 'Abrir abas do app {n} vezes', livros_lidos: 'Ler {n} livro(s) da biblioteca até a última página', livros_opinioes: 'Dar {n} notas ou comentários em livros', videos_vistos: 'Assistir a {n} vídeo(s) no app',
  lives_vistas: 'Assistir a {n} transmissão(ões) no app', videos_min: 'Assistir {n} minutos de vídeos e transmissões', chat_amigos: 'Conversar com {n} pessoa(s) diferentes no chat', chat_msgs: 'Enviar {n} mensagens no chat',
  perfis_visitados: 'Visitar o perfil de {n} pessoa(s)', elogios_dados: 'Elogiar {n} pessoa(s) diferentes', elogios_recebidos: 'Receber elogios de {n} pessoa(s) diferentes', curtidas: 'Curtir {n} publicações'
};
function seqMeses_(meses) { const s = {}; meses.forEach(function (m) { s[m] = 1; }); let melhor = 0; meses.slice().sort().forEach(function (m) { let n = 0, y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)); while (s[y + '-' + ('0' + mo).slice(-2)]) { n++; mo--; if (mo < 1) { mo = 12; y--; } } if (n > melhor) melhor = n; }); return melhor; }
function diaNum_(s) { const p = s.split('-'); return Math.round(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000); }
function streakDe_(mid) {
  const dias = {}; table_('XpLog').rows.forEach(function (r) { if (r.MembroID === mid && String(r.Ref).indexOf('dia:') === 0) dias[diaNum_(String(r.Ref).slice(4))] = 1; });
  const ns = Object.keys(dias).map(Number).sort(function (a, b) { return a - b; }); let melhor = 0, run = 0, prev = null;
  ns.forEach(function (n) { run = prev !== null && n === prev + 1 ? run + 1 : 1; if (run > melhor) melhor = run; prev = n; });
  const hj = diaNum_(today_()); let atual = 0, x = dias[hj] ? hj : hj - 1; while (dias[x]) { atual++; x--; }
  return { atual: atual, melhor: melhor, total: ns.length };
}
/* ---- regras do lote de insígnias (v1.95): cada uma devolve o quanto a pessoa já fez ---- */
function seqDias_(dias) { // maior sequência de dias seguidos num conjunto {'AAAA-MM-DD': 1}
  const ns = Object.keys(dias).map(diaNum_).sort(function (a, b) { return a - b; }); let melhor = 0, run = 0, prev = null;
  ns.forEach(function (n) { run = prev !== null && n === prev + 1 ? run + 1 : 1; if (run > melhor) melhor = run; prev = n; });
  const hj = diaNum_(today_()), set = {}; ns.forEach(function (n) { set[n] = 1; }); let atual = 0, x = set[hj] ? hj : hj - 1; while (set[x]) { atual++; x--; }
  return { melhor: melhor, atual: atual, total: ns.length };
}
function diasBiblia_(mid) { // dias em que a pessoa leu a Bíblia no app (marcou versículo ou registrou leitura da Maratona)
  const s = {}, add = function (x) { const d = String(x || '').slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) s[d] = 1; };
  table_('BibMarcas').rows.forEach(function (r) { if (r.MembroID === mid) add(r.Data); });
  table_('CorridaLeitura').rows.forEach(function (r) { if (r.MembroID === mid && r.Status !== 'Recusado') add(r.Data); });
  return s;
}
function semanasSeguidas_(datas) { // maior número de semanas (segunda a domingo) seguidas com pelo menos uma data
  const w = {}; datas.forEach(function (d) { d = String(d || '').slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) w[Math.floor((diaNum_(d) + 3) / 7)] = 1; });
  const ns = Object.keys(w).map(Number).sort(function (a, b) { return a - b; }); let melhor = 0, run = 0, prev = null; ns.forEach(function (n) { run = prev !== null && n === prev + 1 ? run + 1 : 1; if (run > melhor) melhor = run; prev = n; }); return melhor;
}
function minhasCelulas_(mid) { const o = {}; table_('Celulas').rows.forEach(function (c) { if (c.LiderID === mid) o[c.CelulaID] = 1; }); return o; }
function sodLinha_(mid) { const r = sodTab_().rows.filter(function (x) { return x.MembroID === mid; })[0]; return r ? sodEst_(r) : null; }
const CRIT_EXTRA_ = {
  cultos: function (c, mid) { return lazy_('Cultos').rows.filter(function (r) { return r.MembroID === mid; }).length; },
  eventos_celula: function (c, mid) {
    const hj = today_(), ev = {}; table_('Eventos').rows.forEach(function (e) { if (e.Escopo === 'celula' && e.Status !== 'Cancelado' && e.Data <= hj) ev[e.EventoID] = 1; }); const meus = {};
    table_('Inscricoes').rows.forEach(function (r) { if (r.MembroID === mid && ev[r.EventoID]) meus[r.EventoID] = 1; }); table_('EventoPresenca').rows.forEach(function (r) { if (r.MembroID === mid && ev[r.EventoID]) meus[r.EventoID] = 1; }); return Object.keys(meus).length;
  },
  reunioes_seq: function (c, mid) { return semanasSeguidas_(table_('Presencas').rows.filter(function (r) { return r.MembroID === mid; }).map(function (r) { return r.Data; })); },
  lider_reunioes: function (c, mid) { const cs = minhasCelulas_(mid); return table_('Reunioes').rows.filter(function (r) { return cs[r.CelulaID]; }).length; },
  celula_votos: function (c, mid) { return lazy_('VotosDeus').rows.filter(function (r) { return r.MembroID === mid; }).length; },
  celula_mural: function (c, mid) { return lazy_('MuralCelula').rows.filter(function (r) { return r.AutorID === mid; }).length; },
  celula_visitantes: function (c, mid) { return table_('Visitantes').rows.filter(function (r) { return r.RegistradoPor === mid; }).length; },
  celula_multiplicou: function (c, mid) { const cs = minhasCelulas_(mid); return table_('Celulas').rows.filter(function (r) { return r.MaeID && cs[r.MaeID]; }).length; },
  biblia_dias: function (c, mid) { return Object.keys(diasBiblia_(mid)).length; },
  biblia_seq: function (c, mid) { const q = seqDias_(diasBiblia_(mid)); return Math.max(q.atual, q.melhor); },
  sod_soltos: function (c, mid) { const e = sodLinha_(mid); return e ? e.Soltos : 0; },
  sod_golpes: function (c, mid) { const e = sodLinha_(mid); return e ? Math.round(e.Golpes) : 0; },
  sod_caixas: function (c, mid) { const e = sodLinha_(mid); return e ? e.Abertas : 0; },
  sod_missoes: function (c, mid) { return table_('XpLog').rows.filter(function (r) { return r.MembroID === mid && String(r.Ref).indexOf('sodm:') === 0; }).length; },
  sod_roupas: function (c, mid) { const e = sodLinha_(mid); return e ? e.itens.filter(function (x) { return x.k === 'rou'; }).length : 0; },
  sod_lendarios: function (c, mid) { const e = sodLinha_(mid); return e ? e.itens.filter(function (x) { return x.r === 'lendario'; }).length : 0; },
  abas_distintas: function (c, mid) { const r = lazy_('AbasVistas').rows.filter(function (x) { return x.MembroID === mid; })[0]; return r ? Object.keys(jparse_(r.Mapa, {})).length : 0; },
  abas_abertas: function (c, mid) { const r = lazy_('AbasVistas').rows.filter(function (x) { return x.MembroID === mid; })[0]; return r ? Number(r.Total) || 0 : 0; },
  livros_lidos: function (c, mid) { return lazy_('LivroLeitura').rows.filter(function (r) { return r.MembroID === mid && r.Concluido === '1'; }).length; },
  livros_opinioes: function (c, mid) { return table_('LivroNotas').rows.filter(function (r) { return r.MembroID === mid; }).length + table_('LivroComentarios').rows.filter(function (r) { return r.MembroID === mid && r.Status !== 'Removido' && r.Status !== 'removido'; }).length; },
  videos_vistos: function (c, mid) { return lazy_('VideosVistos').rows.filter(function (r) { return r.MembroID === mid && Number(r.Seg) >= 60; }).length; },
  lives_vistas: function (c, mid) { return lazy_('VideosVistos').rows.filter(function (r) { return r.MembroID === mid && r.Tipo === 'live' && Number(r.Seg) >= 60; }).length; },
  videos_min: function (c, mid) { let s = 0; lazy_('VideosVistos').rows.forEach(function (r) { if (r.MembroID === mid) s += Number(r.Seg) || 0; }); return Math.floor(s / 60); },
  chat_amigos: function (c, mid) { const env = {}, rec = {}; table_('ChatMsgs').rows.forEach(function (r) { if (r.De === mid) env[r.Para] = 1; else if (r.Para === mid) rec[r.De] = 1; }); return Object.keys(env).filter(function (k) { return rec[k]; }).length; },
  chat_msgs: function (c, mid) { return table_('ChatMsgs').rows.filter(function (r) { return r.De === mid; }).length; },
  perfis_visitados: function (c, mid) { return lazy_('PerfilVisitas').rows.filter(function (r) { return r.MembroID === mid; }).length; },
  elogios_dados: function (c, mid) { const s = {}; lazy_('Elogios').rows.forEach(function (r) { if (r.De === mid) s[r.Para] = 1; }); return Object.keys(s).length; },
  elogios_recebidos: function (c, mid) { const s = {}; lazy_('Elogios').rows.forEach(function (r) { if (r.Para === mid) s[r.De] = 1; }); return Object.keys(s).length; },
  curtidas: function (c, mid) { return table_('Curtidas').rows.filter(function (r) { return r.MembroID === mid; }).length; }
};
// guarda o resultado de cada regra enquanto confere várias insígnias de uma vez (muitas usam a mesma regra, só muda o N)
function critProgMemo_(c, mid, memo) {
  const k = [c.tipo, c.palavra || '', c.atividade || '', c.consecutivos || '', c.n || '', c.meses || ''].join('|');
  if (memo && memo[k]) return memo[k]; const r = critProg_(c, mid); if (memo) memo[k] = r; return r;
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
  if (c.tipo === 'eventos_palavra') {
    const q = norm_(c.palavra), hj = today_(), ev = {}; table_('Eventos').rows.forEach(function (e) { if (e.Status !== 'Cancelado' && e.Data <= hj && norm_(e.Titulo).indexOf(q) >= 0) ev[e.EventoID] = 1; });
    const s = {}; table_('EventoPresenca').rows.forEach(function (r) { if (r.MembroID === mid && ev[r.EventoID]) s[r.EventoID] = 1; }); return { atual: Object.keys(s).length, meta: meta };
  }
  if (CRIT_EXTRA_[c.tipo]) return { atual: CRIT_EXTRA_[c.tipo](c, mid), meta: meta };
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
  const out = arr.map(function (x, i) { const n = Math.floor(Number(x.n)); if (!(n >= 1 && n <= CRIT_MAX)) throw new ApiError('VALIDATION', 'Nível ' + (i + 1) + ': informe o parâmetro (quantidade) de 1 a ' + CRIT_MAX + '.'); return { nome: clip_(x.nome, 30), n: n, xp: Math.max(10, Math.min(1000, Math.floor(Number(x.xp) || xpBase || 100))), visual: visualLimpo_(x.visual, base) }; });
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
  const o = { id: r.DefID, codigo: 'cust:' + r.DefID, titulo: r.Nome, categoria: r.Categoria || '', descricao: r.Descricao || '', criterio: c, regra: critTexto_(cc) + (ex.length > 1 ? ' (' + ex.length + ' níveis)' : ''), xp: Number(r.XP) || 100, ativo: r.Ativo !== '0', visual: { estilo: r.Estilo || 'bordado', forma: r.Forma || 'circ', cor1: r.Cor1 || '#2f6b3a', cor2: r.Cor2 || '#efe3b0', icone: r.Icone || 'estrela', texto: r.Texto || '', som: r.Som || '' } };
  if (ex.length) o.niveis = nvs.map(function (x) { return { k: x.k, nome: x.nome, n: x.n, xp: x.xp, visual: x.visual, regra: critTexto_(Object.assign({}, c, c.tipo === 'servico' ? { meses: x.n } : { n: x.n })) }; });
  return o;
}
function defsAtivas_() { return table_('InsigniaDefs').rows.filter(function (r) { return r.Ativo !== '0'; }); }
// confere as insígnias criadas pelos supervisores e entrega as que a pessoa já alcançou (chamada dentro dos pontos em que algo muda)
function avaliaDefs_(mid, ensaio) { // ensaio=true: só conta o que seria concedido, sem gravar nada (pode rodar fora do cadeado)
  if (!mid) return 0; let n = 0; const meus = {}, memo = {}; table_('Insignias').rows.forEach(function (r) { if (r.MembroID === mid) meus[r.Ref] = 1; });
  defsAtivas_().forEach(function (r) {
    const c = jparse_(r.Criterio, { tipo: 'manual' }); if (c.tipo === 'manual') return;
    const nvs = defNiveis_(r); if (nvs.every(function (nv) { return meus[nivelCod_(r.DefID, nv.k)]; })) return;
    const atual = critProgMemo_(c, mid, memo).atual;
    nvs.forEach(function (nv) { const cod = nivelCod_(r.DefID, nv.k); if (!meus[cod] && atual >= nv.n && (ensaio || awardBadge_(mid, cod, nivelTitulo_(r, nv, nvs.length), '', nv.xp))) n++; });
  });
  return n;
}
/* ============================== LOTE DE INSÍGNIAS (v1.95) ==============================
   Catálogo semeado pelo setup(): cada insígnia tem níveis (parâmetro N), do bordado ao Celeste. Só cria o que ainda não existe
   (pelo DefID), então depois de criada pode ser editada em Criar insígnias sem o setup() desfazer nada. */
const LOTE_PAL_ = { bronze: ['#a5602c', '#f8e1c9'], prata: ['#8b97a5', '#f3f6fa'], ouro: ['#d6a21d', '#fff1b8'], celeste: ['#7b6fd6', '#f4efff'], jaspe: ['#b5432a', '#ffe9dc'], ametista: ['#9a5fd0', '#f6ebff'], topazio: ['#f0b429', '#6b3f00'], esmeralda: ['#1fa65a', '#e8fff0'], safira: ['#2f6fd6', '#eaf3ff'], rubi: ['#d4203f', '#fff0f3'], diamante: ['#bfe9ff', '#2f6a8c'] };
const LOTE_XP_ = [15, 25, 40, 65, 100, 150, 220, 320, 460, 650];
// acabamento de cada nível: começa no bordado ou bronze e termina no Celeste (cel: 2 = os dois últimos são Celeste)
function loteEstilos_(k, cel) {
  // nível 1 = bordado, 2 = bronze, 3 = prata, 4 = ouro e do 5 em diante as pedras preciosas da Bíblia, da menos à mais valiosa
  const seq = ['bordado', 'bronze', 'prata', 'ouro', 'jaspe', 'ametista', 'topazio', 'esmeralda', 'safira', 'diamante'];
  if (k <= 1) return ['ouro'];
  const o = []; for (let i = 0; i < k; i++) o.push(seq[Math.min(i, seq.length - 1)]); return o;
}
// v1.96: troca o acabamento dos níveis das insígnias do lote (bordado, bronze, prata, ouro e depois as pedras). Roda uma só vez, para não desfazer edições futuras.
function migraEstilosLote_() {
  const pr = PropertiesService.getScriptProperties(); if (pr.getProperty('LOTE_GEMAS') === '1') return 0;
  const t = table_('InsigniaDefs'); let n = 0;
  LOTE_BD.forEach(function (a) {
    const id = 'IBL_' + a[0], r = t.rows.filter(function (x) { return x.DefID === id; })[0]; if (!r) return;
    const ex = jparse_(r.Niveis, []); if (ex.length < 2) return;
    const x = { forma: a[5], ic: a[4], c: LOTE_COR_[a[1]] }, est = loteEstilos_(ex.length, 0);
    const nv = ex.map(function (v, i) { const e = est[i], cor = e === 'bordado' ? x.c : LOTE_PAL_[e], vis = Object.assign({}, v.visual || {}); vis.estilo = e; vis.cor1 = cor[0]; vis.cor2 = cor[1]; return Object.assign({}, v, { visual: vis }); });
    writeRow_(t, r._row, { Niveis: JSON.stringify(nv), Estilo: nv[0].visual.estilo, Cor1: nv[0].visual.cor1, Cor2: nv[0].visual.cor2 }); n++;
  });
  pr.setProperty('LOTE_GEMAS', '1'); return n;
}
const loteTexto_ = function (n) { return n >= 10000 ? Math.floor(n / 1000) + 'k' : String(n); };
function loteNiveis_(x) {
  const k = x.n.length, est = loteEstilos_(k, x.cel), f = x.f || 1;
  return x.n.map(function (p, i) {
    const e = est[i], cor = e === 'bordado' ? x.c : LOTE_PAL_[e], xp = Math.max(10, Math.min(1000, Math.round((k === 1 ? 60 : LOTE_XP_[Math.round(i * 9 / (k - 1))]) * f)));
    return { nome: p[1], n: p[0], xp: xp, visual: { estilo: e, forma: x.forma, icone: x.ic, cor1: cor[0], cor2: cor[1], texto: loteTexto_(p[0]), som: '' } };
  });
}
const LOTE_CAT_ = { ev: 'Eventos', rt: 'Retiros', en: 'Encontros', ec: 'Eventos de Célula', ce: 'Células', sd: 'Sod', ab: 'Abas do App', bi: 'Biblioteca', vd: 'Vídeos e Transmissões', ch: 'Chat', pf: 'Perfis e Elogios', bb: 'Bíblia', sv: 'Serviço e Cursos', fd: 'Fidelidade' };
const LOTE_COR_ = { ev: ['#2f6b3a', '#efe3b0'], rt: ['#5b3a8c', '#efe6ff'], en: ['#b5513a', '#ffe6dc'], ec: ['#1f7a8c', '#dff3f6'], ce: ['#3a7d44', '#e3f4e2'], sd: ['#4b5d9e', '#e7ecff'], ab: ['#c56a1b', '#ffe9cf'], bi: ['#7a4e2d', '#f5e6d3'], vd: ['#b02a37', '#fde2e4'], ch: ['#00796b', '#d8f3ef'], pf: ['#d6336c', '#ffe3ee'], bb: ['#b8860b', '#fff4cc'], sv: ['#8d5524', '#f6e3d3'], fd: ['#2f6b3a', '#efe3b0'] };
// [id, categoria, nome, descrição, ícone, forma, regra, níveis [N, nome] (vazio = nível único), fator de XP, acabamentos Celeste no fim]
const LOTE_BD = [
  ['EV_PRES', 'ev', 'Casa Cheia', 'Compareça aos eventos da igreja e faça parte de cada momento.', 'casa', 'esc', { tipo: 'eventos_total' }, [[1, 'Chegou'], [3, 'Voltou'], [5, 'Constante'], [10, 'Fiel'], [25, 'Pilar'], [50, 'Coluna'], [100, 'Celestial']], 1],
  ['EV_CULTO', 'ev', 'Adorador', 'Esteja presente nos cultos da igreja (presença registrada pela câmera ou pelos líderes).', 'harpa', 'circ', { tipo: 'cultos' }, [[1, 'Primeiro Culto'], [5, 'Constante'], [10, 'Fiel'], [25, 'Perseverante'], [50, 'Firme'], [100, 'Incansável'], [250, 'Adorador de Verdade'], [500, 'Celestial']], 1.2],
  ['RT_PART', 'rt', 'Retirante', 'Participe dos retiros da igreja e suba o monte com a família.', 'montanha', 'hex', { tipo: 'eventos_palavra', palavra: 'retiro' }, [[1, 'Primeiro Retiro'], [2, 'Repetiu'], [3, 'No Monte'], [5, 'Peregrino'], [7, 'Veterano'], [10, 'Celestial']], 1.3],
  ['RT_U3', 'rt', 'Retiro Sem Falta', 'Esteve nos 3 últimos retiros da igreja.', 'fogueira', 'oct', { tipo: 'eventos_ultimos', palavra: 'retiro', n: 3 }, [], 1.2, 'ouro'],
  ['RT_U5', 'rt', 'Inseparável do Retiro', 'Esteve nos 5 últimos retiros da igreja. Não perdeu nenhum!', 'tenda', 'oct', { tipo: 'eventos_ultimos', palavra: 'retiro', n: 5 }, [], 2, 'celeste'],
  ['EN_PART', 'en', 'Encontrado', 'Participe dos encontros da igreja e deixe Deus falar ao seu coração.', 'abraco', 'circ', { tipo: 'eventos_palavra', palavra: 'encontro' }, [[1, 'Primeiro Encontro'], [3, 'Aberto'], [5, 'Reconciliado'], [10, 'Transformado'], [20, 'Celestial']], 1.2],
  ['EN_U3', 'en', 'Encontros em Sequência', 'Esteve nos 3 últimos encontros da igreja.', 'coracao', 'losango', { tipo: 'eventos_ultimos', palavra: 'encontro', n: 3 }, [], 1.2, 'ouro'],
  ['EC_PART', 'ec', 'Em Família', 'Participe dos eventos da sua célula (confirmando presença).', 'convite', 'esc', { tipo: 'eventos_celula' }, [[1, 'Chegou'], [3, 'Amigo da Célula'], [5, 'Parceiro'], [10, 'Inseparável'], [25, 'Alma da Célula'], [50, 'Celestial']], 1],
  ['CE_REU', 'ce', 'Pé na Célula', 'Esteja presente nas reuniões da sua célula.', 'pegada', 'circ', { tipo: 'reunioes' }, [[1, 'Primeira Reunião'], [4, 'Um Mês'], [8, 'Constante'], [12, 'Fiel'], [26, 'Meio Ano'], [52, 'Um Ano'], [104, 'Dois Anos'], [200, 'Raiz'], [400, 'Celestial']], 1.4],
  ['CE_SEM', 'ce', 'Semanas Fiéis', 'Vá à célula semana após semana, sem falhar.', 'calendario', 'hex', { tipo: 'reunioes_seq' }, [[2, 'Duas Semanas'], [4, 'Um Mês'], [8, 'Dois Meses'], [12, 'Trimestre'], [26, 'Semestre'], [52, 'Um Ano'], [104, 'Celestial']], 1.5],
  ['CE_VOTO', 'ce', 'Termômetro Vivo', 'Dê a sua nota de presença de Deus depois das reuniões da célula.', 'flame', 'circ', { tipo: 'celula_votos' }, [[1, 'Primeira Nota'], [5, 'Atento'], [10, 'Sensível'], [25, 'Discernidor'], [50, 'Profeta'], [100, 'Celestial']], 1],
  ['CE_MURAL', 'ce', 'Memória da Célula', 'Deixe fotos, recados e desenhos no mural da sua célula.', 'camera', 'losango', { tipo: 'celula_mural' }, [[1, 'Primeiro Registro'], [5, 'Cronista'], [10, 'Fotógrafo'], [25, 'Memorialista'], [50, 'Celestial']], 1],
  ['CE_VIS', 'ce', 'Pescador de Gente', 'Cadastre visitantes novos e ajude a igreja a acolher quem chega.', 'peixe', 'hex', { tipo: 'celula_visitantes' }, [[1, 'Primeira Rede'], [3, 'Pescador'], [5, 'Convidador'], [10, 'Barco Cheio'], [25, 'Multiplicador'], [50, 'Celestial']], 1.2],
  ['CE_MULT', 'ce', 'Multiplicação', 'Lidere uma célula que gerou novas células.', 'semente', 'oct', { tipo: 'celula_multiplicou' }, [[1, 'Semente'], [2, 'Broto'], [3, 'Árvore'], [5, 'Bosque'], [10, 'Celestial']], 1.5],
  ['CE_LID', 'ce', 'Pastor de Célula', 'Dirija as reuniões como líder de célula.', 'maos', 'esc', { tipo: 'lider_reunioes' }, [[4, 'Um Mês'], [12, 'Trimestre'], [26, 'Semestre'], [52, 'Um Ano'], [104, 'Dois Anos'], [208, 'Celestial']], 1.4],
  ['CE_ORA', 'ce', 'Intercessor', 'Poste pedidos de oração e interceda pela família da célula.', 'vela', 'circ', { tipo: 'oracoes' }, [[1, 'Primeiro Pedido'], [5, 'Clamor'], [10, 'Vigia'], [25, 'Intercessor'], [50, 'Sacerdote'], [100, 'Celestial']], 1],
  ['SD_SOLT', 'sd', 'Libertador de Luz', 'Liberte o Sod das pedras com 7 dias firmes com Deus.', 'sol', 'circ', { tipo: 'sod_soltos' }, [[1, 'Luz Livre'], [3, 'Libertador'], [5, 'Guardião'], [10, 'Mestre da Luz'], [25, 'Celestial']], 1.3],
  ['SD_MISS', 'sd', 'Dias com Deus', 'Cumpra as missões diárias do Sod: entrar, ler a Bíblia e orar.', 'estrela', 'esc', { tipo: 'sod_missoes' }, [[1, 'Primeiro Dia'], [7, 'Uma Semana'], [30, 'Um Mês'], [60, 'Dois Meses'], [100, 'Cem Dias'], [200, 'Firme'], [365, 'Um Ano'], [730, 'Celestial']], 1.4],
  ['SD_GOLP', 'sd', 'Mineiro de Pedras', 'Quebre as pedras que cobrem o Sod.', 'raio', 'hex', { tipo: 'sod_golpes' }, [[500, 'Aprendiz'], [2500, 'Mineiro'], [10000, 'Quebra-Pedra'], [25000, 'Britador'], [50000, 'Mestre'], [100000, 'Celestial']], 1.2],
  ['SD_CAIX', 'sd', 'Caçador de Caixas', 'Abra as caixas do Sod e descubra ferramentas e roupas.', 'presente', 'oct', { tipo: 'sod_caixas' }, [[1, 'Primeira Caixa'], [5, 'Curioso'], [10, 'Colecionador'], [25, 'Caçador'], [50, 'Tesoureiro'], [100, 'Celestial']], 1],
  ['SD_ROUP', 'sd', 'Guarda-roupa do Reino', 'Junte roupas para o seu personagem do Sod.', 'coroa', 'losango', { tipo: 'sod_roupas' }, [[3, 'Vestido'], [8, 'Estiloso'], [15, 'Elegante'], [25, 'Alfaiate'], [40, 'Celestial']], 1],
  ['SD_LEND', 'sd', 'Tesouro Lendário', 'Encontre itens lendários nas caixas do Sod.', 'diamante', 'hex', { tipo: 'sod_lendarios' }, [[1, 'Lendário'], [2, 'Dois Lendários'], [3, 'Colecionador'], [5, 'Dono do Tesouro'], [10, 'Celestial']], 1.4],
  ['AB_DIST', 'ab', 'Explorador do App', 'Descubra as abas e telas diferentes do aplicativo da igreja.', 'bussola', 'circ', { tipo: 'abas_distintas' }, [[5, 'Curioso'], [10, 'Explorador'], [20, 'Desbravador'], [35, 'Navegador'], [50, 'Conhecedor'], [75, 'Mestre do App'], [100, 'Celestial']], 1.2],
  ['AB_ABR', 'ab', 'Cem Abas e Além', 'Cada vez que você abre uma aba do app, conta. Chegue a 100, 500, 1000 abas abertas e muito mais.', 'raio', 'esc', { tipo: 'abas_abertas' }, [[100, 'Cem Abas'], [500, 'Navegante'], [1000, 'Mil Abas'], [2500, 'Morador do App'], [5000, 'Incansável'], [10000, 'Celestial']], 1.2],
  ['BI_LIDO', 'bi', 'Leitor Voraz', 'Leia um livro da biblioteca do começo ao fim: 100% das páginas abertas no leitor.', 'livro', 'esc', { tipo: 'livros_lidos' }, [[1, 'Primeiro Livro'], [3, 'Leitor'], [5, 'Estudioso'], [10, 'Bibliófilo'], [25, 'Sábio'], [50, 'Celestial']], 1.2],
  ['BI_RES', 'bi', 'Resenhista', 'Dê notas e comentários nos livros da biblioteca.', 'caneta', 'losango', { tipo: 'livros_opinioes' }, [[1, 'Primeira Opinião'], [5, 'Crítico'], [10, 'Resenhista'], [25, 'Mestre'], [50, 'Celestial']], 1],
  ['VD_VID', 'vd', 'Espectador', 'Assista a vídeos no app da igreja (pelo menos 1 minuto cada).', 'camera', 'circ', { tipo: 'videos_vistos' }, [[1, 'Primeiro Vídeo'], [5, 'Curioso'], [10, 'Espectador'], [25, 'Fã'], [50, 'Maratonista'], [100, 'Celestial']], 1],
  ['VD_LIVE', 'vd', 'Ao Vivo na Presença', 'Assista às transmissões da igreja pelo app.', 'megafone', 'hex', { tipo: 'lives_vistas' }, [[1, 'Primeira Live'], [3, 'Conectado'], [5, 'Frequente'], [10, 'Fiel das Lives'], [25, 'Imperdível'], [50, 'Celestial']], 1.1],
  ['VD_MIN', 'vd', 'Horas de Edificação', 'Some minutos assistindo a vídeos e transmissões no app.', 'relogio', 'oct', { tipo: 'videos_min' }, [[30, 'Meia Hora'], [120, 'Duas Horas'], [600, 'Dez Horas'], [1800, 'Trinta Horas'], [6000, 'Cem Horas'], [12000, 'Celestial']], 1.2],
  ['CH_AMIGOS', 'ch', 'Amigo da Igreja', 'Converse com pessoas diferentes no chat da igreja (a conversa precisa ter resposta).', 'coracao', 'circ', { tipo: 'chat_amigos' }, [[1, 'Primeira Conversa'], [5, 'Roda de Amigos'], [10, 'Sociável'], [25, 'Conectador'], [50, 'Pontes'], [100, 'Celestial']], 1.1],
  ['CH_MSG', 'ch', 'Palavra Amiga', 'Envie mensagens de encorajamento no chat.', 'carta', 'esc', { tipo: 'chat_msgs' }, [[10, 'Primeiras Palavras'], [100, 'Conversador'], [500, 'Encorajador'], [2000, 'Consolador'], [5000, 'Celestial']], 1],
  ['PF_VIS', 'pf', 'Bom Vizinho', 'Visite o perfil de outras pessoas e conheça a família da igreja.', 'olho', 'circ', { tipo: 'perfis_visitados' }, [[1, 'Olá!'], [5, 'Curioso'], [10, 'Sociável'], [25, 'Conhecedor'], [50, 'Familiar'], [100, 'Celestial']], 1],
  ['PF_ELOGIO', 'pf', 'Palavras de Vida', 'Elogie o perfil de pessoas diferentes e edifique a igreja.', 'sorriso', 'hex', { tipo: 'elogios_dados' }, [[1, 'Primeiro Elogio'], [5, 'Encorajador'], [10, 'Edificador'], [25, 'Barnabé'], [50, 'Mestre do Elogio'], [100, 'Celestial']], 1.1],
  ['PF_REC', 'pf', 'Amado pela Família', 'Receba elogios de pessoas diferentes da igreja.', 'abraco', 'losango', { tipo: 'elogios_recebidos' }, [[1, 'Notado'], [5, 'Querido'], [10, 'Estimado'], [25, 'Referência'], [50, 'Exemplo'], [100, 'Celestial']], 1.1],
  ['PF_CURT', 'pf', 'Coração Generoso', 'Curta as publicações da igreja.', 'coracao', 'oct', { tipo: 'curtidas' }, [[1, 'Primeira Curtida'], [10, 'Simpático'], [50, 'Animador'], [100, 'Torcida'], [500, 'Celestial']], 0.8],
  ['BB_SEQ', 'bb', 'Palavra Todos os Dias', 'Leia a Bíblia no app todos os dias, sem faltar. O nível mais alto exige três anos seguidos.', 'biblia', 'circ', { tipo: 'biblia_seq' }, [[3, 'Três Dias'], [7, 'Uma Semana'], [14, 'Duas Semanas'], [30, 'Um Mês'], [90, 'Um Trimestre'], [180, 'Meio Ano'], [365, 'Um Ano'], [730, 'Dois Anos'], [1095, 'Três Anos na Palavra']], 1.5, 2],
  ['BB_DIAS', 'bb', 'Amigo da Palavra', 'Some dias de leitura da Bíblia no app (não precisam ser seguidos).', 'pergaminho', 'esc', { tipo: 'biblia_dias' }, [[10, 'Dez Dias'], [30, 'Um Mês'], [100, 'Cem Dias'], [200, 'Fiel'], [365, 'Um Ano'], [730, 'Dois Anos'], [1095, 'Celestial']], 1.3],
  ['BB_CAP', 'bb', 'Maratonista da Bíblia', 'Leia capítulos da Bíblia pela Maratona Bíblica. O último nível é a Bíblia inteira: 1189 capítulos.', 'tabuas', 'hex', { tipo: 'capitulos' }, [[1, 'Primeiro Capítulo'], [10, 'Aquecimento'], [50, 'Corredor'], [150, 'Fôlego'], [300, 'Mil Passos'], [600, 'Meio Caminho'], [1189, 'Bíblia Inteira']], 1.5],
  ['BB_NOTA', 'bb', 'Anotador da Palavra', 'Escreva comentários nos versículos da Bíblia.', 'caneta', 'losango', { tipo: 'anotacoes' }, [[1, 'Primeira Anotação'], [5, 'Atento'], [10, 'Estudante'], [25, 'Meditador'], [50, 'Escriba'], [100, 'Celestial']], 1],
  ['BB_DEV', 'bb', 'Devocional Diário', 'Poste devocionais da Maratona Bíblica.', 'lanterna', 'oct', { tipo: 'devocionais' }, [[1, 'Primeiro Devocional'], [7, 'Uma Semana'], [30, 'Um Mês'], [100, 'Cem Devocionais'], [365, 'Um Ano'], [1000, 'Celestial']], 1.3],
  ['SV_ESC', 'sv', 'Servo Fiel', 'Sirva nas escalas dos ministérios (com presença marcada).', 'arado', 'esc', { tipo: 'escalas' }, [[1, 'Primeiro Serviço'], [3, 'Disposto'], [5, 'Servo'], [10, 'Fiel'], [25, 'Dedicado'], [50, 'Incansável'], [100, 'Celestial']], 1.1],
  ['SV_CUR', 'sv', 'Aluno do Reino', 'Conclua cursos da igreja e receba o certificado.', 'livro', 'circ', { tipo: 'cursos' }, [[1, 'Primeiro Curso'], [2, 'Dois Cursos'], [3, 'Estudante'], [5, 'Discípulo'], [10, 'Celestial']], 1.2],
  ['SV_POST', 'sv', 'Voz da Igreja', 'Publique notas no feed da igreja.', 'megafone', 'hex', { tipo: 'posts' }, [[1, 'Primeira Nota'], [5, 'Participativo'], [10, 'Comunicador'], [25, 'Pregador'], [50, 'Celestial']], 1],
  ['FD_ACE', 'fd', 'Morador do App', 'Some dias de acesso ao aplicativo (não precisam ser seguidos).', 'casa', 'circ', { tipo: 'acessos' }, [[10, 'Visitante'], [30, 'Morador'], [100, 'Fiel'], [200, 'Presença Fixa'], [365, 'Um Ano'], [730, 'Dois Anos'], [1000, 'Celestial']], 1.2]
];
function semeiaLote_() {
  const t = table_('InsigniaDefs'), tem = {}; t.rows.forEach(function (r) { tem[r.DefID] = 1; }); let n = 0;
  const excl = jparse_(PropertiesService.getScriptProperties().getProperty('LOTE_EXCL'), []);
  LOTE_BD.forEach(function (a) {
    const id = 'IBL_' + a[0]; if (tem[id] || excl.indexOf(id) >= 0) return;
    const x = { id: id, cat: a[1], nome: a[2], desc: a[3], ic: a[4], forma: a[5], crit: a[6], n: a[7], f: a[8] || 1, cel: typeof a[9] === 'number' ? a[9] : 0, c: LOTE_COR_[a[1]] }, unico = !x.n.length;
    let visual, nv = '', xp;
    if (unico) { const est = a[9] || 'ouro', cor = est === 'bordado' ? x.c : LOTE_PAL_[est]; xp = Math.max(10, Math.min(1000, Math.round(60 * x.f))); visual = { estilo: est, forma: x.forma, icone: x.ic, cor1: cor[0], cor2: cor[1], texto: '' }; }
    else { const lv = loteNiveis_(x); nv = JSON.stringify(lv); xp = lv[0].xp; visual = lv[0].visual; }
    appendRow_(t, { DefID: id, Nome: x.nome, Descricao: x.desc, Estilo: visual.estilo, Forma: visual.forma, Cor1: visual.cor1, Cor2: visual.cor2, Icone: visual.icone, Texto: visual.texto || '', Som: '', XP: String(xp), Criterio: JSON.stringify(criterioLimpo_(x.crit, !unico)), Niveis: nv, Ativo: '1', CriadoPor: 'sistema', Categoria: LOTE_CAT_[x.cat] });
    n++;
  });
  return n;
}
function listInsigniaDefs_(d, u) {
  exigeCurar_(u); const ganhou = {}; table_('Insignias').rows.forEach(function (r) { if (String(r.Codigo).indexOf('cust:') === 0) ganhou[r.Codigo] = (ganhou[r.Codigo] || 0) + 1; });
  return { defs: table_('InsigniaDefs').rows.map(function (r) { const o = defOut_(r); o.ganharam = ganhou[o.codigo] || 0; return o; }), icones: ICONES_BD, formas: FORMAS_BD, estilos: ESTILOS_BD };
}
const parteCod_ = function (cod) { const m = /^cust:([^#]+)(?:#(\d+))?$/.exec(String(cod)); return m ? { id: m[1], k: Number(m[2] || 1) } : null; };
/* Retira uma insígnia das pessoas (as que passam em quais(linha, nível)), estorna o XP dela, tira dos destaques do perfil e avisa. */
function soltaInsigniasDef_(defId, quais, nome) {
  const ti = table_('Insignias'), tx = table_('XpLog'), alvo = ti.rows.filter(function (r) { const p = parteCod_(r.Codigo); return p && p.id === defId && quais(r, p.k); });
  if (!alvo.length) return { n: 0, xp: 0 };
  const chaves = {}; alvo.forEach(function (r) { chaves[r.MembroID + '|insignia:' + r.Ref] = r; });
  const pts = {}, xr = tx.rows.filter(function (x) { return chaves[x.MembroID + '|' + x.Ref]; });
  xr.forEach(function (x) { pts[x.MembroID] = (pts[x.MembroID] || 0) + (Number(x.Pontos) || 0); });
  alvo.slice().sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { delRow_(ti, r._row); });
  xr.sort(function (a, b) { return b._row - a._row; }).forEach(function (x) { delRow_(tx, x._row); });
  const tem = {}; table_('Insignias').rows.forEach(function (r) { tem[r.MembroID + '|' + r.Ref] = 1; });
  const tp = table_('Perfis'); tp.rows.forEach(function (pr) {
    const L = topLista_(pr.Top); if (!L.length) return;
    const nova = L.filter(function (x) { const p = parteCod_(x.r); return !(p && p.id === defId) || tem[pr.MembroID + '|' + x.r]; });
    if (nova.length !== L.length) writeRow_(tp, pr._row, { Top: JSON.stringify(nova) });
  });
  const ja = {}; alvo.forEach(function (r) { if (!ja[r.MembroID]) { ja[r.MembroID] = 1; try { notify_(r.MembroID, 'insignia', 'Insígnia retirada: ' + nome, 'Ela foi retirada do seu perfil' + (pts[r.MembroID] ? ' e ' + pts[r.MembroID] + ' XP foram estornados.' : '.'), ''); } catch (e) { /* aviso é opcional */ } } });
  let xp = 0; Object.keys(pts).forEach(function (k) { xp += pts[k]; }); return { n: Object.keys(ja).length, xp: xp };
}
function deleteInsigniaDef_(d, u) {
  exigeCurar_(u);
  return withLock_(function () {
    const t = table_('InsigniaDefs'), r = t.rows.filter(function (x) { return x.DefID === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Insígnia não encontrada.');
    const rv = soltaInsigniasDef_(r.DefID, function () { return true; }, r.Nome);
    delRow_(t, r._row);
    if (String(r.DefID).indexOf('IBL_') === 0) { const pr = PropertiesService.getScriptProperties(), L = jparse_(pr.getProperty('LOTE_EXCL'), []); L.push(r.DefID); pr.setProperty('LOTE_EXCL', JSON.stringify(L)); } // o setup() não recria as do lote que foram excluídas
    audit_(u.email, 'INSIGNIA_EXCLUIDA', r.DefID + ' ' + r.Nome + ' (' + rv.n + ' pessoa(s), ' + rv.xp + ' XP estornados)', 'OK'); return { ok: true, pessoas: rv.n, xp: rv.xp };
  });
}
/* Depois de editar: tira de quem não tem mais direito (nível que sumiu ou regra mais difícil/diferente), entrega a quem passou a ter e acerta nome e XP de quem já ganhou. A aparência já vale para todos, pois o perfil lê a insígnia. */
function reconciliaDef_(id, antes) {
  const t = table_('InsigniaDefs'), r = t.rows.filter(function (x) { return x.DefID === id; })[0]; if (!r) return;
  const nvs = defNiveis_(r), c = jparse_(r.Criterio, { tipo: 'manual' }), ca = jparse_(antes.Criterio, { tipo: 'manual' });
  soltaInsigniasDef_(id, function (row, k) { return k > nvs.length; }, r.Nome);
  const mudou = JSON.stringify(c) !== JSON.stringify(ca) || String(r.Niveis || '') !== String(antes.Niveis || '');
  if (c.tipo !== 'manual' && mudou) {
    soltaInsigniasDef_(id, function (row, k) { const nv = nvs[k - 1]; return !!nv && critProgMemo_(c, row.MembroID, {}).atual < nv.n; }, r.Nome);
    table_('Membros').rows.forEach(function (m) { try { avaliaDefs_(m.MembroID); } catch (e) { /* segue */ } });
  }
  const ti = table_('Insignias'), tx = table_('XpLog'), por = {}; tx.rows.forEach(function (x) { if (String(x.Ref).indexOf('insignia:') === 0) por[x.MembroID + '|' + x.Ref] = x; });
  ti.rows.forEach(function (row) {
    const p = parteCod_(row.Codigo); if (!p || p.id !== id) return; const nv = nvs[p.k - 1]; if (!nv) return;
    const tit = nivelTitulo_(r, nv, nvs.length); if (row.Titulo !== clip_(tit, 80)) writeRow_(ti, row._row, { Titulo: clip_(tit, 80) });
    const x = por[row.MembroID + '|insignia:' + row.Ref]; if (x && Number(x.Pontos) !== nv.xp) writeRow_(tx, x._row, { Pontos: String(nv.xp) });
  });
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
    const row = { Nome: nome, Categoria: clip_(d.categoria, 30), Descricao: clip_(d.descricao, 200), Estilo: estilo, Forma: forma, Cor1: cor(v.cor1, '#2f6b3a'), Cor2: cor(v.cor2, '#efe3b0'), Icone: icone, Texto: clip_(v.texto, 4), Som: vb.som, XP: String(xp), Criterio: JSON.stringify(criterioLimpo_(d.criterio, niv.length > 0)), Niveis: niv.length ? JSON.stringify(niv) : '', Ativo: d.ativo === false ? '0' : '1' };
    let id; if (ex) { const antes = { Criterio: ex.Criterio, Niveis: ex.Niveis }; writeRow_(t, ex._row, row); id = ex.DefID; reconciliaDef_(id, antes); } else { id = id_('IB'); appendRow_(t, Object.assign({ DefID: id, CriadoPor: u.membroId }, row)); }
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
    if (p && defs[p.id]) { const x = defOut_(defs[p.id]); o.categoria = x.categoria; o.visual = x.visual; o.descricao = x.descricao; o.regra = x.regra; if (x.niveis) { o.lista = x.niveis; const nv = x.niveis[p.k - 1]; if (nv) { o.visual = nv.visual; o.nivel = p.k; o.niveis = x.niveis.length; o.regra = critTexto_(Object.assign({}, x.criterio, x.criterio.tipo === 'servico' ? { meses: nv.n } : { n: nv.n })); } } }
    return o;
  });
}
// as que ainda não foram conquistadas aparecem escuras no perfil
function bloqueadas_(mid, meu, ganhas) {
  const memoB = {}, tem = {}; ganhas.forEach(function (g) { tem[g.codigo + (g.ano ? ':' + g.ano : '')] = 1; tem[g.codigo] = 1; }); table_('Insignias').rows.forEach(function (r) { if (r.MembroID === mid) { tem[r.Codigo] = 1; tem[r.Ref] = 1; } }); const out = [], ano = today_().slice(0, 4);
  [['perfil', 'Perfil completo', 'Preencha todos os dados em Editar perfil.', ''], ['decisao', 'Decisão por Cristo', 'Registre a sua decisão por Cristo.', ''], ['batismo', 'Batizado', 'Registre a data do seu batismo.', ''], ['presenca', 'Presença total', 'Compareça a todos os eventos do ano.', ano]].forEach(function (b) {
    if (!ganhas.some(function (g) { return g.codigo === b[0] && (b[0] !== 'presenca' || g.ano === ano); })) out.push({ codigo: b[0], titulo: b[1], descricao: b[2], ano: b[3] });
  });
  table_('Eventos').rows.forEach(function (e) { if (!e.Insignia || e.Status === 'Cancelado' || String(e.Data).slice(0, 4) !== ano) return; if (!ganhas.some(function (g) { return g.codigo === 'evento:' + e.EventoID; })) out.push({ codigo: 'evento:' + e.EventoID, titulo: e.Insignia, descricao: 'Compareça a ' + e.Titulo + '.', ano: ano }); });
  defsAtivas_().forEach(function (r) {
    const nvs = defNiveis_(r), prox = nvs.filter(function (nv) { return !tem[nivelCod_(r.DefID, nv.k)]; })[0]; if (!prox) return;
    const x = defOut_(r), explicito = !!x.niveis, o = { codigo: nivelCod_(r.DefID, prox.k), titulo: nivelTitulo_(r, prox, nvs.length), categoria: x.categoria, descricao: x.descricao, regra: explicito ? critTexto_(Object.assign({}, x.criterio, x.criterio.tipo === 'servico' ? { meses: prox.n } : { n: prox.n })) : x.regra, visual: explicito ? prox.visual : x.visual, ano: '' };
    if (explicito) { o.nivel = prox.k; o.niveis = nvs.length; o.lista = x.niveis; }
    if (meu) { const p = critProgMemo_(x.criterio, mid, memoB); const meta = explicito ? prox.n : p.meta; o.progresso = { atual: Math.min(p.atual, meta), meta: meta }; } out.push(o);
  });
  return out;
}
function perfilRow_(mid) { return table_('Perfis').rows.filter(function (r) { return r.MembroID === mid; })[0]; }
function elogiosDe_(mid, eu) { // quantas pessoas já elogiaram este perfil e se eu já elogiei hoje
  const hj = today_(), de = {}; let hoje = false; lazy_('Elogios').rows.forEach(function (r) { if (r.Para !== mid) return; de[r.De] = 1; if (r.De === eu && r.Data === hj) hoje = true; }); return { n: Object.keys(de).length, hoje: hoje };
}
function profileView_(d, u) {
  const mid = clip_(d.membroId, 30) || u.membroId, m = table_('Membros').rows.filter(function (x) { return x.MembroID === mid && x.Status !== 'Inativo'; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Perfil não encontrado.');
  const meu = mid === u.membroId;
  // só pega o cadeado de escrita quando há mesmo insígnia nova a conceder (antes pegava a cada abertura do perfil, ~7 s por vez, e travava a fila de todos)
  if (meu && avaliaDefs_(mid, true)) withLock_(function () { if (TMEMO_) TMEMO_ = {}; avaliaDefs_(mid); }); // dentro do cadeado relê as abas, para não decidir com dados velhos
  const p = perfilRow_(mid) || {}, rs = xpResumo_(mid), ganhas = listInsignias_(mid);
  const contorno = CONTORNOS.indexOf(p.Contorno) >= 0 ? p.Contorno : (CONTORNOS.indexOf(p.Moldura) >= 0 ? p.Moldura : 'simples');
  const cel0 = m.CelulaID ? table_('Celulas').rows.filter(function (c) { return c.CelulaID === m.CelulaID; })[0] : null;
  const out = { id: mid, meu: meu, celula: cel0 ? cel0.Nome : '', nome: m.Simples || m.Nome, apelido: m.Apelido || '', foto: m.Foto || '', bio: p.Bio || '', capa: p.Capa || '', fundo: FUNDOS.indexOf(p.Fundo) >= 0 ? p.Fundo : 'zoe', contorno: contorno, moldura: MOLDURAS.indexOf(p.Quadro) >= 0 ? p.Quadro : 'nenhuma', versiculo: p.Versiculo || '', xp: rs, insignias: ganhas, top: topLista_(p.Top).map(function (x) { const g = ganhas.filter(function (g) { return g.codigo + (g.ano ? ':' + g.ano : '') === x.r; })[0]; return g ? Object.assign({}, g, { fx: x.fx }) : null; }).filter(Boolean).slice(0, 5), bloqueadas: bloqueadas_(mid, meu, ganhas), elogios: elogiosDe_(mid, u.membroId), oculto: p.Oculto === '1', envolvimento: (p.Oculto === '1' && !meu) ? null : envolvimento_(m),
    destaques: table_('PerfilFotos').rows.filter(function (r) { return r.MembroID === mid; }).sort(function (a, b) { return Number(a.Ordem) - Number(b.Ordem); }).map(function (r) { return { id: r.FotoID, foto: r.Foto, legenda: r.Legenda || '' }; }) };
  if (meu) out.libera = { fundos: reqMap_(FUNDOS), contornos: reqMap_(CONTORNOS), molduras: reqMap_(MOLDURAS), capa: NV_CAPA, versiculo: NV_VERSICULO, mural: NV_MURAL, slots: slotsMural_(rs.nivel), topSlots: slotsTop_(rs.nivel), fx: efeitosLib_(), tiers: TIER_NOMES };
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
      const tem = {}; listInsignias_(u.membroId).forEach(function (g) { tem[g.codigo + (g.ano ? ':' + g.ano : '')] = 1; }); const lib = efeitosLib_(), vistos = {};
      const top = (Array.isArray(d.insigniasTop) ? d.insigniasTop : []).map(function (x) { return typeof x === 'string' ? { r: clip_(x, 60), fx: '' } : { r: clip_(x && x.r, 60), fx: String((x && x.fx) || '') }; }).filter(function (x) { if (!tem[x.r] || vistos[x.r]) return false; vistos[x.r] = 1; return true; }).slice(0, slotsTop_(nv));
      top.forEach(function (x) { if (x.fx && (EFEITOS_TOP_.indexOf(x.fx) < 0 || nv < lib[x.fx])) throw new ApiError('FORBIDDEN', 'Esse efeito abre no nível ' + (lib[x.fx] || NV_FX0_) + '.'); if (!x.fx) delete x.fx; });
      patch.Top = JSON.stringify(top);
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
function deleteHighlight_(d, u) { return withLock_(function () { const t = table_('PerfilFotos'), r = t.rows.filter(function (x) { return x.FotoID === d.id && x.MembroID === u.membroId; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Foto não encontrada.'); delRow_(t, r._row); return { ok: true }; }); }

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
  const itens = table_('Membros').rows.filter(function (m) { return m.Status !== 'Inativo'; }).map(function (m) { const r = lin[m.MembroID]; return { id: m.MembroID, nome: m.Nome, foto: m.Foto ? 1 : 0, aut: rostoAut_(r), idx: !!(r && (r.Descritor || r.Amostras)), am: r ? amostras_(r.Amostras).length : 0, cons: r && r.ConsentimentoBio || '', rev: r && r.Revogado || '', em: r && r.AutorizadoEm || '' }; });
  itens.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome)); }); return { itens: itens };
}
function setFaceAuth_(d, u) {
  return withLock_(function () {
    const t = table_('Rostos'), lin = {}, mem = {}; t.rows.forEach(function (r) { lin[r.MembroID] = r; }); table_('Membros').rows.forEach(function (m) { if (m.Status !== 'Inativo') mem[m.MembroID] = 1; });
    const on = d.on === true || d.on === 'true' || d.on === 1; let n = 0;
    (Array.isArray(d.ids) ? d.ids : []).slice(0, 600).forEach(function (x) {
      const id = clip_(x, 30); if (!mem[id]) return; const r = lin[id];
      if (on) { if (r) { if (!rostoAut_(r)) { writeRow_(t, r._row, { Autorizado: '1', AutorizadoPor: u.email, AutorizadoEm: today_() }); n++; } } else { appendRow_(t, { MembroID: id, Descritor: '', AtualizadoEm: '', Autorizado: '1', AutorizadoPor: u.email, AutorizadoEm: today_() }); t.rows.push({ MembroID: id }); lin[id] = { _row: t.rows.length + 1, Autorizado: '1' }; n++; } }
      else if (r) { writeRow_(t, r._row, { Descritor: '', Amostras: '', Autorizado: '0', AutorizadoPor: u.email, AutorizadoEm: today_() }); n++; } // desautorizar apaga a assinatura do rosto
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
  const idx = {}, itens = [], aut = {}; table_('Rostos').rows.forEach(function (r) { if (nome[r.MembroID] === undefined || !rostoAut_(r)) return; aut[r.MembroID] = 1; const ds = vetor_(r.Descritor), ss = amostras_(r.Amostras); if (!ds && !ss.length) return; idx[r.MembroID] = 1; itens.push({ id: r.MembroID, nome: nome[r.MembroID], d: ds, s: ss }); });
  const ids = Object.keys(aut);
  return { itens: itens, falta: ids.filter(function (i) { return foto[i] && !idx[i]; }), semFoto: ids.filter(function (i) { return !foto[i]; }).length, total: ids.length };
}
// ---- Aprendizado contínuo: além da assinatura da foto de perfil, cada pessoa guarda até 12 "amostras" (rostos confirmados na câmera, em ângulos e luzes diferentes)
const AMOSTRAS_MAX_ = 12, TERMO_FACE_ = '2026-10-31-v1';
function vetor_(v) { let a; try { a = typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; } return Array.isArray(a) && a.length === 128 ? a : null; }
function amostras_(v) { let a; try { a = v ? JSON.parse(v) : []; } catch (e) { return []; } return Array.isArray(a) ? a.filter(function (x) { return vetor_(x); }).slice(0, AMOSTRAS_MAX_) : []; }
function distV_(a, b) { let t = 0; for (let i = 0; i < 128; i++) { const x = a[i] - b[i]; t += x * x; } return Math.sqrt(t); }
function learnFace_(d, u) {
  return withLock_(function () {
    const t = table_('Rostos'), ex = {}; t.rows.forEach(function (r) { ex[r.MembroID] = r; }); let n = 0;
    (Array.isArray(d.itens) ? d.itens : []).slice(0, 40).forEach(function (it) {
      const id = clip_(it && it.id, 30), ds = descOk_(it && it.d), r = ex[id]; if (!id || !ds || !rostoAut_(r)) return; const novo = JSON.parse(ds), base = vetor_(r.Descritor), am = amostras_(r.Amostras);
      if (!base && !am.length) { writeRow_(t, r._row, { Descritor: ds, AtualizadoEm: today_() }); r.Descritor = ds; n++; return; } // quem não tinha foto passa a ter o primeiro rosto
      const todos = (base ? [base] : []).concat(am); if (todos.some(function (x) { return distV_(x, novo) < 0.18; })) return; // quase igual ao que já existe: não acrescenta nada
      if (am.length < AMOSTRAS_MAX_) am.push(novo); else { let k = 0, md = 9; am.forEach(function (x, i) { const dd = distV_(x, novo); if (dd < md) { md = dd; k = i; } }); am[k] = novo; } // cheio: renova a amostra mais parecida
      const txt = JSON.stringify(am); writeRow_(t, r._row, { Amostras: txt, AtualizadoEm: today_() }); r.Amostras = txt; n++;
    });
    audit_(u.email, 'ROSTOS_APRENDIDOS', String(n), 'OK'); return { n: n };
  });
}
// ---- Cadastro facial do próprio membro (scanner guiado) com consentimento LGPD: biometria para a chamada + uso de imagem
function faceMe_(d, u) {
  const r = table_('Rostos').rows.filter(function (x) { return x.MembroID === u.membroId; })[0], tem = !!(r && (vetor_(r.Descritor) || amostras_(r.Amostras).length)), cons = r && r.ConsentimentoBio || '', rev = r && r.Revogado || '';
  return { precisa: !rev && !(cons && tem), consentido: cons, imagem: r && r.ConsentimentoImagem || '', revogado: rev, amostras: r ? amostras_(r.Amostras).length : 0, autorizado: rostoAut_(r), versao: TERMO_FACE_ };
}
function faceScan_(d, u) {
  if (d.consentBio !== true || d.consentImg !== true) throw new ApiError('VALIDATION', 'É preciso aceitar os dois consentimentos para fazer o cadastro facial.');
  const vs = []; (Array.isArray(d.itens) ? d.itens : []).slice(0, 14).forEach(function (it) { const ds = descOk_(it && it.d); if (!ds) return; const v = JSON.parse(ds); if (!vs.some(function (x) { return distV_(x, v) < 0.12; })) vs.push(v); });
  if (vs.length < 5) throw new ApiError('VALIDATION', 'Poucas fotos nítidas e diferentes. Refaça o scanner em um lugar com boa luz.');
  return withLock_(function () {
    const t = table_('Rostos'), r = t.rows.filter(function (x) { return x.MembroID === u.membroId; })[0], hoje = today_();
    const base = r ? vetor_(r.Descritor) : null, am = (base ? vs : vs.slice(1)).slice(0, AMOSTRAS_MAX_);
    const patch = { Amostras: JSON.stringify(am), AtualizadoEm: hoje, Autorizado: '1', AutorizadoPor: 'autocadastro', AutorizadoEm: hoje, ConsentimentoBio: hoje, ConsentimentoImagem: hoje, TermoVersao: TERMO_FACE_, Revogado: '' };
    if (!base) patch.Descritor = JSON.stringify(vs[0]);
    if (r) writeRow_(t, r._row, patch); else { patch.MembroID = u.membroId; appendRow_(t, patch); }
    audit_(u.email, 'FACE_CADASTRO', String(vs.length), 'OK'); return { n: am.length + (base ? 0 : 1) };
  });
}
function faceRevoke_(d, u) {
  return withLock_(function () {
    const t = table_('Rostos'), r = t.rows.filter(function (x) { return x.MembroID === u.membroId; })[0]; if (!r) return { n: 0 };
    writeRow_(t, r._row, { Descritor: '', Amostras: '', Autorizado: '0', AutorizadoPor: 'revogado', AutorizadoEm: today_(), Revogado: today_() });
    audit_(u.email, 'FACE_REVOGADO', '', 'OK'); return { n: 1 };
  });
}
/* ===== Ficha geral do membro: visão completa e histórico para administração, pastor, supervisor e líder (cada um vê só o seu alcance) ===== */
function fichaNivel_(u, m) { // 'total' (administração/pastor), 'super' (supervisor), 'lider' (líder ou em treinamento) ou lança erro
  if (can_(u, 'config') || can_(u, 'celulas') || can_(u, 'min') || u.papel === 'pastor') return 'total';
  const cs = table_('Celulas').rows, sup = u.supervisiona || [], lid = (u.lidera || []).concat(u.treina || []);
  if (m.CelulaID && sup.indexOf(m.CelulaID) >= 0) return 'super';
  if (cs.some(function (c) { return sup.indexOf(c.CelulaID) >= 0 && c.LiderID === m.MembroID; })) return 'super';
  if (m.CelulaID && lid.indexOf(m.CelulaID) >= 0) return 'lider';
  throw new ApiError('FORBIDDEN', 'Você só pode ver a ficha de pessoas da sua célula ou das células que você supervisiona.');
}
function listFichas_(d, u) {
  const cs = table_('Celulas').rows, cel = {}; cs.forEach(function (c) { cel[c.CelulaID] = c.Nome; });
  const q = norm_(d.q || '');
  const itens = table_('Membros').rows.filter(function (m) { return m.Status !== 'Inativo'; }).filter(function (m) { try { fichaNivel_(u, m); return true; } catch (e) { return false; } })
    .filter(function (m) { return !q || norm_(m.Nome + ' ' + (m.Apelido || '') + ' ' + (m.Simples || '')).indexOf(q) >= 0; })
    .map(function (m) { return { id: m.MembroID, nome: m.Nome, apelido: m.Apelido || m.Simples || '', celula: cel[m.CelulaID] || '', foto: m.Foto ? 1 : 0, membro: m.EhMembro === '1' || m.EhMembro === 'true' || m.EhMembro === 'sim' ? 1 : 0 }; })
    .sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome)); });
  return { itens: itens.slice(0, 700), total: itens.length };
}
function dia10_(x) { const v = String(x || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }
function getFicha_(d, u) {
  const mid = clip_(d.membroId, 30), m = table_('Membros').rows.filter(function (x) { return x.MembroID === mid; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Pessoa não encontrada.');
  const nivel = fichaNivel_(u, m), tot = nivel === 'total', sens = nivel !== 'lider';
  const cels = table_('Celulas').rows, cel = {}; cels.forEach(function (c) { cel[c.CelulaID] = c; });
  const nm = {}; table_('Membros').rows.forEach(function (x) { nm[x.MembroID] = x.Apelido || x.Simples || x.Nome; });
  const cn = function (id) { return (cel[id] || {}).Nome || ''; };
  const me = function (r) { return r.MembroID === mid; };
  const usu = table_('Usuarios').rows.filter(function (x) { return x.MembroID === mid; })[0] || null, email = usu ? String(usu.Email).toLowerCase() : '';
  const hoje = today_(), d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  // presenças
  const evT = {}; table_('Eventos').rows.forEach(function (e) { evT[e.EventoID] = e; });
  const pc = table_('Presencas').rows.filter(me).map(function (r) { return { data: dia10_(r.Data), onde: cn(r.CelulaID) || 'Célula', tipo: 'celula' }; });
  const pe = table_('EventoPresenca').rows.filter(me).map(function (r) { const e = evT[r.EventoID] || {}; return { data: dia10_(e.Data) || dia10_(r.Data), onde: e.Titulo || 'Evento', tipo: 'evento' }; });
  const pu = table_('Cultos').rows.filter(me).map(function (r) { return { data: dia10_(r.Data), onde: r.Culto, tipo: 'culto' }; });
  const aulasP = table_('AulaPresenca').rows.filter(function (r) { return me(r) && r.Presente === '1'; }).length;
  const todasP = pc.concat(pe, pu).filter(function (x) { return x.data; }).sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
  const presencas = { celula: pc.length, evento: pe.length, culto: pu.length, aulas: aulasP, total: pc.length + pe.length + pu.length, ultimos90: todasP.filter(function (x) { return x.data >= d90; }).length, primeira: todasP.length ? todasP[0].data : '', ultima: todasP.length ? todasP[todasP.length - 1].data : '', recentes: todasP.slice(-12).reverse() };
  // cursos
  const cu = {}; table_('Cursos').rows.forEach(function (c) { cu[c.CursoID] = c.Nome; });
  const cursos = table_('Matriculas').rows.filter(me).map(function (r) { return { curso: cu[r.CursoID] || 'Curso', status: stN_(r.Status), data: dia10_(r.Data), decisao: dia10_(r.DataDecisao), presenca: r.PresencaPct || '', cert: r.Cert ? 1 : 0, certData: dia10_(r.CertData) }; }).sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  const inscricoes = table_('Inscricoes').rows.filter(me).map(function (r) { const e = evT[r.EventoID] || {}; return { evento: e.Titulo || 'Evento', data: dia10_(e.Data), inscritoEm: dia10_(r.Data) }; }).sort(function (a, b) { return a.inscritoEm < b.inscritoEm ? 1 : -1; });
  // células
  const hist = [];
  table_('Membresias').rows.filter(me).forEach(function (r) { hist.push({ data: dia10_(r.DataDecisao) || dia10_(r.Data), tipo: 'membresia', celula: cn(r.CelulaID), texto: 'Membresia ' + stN_(r.Status) + (r.Frequencias ? ' (' + r.Frequencias + ' frequências)' : '') }); });
  table_('Transferencias').rows.filter(me).forEach(function (r) { hist.push({ data: dia10_(r.DataDecisao) || dia10_(r.Data), tipo: 'transferencia', celula: cn(r.ParaCelulaID), texto: 'Transferência de ' + (cn(r.DeCelulaID) || '—') + ' para ' + (cn(r.ParaCelulaID) || '—') + ' (' + stN_(r.Status) + ')' }); });
  table_('Saidas').rows.filter(me).forEach(function (r) { hist.push({ data: dia10_(r.DataDecisao) || dia10_(r.Data), tipo: 'saida', celula: cn(r.CelulaID), texto: 'Saída da célula ' + (cn(r.CelulaID) || '') + ' (' + stN_(r.Status) + ')' }); });
  hist.sort(function (a, b) { return a.data < b.data ? -1 : 1; });
  const ids = {}; if (m.CelulaID) ids[m.CelulaID] = 1; table_('Membresias').rows.filter(me).forEach(function (r) { if (r.CelulaID) ids[r.CelulaID] = 1; }); table_('Transferencias').rows.filter(me).forEach(function (r) { if (r.Status === 'aprovado' || r.Status === 'Aprovado') { if (r.DeCelulaID) ids[r.DeCelulaID] = 1; if (r.ParaCelulaID) ids[r.ParaCelulaID] = 1; } });
  const atual = cel[m.CelulaID] || null, cargos = [];
  cels.forEach(function (c) { if (c.LiderID === mid) cargos.push('Líder de ' + c.Nome); if (c.TreinamentoID === mid) cargos.push('Líder em treinamento de ' + c.Nome); if (c.SupervisorID === mid) cargos.push('Supervisor de ' + c.Nome); });
  table_('Papeis').rows.filter(me).forEach(function (r) { cargos.push(r.Papel + ' em ' + cn(r.CelulaID)); });
  const celulas = { atual: atual ? { id: atual.CelulaID, nome: atual.Nome, lider: nm[atual.LiderID] || '', supervisor: nm[atual.SupervisorID] || '', dia: atual.Dia || '' } : null, qtd: Object.keys(ids).length, cargos: cargos, historico: hist };
  // ministérios
  const mi = {}; table_('Ministerios').rows.forEach(function (x) { mi[x.MinisterioID] = x.Nome; });
  const escs = table_('Escalas').rows.filter(me), escD = escs.map(function (r) { return dia10_(r.Data); }).filter(String).sort();
  const ministerios = { itens: table_('Interesses').rows.filter(me).map(function (r) { return { ministerio: mi[r.MinisterioID] || '', status: stN_(r.Status), pedido: dia10_(r.Data), decisao: dia10_(r.DataDecisao) }; }).sort(function (a, b) { return a.pedido < b.pedido ? -1 : 1; }), escalas: escs.length, primeiraEscala: escD[0] || '' };
  // devocionais e publicações
  const cl = table_('CorridaLeitura').rows.filter(me).filter(function (r) { return r.Status !== 'Recusado'; }), clD = cl.map(function (r) { return dia10_(r.Data); }).filter(String).sort();
  const posts = table_('Posts').rows.filter(function (r) { return r.AutorID === mid; }), notas = posts.filter(function (r) { return r.Tipo === 'nota'; }), notasD = notas.map(function (r) { return dia10_(r.Data); }).filter(String).sort();
  const tes = table_('Testemunhos').rows.filter(me).map(function (r) { return dia10_(r.Data); }).filter(String).sort(), ora = table_('Oracoes').rows.filter(me).map(function (r) { return dia10_(r.Data); }).filter(String).sort();
  const devocionais = { maratona: cl.length, capitulos: cl.filter(function (r) { return r.Status === 'Validado'; }).reduce(function (a, r) { return a + (Number(r.Capitulos) || 0); }, 0), primeiroMaratona: clD[0] || '', notas: notas.length, primeiraNota: notasD[0] || '', testemunhos: tes.length, primeiroTestemunho: tes[0] || '', oracoes: ora.length, publicacoes: posts.length };
  const rs = xpResumo_(mid);
  // app (primeiro acesso, preenchimento do cadastro, uso)
  const aud = email ? table_('Auditoria').rows.filter(function (r) { return String(r.Usuario).toLowerCase() === email; }) : [];
  const logins = aud.filter(function (r) { return r.Acao === 'LOGIN' && r.Resultado === 'OK'; }).map(function (r) { return dia10_(r.Data); }).filter(String).sort();
  const regs = aud.filter(function (r) { return r.Acao === 'MEMBRO_SALVO' && r.Alvo === mid; }).map(function (r) { return dia10_(r.Data); }).filter(String).sort();
  const usos = table_('Uso').rows.filter(me); let seg = 0, nlog = 0, primMes = ''; const telas = {};
  usos.forEach(function (r) { if (r.Tela === '_login') { nlog += Number(r.Visitas || 0); } else { seg += Number(r.Segundos || 0); telas[r.Tela] = (telas[r.Tela] || 0) + Number(r.Segundos || 0); } if (!primMes || r.Mes < primMes) primMes = r.Mes; });
  const app = { conta: usu ? dia10_(usu.CriadoEm) : '', primeiroLogin: logins[0] || (primMes ? primMes + '-01' : ''), ultimoAcesso: usu ? dia10_(usu.UltimoAcesso) : '', logins: logins.length || nlog, registroPreenchido: regs[0] || '', papel: usu ? usu.Papel : '', situacao: usu ? usu.Status : '' };
  if (sens) { app.segundos = seg; app.telas = Object.keys(telas).sort(function (a, b) { return telas[b] - telas[a]; }).slice(0, 5).map(function (k) { return { tela: k, segundos: telas[k] }; }); }
  let rosto = null; if (tot) { const r = table_('Rostos').rows.filter(me)[0]; if (r) rosto = { autorizado: rostoAut_(r), consentiu: dia10_(r.ConsentimentoBio), imagem: dia10_(r.ConsentimentoImagem), amostras: amostras_(r.Amostras).length, base: !!vetor_(r.Descritor), revogado: dia10_(r.Revogado) }; }
  // consolidação (visitante no culto → supervisor → líder/consolidador)
  const tel = String(m.Telefone || '').replace(/\D/g, ''), nmN = norm_(m.Nome), vis = table_('Visitantes').rows.filter(function (v) { return v.MembroID === mid || (tel.length >= 10 && String(v.Telefone || '').replace(/\D/g, '') === tel) || norm_(v.Nome) === nmN; }).sort(function (a, b) { return a.Data < b.Data ? -1 : 1; })[0] || null;
  const consolidacao = vis ? { registrado: dia10_(vis.Data), registradoPor: nm[vis.RegistradoPor] || '', celula: cn(vis.CelulaID), proxima: cn(vis.CelulaProximaID || vis.CelulaID), km: vis.Distancia === '' ? null : Number(vis.Distancia), supervisor: nm[vis.SupervisorID] || '', lider: nm[vis.LiderID] || '', consolidador: vis.ConsolidadorID ? nm[vis.ConsolidadorID] || '' : '', encaminhadoEm: String(vis.EncaminhadoEm || '').slice(0, 16), aceitoEm: String(vis.AceitoEm || '').slice(0, 16), aceitoPor: nm[vis.AceitoPor] || '', contatadoEm: String(vis.ContatoData || '').slice(0, 16), status: vis.Status || 'encaminhado' } : null;
  // datas-chave
  const idade = m.Nascimento ? Math.floor((Date.now() - new Date(String(m.Nascimento).slice(0, 10) + 'T12:00:00Z')) / 31557600000) : '';
  const datas = { cadastro: dia10_(m.CriadoEm), entrada: dia10_(m.DataEntrada), primeiroRegistro: [dia10_(m.CriadoEm), presencas.primeira, clD[0] || '', notasD[0] || '', consolidacao ? consolidacao.registrado : ''].filter(String).sort()[0] || '', decisao: dia10_(m.DataDecisao), batizado: m.Batizado, batismo: dia10_(m.DataBatismo), igrejaBatismo: m.IgrejaBatismo || '', casamento: dia10_(m.DataCasamento), termos: dia10_(m.AceiteTermos), privacidade: dia10_(m.AceitePrivacidade) };
  // linha do tempo
  const tl = []; const add = function (data, tipo, titulo) { data = dia10_(data); if (data) tl.push({ data: data, tipo: tipo, titulo: titulo }); };
  add(datas.entrada, 'igreja', 'Primeiro dia na igreja'); if (consolidacao) { add(consolidacao.registrado, 'consolidacao', 'Ficha de visitante preenchida no culto' + (consolidacao.registradoPor ? ' (por ' + consolidacao.registradoPor + ')' : '')); add(consolidacao.encaminhadoEm, 'consolidacao', 'Encaminhado por ' + (consolidacao.supervisor || 'supervisor') + ' para ' + (consolidacao.consolidador || consolidacao.lider || 'o líder')); add(consolidacao.aceitoEm, 'consolidacao', 'Aceito para consolidação por ' + (consolidacao.aceitoPor || 'o líder')); add(consolidacao.contatadoEm, 'consolidacao', 'Primeiro contato registrado'); } add(datas.cadastro, 'cadastro', 'Cadastro criado'); add(datas.decisao, 'decisao', 'Decisão por Cristo'); if (m.Batizado === 'sim' || m.Batizado === '1') add(datas.batismo, 'batismo', 'Batismo' + (datas.igrejaBatismo ? ' (' + datas.igrejaBatismo + ')' : ''));
  add(app.primeiroLogin, 'app', 'Primeiro acesso ao aplicativo'); add(app.registroPreenchido, 'app', 'Preencheu o próprio cadastro'); add(datas.termos, 'app', 'Aceitou os termos de uso'); add(datas.privacidade, 'app', 'Aceitou a política de privacidade');
  add(presencas.primeira, 'presenca', 'Primeira presença registrada'); add(devocionais.primeiroMaratona, 'devocional', 'Primeiro devocional (Maratona Bíblica)'); add(devocionais.primeiraNota, 'devocional', 'Primeira anotação publicada'); add(devocionais.primeiroTestemunho, 'devocional', 'Primeiro testemunho');
  cursos.forEach(function (c) { add(c.data, 'curso', 'Matrícula: ' + c.curso + ' (' + c.status + ')'); add(c.certData, 'curso', 'Certificado: ' + c.curso); });
  ministerios.itens.forEach(function (i) { add(i.decisao || i.pedido, 'ministerio', 'Ministério ' + i.ministerio + ' (' + i.status + ')'); }); add(ministerios.primeiraEscala, 'ministerio', 'Primeira escala em ministério');
  hist.forEach(function (h) { add(h.data, 'celula', h.texto); }); if (rosto) { add(rosto.consentiu, 'app', 'Consentiu o cadastro facial'); }
  tl.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
  return { id: mid, nivel: nivel, nome: m.Nome, simples: m.Simples || '', apelido: m.Apelido || '', foto: m.Foto || '', status: m.Status || 'Ativo', membro: m.EhMembro === '1' || m.EhMembro === 'true' || m.EhMembro === 'sim', idade: idade, sexo: m.Sexo || '', estadoCivil: m.EstadoCivil || '', conjuge: m.Conjuge || '', profissao: m.Profissao || '', telefone: m.Telefone || '', email: m.Email || '', cidade: m.Cidade || '', bairro: m.Bairro || '', uf: m.UF || '',
    sens: sens ? { endereco: m.Endereco || '', cep: m.CEP || '', sangue: m.Sangue || '', doador: m.Doador || '', mae: m.Mae || '', pai: m.Pai || '', nacionalidade: m.Nacionalidade || '', naturalidade: m.Naturalidade || '', nascimento: dia10_(m.Nascimento) } : null,
    datas: datas, consolidacao: consolidacao, app: app, presencas: presencas, cursos: cursos, inscricoes: inscricoes, celulas: celulas, ministerios: ministerios, devocionais: devocionais, nivelXp: { nivel: rs.nivel, xp: rs.xp, insignias: listInsignias_(mid).length }, rosto: rosto, linha: tl, podeEditar: tot };
}
function saveFichaEntrada_(d, u) {
  const mid = clip_(d.membroId, 30), v = clip_(d.entrada, 10);
  return withLock_(function () {
    const t = table_('Membros'), m = t.rows.filter(function (x) { return x.MembroID === mid; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Pessoa não encontrada.');
    if (fichaNivel_(u, m) !== 'total') throw new ApiError('FORBIDDEN', 'Só a administração e os pastores editam a data de entrada.');
    if (v && !dia10_(v)) throw new ApiError('VALIDATION', 'Data inválida.');
    writeRow_(t, m._row, { DataEntrada: v }); audit_(u.email, 'FICHA_ENTRADA', mid, 'OK'); return { ok: true };
  });
}
/* ===== Mapas: distribuição dos membros, calor, parâmetros e geocodificação ===== */
function saveMapaCfg_(d, u) {
  return withLock_(function () {
    const t = table_('Config'), set = function (k, v) { const r0 = t.rows.filter(function (x) { return x.Chave === k; })[0]; if (r0) writeRow_(t, r0._row, { Valor: String(v) }); else appendRow_(t, { Chave: k, Valor: String(v) }); };
    [['vis', 'MapaVisitanteVezes', 0, 50], ['freq', 'MapaFrequentadorVezes', 1, 100], ['raio', 'MapaRaioKm', 1, 100], ['longe', 'MapaLongeKm', 1, 200], ['alerta', 'MapaAlertaPct', 1, 100]].forEach(function (q) {
      if (d[q[0]] === undefined) return; const n = Number(d[q[0]]); if (!isFinite(n) || n < q[2] || n > q[3]) throw new ApiError('VALIDATION', 'Valor inválido em ' + q[0] + ' (de ' + q[2] + ' a ' + q[3] + ').'); set(q[1], n);
    });
    if (d.sedeLat !== undefined || d.sedeLng !== undefined) {
      if (d.sedeLat === '' && d.sedeLng === '') { set('SedeLat', ''); set('SedeLng', ''); } else { const la = Number(d.sedeLat), lo = Number(d.sedeLng); if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new ApiError('VALIDATION', 'Coordenadas da sede inválidas.'); set('SedeLat', Math.round(la * 1e6) / 1e6); set('SedeLng', Math.round(lo * 1e6) / 1e6); }
    }
    const c = cfgMap_(); if (Number(c.MapaFrequentadorVezes || 3) <= Number(c.MapaVisitanteVezes || 1)) throw new ApiError('VALIDATION', 'Frequentador precisa de mais vezes do que visitante.');
    audit_(u.email, 'MAPA_CFG', '', 'OK'); return mapaCfg_(cfgMap_());
  });
}
function geoOk_(la, lo) { la = Number(la); lo = Number(lo); return isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0); }
function supCores_() { const c = cfgMap_(), o = {}; Object.keys(c).forEach(function (k) { if (k.indexOf('SupCor:') === 0 && /^#[0-9a-fA-F]{6}$/.test(String(c[k]))) o[k.slice(7)] = c[k]; }); return o; }
function saveMySod_(d, u) {
  if (!u.membroId) throw new ApiError('FORBIDDEN', 'Sem cadastro de membro.');
  return withLock_(function () { const t = ensureCols_('Membros', ['SodOff']), m = t.rows.filter(function (x) { return x.MembroID === u.membroId; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Cadastro não encontrado.'); const off = d.on === false || d.on === 0 || d.on === '0'; writeRow_(t, m._row, { SodOff: off ? '1' : '' }); audit_(u.email, off ? 'SOD_OFF' : 'SOD_ON', u.membroId, 'OK'); return { on: !off }; });
}
// ===== Canva Zoe: artes da equipe de Social Mídia, com aprovação do pastor líder =====
function artesCria_(u) {
  if (podeCurar_(u)) return true;
  const mins = table_('Ministerios').rows.filter(function (m) { const n = norm_(m.Nome); return m.Ativo !== '0' && (n === 'midia' || n.indexOf('social') >= 0 || n.indexOf('redes') >= 0); }).map(function (m) { return m.MinisterioID; });
  return table_('Interesses').rows.some(function (i) { return i.MembroID === u.membroId && stN_(i.Status) === 'autorizado' && mins.indexOf(i.MinisterioID) >= 0; });
}
function artesAprovadores_() { const a = jparse_(cfgMap_().ArtesAprovadores, []); return Array.isArray(a) ? a.map(String) : []; }
function artesAprova_(u) { return u.papel === 'admin' || u.papel === 'pastor' || can_(u, 'config') || artesAprovadores_().indexOf(String(u.membroId)) >= 0; }
function arteExige_(u) { if (!artesCria_(u) && !artesAprova_(u)) throw new ApiError('FORBIDDEN', 'O Canva Zoe é da equipe de Social Mídia.'); }
function arteOut_(a, nm) { return { id: a.ArteID, titulo: a.Titulo, formato: a.Formato, w: Number(a.Largura) || 0, h: Number(a.Altura) || 0, mini: a.Mini || '', status: a.Status, autor: nm[a.CriadoPor] || '', autorId: a.CriadoPor, em: a.CriadoEm, decididoPor: nm[a.DecididoPor] || '', decididoEm: a.DecididoEm || '', motivo: a.Motivo || '', midiaId: a.MidiaID || '' }; }
function listArtes_(d, u) {
  arteExige_(u); const ap = artesAprova_(u), nm = nomes_();
  const itens = table_('Artes').rows.filter(function (a) { return a.Status !== 'excluida' && (ap || a.CriadoPor === u.membroId || a.Status === 'aprovada'); }).map(function (a) { return arteOut_(a, nm); }).sort(function (x, y) { return x.em < y.em ? 1 : -1; });
  return { itens: itens.slice(0, 300), aprova: ap, aprovadores: ap ? artesAprovadores_().map(function (id) { return { id: id, nome: nm[id] || id }; }) : [] };
}
function getArte_(d, u) {
  arteExige_(u); const id = clip_(d.id, 30), a = table_('Artes').rows.filter(function (x) { return x.ArteID === id && x.Status !== 'excluida'; })[0]; if (!a) throw new ApiError('NOT_FOUND', 'Arte não encontrada.');
  if (!(artesAprova_(u) || a.CriadoPor === u.membroId || a.Status === 'aprovada')) throw new ApiError('FORBIDDEN', 'Sem acesso a esta arte.');
  return Object.assign(arteOut_(a, nomes_()), { projeto: a.Projeto || '', foto: a.Foto || '' });
}
function saveArte_(d, u) {
  arteExige_(u);
  const foto = String(d.foto || ''), mini = String(d.mini || ''), titulo = clip_(d.titulo, 60) || 'Arte', fmt = clip_(d.formato, 40) || 'Personalizado', w = Math.round(Number(d.w)), h = Math.round(Number(d.h));
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(foto) || foto.length > 45000) throw new ApiError('VALIDATION', 'Imagem inválida ou muito grande.');
  if (mini && (!/^data:image\/(jpeg|png|webp);base64,/.test(mini) || mini.length > 6000)) throw new ApiError('VALIDATION', 'Miniatura inválida.');
  if (!(w >= 100 && w <= 4000 && h >= 100 && h <= 4000)) throw new ApiError('VALIDATION', 'Tamanho inválido.');
  const proj = String(d.projeto || ''); if (proj.length > 45000) throw new ApiError('VALIDATION', 'Projeto muito grande.');
  return withLock_(function () {
    const t = table_('Artes'); let a = d.id ? t.rows.filter(function (x) { return x.ArteID === clip_(d.id, 30) && x.Status !== 'excluida'; })[0] : null;
    if (a && !(a.CriadoPor === u.membroId || artesAprova_(u))) throw new ApiError('FORBIDDEN', 'Só quem criou ou o aprovador edita esta arte.');
    const enviar = d.enviar === true || d.enviar === 1 || d.enviar === '1', ap = artesAprova_(u), st = enviar ? 'pendente' : 'rascunho';
    const base = { Titulo: titulo, Formato: fmt, Largura: String(w), Altura: String(h), Projeto: proj, Foto: foto, Mini: mini, Status: st, DecididoPor: '', DecididoEm: '', Motivo: '' };
    let id;
    if (a) { id = a.ArteID; if (a.MidiaID) { const mt = table_('MidiasTelao'), mr = mt.rows.filter(function (x) { return x.MidiaID === a.MidiaID; })[0]; if (mr) writeRow_(mt, mr._row, { Ativo: '0' }); base.MidiaID = ''; } writeRow_(t, a._row, base); }
    else { id = id_('AR'); appendRow_(t, Object.assign({ ArteID: id, CriadoPor: u.membroId, CriadoEm: now_() }, base)); }
    if (enviar) { const nm = nomes_(); artesAprovadores_().concat(table_('Usuarios').rows.filter(function (x) { return x.Status === 'Ativo' && (x.Papel === 'pastor' || x.Papel === 'admin') && x.MembroID; }).map(function (x) { return x.MembroID; })).filter(function (m, i, arr) { return m && m !== u.membroId && arr.indexOf(m) === i; }).forEach(function (m) { notify_(m, 'arte', 'Arte para aprovar', (nm[u.membroId] || 'Alguém') + ' enviou “' + titulo + '”.', id); }); }
    audit_(u.email, enviar ? 'ARTE_ENVIA' : 'ARTE_SALVA', id, 'OK'); return { id: id, status: st };
  });
}
function decideArte_(d, u) {
  if (!artesAprova_(u)) throw new ApiError('FORBIDDEN', 'Só o pastor líder da Social Mídia aprova artes.');
  return withLock_(function () {
    const t = table_('Artes'), a = t.rows.filter(function (x) { return x.ArteID === clip_(d.id, 30) && x.Status !== 'excluida'; })[0]; if (!a) throw new ApiError('NOT_FOUND', 'Arte não encontrada.');
    const ok = d.ok === true || d.ok === 1 || d.ok === '1', motivo = clip_(d.motivo, 200); if (!ok && !motivo) throw new ApiError('VALIDATION', 'Explique o motivo para a equipe ajustar.');
    const mt = table_('MidiasTelao'); let mid = a.MidiaID || '';
    if (ok) { if (mid) { const mr = mt.rows.filter(function (x) { return x.MidiaID === mid; })[0]; if (mr) writeRow_(mt, mr._row, { Ativo: '1', Titulo: a.Titulo, Foto: a.Foto, Mini: a.Mini }); else mid = ''; } if (!mid) { mid = id_('MI'); appendRow_(mt, { MidiaID: mid, Titulo: a.Titulo, Foto: a.Foto, Mini: a.Mini, Ativo: '1', CriadoPor: a.CriadoPor, CriadoEm: now_() }); } }
    writeRow_(t, a._row, { Status: ok ? 'aprovada' : 'recusada', DecididoPor: u.membroId, DecididoEm: now_(), Motivo: ok ? '' : motivo, MidiaID: ok ? mid : a.MidiaID });
    notify_(a.CriadoPor, 'arte', ok ? 'Arte aprovada' : 'Arte precisa de ajuste', ok ? '“' + a.Titulo + '” foi aprovada e já pode ir ao telão e às lives.' : '“' + a.Titulo + '”: ' + motivo, a.ArteID);
    audit_(u.email, ok ? 'ARTE_APROVA' : 'ARTE_RECUSA', a.ArteID, 'OK'); return { status: ok ? 'aprovada' : 'recusada', midiaId: ok ? mid : '' };
  });
}
function deleteArte_(d, u) {
  arteExige_(u);
  return withLock_(function () {
    const t = table_('Artes'), a = t.rows.filter(function (x) { return x.ArteID === clip_(d.id, 30) && x.Status !== 'excluida'; })[0]; if (!a) throw new ApiError('NOT_FOUND', 'Arte não encontrada.');
    if (!(artesAprova_(u) || (a.CriadoPor === u.membroId && a.Status !== 'aprovada'))) throw new ApiError('FORBIDDEN', 'Esta arte já foi aprovada. Peça ao aprovador para excluir.');
    if (a.MidiaID) { const mt = table_('MidiasTelao'), mr = mt.rows.filter(function (x) { return x.MidiaID === a.MidiaID; })[0]; if (mr) writeRow_(mt, mr._row, { Ativo: '0' }); }
    writeRow_(t, a._row, { Status: 'excluida', Projeto: '', Foto: '', Mini: '' }); audit_(u.email, 'ARTE_EXCLUI', a.ArteID, 'OK'); return { ok: true };
  });
}
function saveArteAprovadores_(d, u) {
  if (!(u.papel === 'admin' || u.papel === 'pastor' || can_(u, 'config'))) throw new ApiError('FORBIDDEN', 'Só pastor ou administração define quem aprova.');
  const ms = {}; table_('Membros').rows.forEach(function (m) { ms[m.MembroID] = 1; });
  const ids = (Array.isArray(d.ids) ? d.ids : []).map(function (x) { return clip_(x, 30); }).filter(function (x, i, a) { return x && ms[x] && a.indexOf(x) === i; }).slice(0, 10);
  return withLock_(function () { const t = table_('Config'), r0 = t.rows.filter(function (x) { return x.Chave === 'ArtesAprovadores'; })[0]; if (r0) writeRow_(t, r0._row, { Valor: JSON.stringify(ids) }); else appendRow_(t, { Chave: 'ArtesAprovadores', Valor: JSON.stringify(ids) }); audit_(u.email, 'ARTE_APROVADORES', ids.join(','), 'OK'); const nm = nomes_(); return { aprovadores: ids.map(function (id) { return { id: id, nome: nm[id] || id }; }) }; });
}
// ===== Árvore Zoe: parentescos entre membros (cônjuge, pai/mãe → filho, irmãos) =====
const KIN_PART = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1 };
function kinToks_(nome) { return norm_(nome).split(' ').filter(function (t) { return t && !KIN_PART[t]; }); }
function kinAtivos_() { return table_('Membros').rows.filter(function (m) { return m.Status !== 'Inativo' || m.Parente === '1'; }); }
function kinRows_() { return table_('Parentes').rows.filter(function (r) { return r.A && r.B; }); }
function kinPode_(u, mid) {
  if (u.membroId === mid) return true;
  const m = table_('Membros').rows.filter(function (x) { return x.MembroID === mid; })[0]; if (!m) return false;
  try { fichaNivel_(u, m); return true; } catch (e) { return false; }
}
function kinUsr_(cel) { if (!cel.__u) { const o = {}; table_('Usuarios').rows.forEach(function (r) { if (r.MembroID && r.Status !== 'Inativo') o[r.MembroID] = 1; }); Object.defineProperty(cel, '__u', { value: o }); } return cel.__u; }
function kinIdade_(m) { const n = String(m.Nascimento || ''); if (!/^\d{4}-\d{2}-\d{2}/.test(n)) return null; const h = today_(); let a = Number(h.slice(0, 4)) - Number(n.slice(0, 4)); if (h.slice(5, 10) < n.slice(5, 10)) a--; return a >= 0 && a < 130 ? a : null; }
/* cristã? e congrega na Zoe?: o que foi marcado vale; sem marca, quem é membro/usuário da Zoe conta como cristã que congrega; os demais ficam "sem informação" */
function kinCristao_(m, usr) {
  const par = m.Parente === '1', cong = m.CongregaZoe === '1' ? true : m.CongregaZoe === '0' ? false : (!par && m.Status !== 'Inativo' && (m.EhMembro === '1' || !!usr[m.MembroID]));
  const cr = m.Crista === '1' ? true : m.Crista === '0' ? false : (cong ? true : null); return { cr: cr, cong: cong };
}
function kinNo_(m, cel) { const c = kinCristao_(m, kinUsr_(cel)); return { id: m.MembroID, nome: m.Apelido || m.Simples || m.Nome, completo: m.Nome, sexo: m.Sexo === 'F' ? 'F' : m.Sexo === 'M' ? 'M' : '', foto: m.Foto ? 1 : 0, celula: cel[m.CelulaID] || '', status: m.Status || 'Ativo', idade: kinIdade_(m), crista: c.cr, zoe: c.cong, parente: m.Parente === '1' ? 1 : 0 }; }
function kinPais_(rows, id) { return rows.filter(function (r) { return r.Tipo === 'filho' && r.B === id; }).map(function (r) { return r.A; }); }
function kinFilhos_(rows, id) { return rows.filter(function (r) { return r.Tipo === 'filho' && r.A === id; }).map(function (r) { return r.B; }); }
function kinConj_(rows, id) { return rows.filter(function (r) { return r.Tipo === 'conjuge' && (r.A === id || r.B === id); }).map(function (r) { return r.A === id ? r.B : r.A; }); }
function kinIrmaos_(rows, id) {
  const o = {}; kinPais_(rows, id).forEach(function (p) { kinFilhos_(rows, p).forEach(function (c) { if (c !== id) o[c] = 1; }); });
  rows.filter(function (r) { return r.Tipo === 'irmao' && (r.A === id || r.B === id); }).forEach(function (r) { o[r.A === id ? r.B : r.A] = 1; });
  return Object.keys(o);
}
function kinAncestral_(rows, de, alvo) { const vis = {}, pilha = [de]; while (pilha.length) { const x = pilha.pop(); if (x === alvo) return true; if (vis[x]) continue; vis[x] = 1; kinPais_(rows, x).forEach(function (p) { pilha.push(p); }); } return false; }
function kinNaFamilia_(u, id) { const c = kinComponentes_(kinRows_()).filter(function (c2) { return c2.indexOf(u.membroId) >= 0; })[0]; return !!c && c.indexOf(id) >= 0; }
function suggestKin_(d, u) {
  const eu = u.membroId, meu = table_('Membros').rows.filter(function (m) { return m.MembroID === eu; })[0] || {};
  const nome = clip_(d.nome, 120) || meu.Nome || '', tk = kinToks_(nome); if (tk.length < 1) return { iguais: [], familia: [] };
  const sob = tk.slice(1), cel = {}; table_('Celulas').rows.forEach(function (c) { cel[c.CelulaID] = c.Nome; });
  const rows = kinRows_(), lig = {}; rows.forEach(function (r) { if (r.A === eu) lig[r.B] = 1; if (r.B === eu) lig[r.A] = 1; });
  const iguais = [], familia = [];
  kinAtivos_().forEach(function (m) {
    if (m.MembroID === eu) return; const t = kinToks_(m.Nome), no = kinNo_(m, cel); no.ligado = lig[m.MembroID] ? 1 : 0;
    const comuns = sob.filter(function (x) { return t.slice(1).indexOf(x) >= 0; });
    const todos = tk.length >= 2 && tk.every(function (x) { return t.indexOf(x) >= 0; });
    if (todos || (tk.length >= 2 && norm_(m.Nome) === norm_(nome))) { iguais.push(no); return; }
    if (comuns.length) { no.comuns = comuns; no.pontos = comuns.length * 2 + (t[t.length - 1] === tk[tk.length - 1] ? 3 : 0); familia.push(no); }
  });
  familia.sort(function (a, b) { return b.pontos - a.pontos || String(a.nome).localeCompare(String(b.nome)); });
  return { iguais: iguais.slice(0, 5), familia: familia.slice(0, 10) };
}
function kinVista_(rows, id, ms, cel) {
  const ref = function (ids) { return ids.filter(function (x) { return ms[x]; }).map(function (x) { return kinNo_(ms[x], cel); }); };
  return { pais: ref(kinPais_(rows, id)), filhos: ref(kinFilhos_(rows, id)), conjuges: ref(kinConj_(rows, id)), irmaos: ref(kinIrmaos_(rows, id)) };
}
function listKin_(d, u) {
  const id = clip_(d.membroId, 30) || u.membroId; if (!kinPode_(u, id)) throw new ApiError('FORBIDDEN', 'Sem acesso à família desta pessoa.');
  const ms = {}; table_('Membros').rows.forEach(function (m) { ms[m.MembroID] = m; }); const cel = {}; table_('Celulas').rows.forEach(function (c) { cel[c.CelulaID] = c.Nome; });
  const rows = kinRows_(), meus = rows.filter(function (r) { return r.A === id || r.B === id; }).map(function (r) { return { id: r.ParID, tipo: r.Tipo, a: r.A, b: r.B }; });
  const v = kinVista_(rows, id, ms, cel); v.vinculos = meus; v.texto = ms[id] ? { mae: ms[id].Mae || '', pai: ms[id].Pai || '', conjuge: ms[id].Conjuge || '' } : {}; return v;
}
function kinSugestoes_(rows, ms, tipo, a, b) {
  const out = [], ja = function (t, x, y) { return rows.some(function (r) { return r.Tipo === t && ((r.A === x && r.B === y) || (t !== 'filho' && r.A === y && r.B === x)); }); };
  const nm = function (x) { return ms[x] ? (ms[x].Apelido || ms[x].Simples || ms[x].Nome) : ''; };
  if (tipo === 'filho') {
    kinPais_(rows, b).forEach(function (q) { if (q !== a && !ja('conjuge', a, q) && !kinConj_(rows, a).length && !kinConj_(rows, q).length) out.push({ tipo: 'conjuge', a: a, b: q, texto: nm(a) + ' e ' + nm(q) + ' têm o mesmo filho(a). São casados?' }); });
    kinConj_(rows, a).forEach(function (s) { if (kinPais_(rows, b).length < 2 && !ja('filho', s, b) && s !== b) out.push({ tipo: 'filho', a: s, b: b, texto: nm(s) + ' (cônjuge de ' + nm(a) + ') também é pai/mãe de ' + nm(b) + '?' }); });
  } else if (tipo === 'conjuge') {
    kinFilhos_(rows, a).forEach(function (c) { if (!ja('filho', b, c) && kinPais_(rows, c).length < 2 && c !== b) out.push({ tipo: 'filho', a: b, b: c, texto: nm(c) + ' também é filho(a) de ' + nm(b) + '?' }); });
    kinFilhos_(rows, b).forEach(function (c) { if (!ja('filho', a, c) && kinPais_(rows, c).length < 2 && c !== a) out.push({ tipo: 'filho', a: a, b: c, texto: nm(c) + ' também é filho(a) de ' + nm(a) + '?' }); });
  }
  return out.slice(0, 8);
}
function saveKin_(d, u) {
  const a = clip_(d.a, 30) || u.membroId, b = clip_(d.b, 30), rel = String(d.rel || '');
  const mapa = { pai: ['filho', b, a], mae: ['filho', b, a], filho: ['filho', a, b], filha: ['filho', a, b], conjuge: ['conjuge', a, b], irmao: ['irmao', a, b], irma: ['irmao', a, b], tipo: null };
  let tipo, x, y; if (d.tipo && (d.tipo === 'filho' || d.tipo === 'conjuge' || d.tipo === 'irmao')) { tipo = d.tipo; x = a; y = b; } else { const m = mapa[rel]; if (!m) throw new ApiError('VALIDATION', 'Escolha o parentesco.'); tipo = m[0]; x = m[1]; y = m[2]; }
  if (!b || a === b) throw new ApiError('VALIDATION', 'Escolha outra pessoa.');
  if (!kinPode_(u, a) && !kinNaFamilia_(u, a)) throw new ApiError('FORBIDDEN', 'Só a própria pessoa, a família já vinculada ou a liderança vincula parentes.');
  const ms = {}; table_('Membros').rows.forEach(function (m) { ms[m.MembroID] = m; }); if (!ms[a] || !ms[b]) throw new ApiError('NOT_FOUND', 'Pessoa não encontrada.');
  return withLock_(function () {
    const t = table_('Parentes'), rows = kinRows_();
    if (rows.some(function (r) { return r.Tipo === tipo && ((r.A === x && r.B === y) || (tipo !== 'filho' && r.A === y && r.B === x)); })) throw new ApiError('VALIDATION', 'Esse vínculo já existe.');
    if (tipo === 'filho') {
      if (kinAncestral_(rows, x, y)) throw new ApiError('VALIDATION', 'Esse vínculo não faz sentido: ' + (ms[y].Apelido || ms[y].Nome) + ' já aparece como antepassado.');
      if (kinPais_(rows, y).length >= 2) throw new ApiError('VALIDATION', 'Essa pessoa já tem pai e mãe vinculados.');
    }
    if (tipo === 'conjuge' && (kinConj_(rows, x).length || kinConj_(rows, y).length)) throw new ApiError('VALIDATION', 'Uma das pessoas já tem cônjuge vinculado. Remova o vínculo antigo antes.');
    const id = id_('PR'); appendRow_(t, { ParID: id, A: x, B: y, Tipo: tipo, CriadoPor: u.membroId, CriadoEm: now_() }); audit_(u.email, 'PARENTE_ADD', id, 'OK');
    const novas = rows.concat([{ ParID: id, A: x, B: y, Tipo: tipo }]);
    return { id: id, sugestoes: kinSugestoes_(novas, ms, tipo, x, y) };
  });
}
function delKin_(d, u) {
  return withLock_(function () {
    const t = table_('Parentes'), r = t.rows.filter(function (x) { return x.ParID === clip_(d.id, 30); })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Vínculo não encontrado.');
    if (!(kinPode_(u, r.A) || kinPode_(u, r.B))) throw new ApiError('FORBIDDEN', 'Sem permissão para remover este vínculo.');
    writeRow_(t, r._row, { A: '', B: '', Tipo: 'removido' }); audit_(u.email, 'PARENTE_DEL', r.ParID, 'OK'); return { ok: true };
  });
}
function kinComponentes_(rows) {
  const adj = {}; rows.forEach(function (r) { (adj[r.A] = adj[r.A] || []).push(r.B); (adj[r.B] = adj[r.B] || []).push(r.A); });
  const vis = {}, comps = []; Object.keys(adj).forEach(function (k) { if (vis[k]) return; const c = [], pilha = [k]; vis[k] = 1; while (pilha.length) { const x = pilha.pop(); c.push(x); adj[x].forEach(function (y) { if (!vis[y]) { vis[y] = 1; pilha.push(y); } }); } comps.push(c); });
  return comps;
}
function getArvore_(d, u) {
  const ms = {}; table_('Membros').rows.forEach(function (m) { ms[m.MembroID] = m; }); const cel = {}; table_('Celulas').rows.forEach(function (c) { cel[c.CelulaID] = c.Nome; });
  const rows = kinRows_(), comps = kinComponentes_(rows).map(function (c) { return c.filter(function (x) { return ms[x]; }); }).filter(function (c) { return c.length > 0; });
  const rotulo = function (c) { const cont = {}; c.forEach(function (x) { const t = kinToks_(ms[x].Nome); const l = t[t.length - 1]; if (l) cont[l] = (cont[l] || 0) + 1; }); const top = Object.keys(cont).sort(function (a, b) { return cont[b] - cont[a]; })[0] || ''; return top ? top.charAt(0).toUpperCase() + top.slice(1) : 'Família'; };
  if (d.todos) {
    if (!podeCurar_(u)) throw new ApiError('FORBIDDEN', 'A visão da igreja inteira é da liderança.');
    const itens = comps.map(function (c) { const set_ = {}; c.forEach(function (x) { set_[x] = 1; }); const cs = {}; c.forEach(function (x) { if (cel[ms[x].CelulaID]) cs[cel[ms[x].CelulaID]] = 1; }); return { ref: c[0], nome: rotulo(c), n: c.length, celulas: Object.keys(cs), pessoas: c.slice(0, 4).map(function (x) { return ms[x].Apelido || ms[x].Simples || ms[x].Nome; }), semCelula: c.filter(function (x) { return !ms[x].CelulaID; }).length, nos: c.map(function (x) { return kinNo_(ms[x], cel); }), arestas: rows.filter(function (r) { return set_[r.A] && set_[r.B]; }).map(function (r) { return { id: r.ParID, a: r.A, b: r.B, tipo: r.Tipo }; }) }; }).sort(function (a, b) { return b.n - a.n; });
    return Object.assign({ familias: itens, total: itens.length, pessoas: itens.reduce(function (s2, f) { return s2 + f.n; }, 0), podeEditar: galhoPode_(u) }, galhosPayload_(ms, cel, null));
  }
  const id = clip_(d.membroId, 30) || u.membroId; if (!kinPode_(u, id)) throw new ApiError('FORBIDDEN', 'Sem acesso a esta família.');
  const comp = comps.filter(function (c) { return c.indexOf(id) >= 0; })[0] || [id]; const set = {}; comp.forEach(function (x) { set[x] = 1; });
  return Object.assign({ podeEditar: galhoPode_(u) }, galhosPayload_(ms, cel, set), { nome: rotulo(comp), eu: id, nos: comp.filter(function (x) { return ms[x]; }).map(function (x) { return kinNo_(ms[x], cel); }), arestas: rows.filter(function (r) { return set[r.A] && set[r.B]; }).map(function (r) { return { id: r.ParID, a: r.A, b: r.B, tipo: r.Tipo }; }) });
}
function galhoPode_(u) { return u.papel === 'admin' || u.papel === 'pastor' || can_(u, 'config'); }
function galhosPayload_(ms, cel, set) {
  const out = [], ids = {};
  lazy_('Galhos').rows.forEach(function (g) {
    if (!g.GalhoID || !g.Tipo || g.Tipo === 'removido') return; if (set && !(g.Ref && set[g.Ref])) return;
    const mem = jparse_(g.Membros, []).filter(function (x) { return ms[x]; }); out.push({ id: g.GalhoID, tipo: g.Tipo, nome: g.Nome || '', ref: g.Ref || '', membros: mem, dx: Number(g.DX) || 0, dy: Number(g.DY) || 0 }); mem.forEach(function (x) { ids[x] = 1; });
  });
  return { galhos: out, nosG: Object.keys(ids).map(function (x) { return kinNo_(ms[x], cel); }) };
}
/* galhos desenhados à mão pela liderança: "manual" é uma ramificação nova com nomes escolhidos; "ajuste" guarda o quanto o galho de uma família foi arrastado */
function saveGalho_(d, u) {
  if (!galhoPode_(u)) throw new ApiError('FORBIDDEN', 'Só a liderança edita os galhos da árvore.');
  const tipo = d.tipo === 'ajuste' ? 'ajuste' : 'manual', ref = clip_(d.ref, 30), num = function (v) { v = Math.round(Number(v)); return isFinite(v) ? Math.max(-3000, Math.min(3000, v)) : 0; };
  if (tipo === 'ajuste' && !ref) throw new ApiError('VALIDATION', 'Galho sem referência.');
  const ms = {}; table_('Membros').rows.forEach(function (m) { ms[m.MembroID] = 1; });
  const mem = (Array.isArray(d.membros) ? d.membros : []).map(function (x) { return clip_(x, 30); }).filter(function (x, i, a) { return x && ms[x] && a.indexOf(x) === i; }).slice(0, 14);
  if (tipo === 'manual' && !clip_(d.nome, 60).trim()) throw new ApiError('VALIDATION', 'Dê um nome ao galho.');
  return withLock_(function () {
    const t = lazy_('Galhos'), id0 = clip_(d.id, 30), ex = t.rows.filter(function (g) { return g.Tipo !== 'removido' && g.Tipo && (tipo === 'ajuste' ? (g.Tipo === 'ajuste' && g.Ref === ref) : (g.GalhoID === id0 && g.Tipo === 'manual')); })[0];
    const p = { Tipo: tipo, Ref: ref, DX: String(num(d.dx)), DY: String(num(d.dy)) }; if (tipo === 'manual') { p.Nome = clip_(d.nome, 60).trim(); p.Membros = JSON.stringify(mem); }
    if (ex) { writeRow_(t, ex._row, p); audit_(u.email, 'GALHO_EDIT', ex.GalhoID, 'OK'); return { id: ex.GalhoID }; }
    const id = id_('GA'); p.GalhoID = id; p.CriadoPor = u.membroId; p.CriadoEm = now_(); appendRow_(t, p); audit_(u.email, 'GALHO_ADD', id, 'OK'); return { id: id };
  });
}
function delGalho_(d, u) {
  if (!galhoPode_(u)) throw new ApiError('FORBIDDEN', 'Só a liderança edita os galhos da árvore.');
  return withLock_(function () {
    const t = lazy_('Galhos'), g = t.rows.filter(function (r) { return r.Tipo && r.Tipo !== 'removido' && (r.GalhoID === clip_(d.id, 30) || (d.ref && r.Tipo === 'ajuste' && r.Ref === clip_(d.ref, 30))); })[0]; if (!g) return { ok: true };
    writeRow_(t, g._row, { Tipo: 'removido' }); audit_(u.email, 'GALHO_DEL', g.GalhoID, 'OK'); return { ok: true };
  });
}
/* marca se a pessoa é cristã e se congrega na Zoe (quem é da família ou a liderança pode marcar) */
function setKinInfo_(d, u) {
  const id = clip_(d.id, 30); if (!kinPode_(u, id) && !kinNaFamilia_(u, id)) throw new ApiError('FORBIDDEN', 'Só a própria pessoa, a família vinculada ou a liderança marca isso.');
  const v = function (x) { x = String(x === undefined || x === null ? '' : x); return x === '1' || x === '0' ? x : ''; };
  return withLock_(function () {
    const t = ensureCols_('Membros', ['Crista', 'CongregaZoe', 'Parente']), m = t.rows.filter(function (x) { return x.MembroID === id; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Pessoa não encontrada.');
    const p = {}; if (d.crista !== undefined) p.Crista = v(d.crista); if (d.congrega !== undefined) p.CongregaZoe = v(d.congrega);
    if (m.Parente === '1') { if (d.nasc !== undefined) p.Nascimento = /^\d{4}-\d{2}-\d{2}$/.test(String(d.nasc)) ? String(d.nasc) : ''; if (d.foto !== undefined) p.Foto = fotoParaGravar_(d.foto, m.Foto, id); }
    writeRow_(t, m._row, p); audit_(u.email, 'PARENTE_INFO', id, 'OK'); return { ok: true };
  });
}
/* cadastra um parente que não usa o site (fica só na árvore, não entra nas listas da igreja) e já vincula */
function addKinPerson_(d, u) {
  const a = clip_(d.a, 30) || u.membroId, rel = String(d.rel || ''), nome = clip_(d.nome, 150).trim(), sx = { pai: 'M', mae: 'F', filho: 'M', filha: 'F', irmao: '', irma: 'F', conjuge: '' };
  if (nome.length < 3) throw new ApiError('VALIDATION', 'Digite o nome completo.'); if (!(rel in sx)) throw new ApiError('VALIDATION', 'Escolha o parentesco.');
  if (!kinPode_(u, a) && !kinNaFamilia_(u, a)) throw new ApiError('FORBIDDEN', 'Só a própria pessoa, a família já vinculada ou a liderança vincula parentes.');
  if (!table_('Membros').rows.some(function (m) { return m.MembroID === a; })) throw new ApiError('NOT_FOUND', 'Pessoa não encontrada.');
  const rows = kinRows_();
  if ((rel === 'pai' || rel === 'mae') && kinPais_(rows, a).length >= 2) throw new ApiError('VALIDATION', 'Essa pessoa já tem pai e mãe vinculados.');
  if (rel === 'conjuge' && kinConj_(rows, a).length) throw new ApiError('VALIDATION', 'Essa pessoa já tem cônjuge vinculado. Remova o vínculo antigo antes.');
  const v = function (x) { x = String(x === undefined || x === null ? '' : x); return x === '1' || x === '0' ? x : ''; }, sexo = d.sexo === 'M' || d.sexo === 'F' ? d.sexo : sx[rel], nasc = /^\d{4}-\d{2}-\d{2}$/.test(String(d.nasc || '')) ? String(d.nasc) : '';
  const nid = withLock_(function () {
    const t = ensureCols_('Membros', ['Crista', 'CongregaZoe', 'Parente']), id = id_('M'), foto = /^data:image\//.test(String(d.foto || '')) ? fotoParaGravar_(d.foto, '', id) : '';
    appendRow_(t, { MembroID: id, Nome: nome, Apelido: nome.split(/\s+/)[0], Sexo: sexo, Nascimento: nasc, Foto: foto, EhMembro: '0', Status: 'Inativo', Parente: '1', Crista: v(d.crista), CongregaZoe: v(d.congrega), CriadoEm: now_() });
    audit_(u.email, 'PARENTE_NOVO', id, 'OK'); return id;
  });
  try { const r = saveKin_({ a: a, b: nid, rel: rel }, u); return { id: nid, sugestoes: r.sugestoes || [] }; }
  catch (e) { const t = table_('Membros'), m = t.rows.filter(function (x) { return x.MembroID === nid; })[0]; if (m) writeRow_(t, m._row, { Nome: '(removido)', Foto: '', Parente: '1', Status: 'Inativo' }); throw e; }
}
function getMemberCard_(d, u) {
  const mid = clip_(d.membroId, 30), m = table_('Membros').rows.filter(function (x) { return x.MembroID === mid; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Pessoa não encontrada.');
  fichaNivel_(u, m);
  const c = table_('Celulas').rows.filter(function (x) { return x.CelulaID === m.CelulaID; })[0] || {}, usu = table_('Usuarios').rows.some(function (x) { return x.MembroID === mid && x.Status === 'Ativo'; });
  return { id: m.MembroID, nome: m.Nome, apelido: m.Apelido || m.Simples || String(m.Nome).split(' ')[0], nasc: m.Nascimento || '', sexo: m.Sexo || '', tel: m.Telefone || '', email: m.Email || '', foto: m.Foto ? 1 : 0, membro: m.EhMembro === '1', celula: c.Nome || '', temAcesso: usu,
    end: { cep: m.CEP || '', uf: m.UF || '', cidade: m.Cidade || '', bairro: m.Bairro || '', endereco: m.Endereco || '' }, lat: geoOk_(m.Lat, m.Lng) ? Number(m.Lat) : null, lng: geoOk_(m.Lat, m.Lng) ? Number(m.Lng) : null };
}
function getCellCard_(d, u) {
  const id = clip_(d.celulaId, 30), c = table_('Celulas').rows.filter(function (r) { return r.CelulaID === id; })[0]; if (!c) throw new ApiError('NOT_FOUND', 'Célula não encontrada.');
  const adm = podeCurar_(u), full = adm || (u.lidera || []).concat(u.treina || [], u.supervisiona || []).indexOf(id) >= 0;
  if (c.Status === 'Inativa' && !adm) throw new ApiError('NOT_FOUND', 'Célula não encontrada.');
  const nm = nomes_(), lid = table_('Membros').rows.filter(function (m) { return m.MembroID === c.LiderID; })[0] || {}, n = table_('Membros').rows.filter(function (m) { return m.CelulaID === id && m.Status !== 'Inativo'; }).length;
  let editavel = false; try { editavel = (u.papel === 'admin' || u.papel === 'pastor' || can_(u, 'celulas') || can_(u, 'config')) && cellAccess_(u, id, 'gerir', 'perfilc', 'editar'); } catch (e) { editavel = false; }
  return { id: id, nome: c.Nome, descricao: c.Descricao || '', dia: c.Dia || '', inicio: c.Inicio || '', fim: c.Fim || '', categoria: c.Categoria || '', faixa: c.Faixa || '', bairro: c.Bairro || '', cidade: c.Cidade || '', uf: c.UF || '', endereco: full || c.PrivEnd === '1' ? (c.Endereco || '') : '', status: c.Status || 'Ativa',
    lider: nm[c.LiderID] || '', liderTel: full || c.PrivTel === '1' ? (lid.Telefone || '') : '', liderEmail: full || c.PrivEmail === '1' ? (lid.Email || '') : '', supervisor: full ? (nm[c.SupervisorID] || '') : '', membros: full ? n : null, completo: full, editavel: !!editavel,
    lat: geoOk_(c.Lat, c.Lng) ? Number(c.Lat) : null, lng: geoOk_(c.Lat, c.Lng) ? Number(c.Lng) : null };
}
function cn_() { const o = {}; table_('Celulas').rows.forEach(function (c) { o[c.CelulaID] = c.Nome; }); return o; }
/* ===== votos da presença de Deus: cada pessoa da célula dá a sua nota; a média soma a nota do líder ===== */
function votoCelula_(d, u) {
  const me = table_('Membros').rows.filter(function (m) { return m.MembroID === u.membroId; })[0] || {}, meus = [me.CelulaID].concat(u.lidera || [], u.treina || []).filter(String), id = clip_(d.celulaId, 30) || me.CelulaID || '';
  if (!id || meus.indexOf(id) < 0) throw new ApiError('FORBIDDEN', 'Só quem é da célula dá a nota.');
  return { id: id, lider: (u.lidera || []).indexOf(id) >= 0 };
}
function getVoteInfo_(d, u) {
  let c; try { c = votoCelula_(d, u); } catch (e) { return { reuniao: null }; }
  const r = table_('Reunioes').rows.filter(function (x) { return x.CelulaID === c.id; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; })[0]; if (!r) return { reuniao: null };
  const vm = votosMapa_(), tm = termMedia_(r, vm), meu = lazy_('VotosDeus').rows.filter(function (v) { return v.CelulaID === c.id && v.Data === r.Data && v.MembroID === u.membroId; })[0];
  const dias = Math.round((new Date(today_() + 'T12:00:00') - new Date(r.Data + 'T12:00:00')) / 86400000);
  return { reuniao: true, celulaId: c.id, data: r.Data, dia: diaDe_(r.Data), meu: meu ? Number(meu.Valor) : null, media: tm.media, termLider: tm.lider, votos: tm.votos, lider: c.lider, podeVotar: !c.lider && dias <= 14 };
}
function voteGod_(d, u) {
  return withLock_(function () {
    const c = votoCelula_(d, u); if (c.lider) throw new ApiError('VALIDATION', 'A nota do líder é a que você registrou na chamada.');
    const data = clip_(d.data, 10), r = table_('Reunioes').rows.filter(function (x) { return x.CelulaID === c.id && x.Data === data; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Essa reunião ainda não foi registrada pelo líder.');
    if (Math.round((new Date(today_() + 'T12:00:00') - new Date(data + 'T12:00:00')) / 86400000) > 14) throw new ApiError('VALIDATION', 'O prazo para dar a nota dessa reunião acabou (14 dias).');
    const v = Math.round(Number(d.valor)); if (!isFinite(v) || v < 0 || v > 100) throw new ApiError('VALIDATION', 'Nota inválida.');
    const t = lazy_('VotosDeus'), ex = t.rows.filter(function (x) { return x.CelulaID === c.id && x.Data === data && x.MembroID === u.membroId; })[0];
    if (ex) writeRow_(t, ex._row, { Valor: String(v), Quando: now_() }); else appendRow_(t, { CelulaID: c.id, Data: data, MembroID: u.membroId, Valor: String(v), Quando: now_() });
    TMEMO_ = null; const tm = termMedia_(r, votosMapa_()); audit_(u.email, 'VOTO_DEUS', c.id + ' ' + data + ' ' + v, 'OK'); return { media: tm.media, votos: tm.votos };
  });
}
/* ===== mural da célula: compartilhado por quem é da célula; qualquer pessoa vê pelo perfil da célula nos mapas ===== */
const MURAL_MAX_ = 60;
function muralCelOut_(r) { return { id: r.ItemID, t: r.Tipo, x: Number(r.X) || 0, y: Number(r.Y) || 0, w: Number(r.W) || 0, r: Number(r.R) || 0, z: Number(r.Z) || 0, l: r.Legenda || '', c: r.Cor || '', k: r.Kind || '', img: r.Foto || '' }; }
function muralPode_(u, id) {
  const me = table_('Membros').rows.filter(function (m) { return m.MembroID === u.membroId; })[0] || {};
  return [me.CelulaID].concat(u.lidera || [], u.treina || [], u.supervisiona || []).filter(String).indexOf(id) >= 0 || u.papel === 'admin' || u.papel === 'pastor' || can_(u, 'celulas');
}
function muralCelId_(d, u) { const me = table_('Membros').rows.filter(function (m) { return m.MembroID === u.membroId; })[0] || {}, id = clip_(d.celulaId, 30) || me.CelulaID || (u.lidera || [])[0] || ''; if (!id) throw new ApiError('NOT_FOUND', 'Célula não encontrada.'); return id; }
function getCellMural_(d, u) {
  const id = muralCelId_(d, u), c = table_('Celulas').rows.filter(function (x) { return x.CelulaID === id; })[0]; if (!c || (c.Status === 'Inativa' && !podeCurar_(u))) throw new ApiError('NOT_FOUND', 'Célula não encontrada.');
  return { celulaId: id, pode: muralPode_(u, id), itens: lazy_('MuralCelula').rows.filter(function (r) { return r.CelulaID === id; }).sort(function (a, b) { return (Number(a.Z) || 0) - (Number(b.Z) || 0) || a._row - b._row; }).map(muralCelOut_) };
}
function saveMuralItem_(d, u) {
  return withLock_(function () {
    const id = muralCelId_(d, u); if (!muralPode_(u, id)) throw new ApiError('FORBIDDEN', 'Só quem é da célula mexe no mural.');
    const i = d.item || {}, t = lazy_('MuralCelula'), num = function (v, a, b) { v = Math.round(Number(v)); return String(isFinite(v) ? Math.max(a, Math.min(b, v)) : 0); };
    const cor = /^#[0-9a-f]{3,8}$/i.test(String(i.c || '')) ? String(i.c) : '', ex = i.id ? t.rows.filter(function (r) { return r.ItemID === String(i.id) && r.CelulaID === id; })[0] : null;
    const patch = { X: num(i.x, -300, 3000), Y: num(i.y, -300, 3000), W: num(i.w, 0, 700), R: num(i.r, -45, 45), Z: num(i.z, 0, 99999), Legenda: clip_(i.l, 60), Cor: cor };
    if (ex) { writeRow_(t, ex._row, patch); return { id: ex.ItemID }; }
    if (i.t !== 'p' && i.t !== 's') throw new ApiError('VALIDATION', 'Tipo de item inválido.');
    if (t.rows.filter(function (r) { return r.CelulaID === id; }).length >= MURAL_MAX_) throw new ApiError('VALIDATION', 'O mural está cheio (' + MURAL_MAX_ + ' itens). Remova algum para colocar outro.');
    const foto = i.t === 'p' ? fotoOk_(i.img) : ''; if (i.t === 'p' && !foto) throw new ApiError('VALIDATION', 'Envie a foto.');
    const nid = id_('MC'); appendRow_(t, Object.assign({ ItemID: nid, CelulaID: id, Tipo: i.t, Kind: i.t === 's' ? clip_(i.k, 20) : '', Foto: foto, AutorID: u.membroId, CriadoEm: now_() }, patch)); audit_(u.email, 'MURAL_CEL', id + ' +' + i.t, 'OK'); return { id: nid };
  });
}
function delMuralItem_(d, u) {
  return withLock_(function () {
    const id = muralCelId_(d, u); if (!muralPode_(u, id)) throw new ApiError('FORBIDDEN', 'Só quem é da célula mexe no mural.');
    const t = lazy_('MuralCelula'), r = t.rows.filter(function (x) { return x.ItemID === String(d.itemId) && x.CelulaID === id; })[0]; if (!r) return { ok: true }; delRow_(t, r._row); audit_(u.email, 'MURAL_CEL', id + ' -' + r.Tipo, 'OK'); return { ok: true };
  });
}
/* ===== Posts agendados (campanhas): no ar por período, sazonais todo ano, ligados/desligados à mão; aparecem no Início e em Notícias ===== */
function isoD_(d) { return d.toISOString().slice(0, 10); }
function parseD_(s) { const p = String(s).split('-'); return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))); }
function addDias_(s, n) { const d = parseD_(s); d.setUTCDate(d.getUTCDate() + n); return isoD_(d); }
function addMeses_(s, n) { const d = parseD_(s), dia = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const ult = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(dia, ult)); return isoD_(d); }
function campFim_(modo, ini, qtd, fim) {
  if (modo === 'dias') return addDias_(ini, qtd - 1); if (modo === 'meses') return addDias_(addMeses_(ini, qtd), -1); if (modo === 'anos') return addDias_(addMeses_(ini, 12 * qtd), -1); return fim;
}
function campJanela_(c, hoje) {
  const ini = c.Inicio, fim = c.Fim; if (!ini || !fim) return { de: ini, ate: fim, ativa: false, futura: false };
  if (c.Anual !== '1') return { de: ini, ate: fim, ativa: hoje >= ini && hoje <= fim, futura: ini > hoje };
  const y0 = Number(ini.slice(0, 4)), hy = Number(hoje.slice(0, 4)); let prox = null, ult = null;
  for (let y = hy - 1; y <= hy + 1; y++) { const dy = y - y0, de = addMeses_(ini, 12 * dy), ate = addMeses_(fim, 12 * dy); if (hoje >= de && hoje <= ate) return { de: de, ate: ate, ativa: true, futura: false }; if (de > hoje && (!prox || de < prox.de)) prox = { de: de, ate: ate }; if (ate < hoje) ult = { de: de, ate: ate }; }
  const j = prox || ult; return { de: j.de, ate: j.ate, ativa: false, futura: !!prox };
}
function campOut_(c, hoje) {
  const j = campJanela_(c, hoje), est = c.Estado === 'ligado' || c.Estado === 'desligado' ? c.Estado : 'auto', no = est === 'ligado' || (est === 'auto' && j.ativa);
  return { id: c.CampID, titulo: c.Titulo, texto: c.Texto || '', arte: c.Arte || '', zoe: c.Zoe || '', preset: c.Preset || '', inicio: c.Inicio, fim: c.Fim, modo: c.Modo || 'intervalo', qtd: Number(c.Qtd) || 0, anual: c.Anual === '1', onde: String(c.Onde || 'feed,noticias').split(',').filter(String), estado: est, de: j.de, ate: j.ate, noAr: no, status: est === 'desligado' ? 'desligada' : (no ? 'no_ar' : (j.futura ? 'agendada' : 'encerrada')) };
}
function listCampanhas_(d, u) { const h = today_(); return lazy_('Campanhas').rows.map(function (c) { return campOut_(c, h); }).filter(function (c) { return c.noAr; }).sort(function (a, b) { return a.ate < b.ate ? -1 : 1; }).slice(0, 12); }
function adminCampanhas_(d, u) { const h = today_(), ord = { no_ar: 0, agendada: 1, desligada: 2, encerrada: 3 }; return lazy_('Campanhas').rows.map(function (c) { return campOut_(c, h); }).sort(function (a, b) { return ord[a.status] - ord[b.status] || (a.de < b.de ? -1 : 1); }); }
function saveCampanha_(d, u) {
  return withLock_(function () {
    const t = lazy_('Campanhas'), id = clip_(d.id, 30), ex = id ? t.rows.filter(function (r) { return r.CampID === id; })[0] : null; if (id && !ex) throw new ApiError('NOT_FOUND', 'Post agendado não encontrado.');
    const titulo = clip_(d.titulo, 120); if (!titulo) throw new ApiError('VALIDATION', 'Informe o título.');
    const ini = clip_(d.inicio, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(ini)) throw new ApiError('VALIDATION', 'Informe a data de início.');
    const modo = ['dias', 'meses', 'anos', 'intervalo'].indexOf(d.modo) >= 0 ? d.modo : 'intervalo', qtd = Math.round(Number(d.qtd)) || 0;
    if (modo !== 'intervalo' && (qtd < 1 || qtd > (modo === 'dias' ? 366 : modo === 'meses' ? 36 : 3))) throw new ApiError('VALIDATION', 'Quantidade fora do limite para ' + modo + '.');
    const fim = campFim_(modo, ini, qtd, clip_(d.fim, 10)); if (!/^\d{4}-\d{2}-\d{2}$/.test(fim) || fim < ini) throw new ApiError('VALIDATION', 'A data final precisa ser depois da inicial.');
    const anual = d.anual ? '1' : '0'; if (anual === '1' && (parseD_(fim) - parseD_(ini)) / 86400000 > 364) throw new ApiError('VALIDATION', 'Post que se repete todo ano precisa durar menos de 1 ano.');
    const onde = (Array.isArray(d.onde) ? d.onde : String(d.onde || 'feed,noticias').split(',')).filter(function (x) { return x === 'feed' || x === 'noticias'; }); if (!onde.length) throw new ApiError('VALIDATION', 'Escolha onde o post aparece: Início e/ou Notícias.');
    const arte = d.arte === undefined ? undefined : fotoOk_(d.arte), est = d.estado === 'ligado' || d.estado === 'desligado' ? d.estado : 'auto';
    const patch = { Titulo: titulo, Texto: clip_(d.texto, 1500), Zoe: clip_(d.zoe, 600), Preset: clip_(d.preset, 30), Inicio: ini, Fim: fim, Modo: modo, Qtd: String(modo === 'intervalo' ? '' : qtd), Anual: anual, Onde: onde.join(','), Estado: est, AtualizadoEm: now_() };
    if (arte !== undefined) patch.Arte = arte;
    if (ex) { writeRow_(t, ex._row, patch); audit_(u.email, 'CAMPANHA', 'edita ' + titulo, 'OK'); return { id: ex.CampID }; }
    const nid = id_('CP'); appendRow_(t, Object.assign({ CampID: nid, Arte: arte || '', CriadoPor: u.membroId, CriadoEm: now_() }, patch)); audit_(u.email, 'CAMPANHA', 'novo ' + titulo, 'OK'); return { id: nid };
  });
}
function setCampanhaEstado_(d, u) {
  return withLock_(function () { const t = lazy_('Campanhas'), r = t.rows.filter(function (x) { return x.CampID === clip_(d.id, 30); })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Post agendado não encontrado.'); const est = d.estado === 'ligado' || d.estado === 'desligado' ? d.estado : 'auto'; writeRow_(t, r._row, { Estado: est, AtualizadoEm: now_() }); audit_(u.email, 'CAMPANHA', est + ' ' + r.Titulo, 'OK'); return { ok: true }; });
}
function deleteCampanha_(d, u) {
  return withLock_(function () { const t = lazy_('Campanhas'), r = t.rows.filter(function (x) { return x.CampID === clip_(d.id, 30); })[0]; if (!r) return { ok: true }; delRow_(t, r._row); audit_(u.email, 'CAMPANHA', 'apaga ' + r.Titulo, 'OK'); return { ok: true }; });
}
function saveSupCor_(d, u) {
  const sid = clip_(d.supId, 30), cor = String(d.cor || ''); if (!sid) throw new ApiError('VALIDATION', 'Supervisão inválida.'); if (cor && !/^#[0-9a-fA-F]{6}$/.test(cor)) throw new ApiError('VALIDATION', 'Cor inválida.');
  if (!(u.papel === 'admin' || u.papel === 'pastor' || can_(u, 'config') || can_(u, 'celulas') || (u.membroId === sid && (u.supervisiona || []).length > 0))) throw new ApiError('FORBIDDEN', 'Só a administração ou o próprio supervisor muda a cor da supervisão.');
  return withLock_(function () { const t = table_('Config'), k = 'SupCor:' + sid, r0 = t.rows.filter(function (x) { return x.Chave === k; })[0]; if (r0) writeRow_(t, r0._row, { Valor: cor }); else appendRow_(t, { Chave: k, Valor: cor }); audit_(u.email, 'SUP_COR', sid, 'OK'); return { cores: supCores_() }; });
}
function saveMyGeo_(d, u) {
  if (!geoOk_(d.lat, d.lng)) throw new ApiError('VALIDATION', 'Marque no mapa onde você mora.');
  const alvo = clip_(d.membroId, 30) || u.membroId; if (alvo !== u.membroId && !(can_(u, 'config') || can_(u, 'celulas') || u.papel === 'pastor')) throw new ApiError('FORBIDDEN', 'Só você ou a administração marcam essa casa.');
  return withLock_(function () { const t = ensureCols_('Membros', ['Lat', 'Lng']), m = t.rows.filter(function (x) { return x.MembroID === alvo; })[0]; if (!m) throw new ApiError('NOT_FOUND', 'Pessoa não encontrada.'); writeRow_(t, m._row, { Lat: String(Math.round(Number(d.lat) * 1e6) / 1e6), Lng: String(Math.round(Number(d.lng) * 1e6) / 1e6) }); audit_(u.email, 'CASA_MARCADA', alvo, 'OK'); return { ok: true }; });
}
function getMapa_(d, u) {
  if (!ehLider_(u)) throw new ApiError('FORBIDDEN', 'O mapa de distribuição é para líderes, supervisores e administração.');
  const todos = u.papel === 'admin' || u.papel === 'pastor' || can_(u, 'celulas') || can_(u, 'config'), meus = (u.lidera || []).concat(u.treina || [], u.supervisiona || []), cfg = mapaCfg_(), nm = nomes_();
  const dentro = function (cid) { return todos || (!!cid && meus.indexOf(cid) >= 0); };
  const cels = table_('Celulas').rows.filter(function (c) { return c.Status !== 'Inativa' && geoOk_(c.Lat, c.Lng) && (todos || dentro(c.CelulaID)); }).map(function (c) { return { id: c.CelulaID, nome: c.Nome, lat: Number(c.Lat), lng: Number(c.Lng), liderId: c.LiderID || '', lider: nm[c.LiderID] || '', supId: c.SupervisorID || '', sup: nm[c.SupervisorID] || '', cor: supCores_()[c.SupervisorID] || '', bairro: c.Bairro || '', dia: c.Dia || '', ini: c.Inicio || '' }; });
  const cont = {}; const soma = function (rows, f) { rows.forEach(function (r) { if (f(r)) cont[r.MembroID] = (cont[r.MembroID] || 0) + 1; }); };
  soma(table_('Presencas').rows, function (r) { return !!r.MembroID; }); soma(table_('EventoPresenca').rows, function (r) { return !!r.MembroID; }); soma(table_('Cultos').rows, function (r) { return !!r.MembroID; }); soma(table_('AulaPresenca').rows, function (r) { return r.Presente === '1'; });
  const tipo = function (membro, v) { return membro ? 'membro' : v <= cfg.vis ? 'visitante' : v >= cfg.freq ? 'frequentador' : 'recorrente'; };
  let ativos = 0, semGeo = 0, comEnd = 0;
  const pessoas = [];
  table_('Membros').rows.forEach(function (m) {
    if (m.Status === 'Inativo') return; if (!dentro(m.CelulaID) && !todos) return; ativos++;
    if (!geoOk_(m.Lat, m.Lng)) { semGeo++; if (m.Endereco || m.Cidade) comEnd++; return; }
    const membro = m.EhMembro === '1' || m.EhMembro === 'true' || m.EhMembro === 'sim', v = cont[m.MembroID] || 0;
    pessoas.push({ id: m.MembroID, nome: m.Apelido || m.Simples || m.Nome, lat: Number(m.Lat), lng: Number(m.Lng), cel: m.CelulaID || '', tipo: tipo(membro, v), vezes: v, foto: m.Foto ? 1 : 0 });
  });
  table_('Visitantes').rows.forEach(function (v) {
    if (!geoOk_(v.Lat, v.Lng) || !(todos || dentro(v.CelulaID) || dentro(v.CelulaProximaID) || v.RegistradoPor === u.membroId)) return;
    pessoas.push({ id: 'v:' + v.VisitanteID, nome: v.Apelido || v.Nome, lat: Number(v.Lat), lng: Number(v.Lng), cel: v.Status === 'aceito' ? (v.CelulaID || '') : '', tipo: tipo(false, 1), vezes: 1, foto: 0, visitante: 1 });
  });
  return { cfg: cfg, cores: supCores_(), celulas: cels, pessoas: pessoas, totais: { ativos: ativos, semCoordenada: semGeo, comEndereco: comEnd }, escopo: todos ? 'total' : 'celulas' };
}
function listGeoPendentes_(d, u) {
  if (!(can_(u, 'config') || can_(u, 'celulas') || u.papel === 'pastor')) throw new ApiError('FORBIDDEN', 'Só a administração prepara os endereços do mapa.');
  const l = table_('Membros').rows.filter(function (m) { return m.Status !== 'Inativo' && !geoOk_(m.Lat, m.Lng) && (m.Endereco || m.CEP) && (m.Cidade || m.CEP); });
  return { total: l.length, itens: l.slice(0, 300).map(function (m) { return { id: m.MembroID, nome: m.Nome, q: [m.Endereco, m.Bairro, m.Cidade, m.UF, 'Brasil'].filter(String).join(', '), cep: String(m.CEP || '').replace(/\D/g, '') }; }) };
}
function saveGeoLote_(d, u) {
  if (!(can_(u, 'config') || can_(u, 'celulas') || u.papel === 'pastor')) throw new ApiError('FORBIDDEN', 'Só a administração prepara os endereços do mapa.');
  return withLock_(function () {
    const t = table_('Membros'), idx = {}; t.rows.forEach(function (m) { idx[m.MembroID] = m; }); let n = 0;
    (Array.isArray(d.itens) ? d.itens : []).slice(0, 300).forEach(function (it) { const m = idx[clip_(it && it.id, 30)]; if (!m || !geoOk_(it.lat, it.lng)) return; writeRow_(t, m._row, { Lat: String(Math.round(Number(it.lat) * 1e6) / 1e6), Lng: String(Math.round(Number(it.lng) * 1e6) / 1e6) }); n++; });
    audit_(u.email, 'MAPA_GEO', String(n), 'OK'); return { salvos: n };
  });
}
function celFotos_(d) {
  const ids = (Array.isArray(d.ids) ? d.ids : []).slice(0, 40).map(function (x) { return clip_(x, 30); }), o = {};
  table_('Celulas').rows.forEach(function (c) { if (ids.indexOf(c.CelulaID) >= 0) o[c.CelulaID] = c.Foto || ''; }); return o;
}
function clearSamples_(d, u) { // apaga só as amostras aprendidas/enviadas; a assinatura da foto de perfil continua
  return withLock_(function () {
    const t = table_('Rostos'), id = clip_(d.id, 30), r = t.rows.filter(function (x) { return x.MembroID === id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Pessoa não encontrada na lista de rostos.');
    const n = amostras_(r.Amostras).length; writeRow_(t, r._row, { Amostras: '', AtualizadoEm: today_() });
    audit_(u.email, 'ROSTOS_AMOSTRAS_APAGADAS', id + ':' + n, 'OK'); return { n: n };
  });
}
// ---- Taxa de acerto: cada sessão de câmera registra quantas sugestões foram confirmadas, rejeitadas e identificadas à mão
function faceStat_(d, u) {
  const ac = metNum_(d.ok, 5000), er = metNum_(d.nao, 5000), ma = metNum_(d.man, 5000); if (!ac && !er && !ma) return { ok: true };
  return withLock_(function () { const n = now_(); appendRow_(table_('RostoLog'), { Data: n.slice(0, 10), Hora: n.slice(11, 16), Por: u.email, Contexto: clip_(d.ctx, 80), Acertos: String(ac), Erros: String(er), Manuais: String(ma) }); return { ok: true }; });
}
function faceStats_(d, u) {
  const rows = table_('RostoLog').rows.map(function (r) { return { data: r.Data, hora: r.Hora, ctx: r.Contexto, ok: metNum_(r.Acertos), nao: metNum_(r.Erros), man: metNum_(r.Manuais) }; });
  const tot = function (l) { const o = { ok: 0, nao: 0, man: 0 }; l.forEach(function (x) { o.ok += x.ok; o.nao += x.nao; o.man += x.man; }); return o; };
  const lim = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return { geral: tot(rows), ultimos30: tot(rows.filter(function (x) { return x.data >= lim; })), sessoes: rows.slice(-30).reverse() };
}
function clearFaces_(d, u) { // apaga assinaturas e autorizações; o registro do consentimento (prova do aceite) permanece
  return withLock_(function () {
    const t = table_('Rostos'), n = t.rows.length, tem = function (r) { return r.ConsentimentoBio || r.ConsentimentoImagem; };
    t.rows.filter(tem).forEach(function (r) { writeRow_(t, r._row, { Descritor: '', Amostras: '', Autorizado: '0', AutorizadoPor: 'limpeza' }); });
    t.rows.filter(function (r) { return !tem(r); }).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; }).forEach(function (rw) { delRow_(t, rw); });
    audit_(u.email, 'ROSTOS_APAGADOS', String(n), 'OK'); return { n: n };
  });
}
// ---- Presença em cultos normais (qualquer dia, sem cadastrar evento): uma linha por pessoa, data e nome do culto
function membrosAtivos_() { return table_('Membros').rows.filter(function (m) { return m.Status !== 'Inativo'; }).map(function (m) { return { id: m.MembroID, nome: m.Nome }; }).sort(function (a, b) { return a.nome < b.nome ? -1 : 1; }); }
function cultoChave_(d) {
  const data = clip_(d.data, 10), culto = clip_(d.culto, 60);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || isNaN(new Date(data + 'T12:00:00Z').getTime())) throw new ApiError('VALIDATION', 'Data do culto inválida.');
  if (data > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) throw new ApiError('VALIDATION', 'A data do culto não pode estar no futuro.');
  if (culto.length < 2) throw new ApiError('VALIDATION', 'Informe o nome do culto.');
  return { data: data, culto: culto };
}
function cultoPresenca_(d, u) {
  const k = cultoChave_(d), pres = []; table_('Cultos').rows.forEach(function (r) { if (r.Data === k.data && r.Culto === k.culto) pres.push(r.MembroID); });
  return { titulo: k.culto, data: k.data, presentes: pres, membros: membrosAtivos_() };
}
function checkinCulto_(d, u) {
  return withLock_(function () {
    const k = cultoChave_(d), ids = (Array.isArray(d.membros) ? d.membros : []).slice(0, 500).map(function (x) { return clip_(x, 30); }).filter(String), t = table_('Cultos'), ja = {}, mem = {};
    t.rows.forEach(function (r) { if (r.Data === k.data && r.Culto === k.culto) ja[r.MembroID] = 1; }); table_('Membros').rows.forEach(function (m) { mem[m.MembroID] = 1; });
    let n = 0, hora = now_().slice(11, 16);
    ids.forEach(function (mid) {
      if (!mem[mid] || ja[mid]) return; ja[mid] = 1; appendRow_(t, { Data: k.data, Culto: k.culto, MembroID: mid, RegistradoPor: u.email, Hora: hora }); t.rows.push({ Data: k.data, Culto: k.culto, MembroID: mid }); n++;
      awardXp_(mid, 'culto:' + k.data + ':' + norm_(k.culto), 10, 'Presença no culto');
    });
    audit_(u.email, 'CULTO_CHECKIN', k.data + ' ' + k.culto, 'OK'); return { n: n };
  });
}
function cultosResumo_(d, u) { // últimos 90 dias: quantas pessoas por culto
  const desde = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10), o = {};
  table_('Cultos').rows.forEach(function (r) { if (r.Data < desde) return; const k = r.Data + '|' + r.Culto; o[k] = (o[k] || 0) + 1; });
  return { cultos: Object.keys(o).map(function (k) { const p = k.split('|'); return { data: p[0], culto: p.slice(1).join('|'), total: o[k] }; }).sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : a.culto < b.culto ? -1 : 1; }).slice(0, 40) };
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
function listPeople_(d, u) {
  const ativos = {}; table_('Usuarios').rows.forEach(function (r) { if (r.Status === 'Ativo' && r.MembroID) ativos[r.MembroID] = 1; });
  const todos = table_('Membros').rows.filter(function (m) { return ativos[m.MembroID] && m.MembroID !== u.membroId && m.Status !== 'Inativo'; }).sort(function (a, b) { return String(a.Simples || a.Apelido || a.Nome).localeCompare(String(b.Simples || b.Apelido || b.Nome)); });
  const de = Math.max(0, Number(d.de) || 0), pag = todos.slice(de, de + 60);
  let pv = {}; if (!(d && d.inv)) { try { pv = CacheService.getScriptCache().getAll(pag.map(function (m) { return 'p:' + m.MembroID; })) || {}; } catch (e) { pv = {}; } } // uma consulta só, em vez de uma por pessoa
  return { total: todos.length, itens: pag.map(function (m) { const v = (d && d.inv) ? 0 : Number(pv['p:' + m.MembroID] || 0); return { id: m.MembroID, nome: m.Simples || m.Apelido || m.Nome, online: v > 0 && Date.now() - v < PRES_MS, visto: v }; }) };
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
    const salt = Utilities.getUuid(); appendRow_(ensureCols_('Usuarios', ['SenhaVis']), { Email: email, SenhaVis: pwEnc_(pw, salt), SenhaHash: hash_(salt, pw), Salt: salt, Papel: papel, Status: 'Ativo', GuiaVisto: '0', MembroID: mid, TrocarSenha: '1', CriadoEm: now_() }); audit_(u.email, 'USUARIO_CRIADO', email + ':' + papel, 'OK'); return { ok: true, membroId: mid };
  });
}
function setUser_(d, u) {
  return withLock_(function () {
    const email = clip_(d.email, 120).toLowerCase(), t = table_('Usuarios'), r = t.rows.filter(function (x) { return String(x.Email).toLowerCase() === email; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Usuário não encontrado.');
    const p = {}; if (d.papel) { if (!papelValido_(d.papel)) throw new ApiError('VALIDATION', 'Papel inválido.'); if ((d.papel === 'admin' || r.Papel === 'admin') && u.papel !== 'admin') throw new ApiError('FORBIDDEN', 'Só administrador altera administradores.'); if (email === u.email && d.papel !== 'admin' && u.papel === 'admin') throw new ApiError('VALIDATION', 'Você não pode remover o seu próprio acesso de administrador.'); p.Papel = d.papel; }
    if (d.status) { if (email === u.email) throw new ApiError('VALIDATION', 'Você não pode desativar a si mesmo.'); p.Status = d.status === 'Inativo' ? 'Inativo' : 'Ativo'; }
    if (d.senha) { if (String(d.senha).length < 8) throw new ApiError('VALIDATION', 'A senha precisa ter 8+ caracteres.'); const salt = Utilities.getUuid(); p.Salt = salt; p.SenhaHash = hash_(salt, String(d.senha)); p.SenhaVis = pwEnc_(String(d.senha), salt); p.TrocarSenha = '1'; }
    writeRow_(p.SenhaVis !== undefined ? ensureCols_('Usuarios', ['SenhaVis']) : t, r._row, p); bumpVer_(email); audit_(u.email, 'USUARIO_ALTERADO', email, 'OK'); return { ok: true };
  });
}
function changePassword_(d, u) {
  return withLock_(function () {
    const t = table_('Usuarios'), r = t.rows.filter(function (x) { return String(x.Email).toLowerCase() === u.email; })[0]; const nova = String(d.nova || '');
    if (!safeEq_(hash_(r.Salt, String(d.atual || '')), r.SenhaHash)) throw new ApiError('AUTH', 'A senha atual não confere.'); if (nova.length < 8) throw new ApiError('VALIDATION', 'A nova senha precisa ter 8+ caracteres.');
    const salt = Utilities.getUuid(); writeRow_(ensureCols_('Usuarios', ['SenhaVis']), r._row, { Salt: salt, SenhaHash: hash_(salt, nova), SenhaVis: pwEnc_(nova, salt), TrocarSenha: '' }); bumpVer_(u.email); audit_(u.email, 'SENHA_TROCADA', '', 'OK'); return { ok: true, relogin: true };
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
    if (e.apagar) delRow_(t, row._row); else { const p = {}; p[e.status.col] = d.reativar ? e.status.ativo : e.status.off; writeRow_(t, row._row, p); }
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
    const apaga = function (aba, col) { const t = table_(aba); t.rows.filter(function (r) { return r[col] === id; }).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; }).forEach(function (rw) { delRow_(t, rw); }); };
    us.map(function (r) { return r._row; }).sort(function (a, b) { return b - a; }).forEach(function (rw) { delRow_(tu, rw); });
    apaga('Notificacoes', 'MembroID'); apaga('Rostos', 'MembroID');
    delRow_(tm, m._row);
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
    if (ex && !on) delRow_(t, ex._row); else if (!ex && on) appendRow_(t, { Tipo: 'post', AlvoID: p.PostID, MembroID: u.membroId, Data: now_() });
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
    if (r.MembroID !== u.membroId && !can_(u, 'config') && u.papel !== 'admin') throw new ApiError('FORBIDDEN', 'Só quem comentou pode apagar.'); delRow_(t, r._row); return { ok: true };
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
      const km = Math.round(pr.km * 10) / 10, nomes = nomes_(), sup = pr.cel.SupervisorID || '', t = table_('Visitantes'), vr = t.rows.filter(function (x) { return x.VisitanteID === id; })[0];
      if (sup) { // o supervisor decide para quem o visitante vai; o líder só é avisado depois do encaminhamento
        writeRow_(t, vr._row, { Status: 'triagem', SupervisorID: sup, LiderID: pr.cel.LiderID || '', CelulaProximaID: pr.cel.CelulaID });
        if (sup !== u.membroId) notify_(sup, 'visitante', 'Visitante para encaminhar: ' + nome, ap + ' mora a ' + km + ' km da célula ' + pr.cel.Nome + (pr.cel.LiderID ? ' (líder ' + (nomes[pr.cel.LiderID] || '—') + ')' : '') + '. Abra Consolidação para escolher quem vai consolidar.', 'visitante:' + id);
      } else { // sem supervisor: vai direto para o líder da célula mais próxima
        writeRow_(t, vr._row, { Status: 'encaminhado', LiderID: pr.cel.LiderID || '', EncaminhadoEm: now_(), CelulaProximaID: pr.cel.CelulaID });
        if (pr.cel.LiderID && pr.cel.LiderID !== u.membroId) notify_(pr.cel.LiderID, 'visitante', 'Novo visitante perto da sua célula: ' + nome, ap + ' esteve no culto e mora a ' + km + ' km. Abra Consolidação para aceitar e chamar no WhatsApp.', 'visitante:' + id);
      }
    }
    audit_(u.email, 'VISITANTE', id + ' ' + nome, 'OK'); return { id: id, celula: pr ? { id: pr.cel.CelulaID, nome: pr.cel.Nome, km: Math.round(pr.km * 10) / 10 } : null, avisados: pr ? [pr.cel.SupervisorID || pr.cel.LiderID].filter(String).length : 0 };
  });
}
function nearCell_(d, u) {
  if (!ehLider_(u)) throw new ApiError('FORBIDDEN', 'Só líderes usam a consolidação.');
  const lat = Number(d.lat), lng = Number(d.lng); if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new ApiError('VALIDATION', 'Marque o local no mapa.');
  const pr = celulaProxima_(lat, lng); if (!pr) return { celula: null };
  const nm = nomes_(); return { celula: { id: pr.cel.CelulaID, nome: pr.cel.Nome, km: Math.round(pr.km * 10) / 10, dia: pr.cel.Dia || '', inicio: pr.cel.Inicio || '', bairro: pr.cel.Bairro || '', lider: nm[pr.cel.LiderID] || '', supervisor: nm[pr.cel.SupervisorID] || '' } };
}
function visitorOut_(v, cn, nm) { const dest = v.ConsolidadorID || v.LiderID || ''; return { id: v.VisitanteID, nome: v.Nome, apelido: v.Apelido, telefone: v.Telefone, email: v.Email || '', endereco: [v.Endereco, v.Bairro, v.Cidade].filter(String).join(', '), lat: v.Lat === '' ? null : Number(v.Lat), lng: v.Lng === '' ? null : Number(v.Lng), data: v.Data, celulaId: v.CelulaID, celula: cn[v.CelulaID] || '', km: v.Distancia === '' ? null : Number(v.Distancia), contatado: v.Contatado === '1', contatadoEm: v.ContatoData || '', msg: v.Msg || msgPadrao_(v.Apelido || v.Nome), obs: v.Obs || '', decisao: v.Decisao === '1',
    proximaId: v.CelulaProximaID || v.CelulaID, proxima: cn[v.CelulaProximaID || v.CelulaID] || '', status: v.Status || 'encaminhado', supervisorId: v.SupervisorID || '', supervisor: nm[v.SupervisorID] || '', liderId: v.LiderID || '', lider: nm[v.LiderID] || '', consolidadorId: v.ConsolidadorID || '', consolidador: nm[v.ConsolidadorID] || '', destinoId: dest, destino: nm[dest] || '', registradoPor: nm[v.RegistradoPor] || '', encaminhadoEm: v.EncaminhadoEm || '', aceitoEm: v.AceitoEm || '', aceitoPor: nm[v.AceitoPor] || '' }; }
function triagemPode_(u, v) { return u.papel === 'admin' || u.papel === 'pastor' || can_(u, 'celulas') || (!!v.SupervisorID && v.SupervisorID === u.membroId) || (!!v.CelulaID && (u.supervisiona || []).indexOf(v.CelulaID) >= 0); }
function destinoPode_(u, v) { return u.papel === 'admin' || triagemPode_(u, v) || (v.ConsolidadorID || v.LiderID) === u.membroId || (!v.ConsolidadorID && !!v.CelulaID && (u.lidera || []).indexOf(v.CelulaID) >= 0); }
function listVisitors_(d, u) {
  const rows = table_('Visitantes').rows;
  if (!ehLider_(u) && !rows.some(function (v) { return v.ConsolidadorID === u.membroId; })) throw new ApiError('FORBIDDEN', 'Só líderes e consolidadores veem a consolidação.');
  const cn = {}, cels = table_('Celulas').rows, nm = nomes_(); cels.forEach(function (c) { cn[c.CelulaID] = c.Nome; });
  const todos = u.papel === 'admin' || u.papel === 'pastor' || can_(u, 'celulas'), lid = u.lidera || [];
  const vis = function (v) { return todos || v.RegistradoPor === u.membroId || v.ConsolidadorID === u.membroId || triagemPode_(u, v) || (v.Status !== 'triagem' && !!v.CelulaID && lid.indexOf(v.CelulaID) >= 0); };
  const itens = rows.filter(vis).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 200).map(function (v) { const o = visitorOut_(v, cn, nm); o.podeEncaminhar = triagemPode_(u, v); o.souDestino = destinoPode_(u, v); return o; });
  return { itens: itens, celulas: cels.filter(function (c) { return c.Status !== 'Inativa'; }).map(function (c) { return { id: c.CelulaID, nome: c.Nome, lider: nm[c.LiderID] || '', supId: c.SupervisorID || '', cor: supCores_()[c.SupervisorID] || '', lat: c.Lat === '' || c.Lat === undefined ? null : Number(c.Lat), lng: c.Lng === '' || c.Lng === undefined ? null : Number(c.Lng) }; }), pessoas: itens.some(function (o) { return o.podeEncaminhar; }) ? table_('Membros').rows.filter(function (m) { return m.Status !== 'Inativo'; }).map(function (m) { return { id: m.MembroID, nome: m.Nome }; }).sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome)); }) : [], msgPadrao: msgPadrao_('{apelido}') };
}
function routeVisitor_(d, u) {
  return withLock_(function () {
    const t = table_('Visitantes'), v = t.rows.filter(function (x) { return x.VisitanteID === clip_(d.id, 30); })[0]; if (!v) throw new ApiError('NOT_FOUND', 'Visitante não encontrado.');
    if (!triagemPode_(u, v)) throw new ApiError('FORBIDDEN', 'Só o supervisor da região (ou a administração) encaminha este visitante.');
    const cons0 = clip_(d.consolidadorId, 30), cels = table_('Celulas').rows; let cid = clip_(d.celulaId, 30) || v.CelulaID;
    const consM = cons0 ? table_('Membros').rows.filter(function (m) { return m.MembroID === cons0; })[0] : null; if (cons0 && !consM) throw new ApiError('VALIDATION', 'Consolidador não encontrado.');
    if (consM) { // o consolidador escolhido manda: a célula dele (ou a que ele lidera) vira a célula de acompanhamento, e o líder dela o líder registrado
      const dele = consM.CelulaID || (cels.filter(function (c) { return c.LiderID === cons0; })[0] || {}).CelulaID; if (dele) cid = dele;
    }
    const cel = cels.filter(function (c) { return c.CelulaID === cid; })[0]; if (!cel) throw new ApiError('VALIDATION', 'Escolha a célula do visitante.');
    const cons = cons0;
    const lider = cel.LiderID || '', dest = cons || lider; if (!dest) throw new ApiError('VALIDATION', 'Essa célula não tem líder. Escolha um consolidador.');
    const nm = nomes_(), ap = v.Apelido || v.Nome;
    writeRow_(t, v._row, { CelulaID: cid, CelulaProximaID: v.CelulaProximaID || v.CelulaID, LiderID: lider, SupervisorID: v.SupervisorID || (u.membroId || ''), ConsolidadorID: cons && cons !== lider ? cons : '', Status: 'encaminhado', TriagemPor: u.membroId || '', EncaminhadoEm: now_(), AceitoEm: '', AceitoPor: '' });
    notify_(dest, 'visitante', 'Visitante encaminhado para você: ' + v.Nome, (cons && cons !== lider ? 'O supervisor ' + (nm[u.membroId] || '') + ' escolheu você para consolidar ' + ap + '. ' : ap + ' foi encaminhado para a sua célula. ') + 'Abra Consolidação para aceitar e chamar no WhatsApp.', 'visitante:' + v.VisitanteID);
    if (cons && cons !== lider && lider) notify_(lider, 'visitante', 'Visitante na sua célula com consolidador definido', ap + ' será acompanhado por ' + (nm[cons] || 'outra pessoa') + ' e fica registrado na sua célula, porque o consolidador escolhido é da sua célula.', 'visitante:' + v.VisitanteID);
    audit_(u.email, 'VISITANTE_ENCAMINHADO', v.VisitanteID + ' -> ' + dest, 'OK'); return { ok: true, destino: nm[dest] || '', celula: cel.Nome };
  });
}
function acceptVisitor_(d, u) {
  return withLock_(function () {
    const t = table_('Visitantes'), v = t.rows.filter(function (x) { return x.VisitanteID === clip_(d.id, 30); })[0]; if (!v) throw new ApiError('NOT_FOUND', 'Visitante não encontrado.');
    if (v.Status === 'triagem' || !destinoPode_(u, v)) throw new ApiError('FORBIDDEN', 'Esse visitante não foi encaminhado para você.');
    const nm = nomes_();
    if (d.aceitar === false) { writeRow_(t, v._row, { Status: 'triagem', ConsolidadorID: '', EncaminhadoEm: '' }); if (v.SupervisorID) notify_(v.SupervisorID, 'visitante', 'Visitante devolvido: ' + v.Nome, (nm[u.membroId] || 'O destino') + ' não pôde aceitar. Escolha outra pessoa para consolidar.', 'visitante:' + v.VisitanteID); audit_(u.email, 'VISITANTE_RECUSADO', v.VisitanteID, 'OK'); return { ok: true, status: 'triagem' }; }
    writeRow_(t, v._row, { Status: 'aceito', AceitoEm: now_(), AceitoPor: u.membroId || '' });
    if (v.SupervisorID && v.SupervisorID !== u.membroId) notify_(v.SupervisorID, 'visitante', 'Visitante aceito: ' + v.Nome, (nm[u.membroId] || 'O consolidador') + ' aceitou consolidar ' + (v.Apelido || v.Nome) + '.', 'visitante:' + v.VisitanteID);
    audit_(u.email, 'VISITANTE_ACEITO', v.VisitanteID, 'OK'); return { ok: true, status: 'aceito' };
  });
}
function contactVisitor_(d, u) {
  return withLock_(function () {
    const t = table_('Visitantes'), v = t.rows.filter(function (x) { return x.VisitanteID === clip_(d.id, 30); })[0]; if (!v) throw new ApiError('NOT_FOUND', 'Visitante não encontrado.');
    if (!ehLider_(u) && v.ConsolidadorID !== u.membroId) throw new ApiError('FORBIDDEN', 'Só líderes e o consolidador escolhido.');
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
    if (!cor && !com) { if (ex) delRow_(t, ex._row); return { removida: true }; }
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
    t.rows.filter(function (r) { return r.Pagina === pg; }).sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { delRow_(t, r._row); });
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
function deleteAgenda_(d, u) { multiExige_(u); return withLock_(function () { const t = table_('Agendas'), r = t.rows.filter(function (x) { return x.AgendaID === d.id; })[0]; if (!r) throw new ApiError('NOT_FOUND', 'Agenda não encontrada.'); delRow_(t, r._row); audit_(u.email, 'AGENDA_DEL', r.AgendaID, 'OK'); return { ok: true }; }); }
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
/* XP das missões diárias do Sod (definido pelo administrador em Administração › Sod). Padrão: só "Entrar" vale 5 XP, como sempre foi. */
const SOD_XP_PAD_ = { entrar: 5, biblia: 0, oracao: 0, anotar: 0, comunhao: 0, completo: 0 }, SOD_XP_ROT_ = { entrar: 'Entrar no app', biblia: 'Ler a Bíblia', oracao: 'Orar', anotar: 'Escrever uma anotação', comunhao: 'Ir à célula ou ao culto', completo: 'Cumprir todas as missões do dia' };
function sodXpCfg_() { const j = jparse_(cfgMap_().SodXp, {}), o = {}; Object.keys(SOD_XP_PAD_).forEach(function (k) { const v = Math.round(Number(j[k])); o[k] = (j[k] !== undefined && j[k] !== '' && isFinite(v)) ? Math.max(0, Math.min(500, v)) : SOD_XP_PAD_[k]; }); return o; }
function saveSodXp_(d, u) {
  return withLock_(function () {
    const cur = sodXpCfg_(), o = {}; Object.keys(SOD_XP_PAD_).forEach(function (k) { const v = Math.round(Number(d[k])); o[k] = (d[k] !== undefined && d[k] !== '' && isFinite(v)) ? Math.max(0, Math.min(500, v)) : cur[k]; });
    const t = table_('Config'), r = t.rows.filter(function (x) { return x.Chave === 'SodXp'; })[0], v = JSON.stringify(o);
    if (r) writeRow_(t, r._row, { Valor: v }); else appendRow_(t, { Chave: 'SodXp', Valor: v });
    audit_(u.email, 'SOD_XP', v, 'OK'); return { sodXp: o };
  });
}
function sodXpMis_(mid, hoje, mis) {
  const cfg = sodXpCfg_(), semana = 's' + Math.floor((diaNum_(hoje) + 3) / 7), dar = function (k, ref) { if (cfg[k] > 0) awardXp_(mid, 'sodx:' + k + ':' + ref, cfg[k], 'Missão do Sod: ' + SOD_XP_ROT_[k]); };
  if (mis.biblia) dar('biblia', hoje); if (mis.oracao) dar('oracao', hoje); if (mis.anotar) dar('anotar', hoje); if (mis.completo) dar('completo', hoje);
  if (cfg.comunhao > 0 && sodComunhao_(mid, hoje)) dar('comunhao', semana);
}
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
  sodXpMis_(mid, hoje, mis);
  if (mis.completo && e.CaixaBonus !== hoje) { e.CaixaBonus = hoje; e.Caixas++; e.Talentos += 10; aviso.push('bonus'); awardXp_(mid, 'sodm:' + hoje, 0, 'Missões do Sod completas'); }
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
  const xpc = sodXpCfg_(); missoes.forEach(function (m) { m.xp = xpc[m.k] || 0; });
  return { hoje: hoje, domingo: dom === 0, pedra: Math.round(e.Pedra), pedraMax: SOD_MAX, nivelPedra: sodNivelPedra_(e.Pedra), atraso: e.Atraso, nerf: nerf, sentado: e.Atraso >= 3 && !e.Livre, seq: e.Seq + (s.mis.completo ? 1 : 0), seqMeta: SOD_SEMANA, livre: e.Livre, livreDesde: e.LivreDesde, soltos: e.Soltos,
    caixas: e.Caixas, abertas: e.Abertas, golpes: Math.round(e.Golpes), taxa: sodRound_(sodTaxa_(it) * nerf, 2), ferramenta: it, itens: e.itens, equip: e.equip, aparencia: e.apar, sala: e.sala, missoes: missoes, aviso: s.aviso, bag: SOD_BAG, talentos: Math.floor(e.Talentos), loja: { precos: SOD_PRECO, caixa: SOD_CAIXA_PRECO, roupas: SOD_ROUPAS }, xp: xpc };
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
function sodOrar_(d, u) { return withLock_(function () { const s = sodSync_(u.membroId, false), e = s.e; e.Orou = today_(); const m = sodMiss_(u.membroId, today_(), e.Orou); s.mis = m; sodXpMis_(u.membroId, today_(), m); if (m.completo && e.CaixaBonus !== today_()) { e.CaixaBonus = today_(); e.Caixas++; e.Talentos += 10; s.aviso.push('bonus'); awardXp_(u.membroId, 'sodm:' + today_(), 0, 'Missões do Sod completas'); } sodSalva_(s.t, s.r, e); return sodView_(u.membroId, s); }); }

/* Carga inicial em UMA requisição (antes eram ~20 idas e voltas ao Apps Script) */
function boot_(d, u) {
  const out = {}; let cid = clip_(d.celulaId, 30);
  const run = function (k, action, data) { try { const r = ROUTES[action]; if (r.auth && r.auth !== 'any' && !can_(u, r.auth)) throw new ApiError('FORBIDDEN', ''); out[k] = r.fn(data || {}, u); } catch (e) { if (k === 'me' && e instanceof ApiError && cid) { cid = ''; return run(k, action, {}); } out[k] = { __erro: e instanceof ApiError ? e.code : 'ERROR' }; } };
  run('me', 'me', cid ? { celulaId: cid } : {}); const me = out.me && !out.me.__erro ? out.me : null; if (!me) throw new ApiError('ERROR', 'Falha ao carregar.');
  ['listEvents', 'listMinistries', 'listNews', 'listVideos', 'listCourses', 'listLessons', 'listDynamics', 'birthdays', 'searchCells', 'listTestimonies', 'listCultoNotes', 'listProducts', 'listFamilia', 'listNotifications', 'listCampanhas', 'getFeedFontes'].forEach(function (a) { run(a, a, {}); });
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
  login: { fn: login_ }, pwdForgot: { fn: pwdForgot_ }, pwdReset: { fn: pwdReset_ }, pwdHelp: { fn: pwdHelp_ }, pwdHelpReset: { auth: 'any', write: 1, fn: pwdHelpReset_ }, getEmailSenha: { auth: 'config', fn: getEmailSenha_ }, saveEmailSenha: { auth: 'config', write: 1, fn: saveEmailSenha_ }, testEmailSenha: { auth: 'config', fn: testEmailSenha_ },
  logout: { auth: 'any', fn: function (d, u) { bumpVer_(u.email); return { ok: true }; } },
  me: { auth: 'any', fn: me_ }, verComoLista: { auth: 'any', fn: verComoLista_ }, changePassword: { auth: 'any', write: 1, fn: changePassword_ },
  saveMember: { auth: 'any', write: 1, fn: saveMember_ }, acceptLegal: { auth: 'any', write: 1, fn: acceptLegal_ }, birthdays: { auth: 'any', fn: birthdays_ },
  rescheduleEvent: { auth: 'eventos', write: 1, fn: rescheduleEvent_ }, saveEventoFotos: { auth: 'any', write: 1, fn: saveEventoFotos_ }, listEventoFotos: { auth: 'any', fn: listEventoFotos_ }, delEventoFoto: { auth: 'any', write: 1, fn: delEventoFoto_ }, getFeedFontes: { auth: 'any', fn: getFeedFontes_ }, saveFeedFontes: { auth: 'config', write: 1, fn: saveFeedFontes_ },
  listEvents: { auth: 'any', fn: listEvents_ }, enroll: { auth: 'any', write: 1, fn: enroll_ }, listNews: { auth: 'any', fn: listNews_ },
  listMinistries: { auth: 'any', fn: listMin_ }, minResp: { auth: 'any', fn: minResp }, saveMinResp: { auth: 'min', write: 1, fn: saveMinResp_ }, saveMinAutonomia: { auth: 'any', write: 1, fn: saveMinAutonomia_ }, interest: { auth: 'any', write: 1, fn: interest_ },
  listCourses: { auth: 'any', fn: listCourses_ }, enrollCourse: { auth: 'any', write: 1, fn: enrollCourse_ }, saveCourse: { auth: 'any', write: 1, fn: saveCourse_ }, courseDetail: { auth: 'any', fn: courseDetail_ }, saveAula: { auth: 'any', write: 1, fn: saveAula_ }, deleteAula: { auth: 'any', write: 1, fn: deleteAula_ }, getAulaPdf: { auth: 'any', fn: getAulaPdf_ },
  requestStart: { auth: 'any', write: 1, fn: requestStart_ }, getClassRoll: { auth: 'any', fn: getClassRoll_ }, saveClassRoll: { auth: 'any', write: 1, fn: saveClassRoll_ }, finishCourse: { auth: 'any', write: 1, fn: finishCourse_ }, listCertificates: { auth: 'any', fn: listCertificates_ }, decideCert: { auth: 'any', write: 1, fn: decideCert_ }, certificate: { auth: 'any', fn: certificate_ },
  getSignature: { auth: 'any', fn: getSignature_ }, saveSignature: { auth: 'any', write: 1, fn: saveSignature_ }, rateAula: { auth: 'any', write: 1, fn: rateAula_ }, aulaFeedback: { auth: 'any', fn: aulaFeedback_ },
  listLessons: { auth: 'any', fn: function (d, u) { return ehLider_(u) ? listLessons_() : []; } }, listDynamics: { auth: 'any', fn: function (d, u) { return ehLider_(u) ? listDyn_() : []; } }, addDynamic: { auth: 'any', write: 1, fn: function (d, u) { if (!ehLider_(u)) throw new ApiError('FORBIDDEN', 'Só líderes de célula e acima criam dinâmicas.'); return addDyn_(d, u); } }, listVideos: { auth: 'any', fn: listVideos_ }, listProducts: { auth: 'any', fn: listProducts_ }, listFamilia: { auth: 'any', fn: listFamilia_ }, profileView: { auth: 'any', fn: profileView_ }, listFeed: { auth: 'any', fn: listFeed_ }, likePost: { auth: 'any', write: 1, fn: likePost_ }, commentPost: { auth: 'any', write: 1, fn: commentPost_ }, listComments: { auth: 'any', fn: listComments_ }, deletePost: { auth: 'any', write: 1, fn: deletePost_ }, deleteComment: { auth: 'any', write: 1, fn: deleteComment_ },
  registerDecision: { auth: 'any', write: 1, fn: registerDecision_ }, purgePessoa: { auth: 'config', write: 1, fn: purgePessoa_ }, saveLayoutVers: { auth: 'any', write: 1, fn: saveLayoutVers_ }, getLiveCfg: { auth: 'any', fn: getLiveCfg_ }, saveLiveCfg: { auth: 'config', write: 1, fn: saveLiveCfg_ }, liveStart: { auth: 'any', write: 1, fn: liveStart_ }, liveStop: { auth: 'any', write: 1, fn: liveStop_ }, getLive: { auth: 'any', fn: getLive_ }, liveSend: { auth: 'any', write: 1, fn: liveSend_ }, liveComments: { auth: 'any', fn: liveComments_ }, nearCell: { auth: 'any', fn: nearCell_ }, saveVisitor: { auth: 'any', write: 1, fn: saveVisitor_ }, listVisitors: { auth: 'any', fn: listVisitors_ }, contactVisitor: { auth: 'any', write: 1, fn: contactVisitor_ },
  listScales: { auth: 'any', fn: listScales_ }, claimScale: { auth: 'any', write: 1, fn: claimScale_ }, saveScale: { auth: 'any', write: 1, fn: saveScale_ }, rescheduleScale: { auth: 'any', write: 1, fn: rescheduleScale_ }, deleteScale: { auth: 'any', write: 1, fn: deleteScale_ }, respondScale: { auth: 'any', write: 1, fn: respondScale_ }, requestSwap: { auth: 'any', write: 1, fn: requestSwap_ }, answerSwap: { auth: 'any', write: 1, fn: answerSwap_ }, markScale: { auth: 'any', write: 1, fn: markScale_ }, requestJoin: { auth: 'any', write: 1, fn: requestJoin_ }, decideJoin: { auth: 'any', write: 1, fn: decideJoin_ },
  listSongs: { auth: 'any', fn: listSongs_ }, saveSong: { auth: 'any', write: 1, fn: saveSong_ }, deleteSong: { auth: 'any', write: 1, fn: deleteSong_ }, saveSongDefault: { auth: 'any', write: 1, fn: saveSongDefault_ }, searchLyrics: { auth: 'any', fn: searchLyrics_ }, importLyrics: { auth: 'any', fn: importLyrics_ },
  boot: { auth: 'any', fn: boot_ },
  myQuizzes: { auth: 'any', fn: myQuizzes_ }, getQuiz: { auth: 'any', fn: getQuiz_ }, answerQuiz: { auth: 'any', write: 1, fn: answerQuiz_ }, quizLider: { auth: 'any', fn: quizLider_ }, quizCelula: { auth: 'any', fn: quizCelula_ }, quizPrepara: { auth: 'any', write: 1, fn: quizPrepara_ }, quizAcao: { auth: 'any', write: 1, fn: quizAcao_ }, getQuizCfg: { auth: 'config', fn: getQuizCfg_ }, capacidade: { auth: 'config', fn: capacidade_ }, testQuizIa: { auth: 'config', fn: testQuizIa_ },
  getEntrega: { auth: 'config', fn: getEntrega_ }, saveEntrega: { auth: 'config', write: 1, fn: saveEntrega_ },
  getPushKey: { auth: 'any', fn: getPushKey_ }, pushDiag: { auth: 'any', fn: pushDiag_ }, savePushSub: { auth: 'any', write: 1, fn: savePushSub_ }, delPushSub: { auth: 'any', write: 1, fn: delPushSub_ },
  sodGet: { auth: 'any', write: 1, fn: sodGet_ }, sodAbrir: { auth: 'any', write: 1, fn: sodAbrir_ }, sodEquipar: { auth: 'any', write: 1, fn: sodEquipar_ }, sodDescartar: { auth: 'any', write: 1, fn: sodDescartar_ }, sodAparencia: { auth: 'any', write: 1, fn: sodAparencia_ }, sodOrar: { auth: 'any', write: 1, fn: sodOrar_ }, sodComprar: { auth: 'any', write: 1, fn: sodComprar_ },
  listMarks: { auth: 'any', fn: listMarks_ }, saveMark: { auth: 'any', write: 1, fn: saveMark_ }, saveNote: { auth: 'any', write: 1, fn: saveNote_ }, listCultoNotes: { auth: 'any', fn: listCultoNotes_ }, getMural: { auth: 'any', fn: getMural_ },
  listInsigniaDefs: { auth: 'any', fn: listInsigniaDefs_ }, deleteInsigniaDef: { auth: 'any', write: 1, fn: deleteInsigniaDef_ }, saveSodXp: { auth: 'config', write: 1, fn: saveSodXp_ }, bookProgress: { auth: 'any', write: 1, fn: bookProgress_ }, videoWatched: { auth: 'any', write: 1, fn: videoWatched_ }, profileSeen: { auth: 'any', write: 1, fn: profileSeen_ }, praiseProfile: { auth: 'any', write: 1, fn: praiseProfile_ }, saveInsigniaDef: { auth: 'any', write: 1, fn: saveInsigniaDef_ }, grantBadge: { auth: 'any', write: 1, fn: grantBadge_ }, logServico: { auth: 'any', write: 1, fn: logServico_ }, listServicos: { auth: 'any', fn: listServicos_ }, searchPeople: { auth: 'any', fn: findPeople_ }, listPeople: { auth: 'any', fn: listPeople_ }, sendChat: { auth: 'any', write: 1, fn: sendChat_ }, getChat: { auth: 'any', fn: getChat_ }, chatRead: { auth: 'any', write: 1, fn: chatRead_ }, chatTyping: { auth: 'any', fn: chatTyping_ }, listChats: { auth: 'any', fn: listChats_ }, getCertLayout: { auth: 'any', fn: getCertLayout_ }, saveCertLayout: { auth: 'any', write: 1, fn: saveCertLayout_ }, previewCert: { auth: 'any', fn: previewCert_ }, revokeCert: { auth: 'any', write: 1, fn: revokeCert_ }, getCorrida: { auth: 'any', fn: getCorrida_ }, corridaLer: { auth: 'any', write: 1, fn: corridaLer_ }, listCorridaValidar: { auth: 'any', fn: listCorridaValidar_ }, decideLeitura: { auth: 'any', write: 1, fn: decideLeitura_ }, checkinEvento: { auth: 'eventos', write: 1, fn: checkinEvento_ }, saveFaces: { auth: 'eventos', write: 1, fn: saveFaces_ }, faceRoster: { auth: 'eventos', fn: faceRoster_ }, setFaceAuth: { auth: 'eventos', write: 1, fn: setFaceAuth_ }, listFaces: { auth: 'eventos', fn: listFaces_ }, clearFaces: { auth: 'eventos', write: 1, fn: clearFaces_ }, eventoPresenca: { auth: 'eventos', fn: eventoPresenca_ }, learnFace: { auth: 'eventos', write: 1, fn: learnFace_ }, clearSamples: { auth: 'eventos', write: 1, fn: clearSamples_ }, listFichas: { auth: 'any', fn: listFichas_ }, getFicha: { auth: 'any', fn: getFicha_ }, routeVisitor: { auth: 'any', write: 1, fn: routeVisitor_ }, getMapa: { auth: 'any', fn: getMapa_ }, getCellCard: { auth: 'any', fn: getCellCard_ }, getVoteInfo: { auth: 'any', fn: getVoteInfo_ }, listCampanhas: { auth: 'any', fn: listCampanhas_ }, adminCampanhas: { auth: 'eventos', fn: adminCampanhas_ }, saveCampanha: { auth: 'eventos', write: 1, fn: saveCampanha_ }, setCampanhaEstado: { auth: 'eventos', write: 1, fn: setCampanhaEstado_ }, deleteCampanha: { auth: 'eventos', write: 1, fn: deleteCampanha_ }, getCellMural: { auth: 'any', fn: getCellMural_ }, saveMuralItem: { auth: 'any', write: 1, fn: saveMuralItem_ }, delMuralItem: { auth: 'any', write: 1, fn: delMuralItem_ }, voteGod: { auth: 'any', write: 1, fn: voteGod_ }, getMemberCard: { auth: 'any', fn: getMemberCard_ }, suggestKin: { auth: 'any', fn: suggestKin_ }, listKin: { auth: 'any', fn: listKin_ }, saveKin: { auth: 'any', write: 1, fn: saveKin_ }, delKin: { auth: 'any', write: 1, fn: delKin_ }, getArvore: { auth: 'any', fn: getArvore_ }, saveGalho: { auth: 'any', write: 1, fn: saveGalho_ }, delGalho: { auth: 'any', write: 1, fn: delGalho_ }, setKinInfo: { auth: 'any', write: 1, fn: setKinInfo_ }, addKinPerson: { auth: 'any', write: 1, fn: addKinPerson_ }, listArtes: { auth: 'any', fn: listArtes_ }, getArte: { auth: 'any', fn: getArte_ }, saveArte: { auth: 'any', write: 1, fn: saveArte_ }, decideArte: { auth: 'any', write: 1, fn: decideArte_ }, deleteArte: { auth: 'any', write: 1, fn: deleteArte_ }, saveArteAprovadores: { auth: 'any', write: 1, fn: saveArteAprovadores_ }, saveMySod: { auth: 'any', write: 1, fn: saveMySod_ }, saveSupCor: { auth: 'any', write: 1, fn: saveSupCor_ }, saveMyGeo: { auth: 'any', write: 1, fn: saveMyGeo_ }, saveMapaCfg: { auth: 'config', write: 1, fn: saveMapaCfg_ }, listGeoPendentes: { auth: 'any', fn: listGeoPendentes_ }, saveGeoLote: { auth: 'any', write: 1, fn: saveGeoLote_ }, celFotos: { auth: 'any', fn: celFotos_ }, acceptVisitor: { auth: 'any', write: 1, fn: acceptVisitor_ }, saveFichaEntrada: { auth: 'any', write: 1, fn: saveFichaEntrada_ }, faceMe: { auth: 'any', fn: faceMe_ }, faceScan: { auth: 'any', write: 1, fn: faceScan_ }, faceRevoke: { auth: 'any', write: 1, fn: faceRevoke_ }, faceStat: { auth: 'eventos', write: 1, fn: faceStat_ }, faceStats: { auth: 'eventos', fn: faceStats_ }, cultoPresenca: { auth: 'eventos', fn: cultoPresenca_ }, checkinCulto: { auth: 'eventos', write: 1, fn: checkinCulto_ }, cultosResumo: { auth: 'eventos', fn: cultosResumo_ }, saveProfile: { auth: 'any', write: 1, fn: saveProfile_ }, saveHighlight: { auth: 'any', write: 1, fn: saveHighlight_ }, deleteHighlight: { auth: 'any', write: 1, fn: deleteHighlight_ }, greet: { auth: 'any', write: 1, fn: greet_ }, saveProduct: { auth: 'config', write: 1, fn: saveProduct_ }, setPromo: { auth: 'config', write: 1, fn: setPromo_ }, deleteProduct: { auth: 'config', write: 1, fn: deleteProduct_ },
  searchCells: { auth: 'any', fn: searchCells_ }, addPrayer: { auth: 'any', write: 1, fn: addPrayer_ }, listPrayers: { auth: 'any', fn: listPrayers_ },
  cellMembers: { auth: 'any', fn: cellMembers_ }, saveCell: { auth: 'any', write: 1, fn: saveCell_ }, saveAttendance: { auth: 'any', write: 1, fn: saveAttendance_ }, history: { auth: 'any', fn: history_ },
  indicators: { auth: 'any', fn: indicators_ }, getPapeis: { auth: 'any', fn: getPapeis_ }, savePapeis: { auth: 'any', write: 1, fn: savePapeis_ }, papeisLog: { auth: 'any', fn: papeisLog_ }, createCellEvent: { auth: 'any', write: 1, fn: createCellEvent_ },
  lookup: { auth: 'any', fn: lookup_ }, requestTransfer: { auth: 'any', write: 1, fn: requestTransfer_ }, requestExit: { auth: 'any', write: 1, fn: requestExit_ }, decideExit: { auth: 'any', write: 1, fn: decideExit_ }, addNewMember: { auth: 'any', write: 1, fn: addNewMember_ }, orgTree: { auth: 'any', fn: orgTree_ },
  listTransfers: { auth: 'any', fn: listTransfers_ }, decideTransfer: { auth: 'any', write: 1, fn: decideTransfer_ },
  createEvent: { auth: 'eventos', write: 1, fn: createEvent_ }, postNews: { auth: 'eventos', write: 1, fn: postNews_ },
  listApprovals: { auth: 'any', cond: 300000, fn: listApprovals_ }, guideDone: { auth: 'any', write: 1, fn: guideDone_ }, listNotifications: { auth: 'any', cond: 60000, fn: listNotifications_ }, clearNotifications: { auth: 'any', write: 1, fn: clearNotifications_ }, readNotifications: { auth: 'any', write: 1, fn: readNotifications_ }, decideApproval: { auth: 'any', fn: decideApproval_ }, undoApproval: { auth: 'any', fn: undoApproval_ }, track: { auth: 'any', fn: track_ }, usageReport: { auth: 'config', fn: usageReport_ }, metricsReport: { auth: 'any', fn: metricsReport_ }, getMetrics: { auth: 'config', fn: getMetrics_ }, ping: { auth: 'any', fn: ping_ },
  orgMove: { auth: 'any', write: 1, fn: orgMove_ }, saveOrgLayout: { auth: 'any', write: 1, fn: saveOrgLayout_ }, rateBook: { auth: 'any', write: 1, fn: rateBook_ }, fotos: { auth: 'any', fn: fotos_ },
  listBooks: { auth: 'any', fn: listBooks_ }, saveBook: { auth: 'any', write: 1, fn: saveBook_ }, deleteBook: { auth: 'any', write: 1, fn: deleteBook_ }, getBookFile: { auth: 'any', fn: getBookFile_ },
  listBookComments: { auth: 'any', fn: listBookComments_ }, addBookComment: { auth: 'any', write: 1, fn: addBookComment_ }, deleteBookComment: { auth: 'any', write: 1, fn: deleteBookComment_ },
  listTestimonies: { auth: 'any', fn: listTestimonies_ }, addTestimony: { auth: 'any', write: 1, fn: addTestimony_ }, deleteTestimony: { auth: 'any', write: 1, fn: deleteTestimony_ }, toggleLike: { auth: 'any', write: 1, fn: toggleLike_ },
  saveMinistry: { auth: 'min', write: 1, fn: saveMinistry_ }, deleteMinistry: { auth: 'min', write: 1, fn: deleteMinistry_ }, listInterests: { auth: 'min', fn: listInterests_ },
  saveConfig: { auth: 'config', write: 1, fn: saveConfig_ }, fotosDriveStatus: { auth: 'config', fn: fotosDriveStatus_ }, fotosDriveSet: { auth: 'config', write: 1, fn: fotosDriveSet_ }, fotosDriveMigra: { auth: 'config', write: 1, fn: fotosDriveMigra_ }, saveHomeLayout: { auth: 'config', write: 1, fn: saveHomeLayout_ }, saveNavConfig: { auth: 'config', write: 1, fn: saveNavConfig_ }, saveMural: { auth: 'config', write: 1, fn: saveMural_ }, getTelao: { auth: 'any', cond: 60000, fn: getTelao_ }, setTelao: { auth: 'any', write: 1, fn: setTelao_ }, saveTelaoPausa: { auth: 'any', write: 1, fn: saveTelaoPausa_ }, listMidias: { auth: 'any', fn: listMidias_ }, getMidia: { auth: 'any', fn: getMidia_ }, saveMidia: { auth: 'any', write: 1, fn: saveMidia_ }, deleteMidia: { auth: 'any', write: 1, fn: deleteMidia_ }, listAgendas: { auth: 'any', fn: listAgendas_ }, saveAgenda: { auth: 'any', write: 1, fn: saveAgenda_ }, deleteAgenda: { auth: 'any', write: 1, fn: deleteAgenda_ }, addAgendaItem: { auth: 'any', write: 1, fn: addAgendaItem_ }, getAccessRules: { auth: 'config', fn: accessRules_ }, saveAccessRules: { auth: 'config', write: 1, fn: saveAccessRules_ }, saveVideo: { auth: 'config', write: 1, fn: saveVideo_ }, deleteVideo: { auth: 'config', write: 1, fn: deleteVideo_ }, updateVideo: { auth: 'config', write: 1, fn: updateVideo_ },
  listUsers: { auth: 'config', fn: listUsers_ }, createUser: { auth: 'config', write: 1, fn: createUser_ }, setUser: { auth: 'config', write: 1, fn: setUser_ }, viewPasswords: { auth: 'config', fn: viewPasswords_ }, savePerms: { auth: 'config', write: 1, fn: savePerms_ },
  saveLesson: { auth: 'config', write: 1, fn: saveLesson_ }, getPerms: { auth: 'config', fn: function () { return permMatrix_(); } },
  createCell: { auth: 'celulas', write: 1, fn: createCell_ }, celPainel: { auth: 'celulas', fn: celPainel_ }, multiplyCell: { auth: 'celulas', write: 1, fn: multiplyCell_ }, setSuperior: { auth: 'celulas', write: 1, fn: setSuperior_ },
  adminList: { auth: 'any', fn: adminList_ }, adminSave: { auth: 'any', write: 1, fn: adminSave_ }, adminRemove: { auth: 'any', write: 1, fn: adminRemove_ }
};
function doGet() { return json_({ ok: true, data: { servico: 'Zoe API', status: 'online' } }); }
function doPost(e) {
  let out, user = null, route = null, action = ''; const t0_ = Date.now(); LOCKMS_ = 0; WAITMS_ = 0; DEPREC_ = null;
  try {
    const raw = e && e.postData && e.postData.contents; if (!raw || raw.length > 16000000) throw new ApiError('BAD_REQUEST', 'Requisição inválida.');
    const req = JSON.parse(raw); action = String(req.action || '');
    if (raw.length > 1500000 && action !== 'saveBook') throw new ApiError('BAD_REQUEST', 'Requisição grande demais.'); route = Object.prototype.hasOwnProperty.call(ROUTES, action) ? ROUTES[action] : null; if (!route) throw new ApiError('NOT_FOUND', 'Ação desconhecida.');
    // as abas lidas na identificação do usuário já servem para a rota (antes eram lidas duas vezes)
    TMEMO_ = /^(list|get|search|boot|me$|birthdays|orgTree|cellMembers|history|indicators|profileView|lookup|track|usageReport|fotos|certData|courseDetail|aulaFeedback)/.test(action) ? {} : null;
    if (route.auth) { user = auth_(req.token); if (req.as && user.papel === 'admin' && action !== 'verComoLista') user = verComo_(user, action, route, String(req.as).slice(0, 40)); if (route.auth !== 'any' && !can_(user, route.auth)) { audit_(user.email, 'NEGADO:' + action, '', 'NEGADO'); throw new ApiError('FORBIDDEN', 'Você não tem permissão para esta operação.'); } }
    /* Rota "sem mudança": se a versão que o aparelho já tem (req.ver) for a mesma de agora, nem executa a rota; responde só "sem mudança" (nunca revela dados).
       A versão junta as marcas das abas que a rota leu da última vez, quem está pedindo, o dia e uma janela de tempo (segurança contra edição manual na planilha). */
    const cond = route.cond ? Number(route.cond) || 300000 : 0; let ver = '', dep = null, pronto = false; const cc = CacheService.getScriptCache();
    if (cond && user) {
      try { dep = JSON.parse(cc.get('dp:' + action) || 'null'); } catch (e2) { dep = null; }
      if (dep && dep.length) {
        ver = tvStamp_(dep.concat(['Usuarios', 'Membros', 'Celulas', 'Config'])) + '|' + user.membroId + '|' + today_() + '|' + Math.floor(Date.now() / cond);
        if (req.ver && String(req.ver) === ver) { out = { ok: true, sem: true, ver: ver }; pronto = true; }
      }
    }
    if (!pronto) {
      if (cond) DEPREC_ = {};
      const data = route.fn(req.data || {}, user); out = { ok: true, data: data };
      if (cond) {
        const lidas = Object.keys(DEPREC_ || {}); DEPREC_ = null; const ant = dep || [], novas = lidas.filter(function (n) { return ant.indexOf(n) < 0; });
        if (novas.length || !dep) { try { cc.put('dp:' + action, JSON.stringify(ant.concat(novas)), 21600); } catch (e3) { /* ok */ } ver = ''; } // aprendeu abas novas: a versão desta resposta não cobre tudo, vale a da próxima
        if (ver) out.ver = ver;
      }
    }
  } catch (err) {
    DEPREC_ = null;
    if (err instanceof ApiError && err.code === 'VC_SOFT') out = { ok: true, data: {} };
    else if (err instanceof ApiError) out = { ok: false, error: { code: err.code, message: err.message } };
    else { console.error(err && err.stack || err); out = { ok: false, error: { code: 'ERROR', message: 'Erro inesperado. Tente novamente.' } }; }
  }
  TMEMO_ = null;
  try { tvFlush_(); } catch (err1) { console.error(err1 && err1.stack || err1); } // gravações fora de trava também trocam a marca da aba
  try { pushFlush_(); } catch (err2) { console.error(err2 && err2.stack || err2); }
  out.k = LOCKMS_; out.w = WAITMS_; out.s = Date.now() - t0_; // tempo gasto no servidor (ms), para o painel de desempenho
  return json_(out);
}


/* ===== Web Push direto do Apps Script (sem servidor externo): VAPID (ES256) + criptografia aes128gcm em JavaScript puro (aritmética própria de 256 bits) ===== */
// Aritmética de 256 bits com blocos de 16 bits e multiplicação de Montgomery
const BN_ = {
  L: 16,
  fromB: function (b) { const o = []; for (let i = 0; i < 16; i++) o.push(((b[31 - 2 * i] || 0) | ((b[30 - 2 * i] || 0) << 8))); return o; },
  toB: function (a) { const o = []; for (let i = 15; i >= 0; i--) { o.push((a[i] >> 8) & 255); o.push(a[i] & 255); } return o; },
  cmp: function (a, b) { for (let i = 15; i >= 0; i--) { if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1; } return 0; },
  zero: function (a) { for (let i = 0; i < 16; i++) if (a[i]) return false; return true; },
  addR: function (a, b) { const o = new Array(16); let c = 0; for (let i = 0; i < 16; i++) { const v = a[i] + b[i] + c; o[i] = v & 65535; c = v >> 16; } return { r: o, c: c }; },
  subR: function (a, b) { const o = new Array(16); let c = 0; for (let i = 0; i < 16; i++) { let v = a[i] - b[i] - c; if (v < 0) { v += 65536; c = 1; } else c = 0; o[i] = v; } return { r: o, c: c }; },
  bit: function (a, i) { return (a[i >> 4] >> (i & 15)) & 1; },
  campo: function (M) {
    const L = 16; let inv = 1; for (let k = 0; k < 5; k++) inv = (inv * ((2 - ((M[0] * inv) & 65535)) & 65535)) & 65535; const mi = (65536 - inv) & 65535;
    const add = function (a, b) { const s = BN_.addR(a, b); if (s.c || BN_.cmp(s.r, M) >= 0) return BN_.subR(s.r, M).r; return s.r; };
    const sub = function (a, b) { const s = BN_.subR(a, b); return s.c ? BN_.addR(s.r, M).r : s.r; };
    const mul = function (a, b) {
      const t = new Array(L + 2); for (let i = 0; i < L + 2; i++) t[i] = 0;
      for (let i = 0; i < L; i++) {
        let c = 0; const ai = a[i];
        for (let j = 0; j < L; j++) { const v = t[j] + ai * b[j] + c; t[j] = v & 65535; c = (v / 65536) | 0; }
        let v = t[L] + c; t[L] = v & 65535; t[L + 1] = (v / 65536) | 0;
        const m = (t[0] * mi) & 65535; v = t[0] + m * M[0]; c = (v / 65536) | 0;
        for (let j = 1; j < L; j++) { v = t[j] + m * M[j] + c; t[j - 1] = v & 65535; c = (v / 65536) | 0; }
        v = t[L] + c; t[L - 1] = v & 65535; c = (v / 65536) | 0; t[L] = t[L + 1] + c; t[L + 1] = 0;
      }
      const r = t.slice(0, L); if (t[L] || BN_.cmp(r, M) >= 0) return BN_.subR(r, M).r; return r;
    };
    let x = [1]; for (let i = 1; i < L; i++) x.push(0); for (let i = 0; i < 512; i++) x = add(x, x); const R2 = x;
    const um = [1]; for (let i = 1; i < L; i++) um.push(0);
    const f = { M: M, add: add, sub: sub, mul: mul, toM: function (a) { return mul(a, R2); }, fromM: function (a) { return mul(a, um); }, one: mul(R2, um) };
    f.pow = function (a, e) { let r = f.one; for (let i = 255; i >= 0; i--) { r = mul(r, r); if (BN_.bit(e, i)) r = mul(r, a); } return r; };
    const dois = [2]; for (let i = 1; i < L; i++) dois.push(0); const em2 = BN_.subR(M, dois).r;
    f.inv = function (a) { return f.pow(a, em2); };
    return f;
  }
};
const P256_ = (function () {
  const hx = function (s) { const o = []; for (let i = 0; i < s.length; i += 2) o.push(parseInt(s.substr(i, 2), 16)); return BN_.fromB(o); };
  const p = hx('ffffffff00000001000000000000000000000000ffffffffffffffffffffffff'), n = hx('ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  const b = hx('5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b'), gx = hx('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'), gy = hx('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');
  const F = BN_.campo(p), N = BN_.campo(n), add = F.add, sub = F.sub, mul = F.mul;
  const x2 = function (a) { return add(a, a); }, x4 = function (a) { return x2(x2(a)); }, x8 = function (a) { return x2(x4(a)); };
  const INF = function () { return [F.one, F.one, F.toM([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])]; };
  function dbl(P) { const X = P[0], Y = P[1], Z = P[2]; if (BN_.zero(Z) || BN_.zero(Y)) return INF(); const d = mul(Z, Z), g = mul(Y, Y), be = mul(X, g), t = mul(sub(X, d), add(X, d)), al = add(x2(t), t), X3 = sub(mul(al, al), x8(be)), yz = add(Y, Z), Z3 = sub(sub(mul(yz, yz), g), d), Y3 = sub(mul(al, sub(x4(be), X3)), x8(mul(g, g))); return [X3, Y3, Z3]; }
  function adc(P, Q) { if (BN_.zero(P[2])) return Q; if (BN_.zero(Q[2])) return P; const z1 = mul(P[2], P[2]), z2 = mul(Q[2], Q[2]), u1 = mul(P[0], z2), u2 = mul(Q[0], z1), s1 = mul(mul(P[1], Q[2]), z2), s2 = mul(mul(Q[1], P[2]), z1);
    if (BN_.cmp(u1, u2) === 0) return BN_.cmp(s1, s2) === 0 ? dbl(P) : INF(); const h = sub(u2, u1), r = sub(s2, s1), h2 = mul(h, h), h3 = mul(h2, h), v = mul(u1, h2), X3 = sub(sub(mul(r, r), h3), x2(v)); return [X3, sub(mul(r, sub(v, X3)), mul(s1, h3)), mul(mul(P[2], Q[2]), h)]; }
  function mulP(k, P) { let R = INF(), ini = false; for (let i = 255; i >= 0; i--) { if (ini) R = dbl(R); if (BN_.bit(k, i)) { R = ini ? adc(R, P) : P; ini = true; } } return R; }
  function aff(P) { if (BN_.zero(P[2])) throw new Error('infinito'); const zi = F.inv(P[2]), z2 = mul(zi, zi); return [F.fromM(mul(P[0], z2)), F.fromM(mul(mul(P[1], z2), zi))]; }
  const G = [F.toM(gx), F.toM(gy), F.one];
  const redN = function (a) { return BN_.cmp(a, n) >= 0 ? BN_.subR(a, n).r : a; };
  return { n: n, G: G, mulP: mulP, aff: aff, F: F, N: N, redN: redN,
    noCurva: function (x, y) { const xm = F.toM(x), ym = F.toM(y), x3 = mul(mul(xm, xm), xm), r = add(sub(x3, add(add(xm, xm), xm)), F.toM(b)); return BN_.cmp(mul(ym, ym), r) !== 0; } };
})();
const WP_ = {
  sg: function (a) { return a.map(function (x) { return x > 127 ? x - 256 : x; }); },
  us: function (a) { return Array.prototype.map.call(a, function (x) { return x < 0 ? x + 256 : x; }); },
  str: function (s) { return WP_.us(Utilities.newBlob(s).getBytes()); },
  hex: function (a) { let o = ''; for (let i = 0; i < a.length; i++) o += (a[i] < 16 ? '0' : '') + a[i].toString(16); return o; },
  unhex: function (s) { const o = []; for (let i = 0; i < s.length; i += 2) o.push(parseInt(s.substr(i, 2), 16)); return o; },
  b64u: function (a) { const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; let o = ''; for (let i = 0; i < a.length; i += 3) { const v = (a[i] << 16) | ((a[i + 1] || 0) << 8) | (a[i + 2] || 0); o += T[v >> 18 & 63] + T[v >> 12 & 63] + (i + 1 < a.length ? T[v >> 6 & 63] : '') + (i + 2 < a.length ? T[v & 63] : ''); } return o; },
  unb64u: function (s) { const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; const o = []; let acc = 0, bits = 0; for (let i = 0; i < s.length; i++) { const v = T.indexOf(s[i]); if (v < 0) continue; acc = (acc << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; o.push((acc >> bits) & 255); acc &= (1 << bits) - 1; } } return o; },
  hmac: function (key, data) { return WP_.us(Utilities.computeHmacSha256Signature(WP_.sg(data), WP_.sg(key))); },
  sha: function (data) { return WP_.us(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, WP_.sg(data))); },
  hkdf: function (salt, ikm, info, len) { const prk = WP_.hmac(salt, ikm); let t = [], o = [], i = 1; while (o.length < len) { t = WP_.hmac(prk, t.concat(info, [i++])); o = o.concat(t); } return o.slice(0, len); },
  rand: function (len) { let o = []; while (o.length < len) o = o.concat(WP_.hmac(WP_.str(Utilities.getUuid() + Utilities.getUuid()), WP_.str(String(Date.now()) + Math.random() + Utilities.getUuid()))); return o.slice(0, len); },
  // chave privada = 32 bytes entre 1 e n-1
  chavePriv: function () { for (;;) { const k = WP_.rand(32), l = BN_.fromB(k); if (!BN_.zero(l) && BN_.cmp(l, P256_.n) < 0) return k; } },
  pub: function (d) { const A = P256_.aff(P256_.mulP(BN_.fromB(d), P256_.G)); return [4].concat(BN_.toB(A[0]), BN_.toB(A[1])); },
  ecdh: function (d, pubB) { const x = BN_.fromB(pubB.slice(1, 33)), y = BN_.fromB(pubB.slice(33, 65)); if (pubB.length !== 65 || pubB[0] !== 4 || P256_.noCurva(x, y)) throw new Error('chave inválida'); const Q = [P256_.F.toM(x), P256_.F.toM(y), P256_.F.one]; return BN_.toB(P256_.aff(P256_.mulP(BN_.fromB(d), Q))[0]); },
  ecdsa: function (d, msg) {
    const N = P256_.N, h = WP_.sha(msg), z = P256_.redN(BN_.fromB(h)), dl = BN_.fromB(d);
    for (let c = 0; c < 20; c++) {
      const k = P256_.redN(BN_.fromB(WP_.hmac(d, h.concat([c])))); if (BN_.zero(k)) continue;
      const r = P256_.redN(P256_.aff(P256_.mulP(k, P256_.G))[0]); if (BN_.zero(r)) continue;
      const rd = N.mul(N.toM(r), N.toM(dl)), zr = N.add(N.toM(z), rd), s = N.fromM(N.mul(N.inv(N.toM(k)), zr)); if (BN_.zero(s)) continue;
      return BN_.toB(r).concat(BN_.toB(s));
    } throw new Error('assinatura'); },
  jwt: function (aud, d, sub) { const h = WP_.b64u(WP_.str(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))), pl = WP_.b64u(WP_.str(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sub }))); return h + '.' + pl + '.' + WP_.b64u(WP_.ecdsa(d, WP_.str(h + '.' + pl))); },
  // AES-128-GCM
  SB: null,
  sbox: function () { if (WP_.SB) return WP_.SB; const s = new Array(256), xt = function (a) { return ((a << 1) ^ ((a & 128) ? 27 : 0)) & 255; }; let p = 1, q = 1; do { p = p ^ xt(p); q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255; if (q & 128) q ^= 9; const x = q ^ ((q << 1) | (q >> 7)) & 255 ^ ((q << 2) | (q >> 6)) & 255 ^ ((q << 3) | (q >> 5)) & 255 ^ ((q << 4) | (q >> 4)) & 255; s[p] = (x ^ 99) & 255; } while (p !== 1); s[0] = 99; WP_.SB = s; return s; },
  aesKey: function (key) { const S = WP_.sbox(), w = []; for (let i = 0; i < 4; i++) w.push(key.slice(4 * i, 4 * i + 4)); let rc = 1; for (let i = 4; i < 44; i++) { let t = w[i - 1].slice(); if (i % 4 === 0) { t = [S[t[1]] ^ rc, S[t[2]], S[t[3]], S[t[0]]]; rc = ((rc << 1) ^ ((rc & 128) ? 27 : 0)) & 255; } w.push([w[i - 4][0] ^ t[0], w[i - 4][1] ^ t[1], w[i - 4][2] ^ t[2], w[i - 4][3] ^ t[3]]); } const rk = []; for (let r = 0; r < 11; r++) rk.push([].concat(w[4 * r], w[4 * r + 1], w[4 * r + 2], w[4 * r + 3])); return rk; },
  aesBlock: function (rk, blk) { const S = WP_.sbox(), xt = function (a) { return ((a << 1) ^ ((a & 128) ? 27 : 0)) & 255; }; let s = blk.map(function (v, i) { return v ^ rk[0][i]; }); for (let r = 1; r <= 10; r++) { const t = new Array(16); for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) t[4 * c + rr] = S[s[4 * ((c + rr) % 4) + rr]]; if (r < 10) { for (let c = 0; c < 4; c++) { const a = t.slice(4 * c, 4 * c + 4), x = a[0] ^ a[1] ^ a[2] ^ a[3]; s[4 * c] = a[0] ^ x ^ xt(a[0] ^ a[1]); s[4 * c + 1] = a[1] ^ x ^ xt(a[1] ^ a[2]); s[4 * c + 2] = a[2] ^ x ^ xt(a[2] ^ a[3]); s[4 * c + 3] = a[3] ^ x ^ xt(a[3] ^ a[0]); } } else s = t; s = s.map(function (v, i) { return v ^ rk[r][i]; }); } return s; },
  // multiplicação em GF(2^128) do GCM, com bytes
  gmul: function (x, y) { const z = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], v = y.slice(); for (let i = 0; i < 128; i++) { if ((x[i >> 3] >> (7 - (i & 7))) & 1) for (let j = 0; j < 16; j++) z[j] ^= v[j]; const lsb = v[15] & 1; for (let j = 15; j > 0; j--) v[j] = (v[j] >> 1) | ((v[j - 1] & 1) << 7); v[0] >>= 1; if (lsb) v[0] ^= 0xe1; } return z; },
  gcm: function (key, iv, pt) {
    const rk = WP_.aesKey(key), H = WP_.aesBlock(rk, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ct = [];
    for (let i = 0; i < pt.length; i += 16) { const c = 2 + i / 16, ks = WP_.aesBlock(rk, iv.concat([(c >> 24) & 255, (c >> 16) & 255, (c >> 8) & 255, c & 255])); for (let j = 0; j < 16 && i + j < pt.length; j++) ct.push(pt[i + j] ^ ks[j]); }
    let g = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < ct.length; i += 16) { const bl = ct.slice(i, i + 16); while (bl.length < 16) bl.push(0); g = WP_.gmul(g.map(function (v, j) { return v ^ bl[j]; }), H); }
    const bits = ct.length * 8, lb = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, (bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255];
    g = WP_.gmul(g.map(function (v, j) { return v ^ lb[j]; }), H);
    const ej = WP_.aesBlock(rk, iv.concat([0, 0, 0, 1])); return ct.concat(g.map(function (v, j) { return v ^ ej[j]; })); },
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
  if (hex && /^[0-9a-f]{64}$/.test(hex) && c.PushPub) return { d: WP_.unhex(hex), pub: c.PushPub };
  return withLock_(function () {
    hex = pr.getProperty('VAPID_PRIV'); c = cfgMap_(); let d;
    if (hex && /^[0-9a-f]{64}$/.test(hex)) d = WP_.unhex(hex); else { d = WP_.chavePriv(); pr.setProperty('VAPID_PRIV', WP_.hex(d)); }
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
/* ===== "Ver como": o administrador enxerga o app como outra pessoa (somente leitura) para conferir o que cada tipo de usuário vê ===== */
const VC_SOFT_ = { track: 1, metricsReport: 1, chatTyping: 1, profileSeen: 1, bookProgress: 1, videoWatched: 1, corridaLer: 1, chatRead: 1, readNotifications: 1, guideDone: 1, ping: 1, savePushSub: 1, delPushSub: 1, logout: 1 };
const VC_NEG_ = { decideApproval: 1, undoApproval: 1, importLyrics: 1, testEmailSenha: 1, pushDiag: 1, testQuizIa: 1, viewPasswords: 1 };
function verComo_(real, action, route, membroId) {
  if (VC_SOFT_[action]) throw new ApiError('VC_SOFT', '');   // registros passivos (acesso, métricas) não contam para a pessoa vista
  if ((route.write && action !== 'sodGet') || VC_NEG_[action]) throw new ApiError('VERCOMO', 'Você está no modo "Ver como": só dá para olhar, não alterar. Saia do modo para fazer mudanças.');
  const u = table_('Usuarios').rows.filter(function (r) { return r.MembroID === membroId; })[0]; if (!u || u.Status === 'Inativo') throw new ApiError('VERCOMO', 'Essa pessoa não tem acesso ativo ao app.');
  const m = table_('Membros').rows.filter(function (r) { return r.MembroID === membroId; })[0] || {}, cg = cargos_(membroId);
  if (action === 'me') audit_(real.email, 'VERCOMO', membroId, 'OK');
  return { email: String(u.Email).toLowerCase(), papel: papelValido_(u.Papel) ? u.Papel : 'membro', membroId: membroId, celulaId: m.CelulaID || '', lidera: cg.lidera, treina: cg.treina, supervisiona: cg.supervisiona, token: real.token, vcReal: real.email };
}
function verComoLista_(d, u) {
  if (u.papel !== 'admin') throw new ApiError('FORBIDDEN', 'Só administradores podem usar o "Ver como".');
  const mem = {}; table_('Membros').rows.forEach(function (r) { mem[r.MembroID] = r; });
  const cels = {}; table_('Celulas').rows.forEach(function (c) { if (c.Status !== 'Inativa') cels[c.CelulaID] = c; });
  const tipos = {}; tiposOut_().forEach(function (t) { tipos[t.id] = t.nome; });
  const itens = table_('Usuarios').rows.filter(function (r) { return r.MembroID && r.Status !== 'Inativo' && mem[r.MembroID]; }).map(function (r) {
    const cg = cargos_(r.MembroID), m = mem[r.MembroID], papel = papelValido_(r.Papel) ? r.Papel : 'membro', cargos = [];
    if (cg.supervisiona.length) cargos.push('Supervisor'); if (cg.lidera.length) cargos.push('Líder'); if (cg.treina.length) cargos.push('Líder em treinamento');
    const cel = cels[m.CelulaID];
    return { id: r.MembroID, nome: String(m.Apelido || m.Simples || m.Nome || ''), papel: papel, tipo: tipos[papel] || papel, cargos: cargos, celula: cel ? cel.Nome : '' };
  }).filter(function (x) { return x.id !== u.membroId; });
  itens.sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
  return { itens: itens.slice(0, 800) };
}
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
        const cods = res.map(function (x) { return x.status; }), tem = function (f) { return cods.some(f); }, host = function (x) { try { return /apple/.test(x) ? 'iPhone/Safari' : /google|fcm/.test(x) ? 'Android/Chrome' : /mozilla/.test(x) ? 'Firefox' : /windows|notify\.windows/.test(x) ? 'Edge' : 'outro'; } catch (e) { return 'outro'; } };
        const aparelhos = meus.map(function (sb) { return host(String(sb.Endpoint)); }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ');
        let dica = '';
        if (ok) dica = 'O serviço de entrega aceitou. Se não aparecer em alguns segundos: ' + (/iPhone/.test(aparelhos) ? 'no iPhone o app precisa estar instalado na tela de início (Compartilhar › Adicionar à Tela de Início) e aberto por esse ícone, e o modo Foco/Não Perturbe pode esconder o aviso.' : 'confira se o celular não está em modo silencioso/economia de bateria e se as notificações do navegador estão liberadas nas configurações do aparelho.');
        else if (tem(function (c) { return c === 0; })) dica = 'O app não conseguiu falar com o Worker da Cloudflare: ' + res.map(function (x) { return x.erro; }).filter(String)[0] + '. Confira o endereço e o segredo em Definições de Parâmetros › Notificações pela Cloudflare.';
        else if (tem(function (c) { return c === 401 || c === 403 || c === 400; })) dica = 'O serviço de entrega recusou a assinatura (código ' + cods.filter(function (c) { return c >= 400; })[0] + '). Isso quase sempre é chave diferente entre o app e o Worker: rode exportaVapid no Apps Script e cole VAPID_PUBLICA e VAPID_PRIVADA de novo no Worker (tipo Secret), faça Deploy e depois desative e ative as notificações neste celular.';
        else if (tem(function (c) { return c === 404 || c === 410; })) dica = 'Este aparelho foi desinscrito pelo serviço de entrega. Desative e ative as notificações de novo neste celular.';
        else dica = 'O serviço de entrega recusou o envio. Desative e ative as notificações de novo neste celular.';
        out.teste = { enviados: res.length, ok: ok, status: st, aparelhos: aparelhos, msg: (ok ? 'Enviada para ' + (aparelhos || 'o aparelho') + '. ' : 'Não enviada (' + st.join('; ') + '). ') + dica }; pushMortos_(res);
      } catch (e) { out.teste = { enviados: 0, ok: 0, msg: 'Falha no envio: ' + String(e && e.message || e).slice(0, 120) }; }
    }
  }
  return out;
}
function pushEnvia_(envios) {
  const E = entregaProps_(), r = E.worker ? pushViaWorker_(envios, E) : pushEnviaDireto_(envios), ok = r.filter(function (x) { return x.status >= 200 && x.status < 300; }).length;
  usoAdd_({ DiretoCalls: E.worker ? 0 : envios.length, PushEnvios: r.length, PushOk: ok, PushFalha: r.length - ok }); return r;
}
function pushEnviaDireto_(envios) {
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
/* ===== Quiz da lição: perguntas geradas sozinhas a partir da lição ministrada e enviadas aos participantes da célula ===== */
const QUIZ_N_ = 5;
function quizAgenda_(celulaId, reuniaoId, data, licao) {
  let titulo = licao.titulo || '', texto = licao.resumo || '';
  if (licao.id) { const l = table_('Licoes').rows.filter(function (x) { return x.LicaoID === licao.id; })[0]; if (l) { texto = [l.Resumo, l.Conteudo].filter(String).join('\n'); titulo = l.Titulo; } }
  if ((titulo + texto).length < 10) return;
  lazy_('Quizzes'); ensureCols_('Quizzes', ['LicaoID']); const t = table_('Quizzes'), ex = t.rows.filter(function (q) { return q.ReuniaoID === reuniaoId; })[0], quando = today_();   // fica disponível logo depois que a presença é registrada
  const v = { Titulo: clip_(titulo || 'Lição da célula', 120), Texto: clip_(texto, 4000), LicaoID: licao.id || '' };
  if (ex) { if (ex.Status === 'agendado' || ex.Status === 'sem') writeRow_(t, ex._row, Object.assign(v, { Status: 'agendado', Perguntas: '', EnviarEm: quando })); return; }
  appendRow_(t, Object.assign({ QuizID: id_('QZ'), ReuniaoID: reuniaoId, CelulaID: celulaId, Data: data, Fonte: '', Perguntas: '', Status: 'agendado', EnviarEm: quando, CriadoEm: now_() }, v));
}
function quizSemente_(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 2147483647; return h || 1; }
function quizEmbaralha_(arr, seed) { const a = arr.slice(); let h = seed; for (let i = a.length - 1; i > 0; i--) { h = (h * 48271) % 2147483647; const j = h % (i + 1), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
const QUIZ_STOP_ = ' para como mais mas pelo pela pelos pelas com sem sobre entre quando onde porque assim ainda também então muito muita todos todas cada seus suas esse essa isso este esta isto aquele aquela depois antes durante contra desde mesmo mesma outro outra outros outras fazer disse disseram tinha tinham foram sendo estar estava você vocês nosso nossa nossos nossas deles delas deus senhor ';
function quizModelo_(titulo, texto, seed) {
  // plano B (sem inteligência artificial): perguntas de completar a frase com palavras do próprio texto e de tema da lição
  const out = [], frases = String(texto).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length >= 35 && x.length <= 220; });
  const pal = []; String(texto).toLowerCase().replace(/[^a-záàâãéêíóôõúç\s-]/g, ' ').split(/\s+/).forEach(function (w) { if (w.length >= 6 && QUIZ_STOP_.indexOf(' ' + w + ' ') < 0 && pal.indexOf(w) < 0) pal.push(w); });
  const outros = table_('Licoes').rows.filter(function (l) { return l.Status !== 'Removida' && l.Titulo && norm_(l.Titulo) !== norm_(titulo); }).map(function (l) { return l.Titulo; });
  if (titulo && outros.length >= 3) { const op = quizEmbaralha_([titulo].concat(quizEmbaralha_(outros, seed).slice(0, 3)), seed + 1); out.push({ p: 'Qual foi o tema da lição da célula?', op: op, c: op.indexOf(titulo), e: 'A lição foi: ' + titulo + '.' }); }
  quizEmbaralha_(frases, seed + 2).forEach(function (f) {
    if (out.length >= QUIZ_N_) return; const ws = f.toLowerCase().replace(/[^a-záàâãéêíóôõúç\s-]/g, ' ').split(/\s+/).filter(function (w) { return pal.indexOf(w) >= 0; }).sort(function (a, b) { return b.length - a.length; });
    const alvo = ws[0]; if (!alvo) return; const dis = quizEmbaralha_(pal.filter(function (w) { return w !== alvo; }), seed + out.length).slice(0, 3); if (dis.length < 3) return;
    const re = new RegExp('(^|[^a-záàâãéêíóôõúç])' + alvo + '(?![a-záàâãéêíóôõúç])', 'i'); if (!re.test(f)) return;
    const op = quizEmbaralha_([alvo].concat(dis), seed + out.length + 5); out.push({ p: 'Complete: ' + f.replace(re, function (m, a) { return a + '_____'; }), op: op, c: op.indexOf(alvo), e: f });
  });
  return out;
}
function quizIa_(titulo, texto) {
  const E = entregaProps_(); if (!E.worker) return null;
  const prompt = 'Você prepara um quiz curto para os participantes de uma célula (pequeno grupo) de uma igreja cristã evangélica, feito depois da reunião, para fixar a lição.\n\nLição: ' + titulo + '\n\nConteúdo da lição:\n' + texto + '\n\nCrie exatamente ' + QUIZ_N_ + ' perguntas de múltipla escolha em português do Brasil, em linguagem simples, sobre o que foi ensinado. Use só o que está no conteúdo (se ele for curto, pergunte sobre o tema e as ideias principais) e não invente doutrina. Cada pergunta tem 4 alternativas curtas, só 1 correta, e as erradas devem parecer plausíveis. Varie a posição da correta. Inclua uma explicação de uma frase. Nos textos nunca use aspas duplas nem quebras de linha (use aspas simples).\n\nResponda SOMENTE com um JSON, sem texto antes ou depois, neste formato:\n[{"p":"pergunta","op":["a","b","c","d"],"c":0,"e":"explicação"}]\nonde "c" é o índice (0 a 3) da alternativa correta.';
  let ultimo = 'sem resposta';
  for (let tent = 0; tent < 2; tent++) {   // a IA às vezes devolve um JSON torto: tenta de novo uma vez antes de desistir
    const r = UrlFetchApp.fetch(E.worker.url.replace(/\/+$/, '') + '/ia', { method: 'post', contentType: 'application/json', headers: { 'X-Segredo': E.worker.segredo }, payload: JSON.stringify({ prompt: prompt, max_tokens: 1800 }), muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) { usoAdd_({ IACalls: 1, IAErros: 1 }); throw new Error('o Worker respondeu ' + r.getResponseCode() + (r.getResponseCode() === 401 ? ' (segredo diferente)' : '')); }
    let j; try { j = JSON.parse(r.getContentText()); } catch (e) { usoAdd_({ IACalls: 1, IAErros: 1 }); throw new Error('resposta do Worker ilegível'); }
    if (!j.ok) { usoAdd_({ IACalls: 1, IAErros: 1 }); throw new Error(String(j.erro || 'sem resposta').slice(0, 80)); }
    usoAdd_({ IACalls: 1, IANeurons: neuronsIa_(j, prompt) });
    const ps = quizValida_(quizParse_(j.texto)); if (ps.length >= 2) return ps;
    ultimo = 'a IA respondeu em formato inválido';
  }
  throw new Error(ultimo);
}
// Lê o JSON da IA com tolerância: aspas curvas, vírgula sobrando, texto antes/depois e objetos com defeito (aproveita os que estiverem bons)
function quizParse_(txt) {
  let t = String(txt || ''); const i = t.indexOf('['), f = t.lastIndexOf(']'); t = i >= 0 ? t.slice(i, f > i ? f + 1 : t.length) : t;
  const arruma = function (x) { return x.replace(/[“”«»]/g, '\\"').replace(/[‘’]/g, "'").replace(/,\s*([\]}])/g, '$1').replace(/[\u0000-\u001f]+/g, ' '); };
  const tenta = function (x) { try { const v = JSON.parse(x); return Array.isArray(v) ? v : null; } catch (e) { return null; } };
  let v = tenta(t) || tenta(arruma(t)); if (v) return v;
  const out = []; (t.match(/\{[^{}]*\}/g) || []).forEach(function (o) { try { out.push(JSON.parse(arruma(o))); } catch (e) { /* objeto com defeito: ignora */ } });
  if (out.length) return out;
  // último recurso: campo a campo, aguentando aspas soltas dentro do texto
  (t.match(/\{[\s\S]*?\}/g) || []).forEach(function (o) {
    const p = /"p"\s*:\s*"([\s\S]*?)"\s*,\s*"op"/.exec(o), op = /"op"\s*:\s*\[([\s\S]*?)\]\s*,\s*"c"/.exec(o), c = /"c"\s*:\s*(\d)/.exec(o), e = /"e"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/.exec(o);
    if (p && op && c) { const a = op[1].split(/"\s*,\s*"/).map(function (x) { return x.replace(/^\s*"|"\s*$/g, ''); }); out.push({ p: p[1], op: a, c: Number(c[1]), e: e ? e[1] : '' }); }
  });
  return out;
}
function quizValida_(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 8).map(function (q) { if (!q || !Array.isArray(q.op)) return null; const op = q.op.map(function (x) { return clip_(x, 160); }).filter(String), c = Number(q.c); if (op.length !== 4 || !(c >= 0 && c < 4) || Math.floor(c) !== c || !clip_(q.p, 300)) return null; return { p: clip_(q.p, 300), op: op, c: c, e: clip_(q.e, 300) }; }).filter(Boolean);
}
function quizGera_(titulo, texto) {
  let ps = [], fonte = 'modelo', erro = '';
  try { const r = quizIa_(titulo, texto); if (r && r.length >= 2) { ps = r.slice(0, QUIZ_N_); fonte = 'ia'; } else if (r) erro = 'a IA não devolveu perguntas válidas'; } catch (e) { erro = String(e && e.message || e).slice(0, 80); }
  if (!ps.length) ps = quizModelo_(titulo, texto, quizSemente_(titulo + texto)).slice(0, QUIZ_N_);
  return { perguntas: ps, fonte: fonte, erro: erro };
}
// Gera as perguntas (se faltam) e envia o aviso aos participantes da célula. Seguro para rodar duas vezes.
function quizEnvia_(quizId) {
  const q0 = lazy_('Quizzes').rows.filter(function (q) { return q.QuizID === quizId; })[0]; if (!q0 || q0.Status !== 'agendado') return false;
  const g = q0.Perguntas ? { perguntas: jparse_(q0.Perguntas, []), fonte: q0.Fonte } : (quizReuso_(q0) || quizGera_(q0.Titulo, q0.Texto));
  return withLock_(function () {
    const t = lazy_('Quizzes'), q = t.rows.filter(function (x) { return x.QuizID === quizId; })[0]; if (!q || q.Status !== 'agendado') return false;
    if (!g.perguntas.length) { writeRow_(t, q._row, { Status: 'sem', Fonte: g.fonte || 'modelo' }); return false; }
    writeRow_(t, q._row, { Perguntas: JSON.stringify(g.perguntas), Fonte: g.fonte, Status: 'enviado', EnviadoEm: now_() });
    ativosDaCelula_(q.CelulaID).forEach(function (m) { notify_(m.MembroID, 'quiz', 'Quiz da lição 📖', 'Já está liberado: “' + q.Titulo + '”. ' + g.perguntas.length + ' perguntas; quanto mais rápido responder, mais pontos!', 'quiz:' + q.QuizID); });
    return true;
  });
}
// Lição escolhida na lista (mesmo LicaoID) = mesmo quiz para todas as células: gera uma vez (1 chamada à IA) e reaproveita.
// Lição "Outra" (resumo escrito na hora) nunca reaproveita: a IA entende o resumo e gera um quiz só daquela reunião.
function quizReuso_(q0) {
  if (!q0.LicaoID) return null;
  const ia = !!entregaProps_().worker, mesmos = lazy_('Quizzes').rows.filter(function (q) { return q.QuizID !== q0.QuizID && q.LicaoID === q0.LicaoID && q.Perguntas && q.Status !== 'cancelado' && q.Status !== 'sem'; });
  const alvo = mesmos.filter(function (q) { return q.Fonte === 'ia'; })[0] || (ia ? null : mesmos[0]); if (!alvo) return null;
  const ps = jparse_(alvo.Perguntas, []); return ps.length ? { perguntas: ps, fonte: alvo.Fonte, erro: '' } : null;
}
function quizVencidos_(celulaId) { let t; try { t = lazy_('Quizzes'); } catch (e) { return; } t.rows.filter(function (q) { return q.Status === 'agendado' && q.EnviarEm && q.EnviarEm <= today_() && (!celulaId || q.CelulaID === celulaId); }).forEach(function (q) { try { quizEnvia_(q.QuizID); } catch (e) { console.error(e && e.stack || e); } }); }
// Gatilho diário (9h)
function enviaQuizzes() { quizVencidos_(''); try { quizLembrete_(); } catch (e) { console.error(e && e.stack || e); } pushFlush_(); }
// 9h do dia seguinte: lembra só quem ainda não jogou (uma vez por quiz)
function quizLembrete_() {
  const hj = today_(), t = lazy_('Quizzes'), feitos = {}; lazy_('QuizRespostas').rows.forEach(function (r) { feitos[r.QuizID + '|' + r.MembroID] = 1; });
  t.rows.filter(function (q) { return q.Status === 'enviado' && !q.LembreteEm && q.EnviadoEm && String(q.EnviadoEm).slice(0, 10) < hj && q.Data >= addDias_(hj, -4); }).forEach(function (q) {
    withLock_(function () { writeRow_(t, q._row, { LembreteEm: now_() }); });
    ativosDaCelula_(q.CelulaID).forEach(function (m) { if (!feitos[q.QuizID + '|' + m.MembroID]) notify_(m.MembroID, 'quiz', 'Você ainda não fez o quiz 📖', 'O quiz “' + q.Titulo + '” está esperando você. Quanto mais rápido, mais pontos!', 'quiz:' + q.QuizID); });
  });
}
function quizMeu_(u, q) { return q.CelulaID === u.celulaId || table_('Membros').rows.some(function (m) { return m.MembroID === u.membroId && m.CelulaID === q.CelulaID; }); }
function quizResp_(quizId, mid) { return lazy_('QuizRespostas').rows.filter(function (r) { return r.QuizID === quizId && r.MembroID === mid; })[0]; }
function quizCard_(q, r) { return { id: q.QuizID, titulo: q.Titulo, data: q.Data, total: jparse_(q.Perguntas, []).length, feito: r ? { acertos: Number(r.Acertos), total: Number(r.Total), pontos: quizPts_(r) } : null }; }
function myQuizzes_(d, u) {
  quizVencidos_(u.celulaId || ''); if (!u.celulaId) return { itens: [], pendentes: 0 };
  const t = lazy_('Quizzes'), feitos = {}; lazy_('QuizRespostas').rows.forEach(function (r) { if (r.MembroID === u.membroId) feitos[r.QuizID] = r; });
  const itens = t.rows.filter(function (q) { return q.CelulaID === u.celulaId && q.Status === 'enviado'; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 8).map(function (q) { return quizCard_(q, feitos[q.QuizID]); });
  return { itens: itens, pendentes: itens.filter(function (x) { return !x.feito; }).length };
}
const QUIZ_T_ = 20000;   // em 20 s ou mais a rapidez não rende bônus
function quizPts_(r) { return r.Pontos !== undefined && r.Pontos !== '' ? Number(r.Pontos) : Number(r.Acertos || 0) * 100; }
// 100 pontos por acerto + até 100 de bônus pela rapidez (ms gastos na pergunta)
function quizPtsPergunta_(ok, ms) { return ok ? 100 + Math.round(100 * Math.max(0, 1 - ms / QUIZ_T_)) : 0; }
function quizPosicao_(quizId, mid) {
  const rs = lazy_('QuizRespostas').rows.filter(function (r) { return r.QuizID === quizId; }).sort(function (a, b) { return quizPts_(b) - quizPts_(a) || Number(a.Tempo || 0) - Number(b.Tempo || 0); });
  const i = rs.findIndex(function (r) { return r.MembroID === mid; }); return { pos: i < 0 ? 0 : i + 1, de: rs.length };
}
function getQuiz_(d, u) {
  const q = lazy_('Quizzes').rows.filter(function (x) { return x.QuizID === clip_(d.id, 30) && x.Status === 'enviado'; })[0]; if (!q || !quizMeu_(u, q)) throw new ApiError('NOT_FOUND', 'Quiz não encontrado.');
  const r = quizResp_(q.QuizID, u.membroId), ps = jparse_(q.Perguntas, []), mine = r ? jparse_(r.Respostas, []) : null;
  if (!r && d.inicia) { try { const cc = CacheService.getScriptCache(), k = 'qs:' + q.QuizID + ':' + u.membroId; if (!cc.get(k)) cc.put(k, String(Date.now()), 21600); } catch (e) { /* sem cronômetro do servidor */ } }   // o relógio começa na 1ª abertura
  const pos = r ? quizPosicao_(q.QuizID, u.membroId) : null, mostra = !!r || !!d.inicia;   // antes de começar não mostra as perguntas (o relógio só corre depois)
  return { n: ps.length, id: q.QuizID, titulo: q.Titulo, data: q.Data, fonte: q.Fonte, feito: !!r, acertos: r ? Number(r.Acertos) : 0, pontos: r ? quizPts_(r) : 0, tempo: r ? Number(r.Tempo || 0) : 0, posicao: pos ? pos.pos : 0, de: pos ? pos.de : 0, limite: QUIZ_T_, perguntas: mostra ? ps.map(function (p, i) { const o = { p: p.p, op: p.op }; if (r) { o.c = p.c; o.e = p.e; o.r = mine[i]; } return o; }) : [] };
}
function answerQuiz_(d, u) {
  const id = clip_(d.id, 30), q0 = lazy_('Quizzes').rows.filter(function (x) { return x.QuizID === id && x.Status === 'enviado'; })[0]; if (!q0 || !quizMeu_(u, q0)) throw new ApiError('NOT_FOUND', 'Quiz não encontrado.');
  const ps = jparse_(q0.Perguntas, []), rs = Array.isArray(d.respostas) ? d.respostas.map(function (x) { return Number(x); }) : [];
  if (rs.length !== ps.length || rs.some(function (x) { return !(x >= -1 && x < 4) || Math.floor(x) !== x; })) throw new ApiError('VALIDATION', 'Responda todas as perguntas.');   // -1 = o tempo acabou
  // tempos por pergunta (ms) medidos no aparelho; o servidor não deixa o total ficar menor que o tempo real desde a abertura (menos uma folga)
  let tp = (Array.isArray(d.tempos) ? d.tempos : []).slice(0, ps.length).map(function (x) { x = Number(x); return isFinite(x) ? Math.max(1000, Math.min(QUIZ_T_, x)) : QUIZ_T_; }); while (tp.length < ps.length) tp.push(QUIZ_T_);
  let ini = 0; try { ini = Number(CacheService.getScriptCache().get('qs:' + id + ':' + u.membroId)) || 0; } catch (e) { ini = 0; }
  const soma = tp.reduce(function (a, x) { return a + x; }, 0), real = ini ? Date.now() - ini - 4000 : 0;
  if (!ini) tp = tp.map(function () { return QUIZ_T_; });   // sem abertura registrada: sem bônus de rapidez
  else if (real > soma && soma > 0) tp = tp.map(function (x) { return x * real / soma; });
  return withLock_(function () {
    if (quizResp_(id, u.membroId)) return getQuiz_({ id: id }, u);
    const ac = ps.filter(function (p, i) { return p.c === rs[i]; }).length, pts = ps.reduce(function (a, p, i) { return a + quizPtsPergunta_(p.c === rs[i], tp[i]); }, 0), tempo = Math.round(tp.reduce(function (a, x) { return a + x; }, 0));
    appendRow_(lazy_('QuizRespostas'), { QuizID: id, MembroID: u.membroId, Acertos: String(ac), Total: String(ps.length), Respostas: JSON.stringify(rs), Data: now_(), Pontos: String(pts), Tempo: String(tempo) });
    awardXp_(u.membroId, 'quiz:' + id, 5 + ac * 3, 'Quiz da lição'); return getQuiz_({ id: id }, u);
  });
}
// Aba Quiz da célula: ranking, histórico da célula e histórico de quem pergunta
function quizCelula_(d, u) {
  const cid = clip_(d.celulaId, 30) || u.celulaId; if (!cid) throw new ApiError('VALIDATION', 'Você ainda não está em uma célula.');
  if (cid !== u.celulaId) cellOf_(u, { celulaId: cid }, 'ver', 'quiz', 'ver');
  const cel = table_('Celulas').rows.filter(function (c) { return c.CelulaID === cid; })[0] || {}, nm = nomes_(), mem = ativosDaCelula_(cid), ids = {}; mem.forEach(function (m) { ids[m.MembroID] = 1; });
  const qs = lazy_('Quizzes').rows.filter(function (q) { return q.CelulaID === cid && q.Status === 'enviado'; }).sort(function (a, b) { return a.Data < b.Data ? 1 : a.Data > b.Data ? -1 : (a.EnviadoEm < b.EnviadoEm ? 1 : -1); });
  const porQ = {}; lazy_('QuizRespostas').rows.forEach(function (r) { (porQ[r.QuizID] = porQ[r.QuizID] || []).push(r); });
  const ord = function (a, b) { return b.pontos - a.pontos || a.tempo - b.tempo; }, mes = today_().slice(0, 7);
  const rank = function (filtro) {
    const ag = {}; qs.filter(filtro).forEach(function (q) { (porQ[q.QuizID] || []).forEach(function (r) { const k = r.MembroID; ag[k] = ag[k] || { id: k, nome: nm[k] || '—', pontos: 0, jogos: 0, acertos: 0, total: 0, tempo: 0 }; ag[k].pontos += quizPts_(r); ag[k].jogos++; ag[k].acertos += Number(r.Acertos || 0); ag[k].total += Number(r.Total || 0); ag[k].tempo += Number(r.Tempo || 0); }); });
    mem.forEach(function (m) { if (!ag[m.MembroID]) ag[m.MembroID] = { id: m.MembroID, nome: nm[m.MembroID] || '—', pontos: 0, jogos: 0, acertos: 0, total: 0, tempo: 0 }; });
    const n = qs.filter(filtro).length;
    return Object.keys(ag).map(function (k) { const x = ag[k]; return { id: x.id, nome: x.nome, pontos: x.pontos, jogos: x.jogos, quizzes: n, acertos: x.acertos, total: x.total, tempoMedio: x.jogos ? Math.round(x.tempo / x.jogos) : 0, eu: x.id === u.membroId, ativo: !!ids[x.id], tempo: x.tempo }; }).filter(function (x) { return x.ativo || x.jogos; }).sort(function (a, b) { return b.pontos - a.pontos || (a.jogos ? a.tempo / a.jogos : 1e9) - (b.jogos ? b.tempo / b.jogos : 1e9); });
  };
  const quizzes = qs.slice(0, 40).map(function (q) {
    const rs = porQ[q.QuizID] || [], feitos = {}; rs.forEach(function (r) { feitos[r.MembroID] = r; });
    const jog = rs.map(function (r) { return { id: r.MembroID, nome: nm[r.MembroID] || '—', acertos: Number(r.Acertos || 0), pontos: quizPts_(r), tempo: Number(r.Tempo || 0) }; }).sort(ord); jog.forEach(function (x, i) { x.pos = i + 1; });
    const falta = mem.filter(function (m) { return !feitos[m.MembroID]; }).map(function (m) { return { id: m.MembroID, nome: nm[m.MembroID] || '—' }; });
    const meu = jog.filter(function (x) { return x.id === u.membroId; })[0] || null;
    return { id: q.QuizID, titulo: q.Titulo, data: q.Data, total: jparse_(q.Perguntas, []).length, meu: meu, jogaram: jog, faltam: falta };
  });
  const meus = []; table_('Celulas'); const todos = {}; lazy_('Quizzes').rows.forEach(function (q) { todos[q.QuizID] = q; });
  lazy_('QuizRespostas').rows.filter(function (r) { return r.MembroID === u.membroId && todos[r.QuizID]; }).forEach(function (r) { const q = todos[r.QuizID], p = quizPosicao_(r.QuizID, u.membroId); meus.push({ id: q.QuizID, titulo: q.Titulo, data: q.Data, acertos: Number(r.Acertos || 0), total: Number(r.Total || 0), pontos: quizPts_(r), tempo: Number(r.Tempo || 0), pos: p.pos, de: p.de }); });
  meus.sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  const pend = qs.filter(function (q) { return !(porQ[q.QuizID] || []).some(function (r) { return r.MembroID === u.membroId; }); }).slice(0, 3).map(function (q) { return { id: q.QuizID, titulo: q.Titulo, data: q.Data, total: jparse_(q.Perguntas, []).length }; });
  const rt = rank(function () { return true; }), rm = rank(function (q) { return q.Data.slice(0, 7) === mes; }), eu = rt.filter(function (x) { return x.eu; })[0];
  return { celulaId: cid, celula: cel.Nome || '', limite: QUIZ_T_, pendentes: pend, eu: eu ? { pontos: eu.pontos, jogos: eu.jogos, quizzes: eu.quizzes, pos: rt.indexOf(eu) + 1, de: rt.length } : null, ranking: { tudo: rt.slice(0, 60), mes: rm.slice(0, 60) }, quizzes: quizzes, meus: meus.slice(0, 80) };
}
// Depois de lançar a presença: monta e envia o quiz na hora (a tela chama em segundo plano, sem travar o registro)
function quizPrepara_(d, u) { const id = cellOf_(u, d, 'presenca', 'freq', 'editar'); quizVencidos_(id); return { ok: true }; }
function quizLider_(d, u) {
  const id = cellOf_(u, d, 'ver', 'ind', 'ver'), mem = ativosDaCelula_(id), nome = {}; mem.forEach(function (m) { nome[m.MembroID] = m.Apelido || m.Simples || m.Nome; });
  const resp = {}; lazy_('QuizRespostas').rows.forEach(function (r) { (resp[r.QuizID] = resp[r.QuizID] || []).push(r); });
  return { ia: !!entregaProps_().worker, itens: lazy_('Quizzes').rows.filter(function (q) { return q.CelulaID === id && q.Status !== 'cancelado'; }).sort(function (a, b) { return a.Data < b.Data ? 1 : -1; }).slice(0, 10).map(function (q) {
    const rs = resp[q.QuizID] || [], ps = jparse_(q.Perguntas, []), feitos = {}; rs.forEach(function (r) { feitos[r.MembroID] = Number(r.Acertos); });
    return { id: q.QuizID, titulo: q.Titulo, data: q.Data, status: q.Status, fonte: q.Fonte, enviarEm: q.EnviarEm, perguntas: ps, total: ps.length, responderam: rs.length, participantes: mem.length, media: rs.length ? Math.round(rs.reduce(function (a, r) { return a + Number(r.Acertos); }, 0) / rs.length * 10) / 10 : 0, pessoas: mem.map(function (m) { return { nome: nome[m.MembroID], acertos: feitos[m.MembroID] === undefined ? null : feitos[m.MembroID] }; }) };
  }) };
}
// d.acao: 'enviar' (envia agora) | 'refazer' (gera as perguntas de novo, só se ninguém respondeu) | 'cancelar'
function quizAcao_(d, u) {
  const q0 = lazy_('Quizzes').rows.filter(function (x) { return x.QuizID === clip_(d.id, 30); })[0]; if (!q0) throw new ApiError('NOT_FOUND', 'Quiz não encontrado.');
  cellOf_(u, { celulaId: q0.CelulaID }, 'presenca', 'freq', 'editar'); const a = String(d.acao || '');
  if (a === 'cancelar') { withLock_(function () { const t = lazy_('Quizzes'), q = t.rows.filter(function (x) { return x.QuizID === q0.QuizID; })[0]; writeRow_(t, q._row, { Status: 'cancelado' }); }); return { ok: true }; }
  if (a === 'refazer') { if (lazy_('QuizRespostas').rows.some(function (r) { return r.QuizID === q0.QuizID; })) throw new ApiError('VALIDATION', 'Alguém já respondeu; não dá para refazer as perguntas.'); const g = quizGera_(q0.Titulo, q0.Texto); if (!g.perguntas.length) throw new ApiError('VALIDATION', 'O texto da lição é curto demais para gerar perguntas. Acrescente o conteúdo da lição.');
    withLock_(function () { const t = lazy_('Quizzes'), q = t.rows.filter(function (x) { return x.QuizID === q0.QuizID; })[0]; writeRow_(t, q._row, { Perguntas: JSON.stringify(g.perguntas), Fonte: g.fonte }); }); return { ok: true, fonte: g.fonte, erro: g.erro }; }
  if (a === 'enviar') { if (q0.Status !== 'agendado' && q0.Status !== 'sem') throw new ApiError('VALIDATION', 'Este quiz já foi enviado.'); withLock_(function () { const t = lazy_('Quizzes'), q = t.rows.filter(function (x) { return x.QuizID === q0.QuizID; })[0]; writeRow_(t, q._row, { Status: 'agendado', EnviarEm: today_() }); }); return { ok: quizEnvia_(q0.QuizID) }; }
  throw new ApiError('VALIDATION', 'Ação inválida.');
}
function getQuizCfg_() { return { ia: !!entregaProps_().worker }; }
// Testa a IA gratuita da Cloudflare com uma lição de exemplo
function testQuizIa_() {
  if (!entregaProps_().worker) throw new ApiError('VALIDATION', 'Ligue primeiro o Worker da Cloudflare (cartão acima).');
  try { const r = quizIa_('Parábola do Semeador', 'O semeador saiu a semear e parte da semente caiu à beira do caminho. Jesus explicou que a semente é a palavra de Deus. A terra boa representa quem ouve a palavra e persevera.'); return { ok: !!(r && r.length >= 2), perguntas: r ? r.length : 0, msg: r && r.length >= 2 ? 'A IA gratuita respondeu e gerou ' + r.length + ' perguntas.' : 'A IA respondeu, mas sem perguntas válidas.' }; }
  catch (e) { const m = String(e && e.message || e).slice(0, 120); return { ok: false, perguntas: 0, msg: 'Não funcionou: ' + m + (/AI|vínculo|binding/i.test(m) ? '. Confira se o vínculo AI foi adicionado ao Worker.' : /formato inválido/.test(m) ? '. A IA respondeu, mas fora do formato. Tente de novo; se repetir, o app usa as perguntas simples.' : '.') }; }
}
/* ===== Capacidade de IA e notificações (uso do dia, contado pelo próprio app) ===== */
const LIM_NEURONS_ = 10000, LIM_URLFETCH_ = 20000, LIM_WORKER_REQ_ = 100000;
function diaUtc_() { return Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd'); }
// Neurons gastos numa chamada (Llama 3.3 70B: 26.668 por milhão de tokens lidos e 204.805 por milhão escritos). Usa os tokens que o Worker devolve; senão estima por tamanho do texto.
function neuronsIa_(j, prompt) {
  const u = j && j.usage, pt = u && Number(u.prompt_tokens) > 0 ? Number(u.prompt_tokens) : String(prompt || '').length / 3.5, ct = u && Number(u.completion_tokens) > 0 ? Number(u.completion_tokens) : String(j && j.texto || '').length / 3.5;
  return Math.round(pt * 0.026668 + ct * 0.204805);
}
// Soma contadores no dia (UTC, que é quando a Cloudflare zera o limite). Nunca derruba a ação que chamou.
function usoAdd_(inc) {
  let got = false; const lk = LockService.getScriptLock();
  try {
    try { got = lk.tryLock(1500); } catch (e0) { got = false; }
    const t = lazy_('UsoDia'), dia = diaUtc_(); let r = t.rows.filter(function (x) { return x.Dia === dia; })[0];
    if (!r) { const o = { Dia: dia }; Object.keys(inc).forEach(function (k) { o[k] = String(Math.round(inc[k])); }); appendRow_(t, o); return; }
    const p = {}; Object.keys(inc).forEach(function (k) { if (inc[k]) p[k] = String((Number(r[k]) || 0) + Math.round(inc[k])); }); if (Object.keys(p).length) writeRow_(t, r._row, p);
  } catch (e) { console.error(e && e.stack || e); } finally { if (got) { try { lk.releaseLock(); } catch (e2) { /* ok */ } } }
}
function capacidade_() {
  const t = lazy_('UsoDia'), hoje = diaUtc_(), n = function (r, k) { return r ? Number(r[k]) || 0 : 0; }, rows = t.rows.slice().sort(function (a, b) { return a.Dia < b.Dia ? -1 : 1; });
  const h = rows.filter(function (r) { return r.Dia === hoje; })[0], E = entregaProps_();
  const ult = rows.filter(function (r) { return n(r, 'IACalls') - n(r, 'IAErros') > 0; }).slice(-14), ok = ult.reduce(function (a, r) { return a + n(r, 'IACalls') - n(r, 'IAErros'); }, 0), nr = ult.reduce(function (a, r) { return a + n(r, 'IANeurons'); }, 0);
  const medio = ok > 0 && nr > 0 ? Math.max(20, Math.round(nr / ok)) : 170, usados = n(h, 'IANeurons'), resta = Math.max(0, LIM_NEURONS_ - usados);
  const fetchs = n(h, 'IACalls') + n(h, 'WorkerCalls') + n(h, 'DiretoCalls'), reset = new Date(); reset.setUTCHours(24, 0, 0, 0);
  return { dia: hoje, zeraAs: Utilities.formatDate(reset, CFG.TZ, 'HH:mm'),
    ia: { ligada: !!E.worker, chamadas: n(h, 'IACalls'), erros: n(h, 'IAErros'), neurons: usados, limite: LIM_NEURONS_, restantes: resta, mediaPorQuiz: medio, quizzesRestantes: Math.floor(resta / medio), estimado: !ult.length },
    push: { worker: !!E.worker, envios: n(h, 'PushEnvios'), ok: n(h, 'PushOk'), falhas: n(h, 'PushFalha'), chamadasWorker: n(h, 'WorkerCalls'), urlFetch: fetchs, limiteUrlFetch: LIM_URLFETCH_, restantesUrlFetch: Math.max(0, LIM_URLFETCH_ - fetchs), limiteWorker: LIM_WORKER_REQ_, aparelhosPorChamada: 50, enviosRestantes: E.worker ? Math.max(0, LIM_URLFETCH_ - fetchs) * 50 : Math.max(0, LIM_URLFETCH_ - fetchs) },
    semana: rows.slice(-7).map(function (r) { return { dia: r.Dia, neurons: n(r, 'IANeurons'), ia: n(r, 'IACalls'), envios: n(r, 'PushEnvios') }; }) };
}
/* ===== Entrega das notificações: Cloudflare Worker (Web Push) ===== */
// Tudo o que é segredo fica nas Propriedades do script (nunca na planilha nem no app)
function entregaProps_() {
  const pr = PropertiesService.getScriptProperties(), g = function (k) { return String(pr.getProperty(k) || '').trim(); };
  const wu = g('PUSH_URL'), ws = g('PUSH_SEGREDO');
  return { worker: /^https:\/\//.test(wu) && ws ? { url: wu, segredo: ws } : null };
}
function pushViaWorker_(envios, E) {
  const out = [], v = vapid_();
  for (let i = 0; i < envios.length; i += 50) {
    const lote = envios.slice(i, i + 50);
    try {
      usoAdd_({ WorkerCalls: 1 }); const r = UrlFetchApp.fetch(E.worker.url, { method: 'post', contentType: 'application/json', headers: { 'X-Segredo': E.worker.segredo }, payload: JSON.stringify({ itens: lote }), muteHttpExceptions: true });
      const st = r.getResponseCode(); let j = null; try { j = JSON.parse(r.getContentText()); } catch (e2) { j = null; }
      if (st === 200 && j && j.resultados) j.resultados.forEach(function (x) { out.push({ endpoint: x.endpoint, status: x.status, erro: x.erro || '' }); });
      else lote.forEach(function (e) { out.push({ endpoint: e.sub.endpoint, status: 0, erro: 'Worker respondeu ' + st + (st === 401 ? ' (segredo diferente)' : '') }); });
    } catch (err) { lote.forEach(function (e) { out.push({ endpoint: e.sub.endpoint, status: 0, erro: 'Worker inacessível: ' + String(err && err.message || err).slice(0, 60) }); }); }
  }
  return out;
}
// Rode UMA vez no editor do Apps Script para copiar as chaves ao Worker (Settings > Variables and Secrets)
function exportaVapid() {
  const v = vapid_(), pub = WP_.b64u(WP_.pub(v.d)), d = WP_.b64u(v.d);
  Logger.log('VAPID_PUBLICA=' + pub); Logger.log('VAPID_PRIVADA=' + d); return { VAPID_PUBLICA: pub, VAPID_PRIVADA: d };
}
// Rode UMA vez no editor para autorizar o envio a servidores externos (UrlFetchApp) depois de colar PUSH_URL
function liberarPush() { UrlFetchApp.fetch('https://example.com', { muteHttpExceptions: true }); Logger.log('Autorizado.'); }
function getEntrega_() {
  const E = entregaProps_(), pr = PropertiesService.getScriptProperties();
  return { worker: !!E.worker, workerUrl: String(pr.getProperty('PUSH_URL') || '') };
}
function saveEntrega_(d) {
  const pr = PropertiesService.getScriptProperties(), set = function (k, v) { v = String(v == null ? '' : v).trim(); if (v) pr.setProperty(k, v); else pr.deleteProperty(k); };
  if (d.workerUrl !== undefined) { const w = String(d.workerUrl).trim(); if (w && !/^https:\/\/[^\s]{6,300}$/.test(w)) throw new ApiError('VALIDATION', 'O endereço do Worker deve começar com https://'); set('PUSH_URL', w); }
  if (d.workerSegredo) set('PUSH_SEGREDO', String(d.workerSegredo).slice(0, 200));
  if (d.workerLimpar) { pr.deleteProperty('PUSH_URL'); pr.deleteProperty('PUSH_SEGREDO'); }
  return getEntrega_();
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
  const temQ = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'enviaQuizzes'; });
  if (!temQ) ScriptApp.newTrigger('enviaQuizzes').timeBased().everyDays(1).atHour(9).create();
}
