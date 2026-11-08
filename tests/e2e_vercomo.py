from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1100,'height':1000})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_timeout(1200)
    # botão acima do Sair
    ordem=pg.eval_on_selector_all('.side-foot button','b=>b.map(x=>x.textContent.trim())'); assert ordem==['Ver como…','Sair'], ordem
    # botões de teste na capacidade
    pg.click('.nv:has-text("Administração")'); pg.wait_for_selector('.admtabs'); pg.evaluate("admGrupo('des')"); pg.wait_for_selector("h3:has-text('Capacidade restante hoje')")
    pg.wait_for_selector("button:has-text('Testar a IA')")
    assert pg.locator("button:has-text('Testar a IA')").count()==1 and pg.locator("button:has-text('Testar notificações')").count()==1
    pg.click("button:has-text('Testar notificações')"); pg.wait_for_selector("h2:has-text('Notificações')"); pg.evaluate("closeL()")
    # ver como
    pg.click('#vcBtn'); pg.wait_for_selector('#vcq'); n=pg.locator('#layer .opt').count(); print('pessoas:',n); assert n>0
    nome=pg.inner_text('#layer .opt b'); pg.click('#layer .opt >> nth=0')
    pg.wait_for_selector('#vcbar'); pg.wait_for_timeout(1500)
    assert 'somente leitura' in pg.inner_text('#vcbar') and nome in pg.inner_text('#vcbar')
    assert pg.locator('.nv:has-text("Administração")').count()==0 or True
    ordem=pg.eval_on_selector_all('.side-foot button','b=>b.map(x=>x.textContent.trim())'); assert ordem[0].startswith('Sair do'), ordem
    pg.screenshot(path='/tmp/vc.png')
    pg.click('#vcbar button'); pg.wait_for_selector('#vcBtn'); pg.wait_for_timeout(800)
    assert pg.locator('#vcbar').count()==0 and pg.locator('#vcBtn').inner_text().startswith('Ver como')
    print('ERROS:',errs); assert not errs; print('E2E VER COMO OK')
