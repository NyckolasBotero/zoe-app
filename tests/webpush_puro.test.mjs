import vm from 'node:vm'; import fs from 'node:fs'; import crypto from 'node:crypto';
const sgn=(b)=>[...b].map(x=>x>127?x-256:x);
const U={newBlob:(s)=>({getBytes:()=>sgn(Buffer.from(s))}),computeHmacSha256Signature:(v,k)=>sgn(crypto.createHmac('sha256',Buffer.from(k.map(x=>x&255))).update(Buffer.from(v.map(x=>x&255))).digest()),computeDigest:(a,v)=>sgn(crypto.createHash('sha256').update(Buffer.from(v.map(x=>x&255))).digest()),DigestAlgorithm:{SHA_256:1},getUuid:()=>crypto.randomUUID()};
const ctx=vm.createContext({Utilities:U,Math,Date,JSON,BigInt,Error,Array,String,Number});
vm.runInContext((()=>{const g=fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');return g.slice(g.indexOf('/* ===== Web Push direto'),g.indexOf('/* ===== Notificações no aparelho'))})()+'\nthis.WP_=WP_;this.P256_=P256_;',ctx);
const W=ctx.WP_; const as=(a)=>Buffer.from(a);
// 1) AES-GCM vs node
const key=crypto.randomBytes(16),iv=crypto.randomBytes(12),pt=crypto.randomBytes(77);
const c=crypto.createCipheriv('aes-128-gcm',key,iv);const ref=Buffer.concat([c.update(pt),c.final(),c.getAuthTag()]);
const mine=as(W.gcm([...key],[...iv],[...pt])); if(!mine.equals(ref)){console.error('FALHOU AES-GCM');process.exit(1)}
// 2) chave pública e ECDH vs node
const d=W.chavePriv(),pub=W.pub(d);const e=crypto.createECDH('prime256v1');e.setPrivateKey(Buffer.from(W.big2b(d,32)));
if(!as(pub).equals(e.getPublicKey())){console.error('FALHOU pub');process.exit(1)}
const o=crypto.createECDH('prime256v1');o.generateKeys();const sh=as(W.ecdh(d,[...o.getPublicKey()]));if(!sh.equals(e.computeSecret(o.getPublicKey()))){console.error('FALHOU ecdh');process.exit(1)}
// 3) ECDSA verificado pelo node
const jwt=W.jwt('https://fcm.googleapis.com',d,'mailto:a@b.com');const [h,p,s]=jwt.split('.');
const kk=crypto.createPublicKey({key:{kty:'EC',crv:'P-256',x:as(pub.slice(1,33)).toString('base64url'),y:as(pub.slice(33,65)).toString('base64url')},format:'jwk'});
if(!crypto.verify('sha256',Buffer.from(h+'.'+p),{key:kk,dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url'))){console.error('FALHOU ES256');process.exit(1)}
// 4) fluxo completo (RFC 8291) decifrado como o navegador
const ua=crypto.createECDH('prime256v1');ua.generateKeys();const auth=crypto.randomBytes(16);
const t0=Date.now();const b=as(W.cifra({title:'Olá',body:'Mensagem ✨'},{keys:{p256dh:ua.getPublicKey().toString('base64url'),auth:auth.toString('base64url')}}));const ms=Date.now()-t0;
const salt=b.subarray(0,16),idl=b[20],asPub=b.subarray(21,21+idl),ci=b.subarray(21+idl);
const shared=ua.computeSecret(asPub),hk=(s2,i,inf,n)=>Buffer.from(crypto.hkdfSync('sha256',i,s2,inf,n));
const ikm=hk(auth,shared,Buffer.concat([Buffer.from('WebPush: info\0'),ua.getPublicKey(),asPub]),32);
const dc=crypto.createDecipheriv('aes-128-gcm',hk(salt,ikm,Buffer.from('Content-Encoding: aes128gcm\0'),16),hk(salt,ikm,Buffer.from('Content-Encoding: nonce\0'),12));
dc.setAuthTag(ci.subarray(ci.length-16));const cl=Buffer.concat([dc.update(ci.subarray(0,ci.length-16)),dc.final()]);
const js=JSON.parse(cl.subarray(0,cl.lastIndexOf(2)).toString());if(js.title!=='Olá'||!js.body.includes('✨')){console.error('FALHOU conteúdo');process.exit(1)}
console.log('OK web push puro, cifra em',ms,'ms');
