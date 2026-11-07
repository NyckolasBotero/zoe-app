from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':420,'height':900})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_timeout(1500)
    pg.evaluate("go('admin')"); pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelectorAll('.card button').forEach(b=>{if(/Definições/.test(b.closest('.card').textContent)&&/Ver e editar/.test(b.textContent))b.click()})"); pg.wait_for_timeout(800)
    pg.wait_for_selector("h3:has-text('Entrega fora do app')")
    pg.fill('#en_nu','https://ntfy.exemplo.com'); pg.fill('#en_nt','tk_x'); pg.click("button:has-text('Salvar'):near(#en_nt)"); pg.wait_for_selector("text=ntfy ligado",timeout=5000) if False else pg.wait_for_timeout(800)
    pg.click("button:text-is('Ligar o ntfy')"); pg.wait_for_selector(".chip:has-text('ntfy ligado')")
    pg.evaluate("go('perfil','conf')"); pg.wait_for_selector("h3:has-text('Receber avisos pelo ntfy')"); pg.click("button:text-is('Ativar')")
    pg.wait_for_selector("code:has-text('zoe-')"); assert pg.inner_text("body").count('ntfy.exemplo.com')>=1
    pg.click("button:text-is('Desativar')"); pg.wait_for_selector("button:text-is('Ativar')")
    print('ERROS:',errs); assert not errs; print('E2E ENTREGA OK')
