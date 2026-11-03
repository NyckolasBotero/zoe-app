# Células: droplist em cascata (efeito bolha) com as guias da célula e “Material Células” (Lições / Extras e Dinâmicas), só para líderes ou acima
from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,1280,900)
    pg.add_style_tag(content='#pushbar{display:none!important}')
    side=lambda: [x.strip() for x in pg.locator('.nav .nv span').all_inner_texts()]
    L=side(); assert 'Lições / Extras' not in L and 'Dinâmicas' not in L and 'Material de célula' not in L, L
    assert pg.locator('#nvcel.open').count()==0
    pg.click('.nav button.nv:has-text("Células")'); pg.wait_for_selector('#nvcel.open'); pg.wait_for_timeout(900)
    its=[x.strip().replace('▾','').strip() for x in pg.locator('#nvcel .sn').all_inner_texts()]
    assert 'Frequência' in its and any('Material Células' in x for x in its) and its[-2:]==['Lições / Extras','Dinâmicas'], its
    assert pg.locator('#nvcel .sn.bub').first.evaluate("e=>getComputedStyle(e).opacity")=='1'
    tabs=[x.strip() for x in pg.locator('#view .tabs button').all_inner_texts()]; assert 'Material Células' in tabs and 'Para Líderes' in tabs, tabs
    pg.click('#view .tabs button:has-text("Material Células")'); pg.wait_for_timeout(400)
    # clicar de novo recolhe, e de novo abre
    pg.click('.nav button.nv:has-text("Células")'); pg.wait_for_function("!document.querySelector('#nvcel').classList.contains('open')"); pg.wait_for_timeout(700)
    print('op',pg.locator('#nvcel .sn.bub').first.evaluate("e=>[getComputedStyle(e).opacity,e.parentElement.parentElement.className]")); pg.wait_for_timeout(800); assert float(pg.locator('#nvcel .sn.bub').first.evaluate("e=>getComputedStyle(e).opacity"))<0.05
    assert pg.evaluate("R.r")=='celula'
    pg.click('.nav button.nv:has-text("Células")'); pg.wait_for_selector('#nvcel.open')
    # grupo Material Células recolhe/abre (estado configurável)
    G='#nvg_celula_material'; pg.wait_for_selector(G+'.open'); pg.click('#nvcel .sn.grp:has-text("Material Células")'); pg.wait_for_function("!document.querySelector('#nvg_celula_material').classList.contains('open')"); pg.click('#nvcel .sn.grp:has-text("Material Células")'); pg.wait_for_selector(G+'.open'); pg.wait_for_timeout(700)
    pg.click(G+' .sn:has-text("Dinâmicas")'); pg.wait_for_timeout(500); assert pg.evaluate("R.r+':'+R.sub.celula")=='celula:dinamicas'
    pg.click('#view .tabs button:has-text("Lições")'); pg.wait_for_timeout(400); assert pg.evaluate("R.sub.celula")=='licoes'
    pg.evaluate("go('licoes')"); pg.wait_for_timeout(300); assert pg.evaluate("R.r+':'+R.sub.celula")=='celula:licoes'
    pg.screenshot(path='/tmp/nav.png',clip={'x':0,'y':0,'width':320,'height':720})
    # membro comum: sem Material Células nem as guias
    pg.evaluate("setRole('membro')"); pg.wait_for_timeout(500)
    assert pg.locator('#nvg_celula_material').count()==0 and pg.locator('#view .tabs button:has-text("Dinâmicas")').count()==0
    pg.evaluate("go('licoes')"); pg.wait_for_timeout(300); assert pg.evaluate("R.r")=='feed'
    print('OK material de célula'); b.close()
