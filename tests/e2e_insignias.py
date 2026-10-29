# Criar insígnias (supervisor), escala de serviço, insígnia escura -> conquistada no perfil
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,email,senha,nova=None):
    pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',senha); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',email); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')"); return pg
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    adm.evaluate("""async()=>{await api('createUser',{nome:'Ana Souza',email:'ana@zoe.com',senha:'Temp12345',papel:'membro'})}""")
    ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123')
    assert ana.locator('.nv[aria-label="Criar insígnias"]').count()==0
    adm.click('.nv[aria-label="Criar insígnias"]'); adm.wait_for_selector('text=Nova insígnia'); adm.click('button:has-text("Nova insígnia")'); adm.wait_for_selector('#cr_prev svg')
    adm.fill('input[oninput*="titulo"]','Mão no arado'); adm.select_option('select[onchange*="crCrit(\'tipo\'"]','servico')
    adm.fill('input[oninput*="atividade"]','Limpeza'); adm.fill('input[oninput*="\'meses\'"]','2')
    adm.click('.chip:has-text("Dourado")'); adm.click('.chip:has-text("Meses seguidos")')
    adm.screenshot(path=OUT+'/criar_insignia.png')
    adm.click('button:has-text("Salvar insígnia")'); adm.wait_for_selector('.opt:has-text("Mão no arado")'); assert 'Servir em “Limpeza” por 2 meses seguidos' in adm.inner_text('#view')
    # Ana vê a insígnia escura
    ana.click('.nv[aria-label="Meu perfil"]'); ana.wait_for_selector('.fx-g .bd.lock:has-text("Mão no arado")')
    # escala: dois meses seguidos
    adm.click('.tabs button:has-text("Escalas e serviço")'); adm.wait_for_selector('#sv_a')
    for mes in ['2026-09','2026-10']:
        adm.fill('#sv_a','Limpeza'); adm.fill('input[type=month]',mes); adm.fill('#sv_q','ana'); adm.wait_for_selector('#sv_r .opt:has-text("Ana")'); adm.click('#sv_r .opt:has-text("Ana")'); adm.click('button:has-text("Registrar participação")'); adm.wait_for_selector('.opt:has-text("Ana") >> text='+mes)
    ana.evaluate("MEU=null;go('meu')"); ana.wait_for_selector('.fx-g .bd:not(.lock):has-text("Mão no arado")'); ana.screenshot(path=OUT+'/insignia_ganha.png')
    print('ERROS',errs); assert not errs
print('OK')
