# Studio Zoe: aba de acessos (admin) e chat flutuante
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':420,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1',timeout=20000)
    pg.evaluate("go('multimidia');mmArea('cfg')"); pg.wait_for_timeout(500); pg.evaluate("mmSub('acessos')"); pg.wait_for_function("document.querySelector('#view').textContent.includes('Quem acessa o quê')",timeout=10000)
    pg.fill('#sta_q','a'); pg.fill('#sta_q','Ana'); pg.wait_for_timeout(1200)
    print(pg.inner_text('#view')[:300].replace('\n',' | '))
    pg.evaluate("go('multimidia')"); pg.wait_for_timeout(900)
    print('ERROS:',errs); assert not errs; print('E2E STUDIO OK')
