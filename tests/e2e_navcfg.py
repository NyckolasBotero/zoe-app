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
    # v1.105: grupos de guias criados pelo admin
    pg.evaluate("""NV.d=nvBase();NV.d.grupos.celula=[];nvGAdd('celula');nvGAdd('celula');const G=NV.d.grupos.celula;G[0].nome='Todos';G[0].modo='fixo';G[1].nome='Perfil';G[1].modo='fechado';
      nvGrp('celula','oracao',G[0].id);nvGrp('celula','membros',G[0].id);['perfilc','priv','mural','org'].forEach(i=>nvGrp('celula',i,G[1].id));nvSave()"""); pg.wait_for_timeout(500)
    pg.evaluate("setRole('admin');go('celula','freq')"); pg.wait_for_timeout(500)
    h=[x.strip() for x in pg.locator('#view .tabs:not(.tsub) button').all_inner_texts()]
    assert 'Todos' in h and 'Perfil' in h and 'Privacidade' not in h and 'Oração' not in h and 'Frequência' in h, h
    pg.click('#view .tabs button:has-text("Perfil")'); pg.wait_for_timeout(500)
    ss=[x.strip() for x in pg.locator('#view .tabs.tsub button').all_inner_texts()]; assert set(ss)=={'Perfil da célula','Privacidade','Mural de fotos','Organograma'}, ss
    pg.click('#view .tabs.tsub button:has-text("Privacidade")'); pg.wait_for_timeout(400); assert pg.evaluate("R.sub.celula")=='priv'
    pg.click('.nav button.nv:has-text("Células")') if not pg.locator('#nvcel.open').count() else None; pg.wait_for_selector('#nvcel.open'); pg.wait_for_timeout(900)
    assert pg.locator('#nvcel .sn.grp:has-text("Todos")[disabled]').count()==1, 'fixo'
    ids=pg.evaluate("[...document.querySelectorAll('#nvcel [id^=nvg_]')].map(e=>[e.id,e.classList.contains('open')])")
    assert ids[0][1] is True and ids[1][1] is True, ids  # fixo aberto; fechado abre pois contém a guia ativa
    pg.evaluate("go('celula','freq')"); pg.wait_for_timeout(900)
    ids=pg.evaluate("[...document.querySelectorAll('#nvcel [id^=nvg_]')].map(e=>e.classList.contains('open'))"); assert ids==[True,False], ids
    pg.click('#nvcel .sn.grp:has-text("Perfil")'); pg.wait_for_timeout(500); assert pg.evaluate("document.querySelectorAll('#nvcel [id^=nvg_]')[1].classList.contains('open')")
    pg.evaluate("S.navCfg=null;NV.d=null;shell();go('feed')")
    print('OK navegação configurável'); b.close()
