# ntfy da Zoe (avisos no celular mesmo com o app fechado)

O ntfy é um serviço simples de avisos: o Apps Script **publica** uma mensagem num tópico e o app ntfy do celular, inscrito nesse tópico, mostra a notificação. Cada pessoa tem um tópico secreto próprio (gerado em *Editar perfil › Configurações*).

## 1. Servidor
Precisa de qualquer computador ou VPS ligado o tempo todo com Docker.
1. Na Cloudflare: **Zero Trust › Networks › Tunnels › Create tunnel** (Cloudflared). Copie o **token**.
2. No túnel, adicione um *Public hostname*: `ntfy.SEUDOMINIO.com.br` → serviço `http://ntfy:80`.
3. Nesta pasta crie o arquivo `.env`:
   `CLOUDFLARE_TUNNEL_TOKEN=cole_o_token_aqui`
4. Edite `server.yml` e troque o `base-url` pelo endereço do passo 2.
5. `docker compose up -d`

## 2. Usuário para o Apps Script publicar
```
docker compose exec ntfy ntfy user add --role=user zoe-app      # pede uma senha
docker compose exec ntfy ntfy access zoe-app "zoe-*" write-only
docker compose exec ntfy ntfy token add zoe-app                  # copie o tk_...
```
Como `auth-default-access` é `deny-all`, quem não tem o token não publica. Para as pessoas **lerem**, crie um usuário só de leitura e entregue o login a elas, ou deixe os tópicos `zoe-*` legíveis (os nomes têm 24 letras aleatórias, impossíveis de adivinhar):
```
docker compose exec ntfy ntfy access '*' "zoe-*" read-only
```

## 3. Ligar no app
Em **Administração › Definições › Entrega fora do app**: coloque o endereço do ntfy, o token `tk_...` e toque em *Ligar o ntfy*. Depois cada pessoa abre *Editar perfil › Configurações › Receber avisos pelo ntfy*, toca em **Ativar** e segue os 3 passos na tela.

## Observações
- iPhone: o ntfy funciona com o app instalado da App Store; o `upstream-base-url` do `server.yml` é o que faz o aviso chegar na hora.
- O texto dos avisos passa pelo seu servidor ntfy. Evite colocar informações muito sensíveis nas notificações.
- Sem o ntfy ligado, tudo continua funcionando só com o aviso normal do navegador/app instalado.
