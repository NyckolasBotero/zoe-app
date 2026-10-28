# Índice das seções da Administração: submenu na barra lateral e botão flutuante
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1300,'height':800}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=8000)
    assert not pg.query_selector('#subnav .sn'), 'só aparece na Administração'
    pg.click('.nv:has-text("Administração")'); pg.wait_for_selector('#subnav .sn'); pg.wait_for_timeout(1900)
    nomes=pg.evaluate("[...document.querySelectorAll('#subnav .sn')].map(x=>x.textContent)"); print('SECOES',nomes); assert len(nomes)>=6, nomes
    pg.screenshot(path=OUT+'/m_secoes.png')
    alvo=[n for n in nomes if 'Usuários' in n or 'Regra' in n][0]
    y0=pg.evaluate("scrollY"); pg.click(f'#subnav .sn:text-is("{alvo}")'); pg.wait_for_timeout(1400)
    y1=pg.evaluate("scrollY"); assert y1>y0+300, (y0,y1)
    assert pg.evaluate("document.querySelector('#subnav .sn.on').textContent")==alvo, pg.evaluate("document.querySelector('#subnav .sn.on').textContent")
    top=pg.evaluate("[...document.querySelectorAll('#view h3')].find(h=>h.textContent.trim()===%r).getBoundingClientRect().top"%alvo); assert 0<top<200, top
    # botão flutuante com a barra recolhida
    pg.click('#bc'); pg.wait_for_timeout(800); pg.wait_for_selector('#secfab'); pg.click('#secfab'); pg.wait_for_selector('#secpop button'); pg.screenshot(path=OUT+'/m_secoes_fab.png')
    pg.click('#secpop button >> nth=1'); pg.wait_for_selector('#secpop',state='detached')
    pg.evaluate("go('feed')"); pg.wait_for_timeout(600); assert not pg.query_selector('#secfab') and not pg.query_selector('#subnav .sn')
    print('E2E SECOES OK' if not errs else 'ERROS: %s'%errs); b.close()
