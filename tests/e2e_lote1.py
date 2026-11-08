# Tela "sem célula", ministérios sem botão de foto, pré-cadastro com 2 nomes + WhatsApp
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':420,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script("localStorage.setItem('zoe-force','1')")
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','caio@zoe.com'); pg.fill('#lg_s','Temp12345'); pg.click('#lg_b'); pg.wait_for_selector('#fp_a')
    pg.fill('#fp_a','Temp12345'); pg.fill('#fp_n','SenhaNova2026!'); pg.fill('#fp_r','SenhaNova2026!'); pg.click('button:has-text("Salvar nova senha")'); pg.wait_for_timeout(1500)
    if pg.locator('#lg_e').count(): pg.fill('#lg_e','caio@zoe.com'); pg.fill('#lg_s','SenhaNova2026!'); pg.click('#lg_b')
    pg.wait_for_selector('#view h1',timeout=20000); pg.wait_for_timeout(800)
    pg.evaluate("S.celulaId='';S.minhas=[];S.casaPos=null;go('celula')"); pg.wait_for_function("document.querySelector('#view').textContent.includes('não está em nenhuma célula')")
    assert 'Usar minha localização' in pg.inner_text('#view')
    pg.evaluate("S.casaPos={lat:1,lng:1};render()"); assert 'Buscar a célula mais perto' in pg.inner_text('#view')
    pg.evaluate("go('ministerios')"); pg.wait_for_selector('#view .card'); assert pg.locator('#view input[type=file]').count()==0, 'sem troca de foto na tela de ministérios'
    assert 'Fabio Botero'==pg.evaluate("simplesDe('Fabio Nyckolas Figueiredo Botero')")
    print('ERROS:',errs); assert not errs; print('E2E LOTE1 OK')
