from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_timeout(1200)
    # administrador sem cargo de célula: a árvore não aparece
    assert not pg.query_selector('.mtree')
    # simula cargos: líder da Semeadores e supervisor da Norte
    pg.evaluate("S.minhas=[{id:'C1',nome:'Semeadores',cargo:'Líder'},{id:'C2',nome:'Célula Norte',cargo:'Supervisor'},{id:'C3',nome:'Todas',cargo:'Administração'}];shell()")
    assert pg.is_hidden('.mt-body'), 'começa fechado'; assert 'Meus Grupos' in pg.inner_text('.mtree')
    pg.click('.mt-btn'); pg.wait_for_timeout(500); assert pg.is_visible('.mt-body') and pg.get_attribute('.mt-btn','aria-expanded')=='true'
    t=pg.inner_text('.mtree'); print(t)
    for x in ['Igreja Zoe','Supervisão','Células que administro','Liderança','Semeadores','Célula Norte']: assert x in t,x
    assert 'Todas' not in t
    pg.evaluate('shell()'); assert pg.is_visible('.mt-body'), 'continua aberto após redesenhar'
    pg.click('.mt-btn'); pg.wait_for_timeout(500); assert pg.is_hidden('.mt-body')
    pg.click('.mt-btn'); pg.wait_for_timeout(500)
    assert pg.evaluate("document.querySelector('.mtree').getBoundingClientRect().top")>pg.evaluate("document.querySelector('.me').getBoundingClientRect().bottom")-2
    print('ERROS:',errs); assert not errs; print('E2E MINHA ARVORE OK')
