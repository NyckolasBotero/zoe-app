# Devocional da Zoe no feed e Pergunte à Zoe (sem IA configurada cai na resposta padrão)
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':420,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1',timeout=20000)
    pg.evaluate("go('feed')"); pg.wait_for_function("document.querySelector('#view').textContent.includes('Devocional da Zoe')",timeout=15000)
    t=pg.inner_text('#view'); assert 'Almeida' in t, t[:300]
    pg.evaluate("zAbreChat()"); pg.wait_for_selector('#zq'); pg.fill('#zq','xyzqw blablabla como funciona o estacionamento'); pg.press('#zq','Enter')
    pg.wait_for_function("ZE.msgs.length>=3&&!ZE.msgs[ZE.msgs.length-1].semResp&&!/Deixa eu ver/.test(ZE.msgs[ZE.msgs.length-1].txt)",timeout=15000)
    print(pg.evaluate("ZE.msgs[ZE.msgs.length-1].txt"))
    print('ERROS:',errs); assert not errs; print('E2E NOVIDADES OK')
