from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1100,'height':1000})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_timeout(1200)
    pg.click('.nv:has-text("Administração")'); pg.wait_for_selector('.admtabs'); pg.evaluate("admGrupo('pub')")
    pg.wait_for_selector("h3:has-text('Responsáveis por ministério')"); pg.wait_for_selector("text=Sem responsável: o supervisor decide.")
    inp=pg.locator("input[aria-label^='Buscar responsável de']").first; inp.fill('Lid'); pg.wait_for_selector("#view .opt button.opt, #view button.opt:has-text('Lid')",timeout=5000)
    pg.locator("button.opt:has-text('Lid')").first.click(); pg.wait_for_selector(".chip:has-text('Lid')"); 
    pg.screenshot(path='/tmp/mr.png')
    # ver como supervisor: cartão de autonomia
    pg.evaluate("vcAbre()"); pg.wait_for_selector('#vcq'); pg.fill('#vcq','Sup'); pg.wait_for_timeout(300)
    pg.locator('#layer .opt:has-text("Supervisor")').first.click(); pg.wait_for_selector('#vcbar'); pg.wait_for_timeout(1500)
    pg.evaluate("go('aprovacoes','pend')"); pg.wait_for_selector("h3:has-text('Autonomia dos responsáveis de ministério')"); pg.wait_for_selector("input[type=checkbox]")
    pg.screenshot(path='/tmp/mr2.png')
    print('ERROS:',errs); assert not errs; print('E2E MINISTERIO RESP OK')
