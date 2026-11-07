from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for w,h in((1200,900),(400,820)):
        pg=b.new_page(viewport={'width':w,'height':h}); pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
        pg.evaluate("go('meu')"); pg.wait_for_selector('.pf-ig'); t=pg.inner_text('.pf-ig'); assert 'Igreja Zoe' in t and 'Sem célula' in t, t
        a=pg.eval_on_selector('.pfav','e=>e.getBoundingClientRect().bottom'); c=pg.eval_on_selector('.pf-ig','e=>e.getBoundingClientRect().top'); assert c>=a-2,(a,c)
        pg.wait_for_timeout(2500); pg.screenshot(path=f'/tmp/perfil_{w}.png'); pg.close()
    print('ERROS:',errs); assert not errs; print('E2E PERFIL CELULA OK')
