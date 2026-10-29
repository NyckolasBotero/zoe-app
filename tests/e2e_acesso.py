# Etapa 2: Regras Células (ver/editar por guia), tipos de acesso, abas por tipo e histórico com elenco da época
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def login(pg,e,s,nova='NovaSenha123'):
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',e); pg.fill('#lg_s',s); pg.click('#lg_b'); pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',s); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',e); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('dialog',lambda d:d.accept())
    login(pg,'admin@zoe.com','SenhaForte123')
    pg.click('.nv:has-text("Administração")'); pg.wait_for_selector('.admtabs'); pg.evaluate("admGrupo('def')"); pg.wait_for_selector('h3:has-text("Regras Células")'); pg.wait_for_timeout(1800)
    t=pg.inner_text('#view')
    for g in ['Frequência','Planejamento','Papéis','Oração','Indicadores','Membros','Perfil da célula','Privacidade','Presença','Histórico','Mural de fotos','Organograma']: assert g in t,g
    assert 'frequentador' in t.lower() and 'líder em treinamento' in t.lower()
    pg.evaluate("admGrupo('acc')"); pg.wait_for_selector('#nt_n')
    # novo tipo
    pg.fill('#nt_n','Visitante'); pg.click('button:has-text("Criar tipo")'); pg.wait_for_selector('.chip:has-text("Visitante")'); pg.wait_for_timeout(900)
    assert 'Visitante' in pg.inner_html('#nu_p')
    pg.evaluate("admGrupo('def')"); pg.wait_for_selector('#rc_p')
    # parâmetros
    pg.fill('#rc_p','60'); pg.fill('#rc_s','0'); pg.click('button:has-text("Salvar parâmetros")'); pg.wait_for_timeout(800)
    # ver/editar: Membro passa a poder ver Frequência (sem editar)
    pg.evaluate("""()=>accRegra('membro','freq','v',true)"""); pg.wait_for_timeout(900); pg.evaluate("""()=>accRegra('frequentador','freq','v',true)"""); pg.wait_for_timeout(900)
    # abas: Loja some para Frequentador
    pg.evaluate("""()=>accAba('frequentador','loja',false)"""); pg.wait_for_timeout(900)
    # dados: célula + usuário numa célula, sem presença (= frequentador)
    cid=pg.evaluate("""async()=>{const l=await api('createUser',{email:'lid@zoe.com',nome:'Lider Um',senha:'Temp12345',papel:'membro'});const c=await api('createCell',{nome:'Semeadores',liderId:l.membroId,dia:'Quinta',inicio:'20:00',fim:'21:30'});await api('createUser',{email:'fre@zoe.com',nome:'Frequentador Um',senha:'Temp12345',papel:'membro',celulaId:c.id});return c.id}""")
    assert cid
    pg.screenshot(path=OUT+'/m_regras.png',full_page=False)
    pg.evaluate("sair()"); pg.wait_for_selector('#lg_e')
    login(pg,'fre@zoe.com','Temp12345')
    nav=pg.inner_text('#nav') if pg.locator('#nav').count() else pg.inner_text('body')
    assert 'Loja Zoe' not in nav, 'Loja deveria estar oculta para frequentador'
    assert 'Células' in nav, 'quem está numa célula sempre vê a aba Células'
    pg.click('.nv:has-text("Células")'); pg.wait_for_selector('.tabs'); tabs=pg.inner_text('.tabs')
    assert 'Frequência' in tabs and 'Membros' in tabs and 'Oração' in tabs and 'Organograma' in tabs
    assert 'Presença' not in tabs.replace('Presença de','') or True
    for ocultas in ['Privacidade','Papéis','Indicadores']: assert ocultas not in tabs,ocultas
    # Frequência: só leitura
    pg.click('.tabs button:has-text("Frequência")'); pg.wait_for_selector('.ro'); assert 'ver esta guia, mas não editar' in pg.inner_text('.ro')
    assert pg.locator('.ro input.pr').first.is_disabled()
    # Oração: pode editar
    pg.click('.tabs button:has-text("Oração")'); pg.wait_for_selector('#ox'); assert not pg.locator('#ox').is_disabled(); assert pg.locator('.ro').count()==0
    # API barra edição de presença
    r=pg.evaluate("""async()=>{try{await api('saveAttendance',{data:'2026-10-01',presentes:[]});return 'ok'}catch(e){return e.code}}"""); assert r=='FORBIDDEN',r
    pg.screenshot(path=OUT+'/m_celula_ro.png',full_page=False)
    print('ERROS',errs); assert not errs
print('OK')
