# Zoe: guia obrigatório no primeiro acesso, tchau, ajuda por conversa
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':860}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('zoe-force','1')")
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000)
    # primeiro acesso: Zoe aparece e diz o versículo
    pg.wait_for_selector('#zbub:not([hidden])',timeout=8000); pg.wait_for_function("document.querySelector('#zx').textContent.includes('Salmos 119:105')",timeout=15000)
    t=pg.inner_text('#zx'); print(t); assert 'lâmpada' in t.lower()
    pg.screenshot(path=OUT+'/m_zoe1.png')
    pg.wait_for_selector('#zbt button:has-text("Continuar")'); pg.click('#zbt button:has-text("Continuar")')
    pg.wait_for_function("document.querySelector('#zx').textContent.includes('vou te ensinar')",timeout=15000)
    pg.wait_for_selector('#zbt button:has-text("Vamos lá")'); pg.click('#zbt button:has-text("Vamos lá")')
    # percorre todos os passos (obrigatório)
    n=0
    while True:
        pg.wait_for_selector('#zbt button:visible',timeout=15000)
        pg.wait_for_function("!document.querySelector('#zbt').hidden",timeout=15000)
        if pg.locator('#zbt button:has-text("Tchau")').count(): break
        assert pg.locator('#zspot').count()==1
        if n==1: pg.screenshot(path=OUT+'/m_zoe2.png')
        lab='Concluir' if pg.locator('#zbt button:has-text("Concluir")').count() else 'Próximo'
        pg.click(f'#zbt button:has-text("{lab}")'); n+=1; assert n<40
        pg.wait_for_timeout(120)
    print('passos',n); assert n>=8
    pg.wait_for_function("document.querySelector('#zx').textContent.includes('Tchau')",timeout=15000)
    pg.click('#zbt button:has-text("Tchau, Zoe!")'); pg.wait_for_timeout(500)
    assert pg.locator('#zblock').count()==0 and pg.locator('#zspot').count()==0 and pg.locator('#zav').is_visible()
    # não reaparece depois de recarregar
    pg.reload(); pg.wait_for_selector('#view h1'); pg.wait_for_timeout(3500); assert pg.locator('#zbub:not([hidden])').count()==0 and pg.locator('#zblock').count()==0
    # dica ao passar o mouse
    pg.hover('#zav',force=True); pg.wait_for_timeout(400); assert pg.is_visible('.zhint'); assert 'ajudar' in pg.inner_text('.zhint')
    # conversa: "Biblia"
    pg.click('#zav',force=True); pg.wait_for_selector('#zq'); pg.fill('#zq','Biblia'); pg.press('#zq','Enter')
    pg.wait_for_selector('.zac button:has-text("Mostrar onde")',timeout=8000); pg.wait_for_timeout(500)
    last=pg.locator('.zm.bot .zb').last.inner_text(); print(last); assert 'Bíblia' in last or 'Anotações' in last
    pg.click('.zac button:has-text("Mostrar onde")'); pg.wait_for_selector('#zspot'); pg.wait_for_timeout(500)
    print('rota',pg.evaluate("R.r")); assert pg.evaluate("R.r")=='membro'
    # conversa: "onde posso encontrar minha célula" (sem célula -> Buscar)
    pg.wait_for_timeout(1500); pg.click('#zav',force=True); pg.wait_for_selector('#zq'); pg.fill('#zq','onde posso encontrar minha célula'); pg.press('#zq','Enter'); pg.wait_for_timeout(600)
    t=pg.locator('.zm.bot .zb').last.inner_text(); print(t); assert ('Buscar' in t) or ('célula' in t.lower())
    # desconhecido
    pg.fill('#zq','xyzabc qwerty'); pg.press('#zq','Enter'); pg.wait_for_timeout(500); assert 'não tenho certeza' in pg.locator('.zm.bot .zb').last.inner_text()
    pg.screenshot(path=OUT+'/m_zoe3.png')
    # celular
    pg.set_viewport_size({'width':400,'height':800}); pg.wait_for_timeout(500)
    box=pg.locator('#zchat').bounding_box(); assert box['x']>=0 and box['x']+box['width']<=400,box
    print('ERROS',errs); assert not errs
print('OK')
