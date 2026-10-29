# Zoe: chat fecha sozinho em 4s se ninguém interage; tutorial revisto pode ser cancelado
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone');S.guiaVisto=true")
    pg.evaluate("zAbreChat()"); pg.wait_for_selector('#zchat:not([hidden])'); pg.mouse.move(5,5); pg.wait_for_timeout(5000)
    assert pg.evaluate("$('#zchat').hidden"); assert 'me chama' in pg.inner_text('#zbub'), pg.inner_text('#zbub')
    pg.wait_for_timeout(4500); assert pg.evaluate("$('#zbub').hidden")
    pg.evaluate("zAbreChat()"); pg.wait_for_selector('#zchat:not([hidden])'); pg.hover('#zchat'); pg.wait_for_timeout(5000); assert not pg.evaluate("$('#zchat').hidden")
    pg.evaluate("zRever()"); pg.wait_for_selector('button:has-text("Cancelar tutorial")',timeout=8000); pg.click('button:has-text("Cancelar tutorial")'); pg.wait_for_timeout(500)
    assert pg.locator('#zblock').count()==0 and pg.evaluate("ZE.on")==False
    print('ERROS',errs); assert not errs
print('OK')
