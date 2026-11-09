# Zoe Live Studio v1.166: movimento de câmera, PiP, texto corrido, letra/versículo, tarjas, YouTube e setups
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']); pg=b.new_page(viewport={'width':1500,'height':950}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1',timeout=20000)
    pg.evaluate("go('multimidia');mmArea('live')"); pg.wait_for_selector('#stu',timeout=10000); pg.wait_for_timeout(800)
    # menu com as fontes novas
    pg.click('#st_fontesf button[aria-label="Adicionar fonte"]'); pg.wait_for_selector('.st-addb'); assert pg.locator('.st-addb').count()>=17; pg.click('.st-mb button:has-text("Fechar")')
    pg.evaluate("ST.prev=ST.cenas[1].id;stRenderUI()")
    for k in ['pip','ticker','letra','versiculo','tarja']: pg.evaluate(f"stAddCamada('{k}')")
    tipos=pg.evaluate("stEdit().camadas.map(l=>l.tipo)"); assert all(k in tipos for k in ['pip','ticker','letra','versiculo','tarja']),tipos
    # propriedades de cada uma abrem sem erro
    for k in ['pip','ticker','letra','versiculo','tarja']:
        pg.evaluate(f"stProps(stEdit().camadas.find(l=>l.tipo==='{k}').id)"); pg.wait_for_selector('.st-mb .st-props'); pg.click('.st-mb button:has-text("Pronto")')
    # projeção -> letra aparece; versículo não
    pg.evaluate("ST.tm.unit={titulo:'Grande é o Senhor',artista:'Zoe',letra:'x'};ST.tm.slides=['Grande é o Senhor\\ne digno de louvor'];ST.tm.i=0;ST.tm.pausado=false;stProgDireto(ST.prev)"); pg.wait_for_timeout(900)
    cv=pg.evaluate("(()=>{const c=ST.cv,g=c.getContext('2d');const W=c.width,H=c.height;const d=g.getImageData(Math.round(W*.5),Math.round(H*.8),1,1).data;return Array.from(d)})()"); print('pixel legenda',cv)
    # tarja: oculta no ar até mostrar
    tid=pg.evaluate("stEdit().camadas.find(l=>l.tipo==='tarja').id")
    assert pg.evaluate(f"stTzP(stAchaCamada('{tid}'))")==0
    pg.evaluate(f"stTarjaToggle('{tid}',true)"); pg.wait_for_timeout(800); assert pg.evaluate(f"stTzP(stAchaCamada('{tid}'))")>=.99
    assert pg.locator('#st_ctl .st-ovr').count()>=4,'seção No ar'
    # 5 modelos de tarja desenham sem erro
    for m in ['classico','jornal','manchete','minimo','vidro']: pg.evaluate(f"stAchaCamada('{tid}').p.modelo='{m}'"); pg.wait_for_timeout(150)
    # lista de pastores
    pg.evaluate(f"stPastorAdd('{tid}')"); assert pg.evaluate("ST.pastores.length")==1; pg.click('.st-mb button:has-text("Pronto")') if pg.locator('.st-mb button:has-text("Pronto")').count() else None
    # movimento de câmera
    pg.evaluate("stAddCamada('camera')"); cid=pg.evaluate("stEdit().camadas.find(l=>l.tipo==='camera').id")
    pg.evaluate(f"stProps('{cid}')"); pg.wait_for_selector('#st_movbox'); pg.click('#st_movbox button:has-text("Panorâmica →")'); pg.wait_for_selector('#st_mvc')
    assert pg.evaluate(f"stAchaCamada('{cid}').mov.pts.length")==2
    pg.click('#st_movbox button:has-text("+ Ponto")'); assert pg.evaluate(f"stAchaCamada('{cid}').mov.pts.length")==3
    pg.click('#st_movbox button:has-text("− Remover")'); assert pg.evaluate(f"stAchaCamada('{cid}').mov.pts.length")==2
    v0=pg.evaluate(f"(()=>{{const l=stAchaCamada('{cid}');return stInterp(l.mov,0)}})()"); v1=pg.evaluate(f"(()=>{{const l=stAchaCamada('{cid}');return stInterp(l.mov,999)}})()")
    assert abs(v0['cx']-.2)<1e-6 and abs(v1['cx']-.8)<1e-6,(v0,v1)
    pg.click('#st_movbox button:has-text("Executar no ar")'); pg.click('.st-mb button:has-text("Pronto")')
    # setup: salvar, mudar, carregar
    n=pg.evaluate("ST.cenas.length")
    pg.click('#st_ctl button:has-text("Setups")'); pg.wait_for_selector('#su_n'); pg.wait_for_timeout(500); pg.fill('#su_n','Culto teste'); pg.click('.st-mb button:has-text("Salvar")'); pg.wait_for_timeout(800)
    print('SUL:',pg.inner_text('.st-sul')[:200], '|', pg.evaluate("(document.querySelector('.toast')||{}).textContent")); assert 'Culto teste' in pg.inner_text('.st-sul')
    pg.evaluate("ST.cenas.pop();stSalva();stRenderUI()"); assert pg.evaluate("ST.cenas.length")==n-1
    pg.click('.st-su button:has-text("Carregar")'); pg.wait_for_timeout(500); assert pg.evaluate("ST.cenas.length")==n
    assert pg.evaluate("ST.cenas.some(c=>c.camadas.some(l=>l.mov))")
    pg.click('.st-mb button:has-text("Fechar")')
    # YouTube: sem ID do Google avisa; com ID mostra botão
    pg.evaluate("ST.cfg=Object.assign(ST.cfg||{plats:[],relay:{}},{googleClientId:'x.apps.googleusercontent.com'});stConfig()"); pg.wait_for_selector('.st-yt'); assert 'Entrar com Google' in pg.inner_text('.st-yt'); pg.click('.st-mb button:has-text("Fechar")')
    # programa congelado: mexer no preview não muda o que está no ar até a próxima Transição
    pg.evaluate("stCena('vz')||ST.cenas.push({id:'vz',nome:'Teste',camadas:[]})"); pg.evaluate("ST.prev='vz';stAddCamada('texto')")
    lid=pg.evaluate("stCena('vz').camadas[0].id"); pg.evaluate("stProgDireto('vz');ST.prev='vz'"); x0=pg.evaluate(f"stProgLayer('{lid}').x")
    pg.evaluate(f"stAchaCamada('{lid}').x=.5"); assert pg.evaluate(f"stProgLayer('{lid}').x")==x0,'programa mudou sozinho'
    pg.evaluate("ST.trans.tipo='corte'"); pg.eval_on_selector('#st_trans .st-tbtn','e=>e.click()'); pg.wait_for_timeout(300); assert pg.evaluate(f"stProgLayer('{lid}').x")==.5,'transição não aplicou'
    # plataformas dentro do estúdio, sem sair
    pg.click('#st_ctl button:has-text("Gerenciar transmissão")'); pg.wait_for_selector('#st_ml .st-plat'); pg.wait_for_timeout(900); assert 'Servidor de retransmissão' in pg.inner_text('#st_ml'); assert pg.evaluate("MM.sub")=='estudio'; pg.click('#st_ml button:has-text("Fechar")')
    # divisórias e blocos arrastáveis
    h0=pg.evaluate("document.querySelector('#st_bot').offsetHeight"); bx=pg.locator('#st_sph').bounding_box(); pg.mouse.move(bx['x']+300,bx['y']+5); pg.mouse.down(); pg.mouse.move(bx['x']+300,bx['y']-80,steps=6); pg.mouse.up()
    h1=pg.evaluate("document.querySelector('#st_bot').offsetHeight"); assert h1>h0+40,(h0,h1)
    w0=pg.evaluate("document.querySelector('[data-p=cenas]').offsetWidth"); sb=pg.locator('.st-spv').first.bounding_box(); pg.mouse.move(sb['x']+4,sb['y']+40); pg.mouse.down(); pg.mouse.move(sb['x']+84,sb['y']+40,steps=6); pg.mouse.up()
    assert pg.evaluate("document.querySelector('[data-p=cenas]').offsetWidth")>w0+40
    pg.evaluate("stDragIni({},'ctl');stDrop({preventDefault(){}},'cenas')"); assert pg.evaluate("ST.lay.ordem[0]")=='ctl' and pg.evaluate("document.querySelector('#st_bot').firstElementChild.dataset.p")=='ctl'
    pg.screenshot(path='/tmp/live166.png')
    print('ERROS:',errs); assert not errs; print('E2E LIVE v166 OK')
