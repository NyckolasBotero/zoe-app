# Motion design: saudação, barra lateral, pop dos modais, barra de cima, feedback de arquivo, tema
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1300,'height':800}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b')
    pg.wait_for_selector('#hello',timeout=15000); assert pg.inner_text('#hello b').startswith('Olá, '), pg.inner_text('#hello')
    pg.wait_for_timeout(700); pg.screenshot(path=OUT+'/m_hello.png')
    pg.wait_for_selector('#hello',state='detached',timeout=6000); pg.wait_for_selector('#splash',state='detached',timeout=8000)
    pg.screenshot(path=OUT+'/m_home_light.png')
    # barra lateral: recolher -> só ícones; expandir de volta
    w0=pg.evaluate("document.querySelector('#side').getBoundingClientRect().width"); pg.click('#bc'); pg.wait_for_timeout(900)
    w1=pg.evaluate("document.querySelector('#side').getBoundingClientRect().width"); assert w0>200 and w1<100, (w0,w1)
    assert pg.evaluate("getComputedStyle(document.querySelector('.nv span')).opacity")=='0'
    pg.screenshot(path=OUT+'/m_collapsed.png')
    pg.evaluate("go('membro')"); pg.wait_for_timeout(500); assert pg.evaluate("document.body.classList.contains('collapsed')")
    pg.click('#bc'); pg.wait_for_timeout(900); assert pg.evaluate("document.querySelector('#side').getBoundingClientRect().width")>200
    # modal: pop ao abrir e animação ao fechar
    pg.evaluate("modal('<h2>Teste</h2><button class=\"btn\" onclick=\"closeL()\">Fechar</button>')"); pg.wait_for_selector('.modal .box')
    pg.click('.modal .btn'); pg.wait_for_selector('.modal.closing',timeout=1000); pg.wait_for_selector('.modal',state='detached',timeout=2000)
    # barra de cima: some ao descer, volta ao subir
    pg.evaluate("go('feed')"); pg.wait_for_timeout(600)
    pg.evaluate("document.body.style.minHeight='3000px';window.scrollTo({top:600,behavior:'instant'})"); pg.wait_for_timeout(300)
    pg.evaluate("window.scrollTo({top:900,behavior:'instant'})"); pg.wait_for_timeout(600); assert pg.evaluate("document.querySelector('.top').classList.contains('hide')")
    pg.evaluate("window.scrollTo({top:700,behavior:'instant'})"); pg.wait_for_timeout(600); assert not pg.evaluate("document.querySelector('.top').classList.contains('hide')")
    pg.evaluate("window.scrollTo({top:0,behavior:'instant'})"); pg.wait_for_timeout(300)
    # ripple no clique
    pg.evaluate("go('admin')"); pg.wait_for_selector('#bk_t'); pg.wait_for_timeout(600)
    pg.hover("button[onclick='salvarLivro()']"); pg.wait_for_timeout(300)
    pg.mouse.down(); assert pg.evaluate("!!document.querySelector('.rip')"); pg.mouse.up()
    # feedback de arquivo selecionado
    pg.set_input_files('#bk_p','/tmp/demo.pdf'); pg.wait_for_selector('.toast >> text=Arquivo selecionado')
    # sininho: fecha sozinho em 3 s, pausa com o mouse em cima
    pg.evaluate("go('feed')"); pg.wait_for_timeout(500); pg.click('#bb'); pg.wait_for_selector('.pop .pbar'); pg.wait_for_timeout(700); pg.screenshot(path=OUT+'/m_bell.png')
    pg.wait_for_selector('.pop',state='detached',timeout=5500)
    pg.click('#bb'); pg.wait_for_selector('.pop'); pg.hover('.pop h3'); pg.wait_for_timeout(4200); assert pg.query_selector('.pop'), 'deve ficar aberto com o mouse em cima'
    pg.mouse.move(5,400); pg.wait_for_selector('.pop',state='detached',timeout=5000)
    # tema escuro
    pg.click('#bt'); pg.wait_for_timeout(900); assert pg.evaluate("document.documentElement.getAttribute('data-theme')")=='dark'
    pg.evaluate("go('feed')"); pg.wait_for_timeout(1200); pg.screenshot(path=OUT+'/m_home_dark.png')
    # celular
    pg.set_viewport_size({'width':390,'height':800}); pg.evaluate("go('feed')"); pg.wait_for_timeout(1300); pg.screenshot(path=OUT+'/m_mobile.png')
    pg.evaluate("menu(true)"); pg.wait_for_timeout(800); pg.screenshot(path=OUT+'/m_mobile_menu.png')
    print('E2E MOTION OK' if not errs else 'ERROS: %s'%errs); b.close()
