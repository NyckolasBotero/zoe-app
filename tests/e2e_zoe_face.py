# Usuário novo: o aviso de rosto e uso de imagem vem primeiro; a Zoe só começa o tutorial depois que ele é concluído
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':420,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('zoe-force','1')")
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','caio@zoe.com'); pg.fill('#lg_s','Temp12345'); pg.click('#lg_b'); pg.wait_for_selector('#fp_a')
    pg.fill('#fp_a','Temp12345'); pg.fill('#fp_n','SenhaNova2026!'); pg.fill('#fp_r','SenhaNova2026!'); pg.click('button:has-text("Salvar nova senha")'); pg.wait_for_timeout(1500)
    if pg.locator('#lg_e').count(): pg.fill('#lg_e','caio@zoe.com'); pg.fill('#lg_s','SenhaNova2026!'); pg.click('#lg_b')
    pg.wait_for_selector('#fgov',timeout=15000)
    # 1) aviso aberto: Zoe não aparece nem começa, por mais que se espere
    pg.wait_for_timeout(4500)
    st=pg.evaluate("({zoe:ZE.on,blk:!!document.getElementById('zblock')})"); assert not st['zoe'] and not st['blk'], st
    # 2) aceita os termos e conclui/fecha o aviso
    pg.evaluate("fgFecha()"); 
    # 3) só então a Zoe começa
    pg.wait_for_selector('#zbub:not([hidden])',timeout=15000)
    assert pg.evaluate("ZE.on&&!FG&&!document.getElementById('fgov')")
    print('ERROS:',errs); assert not errs; print('E2E FACIAL -> ZOE OK')
