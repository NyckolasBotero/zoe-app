// Servidor de teste: serve o app e executa o Code.gs real (em memória) como se fosse o Apps Script.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { makeEnv } from './mock_env.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const e = makeEnv();
e.run(`criarAdmin('admin@zoe.com','SenhaForte123','Pastor Admin')`);
if (process.env.SEED_MAPAS === '1') { // dados de teste para o e2e dos mapas
  const adm = e.call('login', { email: 'admin@zoe.com', senha: 'SenhaForte123' }).data.token, mk = (n) => e.call('createUser', { email: n + '@zoe.com', nome: n[0].toUpperCase() + n.slice(1) + ' Teste', senha: 'Temp12345', papel: 'membro' }, adm).data.membroId;
  const sup = mk('sup'), sup2 = mk('sup2'), l1 = mk('lid1'), l2 = mk('lid2'), a = mk('ana'), b = mk('beto'), c = mk('caio'), d = mk('duda'), f = mk('fabi');
  const c1 = e.call('createCell', { nome: 'Célula Norte', liderId: l1, supervisorId: sup, coordenadas: '-23.50, -46.60' }, adm).data.id, c2 = e.call('createCell', { nome: 'Célula Sul', liderId: l2, supervisorId: sup2, coordenadas: '-23.62, -46.60' }, adm).data.id;
  const geo = { [a]: [c1, '1', -23.51, -46.61], [b]: [c1, '1', -23.49, -46.58], [c]: [c2, '1', -23.63, -46.62], [d]: ['', '0', -23.70, -46.70], [f]: ['', '0', -23.30, -46.20] };
  Object.keys(geo).forEach(id => { const g = geo[id]; e.run(`(function(){const t=table_('Membros');t.rows.forEach(function(m){if(m.MembroID==='${id}')writeRow_(t,m._row,{CelulaID:'${g[0]}',EhMembro:'${g[1]}',Lat:'${g[2]}',Lng:'${g[3]}',Endereco:'Rua X',Cidade:'São Paulo'})})})()`); });
  e.run(`(function(){const t=table_('Presencas');for(var i=0;i<3;i++){appendRow_(t,{ReuniaoID:'r'+i,CelulaID:'${c1}',Data:'2026-10-0'+(i+1),MembroID:'${d}'})}})()`);
  e.call('saveMapaCfg', { sedeLat: -23.55, sedeLng: -46.63 }, adm);
}
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
