# Evento que passou: remarcar, fotos da Mídia viram post "Como foi…", feed único modular
from playwright.sync_api import sync_playwright
import datetime
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
ont=(datetime.date.today()-datetime.timedelta(days=2)).isoformat(); fut=(datetime.date.today()+datetime.timedelta(days=15)).isoformat()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,1280,900)
    pg.add_style_tag(content='#pushbar{display:none!important}')
    for t in ['Aniversário Zoe','Retiro Jovens']:
        r=pg.evaluate("api('createEvent',{titulo:%r,data:%r,hora:'19:00',local:'Templo',descricao:'Festa da família Zoe'})"%(t,ont)); assert r.get('ok'),r
    pg.evaluate("evRecarrega()"); pg.wait_for_timeout(700)
    pg.evaluate("go('eventos')"); pg.wait_for_selector('text=Eventos que já passaram',timeout=8000)
    # remarcar um deles
    pg.locator('.opt:has-text("Retiro Jovens") button:has-text("Remarcar")').click(); pg.wait_for_selector('#rm_d'); pg.fill('#rm_d',fut); pg.fill('#rm_m','Chuva'); pg.click('button:has-text("Remarcar evento")')
    pg.wait_for_function("EVENTOS.find(e=>e.t==='Retiro Jovens').d>TODAY&&EVENTOS.find(e=>e.t==='Retiro Jovens').rem",timeout=8000)
    assert not pg.locator('.opt:has-text("Retiro Jovens")').count(), 'saiu da lista de passados'
    # subir fotos do Aniversário
    pg.locator('.opt:has-text("Aniversário Zoe") button:has-text("Subir fotos")').click(); pg.wait_for_selector('#ef_t'); assert 'Como foi o nosso Aniversário Zoe?' in pg.input_value('#ef_t')
    pg.set_input_files('.modal input[type=file]',['/tmp/evf0.jpg','/tmp/evf1.jpg']); pg.wait_for_function("EVF.f.length===2",timeout=8000)
    pg.click('#ef_go'); pg.wait_for_function("EVENTOS.find(e=>e.t==='Aniversário Zoe').pid",timeout=10000)
    # feed único no Início: post com as fotos, curtir e comentar
    pg.evaluate("go('feed')"); pg.wait_for_selector('#fu_lista article:has-text("Como foi o nosso Aniversário Zoe?")',timeout=10000)
    assert pg.locator('#fu_lista article:has-text("Como foi o nosso")').inner_text().count('Festa da família Zoe')==1
    pg.locator('#fu_lista article:has-text("Como foi o nosso") button:has-text("Curtir")').click(); pg.wait_for_selector('#fu_lista article:has-text("Curtiu")')
    pg.locator('#fu_lista article:has-text("Como foi o nosso") button:has-text("Comentar")').click(); pg.fill('#fu_lista input[id^=sc_]','Que lindo!'); pg.click('#fu_lista .sp-cm button:has-text("Enviar")'); pg.wait_for_selector('#fu_lista .sp-c:has-text("Que lindo!")')
    pg.locator('#fu_lista article:has-text("Como foi o nosso") button:has-text("Ver as")').click(); pg.wait_for_selector('.modal figure img',timeout=8000); assert pg.locator('.modal figure img').count()==2; pg.evaluate("closeL()")
    pg.screenshot(path='/tmp/feed_unico.png',full_page=True)
    # testemunho entra no feed; a administração tira a fonte e ele some
    pg.evaluate("api('addTestimony',{titulo:'Cura',texto:'Deus me curou de uma doença grave'})"); pg.evaluate("refreshTest()"); pg.wait_for_timeout(600); pg.evaluate("render()")
    pg.wait_for_selector('#fu_lista article:has-text("Deus me curou")')
    pg.evaluate("feedFonte('testemunho',false)"); pg.wait_for_function("S.feedF&&S.feedF.testemunho===false"); pg.evaluate("render()"); pg.wait_for_timeout(500); assert not pg.locator('#fu_lista article:has-text("Deus me curou")').count()
    print('ERRS',errs); assert not errs
print('OK feed eventos')
