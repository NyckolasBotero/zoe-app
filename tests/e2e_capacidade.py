from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1100,'height':1100})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_timeout(1200)
    pg.click('.nv:has-text("Administração")'); pg.wait_for_selector('.admtabs'); pg.evaluate("admGrupo('des')")
    pg.wait_for_selector("h3:has-text('Capacidade restante hoje')"); pg.wait_for_selector("text=ligue o Worker para usar a IA"); pg.wait_for_selector("text=envios ainda cabem hoje")
    t=pg.inner_text('#view'); assert '10.000' in t and '20.000' in t and 'zera' in t.lower(), t[:600]
    pg.screenshot(path='/tmp/cap.png')
    print('ERROS:',errs); assert not errs; print('E2E CAPACIDADE OK')
