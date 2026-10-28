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
- Versões: Almeida 1819 (local, offline), **NVI**, **ARC** e **NVT** (lidas de `bolls.life/get-text/<versão>/<livro>/<cap>/` na hora, cache em sessionStorage; códigos em `BVER` no app.html). Precisam de internet.
- **Comparar com outra versão**: mostra cada versículo seguido da outra versão (ex.: 16 NVT, 16 ARC, 17 NVT, 17 ARC).
- A busca por palavra continua no texto local (Almeida 1819). Teste: `tests/e2e_biblia.py`.
- Atenção: NVI e NVT têm direitos autorais; para uso público/oficial, avaliar licença junto às editoras.
