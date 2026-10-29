# Perfil da célula: marcar no mapa preenche latitude/longitude
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("go('celula','perfilc')"); pg.wait_for_selector('#cmapa .leaflet-tile-pane',state='attached',timeout=10000)
    pg.click('#cmapa',position={'x':150,'y':100})
    v=pg.input_value('#cg'); print('coord',v); assert ',' in v and abs(float(v.split(',')[0]))>0
    assert pg.query_selector('#cmapa .pinm')
    print('ERRS',errs); assert not errs
