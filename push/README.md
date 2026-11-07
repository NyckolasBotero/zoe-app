# Worker de notificações (Cloudflare)

O Worker recebe do Apps Script a lista de aparelhos e a mensagem, cifra e entrega o Web Push. Isso tira do Apps Script o trabalho pesado (criptografia) e deixa o envio rápido e confiável, **com o app fechado**. Plano gratuito da Cloudflare: 100 mil envios por dia. O Apps Script chama o Worker em lotes de 50, então o limite do `UrlFetchApp` (20 mil por dia) quase não é tocado.

## 1. Criar o Worker
1. Cloudflare › **Workers & Pages › Create › Worker**, nome `zoe-push`, *Deploy*.
2. **Edit code**: apague tudo, cole o conteúdo de `push/worker_push.js` e *Deploy*.
3. Anote o endereço, tipo `https://zoe-push.SEUNOME.workers.dev`.

## 2. Chaves
1. No editor do Apps Script, escolha a função **`exportaVapid`** e execute. Em *Execution log* aparecem `VAPID_PUBLICA` e `VAPID_PRIVADA`.
2. No Worker: **Settings › Variables and Secrets › Add** (tipo *Secret*), três itens:
   - `VAPID_PUBLICA` e `VAPID_PRIVADA` (os valores do passo anterior)
   - `SEGREDO` (invente uma senha longa; a mesma vai para o app)
3. Opcional: `VAPID_ASSUNTO` = `mailto:seu@email.com`.

## 3. Ligar no app
1. No Apps Script, execute **`liberarPush`** uma vez e aceite a autorização (para o script poder chamar servidores externos). Depois publique uma **nova versão** da implantação.
2. No app: **Administração › Definições › Entrega fora do app**, preencha o endereço do Worker e o segredo, *Salvar*.
3. Em **Notificações no aparelho**, toque em *Verificar e enviar teste*.

Se o Worker for apagado ou o segredo ficar errado, o app volta sozinho a avisar a falha no teste (erro 401 = segredo diferente). Para voltar ao envio direto, use *Desligar o Worker*.

## iPhone
O iPhone só recebe Web Push com o app **instalado na Tela de Início** (Safari › Compartilhar › Adicionar à Tela de Início) e iOS 16.4 ou mais novo. O ntfy (pasta `ntfy/`) é uma alternativa que não exige isso.

## Teste local
`node push/test_worker.mjs` confere que o Worker cifra de um jeito que o navegador consegue decifrar.
