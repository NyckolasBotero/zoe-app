# Cutscene do Sod, liga/desliga do Sod pela administração, pedido de instalar o app e ativar notificações
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
def entra(b,vw=1300,vh=900,ua=None,email='admin@zoe.com',senha='SenhaForte123'):
    ctx=b.new_context(viewport={'width':vw,'height':vh},user_agent=ua) if ua else b.new_context(viewport={'width':vw,'height':vh}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')"); return pg
IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b)
    # --- cutscene: abre sozinha na primeira visita ao Sod e some depois de vista
    pg.evaluate("localStorage.removeItem('zoe-sodcut');go('meu');sub('meu','sod')"); pg.wait_for_selector('#sodcut',timeout=8000)
    assert 'luz' in pg.inner_text('#sodcut').lower()
    n=pg.evaluate("SC.length"); assert n==8,n
    for i in range(n-1): pg.click('#sodcut .sc-btn .btn:last-child'); pg.wait_for_timeout(60)
    assert 'Pronto para começar' in pg.inner_text('#sodcut'); pg.screenshot(path='/tmp/sodcut_fim.png')
    pg.click('#sodcut .sc-btn .btn:last-child'); pg.wait_for_selector('#sodcut',state='detached')
    assert pg.evaluate("localStorage.getItem('zoe-sodcut')")=='1'
    pg.evaluate("render()"); pg.wait_for_timeout(900); assert not pg.query_selector('#sodcut'),'não reabre sozinha'
    pg.click('button:has-text("Ver a história")'); pg.wait_for_selector('#sodcut'); pg.keyboard.press('Escape'); pg.wait_for_selector('#sodcut',state='detached')
    # --- liga/desliga (administração)
    assert pg.query_selector('.pfnav button:has-text("Sod")')
    pg.evaluate("go('admin');admGrupo('def')"); pg.wait_for_selector('text=Sod (gamificação)'); pg.click('button:has-text("Desativar o Sod")'); pg.wait_for_function("S.sodOn===false")
    assert 'Desativado' in pg.inner_text('#view')
    pg.evaluate("go('meu')"); assert not pg.query_selector('.pfnav button:has-text("Sod")') and not pg.query_selector('#sd_pfbox')
    pg.evaluate("go('feed')"); pg.wait_for_selector('#hgrid .hb'); assert not pg.query_selector('#sd_home')
    pg.reload(); pg.wait_for_selector('#splash',state='detached',timeout=15000); assert pg.evaluate("S.sodOn")==False
    pg.evaluate("go('admin');admGrupo('def')"); pg.click('button:has-text("Ativar o Sod")'); pg.wait_for_function("S.sodOn===true")
    # --- instalar o app (iPhone no Safari) e ativar notificações
    ph=entra(b,390,844,IOS); ph.wait_for_selector('#pushbar:not([hidden])',timeout=9000); t=ph.inner_text('#pushbar'); assert 'Instale o app' in t and 'iPhone' in t,t
    ph.click('#pushbar button:has-text("Como instalar")'); ph.wait_for_selector('.modal'); assert 'Adicionar à Tela de Início' in ph.inner_text('.modal'); ph.click('.modal button:has-text("Entendi")')
    ph.click('#pushbar button:has-text("Agora não")'); assert ph.evaluate("document.querySelector('#pushbar').hidden")
    ph.screenshot(path='/tmp/push_ios.png')
    d=entra(b)  # computador: já instalado (simulado) e sem permissão → pede para ativar
    d.evaluate("Object.defineProperty(Notification,'permission',{get:()=>'default',configurable:true});PU.forca=true;PU.key='B'+'x'.repeat(86);pushBarra()"); d.wait_for_selector('#pushbar:not([hidden])'); assert 'Ative as notificações' in d.inner_text('#pushbar') and d.query_selector('#pushbar button:has-text("Ativar notificações")')
    d.evaluate("Object.defineProperty(Notification,'permission',{get:()=>'denied',configurable:true});pushBarra()"); assert 'bloqueadas' in d.inner_text('#pushbar')
    d.evaluate("Object.defineProperty(Notification,'permission',{get:()=>'granted',configurable:true});PU.ok=true;pushBarra()"); assert d.evaluate("document.querySelector('#pushbar').hidden")
    assert not errs,errs
    print('OK sod push')
