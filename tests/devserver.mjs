// Servidor de teste: serve o app e executa o Code.gs real (em memória) como se fosse o Apps Script.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { makeEnv } from './mock_env.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const e = makeEnv();
e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
const PORT = Number(process.env.PORT || 8799); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.method === 'POST' && req.url.startsWith('/api')) { let b = ''; req.on('data', c => b += c); req.on('end', () => { e.ctx.__req = b; const out = e.run('doPost({postData:{contents:__req}}).getContent()'); res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(out); }); return; }
  let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
  if (p === '/assets/js/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(`window.ZOE_CONFIG={apiUrl:'http://localhost:${PORT}/api',nomeIgreja:'Ministério Zoe',faceGate:${process.env.FACEGATE==='1'}}`); }
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(PORT, () => console.log('ok ' + PORT));
