# Zoe Live Studio v1.167: redimensionar livre, régua/guias, cursor, proporção, menu de camada, arrastar na lista, atalhos de efeito
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']); pg=b.new_page(viewport={'width':1500,'height':950}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1',timeout=20000)
    pg.evaluate("go('multimidia');mmArea('live')"); pg.wait_for_selector('#stu',timeout=10000); pg.wait_for_timeout(800)
    pg.evaluate("(()=>{const c={id:'t1',nome:'T',camadas:[]};ST.cenas.push(c);ST.prev='t1';stAddCamada('cor');stAddCamada('texto');stAddCamada('logo');const l=c.camadas[2];l.x=.3;l.y=.3;l.w=.3;l.h=.3;l.ar=false;ST.sel=l.id;stRenderUI()})()"); pg.wait_for_timeout(500)
    lid=pg.evaluate("stEdit().camadas[2].id"); bb=pg.locator('#st_pv canvas').bounding_box()
    px=lambda fx,fy:(bb['x']+bb['width']*fx,bb['y']+bb['height']*fy)
    # cursor muda sobre as alças
    for (fx,fy,cur) in [(.6,.6,'nwse-resize'),(.3,.3,'nwse-resize'),(.6,.3,'nesw-resize'),(.6,.45,'ew-resize'),(.45,.6,'ns-resize'),(.45,.45,'move')]:
        pg.mouse.move(*px(fx,fy)); pg.wait_for_timeout(60); c=pg.evaluate("document.querySelector('#st_pv canvas').style.cursor"); assert c==cur,(fx,fy,c,cur)
    # redimensiona livre pela alça direita (sem travar proporção): só a largura muda
    w0=pg.evaluate(f"stAchaCamada('{lid}').w"); h0=pg.evaluate(f"stAchaCamada('{lid}').h")
    pg.mouse.move(*px(.6,.45)); pg.mouse.down(); pg.mouse.move(*px(.75,.45),steps=5)
    pg.screenshot(path='/tmp/live167_drag.png')
    pg.mouse.up(); w1=pg.evaluate(f"stAchaCamada('{lid}').w"); h1=pg.evaluate(f"stAchaCamada('{lid}').h"); assert w1>w0+.08 and abs(h1-h0)<1e-6,(w0,w1,h0,h1)
    # proporção travada: arrastar o canto mantém a razão
    pg.evaluate(f"stAchaCamada('{lid}').ar=true"); r0=pg.evaluate(f"(()=>{{const l=stAchaCamada('{lid}');return l.w/l.h}})()")
    l=pg.evaluate(f"(()=>{{const l=stAchaCamada('{lid}');return [l.x,l.y,l.w,l.h]}})()")
    pg.mouse.move(*px(l[0]+l[2],l[1]+l[3])); pg.mouse.down(); pg.mouse.move(*px(l[0]+l[2]+.1,l[1]+l[3]+.02),steps=5); pg.mouse.up()
    r1=pg.evaluate(f"(()=>{{const l=stAchaCamada('{lid}');return l.w/l.h}})()"); assert abs(r1-r0)<1e-6,(r0,r1)
    # guias: arrastar perto do centro encaixa
    pg.evaluate(f"(()=>{{const l=stAchaCamada('{lid}');l.x=.3;l.y=.3;l.w=.3;l.h=.3;l.ar=false}})()")
    pg.mouse.move(*px(.45,.45)); pg.mouse.down(); pg.mouse.move(*px(.505,.45),steps=6); gx=pg.evaluate("ST.guias.vx.length"); pg.mouse.up(); assert gx>=1,'sem guia'
    # menu de camada com botão direito
    pg.mouse.click(*px(.5,.5),button='right'); pg.wait_for_selector('.st-cm'); assert 'Trazer para a frente' in pg.inner_text('.st-cm')
    n0=pg.evaluate("stEdit().camadas.findIndex(l=>l.id==='"+lid+"')"); pg.click('.st-cm button:has-text("Enviar para trás")'); assert pg.evaluate("stEdit().camadas[0].id")==lid
    pg.click('#st_fontes .st-it:has-text("Logotipo")',button='right'); pg.wait_for_selector('.st-cm'); pg.click('.st-cm button:has-text("Trazer para a frente")'); assert pg.evaluate("stEdit().camadas[stEdit().camadas.length-1].id")==lid
    # arrastar na lista de Fontes reordena
    pg.evaluate("stLDrag({}, stEdit().camadas[0].id)"); ids=pg.evaluate("stEdit().camadas.map(l=>l.id)")
    pg.evaluate("(()=>{const el=document.querySelector('#st_fontes .st-it');const ev={preventDefault(){},stopPropagation(){},clientY:el.getBoundingClientRect().top+2,currentTarget:el};stLDrop(ev,stEdit().camadas[stEdit().camadas.length-1].id)})()")
    assert pg.evaluate("stEdit().camadas.map(l=>l.id)")!=ids
    # atalhos de efeito
    assert pg.locator('.st-fx').count()>=9
    pg.click('.st-fx:has-text("Zoom") .st-fxb'); assert pg.evaluate("ST.trans.tipo")=='zoom' and pg.evaluate("!!ST.TRp")
    pg.wait_for_timeout(900); assert pg.evaluate("!ST.TRp")
    pg.evaluate("ST.trans.tipo='iris';ST.trans.dur=1300;stTransUI()"); pg.click('#st_trans button:has-text("Salvar efeito atual")'); pg.wait_for_selector('#st_dlgi'); pg.fill('#st_dlgi','Meu íris'); pg.click('#st_dlgok'); pg.wait_for_timeout(200)
    assert pg.evaluate("ST.fx.length")==1 and pg.locator('.st-fx:has-text("Meu íris")').count()==1
    pg.evaluate("ST.prev=ST.cenas[0].id"); pg.click('.st-fx:has-text("Meu íris") button[aria-label^="Colocar no ar"]'); pg.wait_for_timeout(300); assert pg.evaluate("!!ST.TR||ST.prog===ST.cenas[0].id")
    pg.wait_for_timeout(1500); pg.screenshot(path='/tmp/live167.png')
    print('ERROS:',errs); assert not errs; print('E2E LIVE v167 OK')
