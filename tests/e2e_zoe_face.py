# Novo usuário: entra direto no tutorial da Zoe (sem aviso de rosto/termos). O rosto e os termos só são pedidos ao abrir a edição do perfil.
# Depois do tutorial, a Zoe lembra de leve (com versículo) de completar o perfil.
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':420,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('zoe-force','1')")
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','caio@zoe.com'); pg.fill('#lg_s','Temp12345'); pg.click('#lg_b'); pg.wait_for_selector('#fp_a')
    pg.fill('#fp_a','Temp12345'); pg.fill('#fp_n','SenhaNova2026!'); pg.fill('#fp_r','SenhaNova2026!'); pg.click('button:has-text("Salvar nova senha")'); pg.wait_for_timeout(1500)
    if pg.locator('#lg_e').count(): pg.fill('#lg_e','caio@zoe.com'); pg.fill('#lg_s','SenhaNova2026!'); pg.click('#lg_b')
    # 1) a Zoe começa o tutorial e NÃO existe aviso de rosto/termos na entrada
    pg.wait_for_selector('#zbub:not([hidden])',timeout=15000); pg.wait_for_timeout(1500)
    assert pg.locator('#fgov').count()==0, 'sem aviso de rosto na entrada'; assert pg.evaluate("ZE.on"), 'tutorial rodando'
    # 2) tutorial concluído: ao abrir a edição do perfil, aparece o aviso (com "Agora não")
    pg.evaluate("ZE.on=false;S.guiaVisto=true;zFecha();go('meu');sub('meu','editar')"); pg.wait_for_selector('#fgov',timeout=10000)
    assert 'Agora não' in pg.inner_text('#fgov') and 'termos' in pg.inner_text('#fgov').lower(), pg.inner_text('#fgov')[:300]
    pg.click('#fgov button:has-text("Agora não")'); pg.wait_for_function("!document.getElementById('fgov')"); pg.evaluate("render()"); pg.wait_for_timeout(800)
    assert pg.locator('#fgov').count()==0, 'não insiste na mesma sessão'
    # 3) lembrete discreto da Zoe para completar o perfil, com versículo
    pg.evaluate("S.perfil={nome:'Caio'};localStorage.setItem('zoe-perf-ult',String(Date.now()-700000));go('feed')"); pg.wait_for_timeout(500)
    pg.evaluate("zPerfilTick()"); pg.wait_for_selector('#zbub:not([hidden])',timeout=5000)
    assert pg.evaluate("document.querySelector('#zbub .zt').textContent")=='Seu perfil 💛'
    pg.wait_for_selector('#zbt:not([hidden])',timeout=15000); t=pg.inner_text('#zbub'); assert '“' in t and 'Completar agora' in t and 'Depois' in t, t
    # não repete antes de 10 minutos
    pg.evaluate("zPerfilDepois()"); pg.evaluate("zPerfilTick()"); pg.wait_for_timeout(400); assert pg.evaluate("$('#zbub').hidden"), 'espera 10 min'
    print('ERROS:',errs); assert not errs; print('E2E FACIAL -> ZOE OK')
