# Maratona Bíblica + botons de eventos (ponta a ponta)
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,email,senha,nova=None,force=True):
    pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept()); force and pg.add_init_script("localStorage.setItem('zoe-force','1')")
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',senha); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',email); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); return pg
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123',force=False)
    adm.evaluate("""async()=>{await api('guideDone');await api('createUser',{nome:'Ana Souza',email:'ana@zoe.com',senha:'Temp12345',papel:'membro'});
      await api('adminSave',{tipo:'corridas',valores:{Titulo:'Maratona Bíblica',Ano:'2026',Inicio:TODAY,CapDia:'3',TotalCap:'3',Status:'Ativo'}});
      await api('createEvent',{titulo:'Dia do Amigo',data:'2026-03-10',hora:'19:00',local:'Igreja',insignia:'Dia do Amigo'})}""")
    # check-in pela tela do admin
    adm.evaluate("go('admin')"); adm.wait_for_selector('text=Presença nos eventos'); adm.click('text=Carregar eventos'); adm.wait_for_selector('#ck_ev'); adm.click('text=Abrir lista de presença'); adm.wait_for_selector('#ck_l')
    adm.click('#ck_l label:has-text("Ana Souza")'); adm.click('text=Salvar presença'); adm.wait_for_selector('text=1 presença(s) registrada(s)')
    ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123'); ana.evaluate("S.guiaVisto=true")
    ana.wait_for_selector('.nv[aria-label="Bíblia e Anotações"] .tdot'); ana.click('.nv[aria-label="Bíblia e Anotações"]'); ana.click('.tabs button:has-text("Maratona Bíblica")'); ana.wait_for_selector('#cr_n')
    ana.fill('#cr_n','3'); ana.fill('#cr_r','curto'); ana.click('text=Registrar leitura'); ana.wait_for_selector('text=mínimo 30 letras')
    ana.fill('#cr_r','Aprendi que Deus criou tudo com um propósito e cuida de nós.'); ana.click('text=Registrar leitura'); ana.wait_for_selector('text=Aguardando a validação')
    ana.screenshot(path=OUT+'/corrida_ana.png')
    # o administrador valida
    adm.evaluate("go('corrida')"); adm.evaluate("carregaCorrida()"); adm.wait_for_selector('text=Devocionais para validar'); assert 'Aprendi que Deus' in adm.inner_text('#view')
    adm.click('button:has-text("Validar")'); adm.wait_for_selector('text=Devocional validado'); adm.screenshot(path=OUT+'/corrida_adm.png')
    # Ana: insígnias no perfil (ouro 1º, evento)
    ana.evaluate("MEU=null;go('meu')"); ana.wait_for_selector('.pf-head'); t=ana.inner_text('#faixa'); print(t); assert 'Maratona Bíblica' in t and 'Dia do Amigo' in t
    ana.wait_for_timeout(900); ana.screenshot(path=OUT+'/corrida_perfil.png')
    # Zoe comemora a insígnia
    ana.evaluate("S.notifs=null;api('listNotifications').then(n=>{S.notifs=n;zMomRun()})"); ana.wait_for_selector('#zbub:not([hidden])',timeout=15000); assert 'insígnia' in ana.inner_text('#zbub').lower(), ana.inner_text('#zbub')
    print('ERROS',errs); assert not errs
print('OK')
