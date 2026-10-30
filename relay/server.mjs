// Retransmissor da Zoe — recebe o vídeo do Estúdio (WebSocket, WebM) e entrega por RTMP a várias plataformas e em HLS para o site.
// Requisitos: Node 18+, ffmpeg no PATH. Variáveis: RELAY_TOKEN (obrigatória), PORT (8787), PUBLIC_URL (https://relay.seudominio.com),
// ALLOWED_ORIGIN (https://seu-site, padrão: qualquer), FFMPEG (caminho do ffmpeg), HLS_DIR.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { carregaVapid, envia } from './push.mjs';

const PORT = Number(process.env.PORT) || 8787, TOKEN = process.env.RELAY_TOKEN || '', FFMPEG = process.env.FFMPEG || 'ffmpeg';
const ORIGIN = process.env.ALLOWED_ORIGIN || '*', PUBLIC = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const HLS_DIR = process.env.HLS_DIR || path.join(os.tmpdir(), 'zoe-hls');
if (!TOKEN) { console.error('Defina RELAY_TOKEN (um segredo longo) antes de iniciar.'); process.exit(1); }
fs.mkdirSync(HLS_DIR, { recursive: true });
const VAPID = carregaVapid(process.env.VAPID_FILE || path.join(process.env.DATA_DIR || '.', 'vapid.json'));

const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const cors = (res) => { res.setHeader('Access-Control-Allow-Origin', ORIGIN); res.setHeader('Access-Control-Allow-Headers', '*'); };
const mime = { '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  cors(res); if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/vapid') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ key: VAPID.pub })); }
  if (u.pathname === '/push' && req.method === 'POST') {
    const au = String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''); if (!safeEq(au, TOKEN)) { res.writeHead(401); return res.end(); }
    let b = ''; req.on('data', (c) => { b += c; if (b.length > 2e6) req.destroy(); });
    req.on('end', async () => { try { const l = (JSON.parse(b).envios || []).slice(0, 300); const out = await Promise.all(l.map((e) => envia(e.sub, e.payload, VAPID)));
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ res: out })); } catch { res.writeHead(400); res.end(); } });
    return;
  }
  if (u.pathname === '/saude') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, ao_vivo: !!atual })); }
  const m = /^\/hls\/([a-f0-9]{16})\/([\w.-]+)$/.exec(u.pathname);
  if (m) { const f = path.join(HLS_DIR, m[1], m[2]); if (!f.startsWith(HLS_DIR) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); return fs.createReadStream(f).pipe(res); }
  res.writeHead(404); res.end();
});

let atual = null; // só uma transmissão por vez
const wss = new WebSocketServer({ server, path: '/live', maxPayload: 8 * 1024 * 1024 });

const okRtmp = (u) => /^rtmps?:\/\/[^\s]+$/.test(u);
function spawnFfmpeg(args, tag, onLine) {
  const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'warning', '-stats', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = ''; p.stderr.on('data', (d) => { buf += d.toString(); const parts = buf.split(/[\r\n]+/); buf = parts.pop(); parts.forEach((l) => l.trim() && onLine(l)); });
  p.stdin.on('error', () => { }); p.stdout.on('error', () => { }); p.on('error', (e) => onLine('ERRO ' + e.message));
  return p;
}

function iniciar(ws, cfg) {
  const id = crypto.randomBytes(8).toString('hex'), dir = path.join(HLS_DIR, id); fs.mkdirSync(dir, { recursive: true });
  const fps = [24, 30, 60].includes(+cfg.fps) ? +cfg.fps : 30, kbps = Math.max(500, Math.min(12000, +cfg.kbps || 2500)), res = [480, 720, 1080].includes(+cfg.res) ? +cfg.res : 720;
  const outs = (Array.isArray(cfg.outputs) ? cfg.outputs : []).slice(0, 10).filter((o) => o && okRtmp(String(o.url || ''))).map((o) => ({ id: String(o.id).slice(0, 30), nome: String(o.nome || o.id).slice(0, 40), alvo: String(o.url).replace(/\/$/, '') + (o.key ? '/' + o.key : ''), estado: 'conectando', kbps: 0, msg: '', proc: null }));
  const S = { id, dir, ws, outs, inicio: Date.now(), bytes: 0, ultimoBytes: 0, kbpsIn: 0, hls: cfg.hls !== false, enc: null, hlsProc: null, timers: [], fechado: false, drop: 0 };
  // codificador único: WebM do navegador -> H.264/AAC em FLV para stdout; cada saída copia o fluxo (sem recodificar)
  const gop = fps * 2, ar = ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0', '-b:v', kbps + 'k', '-maxrate', kbps + 'k', '-bufsize', kbps * 2 + 'k', '-vf', `scale=-2:${res}`, '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2'];
  S.enc = spawnFfmpeg(['-fflags', '+genpts', '-i', 'pipe:0', ...ar, '-f', 'flv', 'pipe:1'], 'enc', (l) => { if (/error|invalid/i.test(l)) aviso(S, 'Codificador: ' + l.slice(0, 160)); });
  const alvos = [];
  outs.forEach((o) => {
    o.proc = spawnFfmpeg(['-f', 'flv', '-i', 'pipe:0', '-c', 'copy', '-flvflags', 'no_duration_filesize', '-f', 'flv', o.alvo], o.id, (l) => {
      const b = /bitrate=\s*([\d.]+)kbits\/s/.exec(l); if (b) { o.kbps = Math.round(+b[1]); o.estado = 'ok'; o.msg = ''; }
      else if (/refused|failed|error|Input\/output|Server returned|Broken pipe|timed out/i.test(l)) { o.estado = 'erro'; o.msg = l.replace(o.alvo, '***').slice(0, 160); }
    });
    o.proc.on('exit', (c) => { if (!S.fechado && o.estado !== 'erro') { o.estado = 'erro'; o.msg = o.msg || 'Conexão encerrada pela plataforma (código ' + c + ').'; } else if (!S.fechado) o.estado = 'erro'; });
    alvos.push(o.proc.stdin);
  });
  if (S.hls) {
    S.hlsProc = spawnFfmpeg(['-f', 'flv', '-i', 'pipe:0', '-c', 'copy', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '8', '-hls_flags', 'delete_segments+omit_endlist+independent_segments', '-hls_segment_filename', path.join(dir, 's%d.ts'), path.join(dir, 'index.m3u8')], 'hls', () => { });
    alvos.push(S.hlsProc.stdin);
  }
  S.enc.stdout.on('data', (d) => alvos.forEach((w) => { if (w.writable && w.writableLength < 4 * 1024 * 1024) w.write(d); else S.drop++; }));
  S.enc.on('exit', () => alvos.forEach((w) => { try { w.end(); } catch { } }));
  S.timers.push(setInterval(() => estatisticas(S), 2000));
  S.timers.push(...apis(S, cfg.apis || []));
  atual = S; send(ws, { type: 'iniciado', hls: S.hls ? `${PUBLIC}/hls/${id}/index.m3u8` : '', saidas: outs.map((o) => ({ id: o.id, nome: o.nome })) });
}
const send = (ws, o) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(o)); } catch { } };
const aviso = (S, msg) => send(S.ws, { type: 'aviso', msg });
function estatisticas(S) {
  const dt = 2, kb = Math.round(((S.bytes - S.ultimoBytes) * 8) / 1000 / dt); S.ultimoBytes = S.bytes; S.kbpsIn = kb;
  send(S.ws, { type: 'stats', segundos: Math.round((Date.now() - S.inicio) / 1000), kbpsEntrada: kb, descartados: S.drop, saidas: S.outs.map((o) => ({ id: o.id, nome: o.nome, estado: o.estado, kbps: o.kbps, msg: o.msg })) });
}
function parar(S) {
  if (!S || S.fechado) return; S.fechado = true; S.timers.forEach((t) => clearInterval(t));
  try { S.enc.stdin.end(); } catch { } setTimeout(() => { [S.enc, S.hlsProc, ...S.outs.map((o) => o.proc)].forEach((p) => { try { p && p.kill('SIGTERM'); } catch { } }); }, 1500);
  setTimeout(() => fs.rm(S.dir, { recursive: true, force: true }, () => { }), 60000); if (atual === S) atual = null;
}
// Espectadores e comentários das plataformas (opcional): YouTube Data API v3 e Facebook Graph API
function apis(S, lista) {
  const ts = []; (Array.isArray(lista) ? lista : []).slice(0, 10).forEach((a) => {
    if (!a || !a.apiKey || !a.videoId) return; const id = String(a.id).slice(0, 30);
    const q = (u) => fetch(u, { signal: AbortSignal.timeout(8000) }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || r.status); return j; });
    const tick = async () => { try {
      if (a.tipo === 'youtube') { const j = await q(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(a.videoId)}&key=${encodeURIComponent(a.apiKey)}`); const d = j.items && j.items[0] && j.items[0].liveStreamingDetails; send(S.ws, { type: 'plataforma', id, espectadores: d ? Number(d.concurrentViewers) || 0 : null }); }
      else if (a.tipo === 'facebook') { const j = await q(`https://graph.facebook.com/v19.0/${encodeURIComponent(a.videoId)}?fields=live_views,status&access_token=${encodeURIComponent(a.apiKey)}`); send(S.ws, { type: 'plataforma', id, espectadores: Number(j.live_views) || 0, status: j.status }); }
    } catch (e) { send(S.ws, { type: 'plataforma', id, erro: String(e.message || e).slice(0, 140) }); } };
    tick(); ts.push(setInterval(tick, 15000));
    // comentários
    let tok = '', desde = 0;
    const chat = async () => { try {
      if (a.tipo === 'youtube' && a.chatId) { const j = await q(`https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(a.chatId)}&part=snippet,authorDetails&maxResults=50${tok ? '&pageToken=' + encodeURIComponent(tok) : ''}&key=${encodeURIComponent(a.apiKey)}`); tok = j.nextPageToken || tok; (j.items || []).forEach((m) => send(S.ws, { type: 'comentario', plataforma: id, autor: m.authorDetails && m.authorDetails.displayName, texto: m.snippet && m.snippet.displayMessage })); }
      else if (a.tipo === 'facebook') { const j = await q(`https://graph.facebook.com/v19.0/${encodeURIComponent(a.videoId)}/comments?fields=from,message,created_time&order=chronological&access_token=${encodeURIComponent(a.apiKey)}`); (j.data || []).filter((m) => Date.parse(m.created_time) > desde).forEach((m) => { desde = Math.max(desde, Date.parse(m.created_time)); send(S.ws, { type: 'comentario', plataforma: id, autor: m.from && m.from.name, texto: m.message }); }); }
    } catch { } };
    if ((a.tipo === 'youtube' && a.chatId) || a.tipo === 'facebook') { if (a.tipo === 'facebook') desde = Date.now(); ts.push(setInterval(chat, 6000)); }
  }); return ts;
}

wss.on('connection', (ws, req) => {
  const u = new URL(req.url, 'http://x'); if (!safeEq(u.searchParams.get('token') || '', TOKEN)) { send(ws, { type: 'erro', msg: 'Token inválido.' }); return ws.close(4401); }
  if (ORIGIN !== '*' && req.headers.origin !== ORIGIN) { send(ws, { type: 'erro', msg: 'Origem não permitida.' }); return ws.close(4403); }
  let meu = null; send(ws, { type: 'pronto', ocupado: !!atual });
  ws.on('message', (data, isBin) => {
    if (isBin) { if (meu && !meu.fechado && meu.enc.stdin.writable) { meu.bytes += data.length; meu.enc.stdin.write(data); } return; }
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.cmd === 'start') { if (atual) return send(ws, { type: 'erro', msg: 'Já existe uma transmissão em andamento neste servidor.' }); try { iniciar(ws, m); meu = atual; } catch (e) { send(ws, { type: 'erro', msg: 'Não foi possível iniciar: ' + e.message }); } }
    if (m.cmd === 'stop' && meu) { parar(meu); send(ws, { type: 'parado' }); meu = null; }
  });
  ws.on('close', () => { if (meu) parar(meu); });
  ws.on('error', () => { });
});
server.listen(PORT, () => console.log(`Retransmissor Zoe em :${PORT} (HLS em ${HLS_DIR})`));
process.on('SIGTERM', () => { if (atual) parar(atual); setTimeout(() => process.exit(0), 2000); });
