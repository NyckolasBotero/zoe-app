from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("go('admin')"); pg.wait_for_selector('.admtabs'); pg.click('.admtabs >> text=Documentação'); pg.wait_for_selector('.doc-n')
    t=pg.inner_text('#view'); assert 'Notas de atualização' in t and 'Agendas de transmissão' in t and 'Atual' in t,t[:400]
    pg.click('.tabs >> text=Documentação'); pg.wait_for_selector('text=Visão geral')
    pg.screenshot(path=os.environ.get('SHOTS','/tmp')+'/docs.png')
    print('ERRS',errs); assert not errs
print('OK')
