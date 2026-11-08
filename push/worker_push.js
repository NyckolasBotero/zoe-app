/* Zoe: servidor de notificações push (Cloudflare Worker, plano gratuito).
   Recebe do Apps Script a lista de aparelhos com a mensagem de cada um e entrega via Web Push (RFC 8030/8291/8292).
   Variáveis (Settings > Variables and Secrets, tipo Secret): SEGREDO, VAPID_PUBLICA, VAPID_PRIVADA. Sem dependências. */
const b64u = {
  dec(s){ s = String(s).replace(/-/g,'+').replace(/_/g,'/'); while(s.length % 4) s += '='; const b = atob(s), o = new Uint8Array(b.length); for(let i=0;i<b.length;i++) o[i] = b.charCodeAt(i); return o; },
  enc(u){ let s = ''; u = new Uint8Array(u); for(let i=0;i<u.length;i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
};
const cat = (...a)=>{ const n = a.reduce((s,x)=>s+x.length,0), o = new Uint8Array(n); let p = 0; a.forEach(x=>{ o.set(x,p); p+=x.length; }); return o; };
const enc = new TextEncoder();
async function chaveEcdh(privD, pub){
  return crypto.subtle.importKey('jwk', { kty:'EC', crv:'P-256', d:b64u.enc(privD), x:b64u.enc(pub.slice(1,33)), y:b64u.enc(pub.slice(33,65)), ext:true }, { name:'ECDH', namedCurve:'P-256' }, false, ['deriveBits']);
}
async function hkdf(salt, ikm, info, bytes){
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name:'HKDF', hash:'SHA-256', salt, info }, k, bytes*8));
}
/** Criptografia aes128gcm (RFC 8291). `fixo` só é usado nos testes (chave efêmera e sal conhecidos). */
export async function criptografar(texto, uaPublica, authSecret, fixo){
  let asPub, asPrivD;
  if(fixo){ asPub = fixo.pub; asPrivD = fixo.priv; }
  else{
    const par = await crypto.subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, true, ['deriveBits']);
    const j = await crypto.subtle.exportKey('jwk', par.privateKey);
    asPrivD = b64u.dec(j.d); asPub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  }
  const uaKey = await crypto.subtle.importKey('raw', uaPublica, { name:'ECDH', namedCurve:'P-256' }, false, []);
  const priv = await chaveEcdh(asPrivD, asPub);
  const segredo = new Uint8Array(await crypto.subtle.deriveBits({ name:'ECDH', public:uaKey }, priv, 256));
  const ikm = await hkdf(authSecret, segredo, cat(enc.encode('WebPush: info\0'), uaPublica, asPub), 32);
  const sal = (fixo && fixo.salt) || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const chave = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const claro = cat(enc.encode(texto), new Uint8Array([2]));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv:nonce }, chave, claro));
  return cat(sal, new Uint8Array([0,0,0x10,0,65]), asPub, cifrado);
}
async function jwtVapid(aud, env){
  const pub = b64u.dec(env.VAPID_PUBLICA);
  const k = await crypto.subtle.importKey('jwk', { kty:'EC', crv:'P-256', d:env.VAPID_PRIVADA, x:b64u.enc(pub.slice(1,33)), y:b64u.enc(pub.slice(33,65)), ext:true }, { name:'ECDSA', namedCurve:'P-256' }, false, ['sign']);
  const cab = b64u.enc(enc.encode(JSON.stringify({ typ:'JWT', alg:'ES256' })));
  const cor = b64u.enc(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now()/1000) + 12*3600, sub: env.VAPID_ASSUNTO || 'mailto:contato@mczoe.com.br' })));
  const ass = new Uint8Array(await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, k, enc.encode(cab + '.' + cor)));
  return cab + '.' + cor + '.' + b64u.enc(ass);
}
async function enviar(sub, payload, env){
  const corpo = await criptografar(JSON.stringify(payload), b64u.dec(sub.keys.p256dh), b64u.dec(sub.keys.auth));
  const aud = new URL(sub.endpoint).origin;
  const r = await fetch(sub.endpoint, { method:'POST', body:corpo, headers:{
    'Authorization': `vapid t=${await jwtVapid(aud, env)}, k=${env.VAPID_PUBLICA}`,
    'Content-Encoding':'aes128gcm', 'Content-Type':'application/octet-stream', 'TTL':'86400', 'Urgency':'high' } });
  return r.status;
}
/** IA gratuita (Cloudflare Workers AI) para o quiz das lições. Precisa do vínculo "AI" (Settings > Bindings > Workers AI). */
async function ia(d, env){
  const json = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers:{ 'Content-Type':'application/json' } });
  if(!env.AI) return json({ ok:false, erro:'Vínculo "AI" não configurado no Worker' }, 501);
  const prompt = String(d.prompt || '').slice(0, 9000); if(!prompt) return json({ ok:false, erro:'sem texto' }, 400);
  try{
    const r = await env.AI.run(env.IA_MODELO || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages:[{ role:'system', content:'Você responde sempre em português do Brasil e exatamente no formato pedido.' }, { role:'user', content:prompt }], max_tokens: Math.min(+d.max_tokens || 1500, 2500), temperature: 0.4 });
    const t = r && (typeof r.response === 'string' ? r.response : JSON.stringify(r.response || r));
    return json({ ok:true, texto: String(t || ''), usage: r && r.usage ? { prompt_tokens: r.usage.prompt_tokens, completion_tokens: r.usage.completion_tokens } : undefined });
  }catch(e){ return json({ ok:false, erro:String(e && e.message || e).slice(0, 160) }, 502); }
}
export default {
  async fetch(req, env){
    if(req.method !== 'POST') return new Response('Zoe: servidor de notificações', { status:200 });
    if(!env.SEGREDO || req.headers.get('X-Segredo') !== env.SEGREDO) return new Response('não autorizado', { status:401 });
    let d; try{ d = await req.json(); }catch(e){ return new Response('json inválido', { status:400 }); }
    if(new URL(req.url).pathname === '/ia') return ia(d, env);
    const res = await Promise.all((d.itens||[]).slice(0,50).map(async it=>{
      try{ return { endpoint:it.sub.endpoint, status: await enviar(it.sub, it.payload, env) }; }catch(e){ return { endpoint:it.sub && it.sub.endpoint, status:0, erro:String(e && e.message || e).slice(0,120) }; }
    }));
    return new Response(JSON.stringify({ ok:true, resultados:res }), { headers:{ 'Content-Type':'application/json' } });
  }
};
