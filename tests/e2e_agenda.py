# Calendário minimalista (canto dobrado + resumo, alternância igreja/célula) e Administração em páginas no computador
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':860}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000)
    # célula + evento da célula no dia de hoje
    pg.evaluate("""async()=>{await api('createEvent',{titulo:'Culto de Celebração',data:TODAY,hora:'19:00',local:'Templo'});const l=await api('createUser',{email:'l@zoe.com',nome:'Lider',senha:'Temp12345',papel:'membro'});const c=await api('createCell',{nome:'Semeadores',liderId:l.membroId,dia:'Quinta',inicio:'20:00'});await api('createCellEvent',{celulaId:c.id,titulo:'Jantar da célula',data:TODAY,hora:'20:30',local:'Casa'});await hydrate();go('celula','plan')}""")
    pg.wait_for_selector('.cal'); pg.wait_for_timeout(600)
    box=pg.locator('.calc').bounding_box(); assert box['width']<=380,box
    assert pg.locator('.cal button.ev').count()>=1
    pg.locator('.cal button.hoje').hover(); pg.wait_for_selector('.cal button.hoje .peek',state='visible'); pg.wait_for_timeout(300)
    pk=pg.locator('.cal button.hoje .peek'); assert pk.is_visible(); t=pk.inner_text(); print(t); assert 'Culto' in t and 'Jantar' in t
    pg.screenshot(path=OUT+'/m_cal.png')
    # alternância
    pg.click('.seg button:has-text("apenas agenda Célula")'); pg.wait_for_timeout(300)
    pg.locator('.cal button.hoje').hover(); pg.wait_for_timeout(400); t=pg.locator('.cal button.hoje .peek').inner_text(); assert 'Jantar' in t and 'Culto' not in t,t
    pg.click('.seg button:has-text("agenda geral igreja")'); pg.wait_for_timeout(300); assert pg.locator('.seg button.on').inner_text().startswith('Ver agenda geral')
    # administração em páginas (computador)
    pg.click('.nv:has-text("Administração")'); pg.wait_for_selector('.admtabs'); pg.wait_for_timeout(1500)
    tabs=pg.inner_text('.admtabs'); print(tabs.replace('\n',' | ')); assert 'Acessos' in tabs and 'Loja Zoe' in tabs
    assert pg.locator('h2:has-text("Painel de administração")').count()==1
    assert pg.locator('.admtabs').bounding_box()['y']<pg.locator('h2:has-text("Painel de administração")').bounding_box()['y']
    assert pg.locator('h3:has-text("Níveis de acesso")').count()==0
    pg.click('.admtabs button:has-text("Acessos")'); pg.wait_for_selector('h3:has-text("Níveis de acesso")'); pg.wait_for_selector('#secpanel .sn'); pg.wait_for_timeout(500)
    sp=pg.inner_text('#secpanel'); print(sp.replace('\n',' | ')); assert 'Novo usuário' in sp and 'Níveis de acesso' in sp
    assert pg.locator('h3:has-text("Regras Células")').count()==0
    pg.click('#secpanel .sn:has-text("Níveis de acesso")'); pg.wait_for_timeout(900)
    assert pg.locator('#secpanel .sn.on').count()==1
    pg.screenshot(path=OUT+'/m_adm_pag.png')
    # celular: tudo junto, sem menu horizontal
    pg.set_viewport_size({'width':400,'height':800}); pg.wait_for_timeout(900)
    assert pg.locator('.admtabs').is_hidden() or pg.locator('.admtabs').count()==0
    assert pg.locator('h3:has-text("Regras Células")').count()==1 and pg.locator('#secfab').count()==1
    print('ERROS',errs); assert not errs
print('OK')
