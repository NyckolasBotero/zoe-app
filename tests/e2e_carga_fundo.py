# Carga de fundo no servidor: registro de uso a cada 2 min, chat com menos consultas e telão que não empilha consultas lentas
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
INIT="""
(()=>{const si=window.setInterval;window.__iv=[];window.setInterval=function(f,t,...r){window.__iv.push(t);return si.call(this,f,t,...r)};
const of=window.fetch;window.__inf=0;window.__max=0;window.__cnt={};window.__slow=false;
window.fetch=async function(u,o){let a='';try{a=JSON.parse(o.body).action}catch(e){}window.__cnt[a]=(window.__cnt[a]||0)+1;
 if(a==='getTelao'&&window.__slow){window.__inf++;window.__max=Math.max(window.__max,window.__inf);await new Promise(r=>setTimeout(r,4000));try{return await of.apply(this,arguments)}finally{window.__inf--}}
 return of.apply(this,arguments)}})();
"""
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1280,'height':900}); a=ctx.new_page(); a.on('pageerror',lambda e:errs.append(str(e)))
    a.add_init_script(INIT); a.goto(URL); a.add_style_tag(content='#pushbar{display:none!important}')
    a.wait_for_selector('#lg_e'); a.fill('#lg_e','admin@zoe.com'); a.fill('#lg_s','SenhaForte123'); a.click('#lg_b'); a.wait_for_selector('#view h1'); a.wait_for_selector('#splash',state='detached',timeout=15000)
    # registro de uso: envia a cada 2 min (e conta o tempo a cada 30 s localmente, para o limite de 60 s por contagem não cortar o tempo online)
    iv=a.evaluate("window.__iv"); assert 120000 in iv and 45000 not in iv, iv
    a.evaluate("trkStart()"); a.wait_for_timeout(300)
    a.evaluate("TRK.last=Date.now()-50000;TRK.tela='inicio';TRK.buf={}"); a.evaluate("trkTick()"); seg=a.evaluate("TRK.buf.inicio"); assert 49<=seg<=52, seg
    # chat com uma conversa aberta: a consulta da conversa continua a cada 2,5 s, mas a lista só a cada 5 ciclos
    r=a.evaluate("api('createUser',{email:'bia@zoe.com',nome:'Bia Teste',senha:'Temp12345',papel:'membro'})"); mid=r['membroId']
    a.evaluate("chAbreCom('%s','Bia Teste')"%mid); a.wait_for_selector('#chatp .chb'); a.wait_for_timeout(600); a.evaluate("window.__cnt={}"); a.wait_for_timeout(8000)
    c=a.evaluate("window.__cnt"); assert c.get('getChat',0)>=2, c; assert c.get('listChats',0)<=1, ('a lista não pode ser consultada a cada ciclo',c)
    a.evaluate("chFecha()"); assert a.evaluate("window.__iv[window.__iv.length-1]")==30000, 'chat fechado consulta a cada 30 s'
    # telão: com o servidor lento (4 s por resposta) nunca há duas consultas ao mesmo tempo
    a.evaluate("window.__slow=true;go('multimidia')"); a.wait_for_selector('#view h1'); a.evaluate("MM.sub='remoto'"); a.evaluate("window.__cnt={}"); a.wait_for_timeout(9000)
    c=a.evaluate("window.__cnt"); mx=a.evaluate("window.__max"); assert c.get('getTelao',0)>=1, c; assert mx==1, ('consultas do telão empilhadas',mx,c)
    print('ERROS JS:',errs); assert not errs
    b.close(); print('OK carga de fundo')
