# Coordenadas da célula, mapa na busca e célula mais próxima
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1300,'height':900},geolocation={'latitude':-15.7660,'longitude':-48.2680},permissions=['geolocation'])
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=8000)
    r=pg.evaluate("async()=>{try{await api('createCell',{nome:'Longe',dia:'Terça',coordenadas:'-15.9000, -48.0000'})}catch(e){return e.code}; try{await api('createCell',{nome:'Ruim',coordenadas:'xx'})}catch(e){return e.code}}"); assert r=='VALIDATION', r
    pg.evaluate("async()=>{await api('createCell',{nome:'Perto',dia:'Quinta',inicio:'20:00',fim:'21:30',coordenadas:'-15.765417, -48.267880'});mapCells(await api('searchCells'))}")
    pg.evaluate("go('buscar')"); pg.wait_for_selector('#mapa .leaflet-marker-icon'); assert pg.locator('#mapa .leaflet-marker-icon').count()==2
    pg.click('text=Usar minha localização'); pg.wait_for_function('S.pos'); pg.wait_for_selector('#view .chip.r'); t=pg.inner_text('#view').lower(); assert 'perto' in t.split('mais próxima de você')[1][:80], t[:400]
    assert pg.locator('.grid.w .card h3').first.inner_text()=='Perto'
    pg.wait_for_selector('#mapa .leaflet-marker-icon'); pg.screenshot(path='/tmp/s_mapa.png')
    pg.evaluate("go('celula','perfilc')") if False else None
    print('E2E MAPA OK' if not errs else 'ERROS: %s'%errs); b.close()
