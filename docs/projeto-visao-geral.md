# Ministério Zoe — Página de Membros e App da Igreja

App web para iPhone, Android e computador, com níveis de permissão e dimensionamento de acessos. Plataforma geral da igreja. Versão atual: **1.104** (a "2.0" só será anunciada quando estiver em produção rodando na igreja).

## Onde está tudo
- Código: repositório privado GitHub `NyckolasBotero/zoe-app` (branch `main`, publicado via GitHub Pages).
- Protótipo publicado: https://claude.ai/artifact/94fbkZrUBGZqAgLHWNEkTY
- Front-end: arquivo único `src/app.html` → `index.html` (`python3 build.py`, rodar duas vezes).
- Backend: `apps-script/Code.gs` (Google Apps Script, ES2017) com Google Sheets como banco. Sheets criadas sozinhas (`lazy_`) quando faltam.
- Documentos: `README.md`, `docs/atualizacoes.json` (notas por versão), `docs/documentacao.json`.
- Testes: `node --test tests/zoe.test.mjs` (81 de backend) e e2e Playwright em `tests/e2e_*.py` (um por vez, servidor novo em `tests/devserver.mjs`).

## Fonte única da verdade (vários chats)
- Vários chats trabalham neste app. O ramo `main` do GitHub é a única fonte: **antes de mexer, `git pull`; antes de publicar, conferir se há versão nova no `origin/main`** (e mesclar sem perder nada).
- Há **um só `Code.gs`**: o de `main` (apps-script/Code.gs). Nunca usar um `Code.gs` enviado por chat anterior se o chat tiver posterior.
- A versão exibida é a última nota de `docs/atualizacoes.json`; cada chat acrescenta a sua nota no topo, sem renumerar as dos outros.

## Regras de trabalho combinadas
1. Sempre enviar o `Code.gs` ao usuário quando mudar, dizendo se precisa rodar `setup()`.
2. Commit e push a cada etapa; republicar o artifact; atualizar README, atualizacoes.json e documentacao.json.
3. Planilha continua com compartilhamento restrito.
4. Não rodar agentes de validação a menos que o usuário peça.
5. Número de versão = última nota em `docs/atualizacoes.json`.

## O que o app já tem
- **Acesso e permissões:** administrador, pastor, supervisor, líder, membro; matriz de permissões conferida no servidor; senha só como hash, com visualização cifrada para o admin (confirmando a senha dele).
- **Início personalizável**, Notícias, **Posts agendados** (campanhas sazonais: por dias, meses, anos ou intervalo; repetir todo ano; ligar/desligar; arte trocável; a Zoe comenta).
- **Células:** frequência (chamada com rascunho, visitantes e pessoas de outra célula, foto vai ao mural da célula, nota de presença de Deus do líder + votos dos membros com média), planejamento, oração, organograma, mapas (casa dos membros, sede com símbolo da Zoe, cartão da célula com mural).
- **Família Zoe:** quem somos, pastores, programação, onde estamos, fale com a igreja e **Árvore Zoe** (radial, "Cristo Jesus" no centro; "Minha família" e "Toda a igreja").
- **Presença facial:** câmera abre direto, assume a câmera, reconhecimento rigoroso ("Rosto não cadastrado"), presença avulsa.
- **Zoe (assistente) e Sod (gamificação):** Zoe conhece as áreas do site, eventos, agenda da célula e posts no ar.
- **Chat e notificações:** som e animação (sino salta e balança; chat pula), botões de teste em Meu perfil › Configurações, mensagem de teste.
- **PWA:** instalável; o aviso de instalar não repete para quem já instalou.
- **Eventos que passaram:** remarcar/adiar, alerta à Mídia para subir fotos, post "Como foi…", feed único modular (Administração › Publicações).
- **Insígnias:** lote de 44 insígnias com níveis e botão Elogiar (v1.95). Desempenho: marcas de versão por aba e fotos de perfil no Drive em piloto (v1.92/1.93).
- Biblioteca virtual, Bíblia e anotações, Studio/Projeção, Consolidação, Fichas, Aniversariantes, Loja Zoe, Aprovações, cursos e aulas.

## Pendências e ideias
- Passos do usuário: colar o último `Code.gs`, publicar nova versão do Apps Script, remarcar a casa no mapa.
- Resultado dos 3 agentes de validação (UI/UX, causa raiz, Zoe/Sod) ainda não chegou.
- Verificar em aparelho real: câmera da presença facial, sons e animações, instalação.
- Teste de backend de agendas do telão depende da data de hoje (falha intermitente).
- Sod etapa 3, loja de insígnias, domínio www.mczoe.com.br, endurecimento do login, conferir códigos da Bíblia, carregamento com cache primeiro, "Colocar na célula" para visitantes aceitos (só se o usuário pedir), desenho compartilhado no mural da célula.
- Opcional: diminuir o intervalo de consulta do chat (hoje 20 s com o chat fechado) para avisos mais rápidos.
