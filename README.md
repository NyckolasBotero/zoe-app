# Ministério Zoe — app de membros

Site estático (HTML/CSS/JS puro, sem build de front) + backend em Google Apps Script + Google Sheets.
Mesmo modelo do Núcleo Reposição e do Safezone: login com sessão, permissões conferidas no servidor.

## Estrutura
- `src/app.html` — código-fonte do app (edite aqui). `python3 build.py` gera `index.html`.
- `index.html` — documento final para hospedar (GitHub Pages).
- `assets/js/config.js` — URL do backend. Vazio = **modo demonstração** (dados de exemplo no aparelho).
- `apps-script/Code.gs` — backend. Cole no projeto Apps Script.
- `manifest.json` — instalação na tela inicial (iPhone: Compartilhar > Adicionar à Tela de Início).
- `tests/` — testes do backend (`node --test tests/zoe.test.mjs`) e teste de ponta a ponta no navegador (`python3 tests/e2e.py`, com `node tests/devserver.mjs` rodando).

## Colocar no ar
1. Em script.google.com crie um projeto, cole `apps-script/Code.gs` e rode `setup()` (cria a planilha "Zoe - Dados" no seu Drive; mantenha o compartilhamento **Restrito**).
2. Rode `criarAdmin('seu@email.com','SuaSenhaForte','Seu Nome')` (a senha fica só como hash).
3. Implantar > Nova implantação > App da Web (Executar como: Eu | Acesso: Qualquer pessoa). Copie a URL `/exec`.
4. Em `assets/js/config.js` coloque a URL em `apiUrl` e publique o repositório no GitHub Pages.
5. Ao mudar o `Code.gs`: Gerenciar implantações > editar > **Nova versão**.

## Papéis e permissões
Papéis: administrador, pastor, supervisor, líder, membro. A matriz (lançar eventos, aprovar transferências, ver todas as células, gerenciar ministérios, configurações) é editada em Administração e validada no servidor.
Líder só mexe na própria célula; supervisor nas que supervisiona.

## Ainda não feito
- Bíblia (texto), mural de fotos e anotações do culto ficam só no aparelho por enquanto.
- Aprovação de matrículas em cursos e cadastro de cursos pelo painel.
- Busca de CEP automática, mapa com pinos reais, ícones do app, service worker (uso offline).
- Cores e logo definitivas (trocar `--verde` e `--vermelho` no `:root`).

## Bíblia
Texto: *Almeida 1819 (Bíblia Livre)*, domínio público, fonte github.com/midvash/bible-data. Arquivos em `assets/bible/` (um por livro + `index.json`). Funciona só quando o app é aberto pelo site publicado (GitHub Pages), pois lê esses arquivos.

## Níveis de acesso x cargos de célula
- **Nível de acesso** (aba `Usuarios`, coluna Papel): `admin`, `pastor`, `membro`. Define o que a pessoa faz no app (aba `Permissoes`).
- **Cargos de célula** não são papéis: vêm da própria célula (`Celulas`: LiderID, SupervisorID, TreinamentoID) e se somam a qualquer nível. Um administrador pode ser líder e supervisor ao mesmo tempo.
- Só quem tem a permissão "celulas" (administração) cria células.
- Líder: gere a célula e **solicita** transferências. Supervisor: vê as células que supervisiona e **aprova/nega** transferências (não decide pedido feito por ele mesmo). Líder em treinamento: vê membros/indicadores e registra presença; não edita a célula nem pede transferência.

## Fluxo das células (administração → líder → supervisor)

1. **Administração** cria todas as células (dia da semana, líder, supervisor, líder em treinamento) e cadastra os membros, escolhendo o nível de acesso e a célula de cada um.
2. O membro **pertence sempre àquela célula**, até ser transferido (supervisor aprova) ou sair da congregação.
3. **Frequência**: a lista traz apenas as pessoas cadastradas na célula. A data vem preenchida com o último dia da célula; se a data escolhida não for o dia da célula, o sistema avisa e pede confirmação (fica marcado "fora do dia" no histórico). Datas futuras são bloqueadas. Ao registrar, o histórico mostra data, dia da semana, presentes e ausentes por nome.
4. **Ex-participante** só existe quando o líder usa *Informar saída* (aba Membros) e o supervisor da célula (ou a administração) **autoriza** em Administração → Pedidos. Enquanto não houver aprovação, a pessoa continua na lista. Transferência entre células não conta como ex-participante.
5. Atualização do backend: cole o novo `Code.gs`, execute `setup()` uma vez (cria a aba **Saidas** e as colunas novas) e publique uma **nova versão** da implantação.

## Biblioteca virtual, testemunhos, mural e organograma

- **Biblioteca virtual** (menu lateral): o administrador envia PDFs em *Administração → Biblioteca virtual* (nome, autor, descrição, capa e arquivo até 10 MB). Os PDFs ficam em uma pasta privada do Google Drive ("Zoe - Biblioteca Virtual (PDFs)"), criada ao rodar `setup()`. Os membros leem no próprio app (leitor pdf.js em `assets/lib/`) e comentam em um feed, com número da página e botão "Amém". Quem tem a permissão de ministérios ou configurações gerencia livros e apaga comentários.
- **Testemunhos**: em Início, qualquer membro compartilha o seu e todos veem; o autor ou a administração apaga.
- **Mural**: as fotos aparecem inteiras, com a proporção original. Em *Mover e ajustar*, a bolinha do canto redimensiona e o X remove. *Salvar e compartilhar* gera uma imagem PNG do mural, abre a folha de compartilhamento (WhatsApp) ou baixa a imagem.
- **Organograma** (aba após o Mural, visível a todos): árvore invertida, com a supervisão na base e as células crescendo para cima. Ao criar ou editar uma célula, o campo *Gerada da célula* coloca a nova acima da célula de origem.
- Atualização do backend: cole o novo `Code.gs`, rode `setup()` (autorize o acesso ao Google Drive quando o Google pedir) e publique uma nova versão da implantação.

## Aprovações, membresia e uso da plataforma

- **Aprovações** (menu, acima de Administração; aparece para quem decide algo): central única de transferências, saídas de participantes, interesses em ministérios e novos membros. Os pedidos pendentes geram pop-up ao entrar, aparecem no sino e levam a essa página. Cada decisão fica registrada com quem decidiu e quando.
- **Desfazer**: ao aprovar ou recusar aparece uma barra com contagem de 10 segundos e o botão *Desfazer*. Depois disso, em *Histórico geral* ou *Minhas decisões*, o botão *Reverter decisão* devolve o pedido a pendente e desfaz o efeito (pessoa volta à célula de origem, volta a ser visitante etc.) para decidir de novo.
- **Ministérios**: o interesse do membro chega em Aprovações para quem tem a permissão de ministérios. Aprovado, aparece na linha do tempo (roadmap) do membro.
- **Novo membro**: em Administração → *Regra para virar membro* define-se quantas células seguidas um visitante precisa frequentar (padrão 4). Ao atingir o número, o supervisor recebe o pedido, revisa o cadastro e aprova.
- **Acessos**: em Administração → Usuários, *Editar acesso e senha* troca nível de acesso, situação e senha (a pessoa troca a senha no próximo acesso).
- **Uso da plataforma**: logins, tempo online, % de uso por pessoa e telas mais acessadas (por mês). O tempo só conta com o app aberto e visível.
- Atualização do backend: cole o novo `Code.gs`, rode `setup()` (cria as abas Membresias, AprovLog e Uso e as colunas novas) e publique uma nova versão da implantação.

## Organograma modular, fotos, notas e carrossel
- **Organograma** (Célula → aba Organograma): visível **apenas** para supervisores e administradores; os demais não veem a aba e a API recusa (`FORBIDDEN`). Os cards das células são arrastáveis; a posição fica salva para todos (Config `OrgLayout`). **Botão direito** (no celular, segurar o dedo) numa célula: *Vincular a outro supervisor*, *Retirar do supervisor atual*, *Definir/Remover célula-mãe*. Também dá para soltar o card sobre um supervisor (ou outra célula, para definir a mãe). A mudança grava `SupervisorID`/`MaeID` da célula, então transferências, saídas e aprovações passam a ir para o novo supervisor. Administrador move qualquer célula; supervisor só as suas. "Reorganizar automaticamente" limpa as posições.
- **Fotos de perfil** aparecem em todo lugar com avatar (chamada, papéis, membros, aniversariantes, testemunhos, comentários dos livros, aprovações, organograma). As fotos são buscadas sob demanda (`fotos`, lotes de 25) e guardadas em cache na página.
- **Nota do livro**: cada pessoa dá de 1 a 10 (pode mudar); a média e o número de avaliações aparecem na biblioteca (aba `LivroNotas`).
- **Tela inicial**: carrossel com os próximos eventos (troca a cada 3 s; pausa ao passar o mouse/tocar; setas e pontos). Sem eventos, passam versículos.
- **PDF grande**: o limite do corpo da requisição subiu para 16 MB apenas para `saveBook`; as demais ações continuam limitadas a 1,5 MB.
- Depois de atualizar: cole o novo `Code.gs`, rode `setup()` (cria a aba `LivroNotas`) e publique uma **nova versão** da implantação.

## Mapa das células e célula mais próxima
- Ao criar a célula (Administração) ou em Célula → Perfil da célula, informe **latitude, longitude** (ex.: `-15.765417, -48.267880`; no Google Maps, toque e segure no local e copie os números).
- **Buscar células** mostra um mapa (Leaflet + OpenStreetMap) com todos os pontos; cada ponto abre um balão com o link "Ver no Google Maps". "Usar minha localização" (ou "Marcar onde moro", tocando no mapa) calcula a distância até cada célula, ordena por proximidade e destaca a mais próxima. A posição fica só no aparelho de quem usa. Na tela inicial, quem ainda não tem célula vê a mais próxima.
- Privacidade: se a célula não marcou o endereço como público (aba Privacidade), o ponto sai **aproximado** (arredondado, cerca de 1 km); com endereço público, exato.
- Depois de atualizar: cole o novo `Code.gs`, rode `setup()` (cria as colunas Lat/Lng em Celulas) e publique nova versão da implantação.

## Motion design e acabamento
- **Tokens** (`:root`): `--d-fast/base/slow` (150/280/480 ms) e curvas `--e-std`, `--e-out`, `--e-in`, `--e-spring`; tudo usa esses valores. "Reduzir movimento" do sistema e o botão de animações do topo desligam tudo.
- **Botões**: brilho de vitrine ao passar o mouse, elevação suave e **ripple** fluido no clique. Barra lateral expande/recolhe com animação e, recolhida, mostra só os ícones (com dica ao passar o mouse).
- **Pop**: modais, menu do mouse, alertas e avisos entram e saem com animação. Telas entram em sequência (coreografia) e os cards abaixo da dobra aparecem ao rolar.
- **Barra de cima**: some ao descer a página, volta ao subir, e tem uma linha de progresso de leitura suavizada.
- **Saudação** "Olá, <apelido>!" ao entrar; **feedback de arquivo** (nome e tamanho ao escolher, barra "Enviando…" nos envios grandes); troca de tema claro/escuro com transição.

## Índice da Administração
Na página de Administração, a barra lateral mostra, abaixo de "Administração", um submenu com todas as seções (Níveis de acesso, Usuários, Biblioteca…). Clicar rola suavemente até a seção e a destaca; a seção atual fica marcada enquanto você rola. No celular (ou com a barra recolhida) aparece o botão flutuante **Seções** com a mesma lista.

## Envio de livros: compressor e arrastar-e-soltar; leitor
- **Compressor**: PDFs acima de 10 MB são reduzidos automaticamente no navegador (cada página vira JPEG e o PDF é remontado, tentando qualidades cada vez menores até caber em ~9 MB). Mostra o progresso "Comprimindo página X de N". Atenção: o PDF comprimido deixa de ter texto selecionável (é como um escaneado). Se nem na menor qualidade couber, o app avisa para dividir o arquivo.
- **Arrastar e soltar**: dentro do cartão Biblioteca virtual (Administração) é só soltar o PDF e/ou a imagem da capa; as áreas tracejadas pulsam quando você arrasta um arquivo pela tela.
- **Leitor**: abre com a **página inteira** visível (sem cortar), com botões −/+ (30% a 400%), "Página inteira"/"Largura" e tela cheia; reajusta ao redimensionar a janela.
- **Capa automática**: ao adicionar um livro sem enviar imagem, a capa é a primeira página do PDF. Se você enviar uma imagem, ela vale no lugar. Livros que já estão sem capa ganham o botão **Capa do PDF** na lista da Administração.

## Lives e Vídeos
- A aba "Tutoriais" agora se chama **Lives e Vídeos**: carrossel de vídeos do YouTube (avança sozinho a cada 4 s, pausa com mouse/toque, setas), abas **Transmissões** / **Todos os vídeos** abaixo e player do YouTube **dentro do site** (modal, `youtube-nocookie`).
- Admin → "Vídeos e transmissões": campo Tipo (Vídeo/Transmissão) e "Ao vivo agora"; botão "Está ao vivo / Encerrar ao vivo" por linha (`updateVideo`).
- Backend: colunas novas `Tipo` e `AoVivo` na aba Videos — cole o novo `Code.gs`, rode `setup()` e publique nova versão da implantação.
- Teste: `tests/e2e_videos.py`.

## Bíblia e Anotações
- "Área do Membro" virou **Bíblia e Anotações**. Filtros: versão, livro, capítulo, versículo (de/até).
- Versões: Almeida 1819 (local, offline), **ARC** e **NVT** (lidas de `bolls.life/get-text/<versão>/<livro>/<cap>/` na hora, cache em sessionStorage; códigos em `BVER` no app.html). Precisam de internet.
- **Comparar com outra versão**: mostra cada versículo seguido da outra versão (ex.: 16 NVT, 16 ARC, 17 NVT, 17 ARC).
- A busca por palavra continua no texto local (Almeida 1819). Teste: `tests/e2e_biblia.py`.
- Atenção: NVT tem direitos autorais; para uso público/oficial, avaliar licença junto às editoras.

## Loja Zoe
- Nova aba **Loja Zoe**: produtos (camisetas, pulseiras, bonés, garrafas, marca-texto, marcador de página, porta-copos, outros) com filtros por categoria, busca e ordenação por nome/preço.
- **Nenhum pedido é fechado no site**: "Tenho interesse" abre o WhatsApp com a mensagem pronta (produto, descrição, opção, quantidade, valor unitário e total, nome de quem pediu).
- Contato: Administração → "Loja Zoe: produtos e contato". Em branco usa o WhatsApp da igreja (Dados da igreja). Números com 10/11 dígitos recebem o 55 automaticamente.
- Administração: cadastrar/editar/remover produtos (nome, categoria, preço, opções, descrição, foto, disponível/esgotado).
- Backend: aba `Produtos` e chave `LojaWhatsApp` em Config. Rotas `listProducts` (qualquer logado), `saveProduct`/`deleteProduct` (permissão "config"). Teste: `tests/e2e_loja.py`.

## Regras Células, tipos de acesso e frequentador
Em **Administração → Definições de Parâmetros → Regras Células** o administrador marca, para cada perfil (supervisor, líder, líder em treinamento, pastor, membro, frequentador e tipos criados por ele), quem pode **ver** e quem pode **editar** cada uma das 12 guias da célula. Padrão: líder e supervisor fazem tudo; membro e frequentador veem planejamento, membros, perfil, mural e organograma e podem pedir oração. As regras são conferidas **no servidor** (Apps Script), não só na tela; uma guia sem edição aparece em modo leitura.
- **Frequentador**: quem está numa célula e tem presença abaixo do limite (padrão 70%, nas últimas 8 reuniões — ambos editáveis) é tratado como Frequentador; acima do limite, Membro. É calculado, não precisa ser marcado.
- **Níveis de acesso** (Acessos): além das permissões, define quais **abas** cada tipo vê e permite **criar outros tipos**. Exceção automática: quem já está numa célula sempre vê a aba Células.
- **Histórico de presença**: cada reunião grava o elenco da época (coluna `Elenco` em `Reunioes`); entrar gente nova não muda o % de reuniões passadas.
- **Supervisor**: "Células a multiplicar para ser supervisor" (0 = sem exigência). Se a pessoa ainda não cumpriu, o sistema avisa e o administrador pode abrir uma exceção.
- Ao atualizar o `Code.gs`: cole, rode `setup()` uma vez (cria a coluna `Elenco` e a configuração) e publique nova versão.

## Aprovações: motivo, Notificações e resumo para decidir
- Quem aprova pode (opcionalmente) escrever o **motivo**; ao **recusar**, o motivo é obrigatório. O resultado vai como **Notificação** (antes "Alertas", sino no topo) para quem fez o pedido e para o líder da célula, com o motivo. Quem decidiu não se notifica. As notificações ficam na aba `Notificacoes` da planilha e o motivo no `AprovLog`.
- Cada pedido pendente mostra um **resumo** para decidir com base em fatos: de qual célula vem e para qual vai (ou "não estava em nenhuma"), motivo do pedido, membro desde, batismo, % de frequência na célula (e se é Frequentador ou Membro), cursos, ministérios e eventos. Vale para transferência, pedido de ministério, saída de participante e novo membro. Ao pedir transferência, o líder pode informar o motivo (coluna `Motivo` em `Transferencias`).
- Hierarquia: o **supervisor** decide e recebe os pedidos; o **líder** não decide nem recebe pedidos, só o resultado do que pediu; **líder em treinamento** é a nomenclatura do futuro líder.
- Ao atualizar o `Code.gs`, rode `setup()` (cria `Notificacoes` e as colunas `Motivo`).

## Atualizar sem F5 e Termômetro da presença de Deus
- **Botão atualizar** (ícone de setas no topo): recarrega os dados do app sem recarregar a página, mostrando uma "vitrine" fosca com o andamento ao lado (sessão, eventos e avisos, célula, aprovações e notificações). Você continua na mesma tela.
- **Frequência**: o campo "Como foi a célula? (resumo)" vem acima do **Termômetro da presença de Deus**, uma barra de 0 a 100. Perto do zero aparece um gelinho animado; no meio, uma chama pequena; passando do meio a chama cresce e ganha brilho e faíscas. O valor vai para a coluna `Termometro` de `Reunioes` (o resumo em `Obs`, até 500 caracteres); `PresencaDeDeus` fica marcado a partir de 50 para os indicadores antigos.
- **Histórico** mostra o ícone e o resumo de cada reunião; **Indicadores** mostra a média e as últimas 8 reuniões.
- Ao atualizar o `Code.gs`, rode `setup()` (cria a coluna `Termometro`).

## Zoe, espírito de luz (guia de primeiro acesso + ajudante)

- **Primeiro acesso:** ao entrar pela primeira vez (coluna `Usuarios.GuiaVisto` vazia), a Zoe aparece, diz o versículo (Salmos 119:105) e "como a Palavra de Deus diz, precisamos saber o que fazer! Por isso eu vou te ensinar!". Depois vem o **guia obrigatório**, passo a passo com holofote sobre cada aba (só as abas que o perfil enxerga; quem não está em célula vê *Buscar células*; quem aprova vê *Aprovações*). Ao concluir, a Zoe se despede (tchau) e fica no canto direito. O fim grava `guideDone` e o guia não volta.
- **Ajudante:** passar o mouse mostra "Posso te ajudar em algo?". Clicar abre a conversa: a pessoa digita a dúvida ("Bíblia", "onde posso encontrar minha célula"…) e a Zoe presume o que é, e **Mostrar onde** leva até a aba com holofote. Se a pessoa está em célula, mostra a célula dela; se não, leva à busca de células. Há botão **Rever o tutorial**.
- Depois de colar o novo `Code.gs`, rode `setup()` uma vez (cria a coluna `GuiaVisto`).
- Em navegador automatizado (Playwright) o guia é pulado, a menos que `localStorage['zoe-force']='1'` (usado em `tests/e2e_zoe.py`).

## Loja: promoções e produtos

- Em **Administração › Loja Zoe**, o cartão **Promoções** aplica desconto em **um produto**, **vários (marcados na lista)**, **uma categoria** ou **a loja toda**. Tipo: desconto em % (1–90) ou preço promocional fixo (só item/lote). Data final opcional: ao passar, a promoção acaba sozinha. **Remover promoção** vale para o mesmo escopo.
- O preço normal fica guardado (colunas `PromoPreco`/`PromoAte` em `Produtos`); a vitrine mostra o preço antigo riscado, o novo e o `-%`, e a mensagem do WhatsApp já vai com o valor promocional.
- **Marcar esgotado / Voltou ao estoque** ativa ou desativa o produto sem apagá-lo.
- Depois de colar o novo `Code.gs`, rode `setup()` para criar as colunas novas.

## Professor, Cursos, Aulas e Certificados

- **Nível Professor** (abaixo de Pastor, acima de Membro) e duas permissões novas em *Níveis de acesso*: **Dar aulas** (`prof`: criar cursos/aulas/certificados) e **Supervisão de cursos** (`cursos`: aprovar cursos, início e matrículas; padrão: Administrador e Pastor). Depois de colar o novo `Code.gs`, rode `setup()` (novas abas: `Aulas`, `AulaPresenca`, `AulaAval`, `Assinaturas` e colunas novas em `Cursos`/`Matriculas`/`Permissoes`).
- **Fluxo:** professor cria o curso (informa se a matrícula exige aprovação e a presença mínima do certificado) → vai para **Aprovações** (com resumo; o supervisor também recebe notificação) → aprovado, o professor monta o cronograma (uma aula, ou **em lote**: quantidade, dias da semana, horário, PDF e título de cada aula) → **pede o início** e o supervisor autoriza → aulas com **chamada** e **foto do dia** → o professor **encerra** e avalia cada aluno (presença sobre o total de aulas) → **emite o certificado**.
- **Aluno** (aba *Cursos*): Cursos da igreja (se matricula), Meus cursos, Cursos que você fez (certificado) e Matrículas pendentes (permitidas só pelos supervisores). Vê o cronograma por dia, títulos e PDFs, e **avalia as aulas** (nota 1–10, feedback, dúvida e observação; a dúvida chega como notificação ao professor).
- **Certificado digital** com a identidade da Zoe, carga horária, descrição, presença e **assinaturas** do professor e do supervisor/pastor que aprovou o curso. Cada um cadastra a sua (desenhar ou digitar o nome) em *Aulas › Minha assinatura* ou em *Aprovações*. Botão para imprimir/salvar em PDF.

## Zoe participativa
A Zoe avisa aniversariantes (com botão "Enviar parabéns" e Salmos 118:24), Natal, Dia do Pastor (2º domingo de junho), Independência, comemora decisão por Cristo, batismo, perfil completo e cada insígnia nova. Cada aviso aparece uma vez (`S.zMom`).

## Meu perfil, níveis e insígnias
- **Meu perfil** tem três abas: **Meu perfil**, **Personalizar** e **Editar perfil** (os dados pessoais, foto, endereço, família e senha agora ficam aqui dentro). A faixa de **insígnias já vem aberta**: as conquistadas aparecem normais e as que faltam aparecem **escuras** (com a regra e o progresso ao tocar).
- **XP e níveis (1 a 100)**: acesso diário +5, presença na célula +10, perfil completo +100, decisão +150, batismo +200, curso +300, mais o XP de cada insígnia. O nível aparece no perfil.
- **Personalização libera de 10 em 10 níveis**: nível 10 = contorno da foto 1, moldura 1, fundo animado 1, capa, versículo e mural de fotos (visível a todos no perfil); nível 20 = contorno 2, moldura 2, fundo 2, e assim até o 100. Os fundos se movem como o cartão de boas-vindas do Início. O mural ganha 2 espaços por faixa (até 12).
- **Criar insígnias** (supervisores, pastor e administração; menu *Criar insígnias*): nome, descrição, XP, **o que precisa ser feito** (ir aos últimos N eventos de um tipo, ex.: retiro; servir N meses numa escala, ex.: 12 meses na Limpeza = “Mão no arado”; N eventos; N reuniões de célula; N cursos; N dias de acesso; ou concessão manual) e o **visual** (bordado, dourado, prateado ou bronze; 5 formas; 18 ícones; cores e texto). Quem cumpre a regra ganha sozinho; quem ainda não cumpriu vê a insígnia escura. A aba **Escalas e serviço** registra quem serviu em cada atividade por mês.
- Tabelas: `Insignias`, `InsigniaDefs`, `Servicos`, `XpLog`, `Perfis` (Contorno, Quadro, Fundo), `PerfilFotos`. Rotas: `profileView`, `saveProfile`, `saveHighlight`, `deleteHighlight`, `listInsigniaDefs`, `saveInsigniaDef`, `grantBadge`, `logServico`, `listServicos`.

## Feed social, Consolidação e “aceitou Jesus”
- **Mural da igreja** (Início): quando alguém aceita Jesus (no culto ou na célula) a publicação cai no feed, a Zoe avisa todos e qualquer pessoa pode **curtir e comentar**. Tabelas `Posts`, `Comentarios` (curtidas na tabela `Curtidas` com `Tipo=post`). Rotas `listFeed`, `likePost`, `commentPost`, `listComments`, `deletePost`, `deleteComment`.
- **Consolidação** (só líderes e acima): **Novo visitante** com mapa para marcar onde mora (latitude/longitude); o sistema acha a célula ativa mais próxima e avisa o líder dela (sino e Zoe) com nome, apelido, celular e **atalho do WhatsApp** com mensagem pronta editável. A aba **Visitantes** lista e marca quem já foi contatado; a aba **Aceitou Jesus** lança a decisão no culto (se já tem cadastro, os dados vêm preenchidos). Tabela `Visitantes`; rotas `saveVisitor`, `listVisitors`, `contactVisitor`, `registerDecision`.
- **Relatório da célula**: ao registrar a frequência há **foto da célula do dia** e a caixa **Alguém aceitou Jesus**; a publicação no feed leva a foto, o nome e o termômetro da presença de Deus. Quem já tem cadastro é só marcado como frequentador que aceitou Jesus. Coluna nova `Reunioes.Foto`.

## Bíblia: marcações e anotações do culto
Toque em um versículo para **marcar com marca-texto ou sublinhar** (6 cores; fica para sempre no seu usuário), escrever um **comentário** (privado ou público: os outros veem sob o versículo) e **Adicionar às anotações do culto**. A anotação acumula os versículos com os seus comentários; ao **salvar**, o título é montado sozinho (ex.: *01/11/2026 Domingo - Tema Mordomia Cristã*) e ela cai no **feed da sua célula** (aba *Anotações do culto*) para os colegas curtirem e comentarem. Tabela `BibMarcas`; rotas `listMarks`, `saveMark`, `saveNote`. A **Maratona Bíblica** agora fica dentro da Bíblia (aba própria, com um ponto vermelho quando há uma em andamento).

## Botons de eventos
Em Administração › Publicar evento, o campo **Insígnia exclusiva** cria um boton para quem comparecer. O card **Presença nos eventos** (check-in) marca quem veio (`checkinEvento`, tabela `EventoPresenca`); quem vai a todos os eventos do ano (mínimo 3) ganha **Presença total**. Curso concluído também dá insígnia com o ano.

## Maratona Bíblica
Administração › **Maratona Bíblica (programar)**: início (1º de janeiro), máximo de capítulos por dia e total (1189). Fica dentro da **Bíblia** (aba Maratona Bíblica, com um ponto vermelho indicando que há uma em andamento) e em um cartão no Início. Só se registra a leitura **do dia**, com um devocional de no mínimo 30 letras, que o líder da célula (ou a administração) valida ou recusa com motivo. Faixa pelos dias perdidos: 0 ouro, 1 prata, 2 ou mais bronze; em cada faixa os 3 primeiros a terminar ganham a insígnia do 1º, 2º e 3º lugar. Tabelas `Corridas`, `CorridaLeitura`, `CorridaConc`.

**Ao publicar o Code.gs:** cole o arquivo, rode `setup()` (cria as novas tabelas/colunas) e publique uma nova versão.

## Certificados: prévia, layout e exclusão
- **Prévia** do certificado a qualquer momento (curso em andamento ou encerrado), com nome de exemplo ou de um aluno; leva marca d'água "PRÉVIA".
- **Layout do certificado** (Área do professor › aba própria): cores, fundo, moldura, letra do nome, título, subtítulo, frase de abertura, rodapé e o que mostrar; prévia ao vivo e temas prontos. Cada professor tem o seu (tabela `CertLayout`).
- **Excluir certificado emitido**: o aluno volta para "a avaliar", perde a insígnia/XP do curso e recebe aviso; dá para emitir de novo. Rotas `previewCert`, `getCertLayout`, `saveCertLayout`, `revokeCert`.

## Pessoas e Chat
- Aba **Pessoas**: busca por nome (mín. 2 letras, sem acento) e abre o **perfil de qualquer usuário**: foto, insígnias, nível, destaques e **envolvimento** (célula, ministérios, cursos concluídos, reuniões e eventos). Telefone, e-mail e endereço nunca aparecem. Em Personalizar dá para ocultar o envolvimento.
- **Chat** ao lado do sino: conversas 1 a 1 com qualquer usuário ativo, busca por nome, contador de não lidas, atualização a cada 4 s com o chat aberto (20 s fechado), limite de 20 mensagens por minuto. Tabela `ChatMsgs`; rotas `searchPeople`, `profileView`, `sendChat`, `getChat`, `chatRead`, `listChats`.

## Escalas dos ministérios
- Menu **Escalas**. Supervisores (e pastores/admin) têm **Visão geral** (indicadores: pessoas escaladas por ministério, confirmadas, pendentes, re-escalações, quem confirmou e foi), **Lançar escala** (ministério + pessoas + data/hora/função; **lote** repetindo nos dias da semana escolhidos pelos próximos 1–12 meses, sem duplicar), **Agenda** (remarcar, remover, marcar “foi/faltou”) e **Pedidos** (aprovar/recusar quem quer entrar na escala). Membros só visualizam a agenda.
- A pessoa escalada recebe aviso no sino **7, 3 e 1 dia antes** e popup da Zoe com “Vou estar lá!”; pode **confirmar**, **pedir re-escalação** (com motivo, que o supervisor vê) ou **pedir troca** (a outra pessoa aceita e a agenda mostra “⇄ trocou com”). A Zoe elogia quem confirma ou pede para servir, com versículos.
- Qualquer membro pode ver a agenda e **pedir para participar** (aba Participar).
- Tabelas `Escalas` e `EscalaPedidos`; rotas `listScales`, `saveScale`, `rescheduleScale`, `deleteScale`, `respondScale`, `requestSwap`, `answerSwap`, `markScale`, `requestJoin`, `decideJoin`. Teste: `tests/e2e_escalas.py`.

## Outras mudanças recentes
- Sino: limpar tudo / descartar uma a uma; tipos de notificação definidos pelo adm em Parâmetros.
- Certificado: assinatura cursiva (8 fontes) e cor; assinatura cadastrada em **Meu perfil › Editar perfil › Assinatura** (professores) e na aba Aulas.
- **Célula › Perfil da célula**: clique no mapa para preencher latitude/longitude.

## Área do Multimídia (projetor de letras)
- Menu **Multimídia**, só para quem está no ministério **Som** (e supervisores/pastor/admin). As músicas ficam salvas para todo o ministério; qualquer um pode editar ou excluir.
- **Nova música**: nome, cantor, link do YouTube, letra colada ou **importada da web** (busca por nome/cantor via lyrics.ovh, feita pelo servidor — o Apps Script pede autorização de “conectar a serviço externo” na 1ª vez; rode `setup()` e autorize). Uma **linha em branco separa os slides**; dá para juntar, dividir, editar e excluir slides.
- **Layout** por música ou **layout padrão**: degradê de fundo, luzes coloridas que brilham e se movem, partículas (luzes em desfoque, estrelas, neve, bolhas, corações, cruzes, notas, brilho), fonte, tamanho, cor, negrito, itálico, maiúsculas, contorno, sombra, alinhamento, logo (tamanho, posição, opacidade) e nome/cantor.
- **Projetar › Iniciar transmissão** abre uma janela nova: na **segunda tela** (tela cheia — o navegador pede permissão “gerenciar janelas”; se não abrir em tela cheia, clique ou aperte F) ou, sem segunda tela, numa janela com moldura na tela principal. Painel com slide atual, **anterior e próximo**, lista para **pular direto**, atalhos (← → espaço, B) e **Pausar/Retomar**. Pausar ou encerrar mostra a **logo da Zoe** na tela de projeção.
- Tabela `Musicas` (a linha `PADRAO` guarda o layout padrão); rotas `listSongs`, `saveSong`, `deleteSong`, `saveSongDefault`, `searchLyrics`, `importLyrics`. Teste: `tests/e2e_multimidia.py`.

## Desempenho do carregamento
- A carga inicial agora é **uma única requisição** (`boot`) em vez de ~20; o servidor lê cada aba da planilha uma vez por requisição de leitura (cache só em rotas de leitura, invalidado ao gravar) e reutiliza a planilha aberta.
- Fontes extras (assinaturas cursivas e Multimídia) carregam depois do app, fora do caminho crítico.
