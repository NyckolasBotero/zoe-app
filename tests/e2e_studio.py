# Studio Zoe: aba de acessos (admin) e chat flutuante
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':420,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1',timeout=20000)
    pg.wait_for_selector('#scbtn',state='attached',timeout=10000); pg.wait_for_timeout(900)
    assert pg.evaluate("getComputedStyle($('#scbtn')).display")=='none', 'chat só aparece no Studio'
    pg.evaluate("go('multimidia');mmArea('cfg')"); pg.wait_for_timeout(500); pg.evaluate("mmSub('acessos')"); pg.wait_for_function("document.querySelector('#view').textContent.includes('Quem acessa o quê')",timeout=10000)
    pg.fill('#sta_q','a'); pg.fill('#sta_q','Ana'); pg.wait_for_timeout(1200)
    print(pg.inner_text('#view')[:300].replace('\n',' | '))
    pg.wait_for_timeout(900); assert pg.evaluate("getComputedStyle($('#scbtn')).display")!='none'
    bx=pg.locator('#scbtn').bounding_box(); x0,y0=bx['x']+25,bx['y']+25
    pg.mouse.move(x0,y0); pg.mouse.down(); pg.mouse.move(x0+120,y0-200,steps=8); pg.mouse.up(); pg.wait_for_timeout(200)
    b2=pg.locator('#scbtn').bounding_box(); assert abs(b2['x']-bx['x'])>60 and abs(b2['y']-bx['y'])>100, (bx,b2)
    assert pg.evaluate("document.querySelector('#scp').hidden"), 'arrastar não abre o chat'
    pg.evaluate("go('feed')"); pg.wait_for_timeout(900); assert pg.evaluate("getComputedStyle($('#scbtn')).display")=='none'
    pg.evaluate("go('multimidia')"); pg.wait_for_timeout(900)
    pg.evaluate("scToggle()"); pg.wait_for_selector('#scq'); assert 'Ninguém está' in pg.inner_text('#scp')
    pg.screenshot(path='/tmp/studio.png')
    print('ERROS:',errs); assert not errs; print('E2E STUDIO OK')
