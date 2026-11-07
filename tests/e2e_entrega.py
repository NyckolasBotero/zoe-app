from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':420,'height':900})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_timeout(1500)
    pg.evaluate("go('admin')"); pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelectorAll('.card button').forEach(b=>{if(/Definições/.test(b.closest('.card').textContent)&&/Ver e editar/.test(b.textContent))b.click()})"); pg.wait_for_timeout(800)
    pg.wait_for_selector("h3:has-text('Notificações pela Cloudflare')")
    pg.fill('#en_wu','https://zoe-push.exemplo.workers.dev'); pg.fill('#en_ws','segredo123'); pg.click("button:text-is('Salvar'):near(#en_ws)"); pg.wait_for_selector(".chip:has-text('Worker ligado')")
    assert 'segredo123' not in pg.content().split('en_ws')[1][:400]
    print('ERROS:',errs); assert not errs; print('E2E ENTREGA OK')
