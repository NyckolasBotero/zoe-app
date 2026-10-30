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

## Variáveis
`RELAY_TOKEN` (obrigatória) · `PORT` (8787) · `PUBLIC_URL` (endereço público, usado no link HLS) · `ALLOWED_ORIGIN` (endereço do site; padrão: qualquer) · `FFMPEG` · `HLS_DIR`.

## Teste
`npm test` gera um vídeo, envia como o navegador faria e confere RTMP (h264), HLS e a recusa de token inválido.

## Segurança
A senha trafega só por `wss://`. As chaves de transmissão ficam na planilha da igreja (Config › LiveCfg) e só são lidas por quem usa o Multimídia. Restrinja `ALLOWED_ORIGIN` ao endereço do site.
