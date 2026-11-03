# Navegação configurável: ordem/visibilidade/nome do menu lateral e guias no menu horizontal e/ou vertical
from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,1280,900)
    pg.add_style_tag(content='#pushbar{display:none!important}')
    side=lambda: [x.strip() for x in pg.locator('.nav .nv span').all_inner_texts()]
    assert 'Família Zoe' in side() and 'Mapas' in side()
    pg.evaluate("go('admin')"); pg.wait_for_timeout(500)
    pg.evaluate("S.navCfg=null;NV.d=null;")
    # simula as edições da tela do admin
    pg.evaluate("""NV.d=nvBase();const D=NV.d;nvMove(D.itens.findIndex(x=>x.id==='familia'),-3);const im=D.itens.findIndex(x=>x.id==='buscar');nvOn(im,false);
      nvNome(D.itens.findIndex(x=>x.id==='familia'),'Nossa Família');nvSub('familia','quem','v');nvSub('familia','fale','-');nvSub('celula','org','v');nvSave()""")
    pg.wait_for_timeout(600)
    L=side(); assert 'Mapas' not in L and 'Nossa Família' in L and 'Família Zoe' not in L, L
    assert L.index('Nossa Família')<L.index('Ministérios'), L
    # familia: 'quem' só no vertical, 'fale' oculta
    pg.click('.nav button.nv:has-text("Nossa Família")'); pg.wait_for_selector('.cdrop[data-ns="familia"].open'); pg.wait_for_timeout(900)
    v=[x.strip() for x in pg.locator('.cdrop[data-ns="familia"] .sn').all_inner_texts()]; assert v==['Quem somos'], v
    h=[x.strip() for x in pg.locator('#view .tabs button').all_inner_texts()]; assert 'Quem somos' not in h and 'Fale com a Igreja' not in h and 'Notícias' in h, h
    pg.click('.cdrop[data-ns="familia"] .sn'); pg.wait_for_timeout(400); assert pg.evaluate("R.sub.familia")=='quem'
    # recolhe ao clicar de novo
    pg.click('.nav button.nv:has-text("Nossa Família")'); pg.wait_for_function("!document.querySelector('.cdrop[data-ns=familia]').classList.contains('open')")
    # restaurar padrão
    pg.evaluate("S.navCfg=null;NV.d=null;shell();go('feed')"); pg.wait_for_timeout(400)
    assert 'Família Zoe' in side() and 'Mapas' in side()
    print('OK navegação configurável'); b.close()
