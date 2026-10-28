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
