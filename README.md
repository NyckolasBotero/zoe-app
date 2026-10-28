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
