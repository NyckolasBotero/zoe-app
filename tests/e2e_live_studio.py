# Zoe Live Studio: layout tipo OBS, fontes novas, cenas, tela cheia e balões de comentário
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']); pg=b.new_page(viewport={'width':1500,'height':950}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept('Cena nova' if 'Nome' in d.message else 'Renomeada'))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1',timeout=20000); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("go('multimidia');mmArea('live')"); pg.wait_for_selector('#stu',timeout=10000); pg.wait_for_timeout(800)
    t=pg.inner_text('#stu'); assert 'Zoe Live Studio' in t and 'PRÉ-VISUALIZAÇÃO' in t and 'PROGRAMA' in t
    for sec in ['Cenas','Fontes','Mixer de áudio','Controles']: assert pg.locator(f'section[aria-label="{sec}"]').count()==1,sec
    n0=pg.evaluate("ST.cenas.length")
    # cenas: criar, renomear, duplicar, mover
    pg.click('#st_cenasf button[aria-label="Nova cena"]'); pg.wait_for_selector('#st_dlgi'); pg.fill('#st_dlgi','Cena nova'); pg.click('#st_dlgok'); pg.wait_for_timeout(200); assert pg.evaluate("ST.cenas.length")==n0+1
    pg.click('#st_cenasf button[aria-label="Renomear cena"]'); pg.wait_for_selector('#st_dlgi'); pg.fill('#st_dlgi','Renomeada'); pg.click('#st_dlgok'); pg.wait_for_timeout(200); assert pg.evaluate("stCena(ST.prev).nome")=='Renomeada'
    pg.click('#st_cenasf button[aria-label="Duplicar cena"]'); assert pg.evaluate("ST.cenas.length")==n0+2
    pg.click('#st_cenasf button[aria-label="Subir cena"]')
    # fontes novas
    pg.evaluate("ST.prev=ST.cenas[0].id;stRenderUI()")
    for k in ['relogio','contagem','logo','cor','texto']: pg.evaluate(f"stAddCamada('{k}')")
    pg.evaluate("stAddCamada('cena')"); assert pg.evaluate("stEdit().camadas.some(l=>l.tipo==='cena')")
    pg.wait_for_timeout(600); assert pg.locator('#st_fontes .st-it').count()>=6
    # menu de adicionar + propriedades + travar + opacidade
    pg.click('#st_fontesf button[aria-label="Adicionar fonte"]'); pg.wait_for_selector('.st-addb'); assert pg.locator('.st-addb').count()>=12; pg.click('.st-mb button:has-text("Fechar")')
    pg.click('#st_fontesf button[aria-label="Propriedades"]'); pg.wait_for_selector('.st-mb h3:has-text("Propriedades")'); pg.fill('.st-mb input[type=range] >> nth=-1','50'); pg.click('.st-mb button:has-text("Pronto")')
    pg.click('#st_fontes .st-it >> nth=0 >> button[aria-label="Travar"]'); assert pg.evaluate("stEdit().camadas[stEdit().camadas.length-1].lock")
    # coloca no ar e confere desenho sem erros
    pg.evaluate("stProgDireto(ST.prev)"); pg.wait_for_timeout(800)
    # balões de comentário
    pg.click('#st_ctl button:has-text("Testar balão")'); pg.wait_for_selector('.st-bl .st-rd',timeout=3000); assert pg.locator('.st-bl').count()==1
    pg.evaluate("ST.com.push({rede:'youtube',autor:'Ana',texto:'oi'});ST.com.push({rede:'instagram',autor:'Léo',texto:'amém'});stComUI()"); assert pg.locator('.st-bl').count()==3
    # tela cheia
    pg.click('#st_barra button:has-text("Tela cheia")'); pg.wait_for_timeout(500); assert pg.evaluate("document.querySelector('#stu').classList.contains('st-full')")
    pg.screenshot(path='/tmp/live_full.png')
    pg.click('#st_barra button:has-text("Sair da tela cheia")'); pg.wait_for_timeout(300); assert not pg.evaluate("document.querySelector('#stu').classList.contains('st-full')")
    pg.screenshot(path='/tmp/live.png')
    # mobile
    pg.set_viewport_size({'width':420,'height':900}); pg.wait_for_timeout(500); assert pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth+2"),'sem rolagem horizontal'
    print('ERROS:',errs); assert not errs; print('E2E LIVE STUDIO OK')
