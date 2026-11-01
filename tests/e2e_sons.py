# Som e animação: chat (som_chat) e sino (notificação sino)
from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,1280,900)
    pg.add_style_tag(content='#pushbar{display:none!important}')
    pg.evaluate("window.__tocou=[];const o=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__tocou.push(String(this.src||'').slice(0,22)+'|'+this.muted);return Promise.resolve()}")
    # sino
    pg.evaluate("sinoAviso()"); assert pg.evaluate("document.getElementById('bb').classList.contains('ring')"); pg.wait_for_timeout(2400); assert not pg.evaluate("document.getElementById('bb').classList.contains('ring')")
    assert pg.evaluate("window.__tocou.some(x=>x.includes('audio/mpeg')&&x.endsWith('false'))")
    # botão de teste em Meu perfil > Configurações: o sino de fato gira e salta
    pg.evaluate("R.sub.perfil='conf';go('meu','editar')"); pg.wait_for_selector('#bt_sino'); pg.evaluate("window.__tocou=[]"); pg.click('#bt_sino'); pg.wait_for_timeout(750)
    t=pg.evaluate("[getComputedStyle(document.querySelector('#bb svg')).transform,getComputedStyle(document.getElementById('bb')).transform]"); print('TRANSF',t); assert t[0]!='none' and t[1]!='none'
    assert pg.evaluate("window.__tocou.length")>=1; pg.wait_for_timeout(2300)
    # chat: baseline e depois uma mensagem nova não lida
    pg.evaluate("chTick()"); pg.wait_for_timeout(600); pg.evaluate("window.__tocou=[]")
    pg.evaluate("window.__api0=api;void 0"); pg.evaluate("api=async function(a,d){return a==='listChats'?{naoLidas:(window.__nl=(window.__nl||0)+1),conversas:[]}:window.__api0(a,d)};void 0"); pg.evaluate("CH.tot=0;void 0"); pg.evaluate("chTick().then(()=>1)"); pg.wait_for_function("document.getElementById('bch').classList.contains('ping')",timeout=4000)
    assert pg.evaluate("window.__tocou.length")>=1
    # mesma contagem: não toca de novo
    pg.evaluate("window.__tocou=[];CH.tot=5;window.__nl=4"); pg.evaluate("chTick()"); pg.wait_for_timeout(800); assert pg.evaluate("window.__tocou.length")==0
    # mensagem de teste chegando: som + pulo + selo + conversa na lista, tudo junto
    pg.reload(); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("window.__tocou=[];const o=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__tocou.push(1);return Promise.resolve()}")
    pg.add_style_tag(content='#pushbar{display:none!important}'); pg.evaluate("chTick()"); pg.wait_for_timeout(800)
    pg.evaluate("testaMsg()"); pg.wait_for_function("document.getElementById('bch').classList.contains('ping')",timeout=8000)
    assert pg.evaluate("window.__tocou.length")>=1; assert pg.inner_text('#bch .dot').strip()=='1'; assert pg.evaluate("CH.simDt")<1500,pg.evaluate("CH.simDt")
    pg.click('#bch'); pg.wait_for_selector('.chr:has-text("Teste da Zoe")'); pg.click('.chr:has-text("Teste da Zoe")'); pg.wait_for_selector('text=mensagem de teste da Zoe'); pg.wait_for_timeout(600)
    pg.evaluate("chTick()"); pg.wait_for_timeout(600); assert not pg.query_selector('#bch .dot'),'depois de lida o selo some'
    print('ERRS',errs); assert not errs
print('OK sons')
