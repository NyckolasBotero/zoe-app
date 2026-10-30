# Retransmissor da Zoe

O **Estúdio** do site (Multimídia › Transmissões) monta o vídeo no navegador. Navegadores não conseguem falar RTMP, que é o que
YouTube, Facebook, Twitch e outros exigem. Este pequeno servidor faz a ponte:

```
Estúdio (navegador) ──WebSocket/WebM──► Retransmissor ──ffmpeg──► YouTube (RTMP)
                                                        ├────────► Facebook (RTMP)
                                                        ├────────► outras plataformas
                                                        └────────► HLS (assistir no site da igreja)
```

* Um codificador H.264/AAC; cada plataforma recebe uma cópia (uma queda não derruba as outras) e o status volta ao Estúdio.
* Gera HLS para o site (Lives e Vídeos) e consulta espectadores/comentários do YouTube (Data API v3) e do Facebook (Graph API), se você informar as chaves.
* Uma transmissão por vez. Acesso por senha (`RELAY_TOKEN`).

## Instalar (qualquer VPS Linux com Docker, ~2 vCPU)
1. `cp .env.example .env` e edite (domínio e senha). Aponte o DNS do domínio para o servidor.
2. `docker compose up -d --build` — o HTTPS é automático.
3. No site: **Multimídia › Transmissões › Plataformas e conexão**: endereço `wss://seu-dominio`, a senha, e **Testar conexão**.
4. Cadastre cada plataforma (endereço RTMP e chave de transmissão) e salve.

Sem Docker: Node 18+, `ffmpeg` instalado, `npm install`, `RELAY_TOKEN=... PUBLIC_URL=https://... node server.mjs` atrás de um proxy HTTPS.

## Notificações no aparelho (Web Push)
O mesmo servidor entrega os pop-ups do app (avisos, chat, missões do Sod): o Apps Script chama `POST /push` com o mesmo token e o servidor cifra e envia para cada aparelho inscrito. A chave pública (VAPID) é gerada na primeira execução e guardada em `DATA_DIR/vapid.json` — **mantenha esse volume** (no Docker já está em `relay_data`), senão todos precisam reativar as notificações. Não precisa de conta no Firebase.

## Variáveis
`RELAY_TOKEN` (obrigatória) · `PORT` (8787) · `PUBLIC_URL` (endereço público, usado no link HLS) · `ALLOWED_ORIGIN` (endereço do site; padrão: qualquer) · `FFMPEG` · `HLS_DIR` · `DATA_DIR` (onde fica a chave `vapid.json`) · `VAPID_PUBLIC`/`VAPID_PRIVATE` (opcional, para definir as chaves à mão).

## Teste
`node test_push.mjs` confere o Web Push (cifra, assinatura VAPID e decifragem). `npm test` gera um vídeo, envia como o navegador faria e confere RTMP (h264), HLS e a recusa de token inválido.

## Segurança
A senha trafega só por `wss://`. As chaves de transmissão ficam na planilha da igreja (Config › LiveCfg) e só são lidas por quem usa o Multimídia. Restrinja `ALLOWED_ORIGIN` ao endereço do site.
