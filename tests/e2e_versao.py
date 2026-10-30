# Versão do site: aparece no rodapé do menu; avisa quando há versão nova publicada
from playwright.sync_api import sync_playwright
import json
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000)
    n=pg.inner_text('#zvn'); print(n); assert 'Versão 1.' in n and 'Versão mais recente' in n
    pg.evaluate("go('admin')"); pg.wait_for_selector('#zver'); t=pg.inner_text('#zver'); print(repr(t)); assert 'Verificar atualização' in t and 'mais recente' in t
    pg.click('#zver button'); pg.wait_for_timeout(800); assert 'disponível' not in pg.inner_text('#zvn')
    pg.route('**/version.json*',lambda r:r.fulfill(body=json.dumps({'id':'29991231-235959','data':'31/12/2999 23:59','h':'zzz','v':'9.9'}),content_type='application/json'))
    pg.click('#zver button'); pg.wait_for_selector('#zvn[data-st=nova]'); assert 'Versão 9.9 disponível' in pg.inner_text('#zvn') and 'Atualizar agora' in pg.inner_text('#zver') and 'Versão 1.' in pg.inner_text('#zvn')
    pg.screenshot(path='/tmp/versao.png')
    print('ERRS',errs); assert not errs
print('OK')
