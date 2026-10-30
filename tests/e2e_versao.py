# Versão do site: aparece no rodapé do menu; avisa quando há versão nova publicada
from playwright.sync_api import sync_playwright
import json
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000)
    t=pg.inner_text('#zver'); print(t); assert 'Versão do site' in t and '/20' in t and 'Verificar atualização' in t
    pg.click('#zver button'); pg.wait_for_timeout(800); assert 'Nova versão' not in pg.inner_text('#zver')
    # simula publicação de uma versão mais nova
    pg.route('**/version.json*',lambda r:r.fulfill(body=json.dumps({'id':'29991231-235959','data':'31/12/2999 23:59'}),content_type='application/json'))
    pg.click('#zver button'); pg.wait_for_selector('#zver[data-st=nova]'); assert 'Nova versão disponível' in pg.inner_text('#zver') and 'Atualizar agora' in pg.inner_text('#zver')
    pg.screenshot(path='/tmp/versao.png',clip={'x':0,'y':500,'width':300,'height':400})
    print('ERRS',errs); assert not errs
print('OK')
