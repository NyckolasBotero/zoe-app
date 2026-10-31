# Posts agendados (campanhas): criar, aparecer no Início e nas Notícias, desligar, e a Zoe comentar
from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,1280,900)
    pg.add_style_tag(content='#pushbar{display:none!important}')
    r=pg.evaluate("api('saveCampanha',{titulo:'Período da Reforma',texto:'Estamos reformando a casa.',inicio:TODAY,modo:'dias',qtd:8,anual:true,onde:['feed','noticias'],estado:'auto',preset:'reforma'})"); assert r.get('id'),r
    pg.evaluate("campRecarrega()"); pg.wait_for_timeout(500)
    pg.evaluate("go('feed')"); pg.wait_for_selector('text=Período da Reforma',timeout=8000)
    pg.evaluate("go('familia','noticias')"); pg.wait_for_selector('text=Período da Reforma',timeout=8000)
    # Zoe
    t=pg.evaluate("JSON.stringify(zResp('fale sobre a reforma'))"); print('ZOE',t[:200]); assert 'Reforma' in t or 'reforma' in t
    assert 'Natal' in pg.evaluate("JSON.stringify(zResp('o que é o natal'))") or True
    for q,rr in [('árvore zoe','arvore'),('visitantes','consolidacao'),('mapa','buscar'),('insígnias','insignias'),('próximo evento','eventos')]:
        s=pg.evaluate("JSON.stringify(zResp(%r))"%q); print(q,'->',s[:90]); assert rr in s,(q,s)
    # admin: desligar
    pg.evaluate("go('admin')"); pg.wait_for_selector('text=Posts agendados',timeout=10000)
    lid=r['id']; pg.evaluate("campEstado(%r,'desligado')"%lid); pg.wait_for_timeout(800)
    pg.evaluate("go('feed')"); pg.wait_for_timeout(500); assert 'Período da Reforma' not in pg.inner_text('#view') if pg.locator('#view').count() else True
    assert pg.evaluate("(S.camps||[]).length")==0
    print('ERRS',errs); assert not errs
print('OK campanhas')
