# Início: o administrador edita blocos e o tamanho das fotos também no celular
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
def entra(b,vw,vh,email='admin@zoe.com',senha='SenhaForte123'):
    ctx=b.new_context(viewport={'width':vw,'height':vh}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')"); return pg
with sync_playwright() as p:
    b=p.chromium.launch(); m=entra(b,390,844)
    m.evaluate("go('feed')"); m.wait_for_selector('#hgrid .hb')
    m.evaluate("api('saveEvent',{titulo:'Retiro',data:'2099-01-10',hora:'19:00',local:'Templo'}).catch(()=>0)")
    m.click('button:has-text("Personalizar início")'); m.wait_for_selector('.hltb'); m.wait_for_selector('.hgrid.ed .hb.ed')
    assert m.evaluate("getComputedStyle(document.querySelector('#hgrid')).display")=='grid'   # grade de 12 colunas também no celular
    # redimensiona um bloco pelo canto, com toque/mouse
    bl=m.query_selector('.hb[data-id="aniv"]'); m.evaluate("document.querySelector('.hb[data-id=aniv]').scrollIntoView({block:'center',behavior:'instant'})")
    w0=m.evaluate("HL.draft.find(x=>x.id==='aniv').w"); h0=m.evaluate("HL.draft.find(x=>x.id==='aniv').h")
    m.wait_for_timeout(500); c=m.query_selector('.hb[data-id="aniv"] .hbc').bounding_box(); m.mouse.move(c['x']+6,c['y']+6); m.mouse.down(); m.mouse.move(c['x']+90,c['y']+70,steps=8); m.mouse.up()
    w1=m.evaluate("HL.draft.find(x=>x.id==='aniv').w"); h1=m.evaluate("HL.draft.find(x=>x.id==='aniv').h"); assert w1>w0 or h1>h0,(w0,h0,w1,h1)
    # altura das fotos do carrossel de eventos
    m.evaluate("document.querySelector('.hb[data-id=eventos]').scrollIntoView({block:'center',behavior:'instant'})")
    m.wait_for_timeout(500); g=m.query_selector('.hb[data-id="eventos"] .hbf .grip'); assert g
    bx=g.bounding_box(); m.mouse.move(bx['x']+10,bx['y']+10); m.mouse.down(); m.mouse.move(bx['x']+10,bx['y']+140,steps=8); m.mouse.up()
    fh=m.evaluate("HL.draft.find(x=>x.id==='eventos').fh"); assert fh>=200,fh
    m.click('.hb[data-id="eventos"] .hbf button:has-text("Preencher")'); assert m.evaluate("HL.draft.find(x=>x.id==='eventos').fit")=='contain'
    m.click('button:has-text("Salvar para todos")'); m.wait_for_selector('.hltb',state='detached')
    # outro aparelho (desktop): a foto respeita a altura salva
    d=entra(b,1300,900); d.evaluate("go('feed')"); d.wait_for_selector('#hgrid .hb[data-id="eventos"]')
    v=d.evaluate("getComputedStyle(document.querySelector('.hb[data-id=eventos]')).getPropertyValue('--fh').trim()"); assert v==f'{fh}px',(v,fh)
    assert d.evaluate("S.homeLayout.find(x=>x.id==='eventos').fit")=='contain'
    assert not errs,errs
    print('OK inicio foto')
