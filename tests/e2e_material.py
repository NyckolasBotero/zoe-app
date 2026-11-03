# Lições / Extras e Dinâmicas: droplist "Material de célula" abaixo de Células, só para líderes de célula ou acima
from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,1280,900)
    pg.add_style_tag(content='#pushbar{display:none!important}')
    lab=lambda: [x.strip() for x in pg.locator('.nav .nv span').all_inner_texts()]
    L=lab(); assert 'Lições / Extras' not in L and 'Dinâmicas' not in L, L
    assert L.index('Material de célula')==L.index('Células')+1, L
    pg.evaluate("setRole('membro')"); pg.wait_for_timeout(300); L=lab(); assert 'Material de célula' not in L, L
    pg.evaluate("go('licoes')"); pg.wait_for_timeout(300); assert pg.evaluate("R.r")=='feed'
    pg.evaluate("setRole('lider')"); pg.wait_for_timeout(300)
    pg.click('.nav button:has-text("Material de célula")'); pg.wait_for_selector('#nvmat.open')
    assert [x.strip() for x in pg.locator('#nvmat .sn').all_inner_texts()]==['Lições / Extras','Dinâmicas']
    pg.click('#nvmat .sn:has-text("Dinâmicas")'); pg.wait_for_timeout(400); assert pg.evaluate("R.r")=='dinamicas'
    pg.click('#nvmat .sn:has-text("Lições")'); pg.wait_for_timeout(400); assert pg.evaluate("R.r")=='licoes'
    pg.screenshot(path='/tmp/nav.png',clip={'x':0,'y':0,'width':320,'height':560})
    print('OK material de célula'); b.close()
