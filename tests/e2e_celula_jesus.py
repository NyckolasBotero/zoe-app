# Relatório da célula: aceitou Jesus (foto + termômetro) cai no feed da igreja
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
    adm.evaluate("""async()=>{const l=await api('createUser',{email:'lid@zoe.com',nome:'Lider Norte',senha:'Temp12345',papel:'membro'});const c=await api('createCell',{nome:'Célula Norte',liderId:l.membroId,dia:'Quinta'});await api('createUser',{email:'ana@zoe.com',nome:'Ana Souza',senha:'Temp12345',papel:'membro',celulaId:c.id})}""")
    lid=entra(b,'lid@zoe.com','Temp12345','NovaSenha123')
    lid.click('.nv[aria-label="Células"]'); lid.wait_for_selector('#fdata'); lid.evaluate("R.sub.celula='freq';render()")
    lid.wait_for_selector('#fj'); lid.check('#fj input[type=checkbox]'); lid.wait_for_selector('#fj select')
    lid.select_option('#fj select','') ; lid.fill('#fj input[placeholder^="Nome de quem"]','Marcos Ferreira')
    lid.evaluate("document.querySelector('#term').value=85;termoUpd(85)")
    lid.click('button:has-text("Registrar frequência")'); lid.wait_for_selector('.toast:has-text("Frequência")',timeout=10000)
    adm.evaluate("SOC.igreja=null;go('feed')"); adm.wait_for_selector('.sp-j:has-text("Marcos Ferreira")'); t=adm.inner_text('.sp-j'); assert 'Presença de Deus 85%' in t and 'Célula Norte' in t, t
    adm.screenshot(path=OUT+'/feed_celula_jesus.png')
    print('ERROS',errs); assert not errs
print('OK')
