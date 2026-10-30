# Consolidação: visitante com mapa -> alerta ao líder da célula mais próxima; decisão no feed; curtir/comentar
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
    adm.evaluate("""async()=>{const l=await api('createUser',{email:'lid@zoe.com',nome:'Lider Norte',senha:'Temp12345',papel:'membro'});const sp=await api('createUser',{email:'sup@zoe.com',nome:'Sup Norte',senha:'Temp12345',papel:'membro'});await api('createCell',{nome:'Célula Norte',liderId:l.membroId,supervisorId:sp.membroId,coordenadas:'-23.50,-46.60',dia:'Quinta'});await api('createCell',{nome:'Célula Sul',coordenadas:'-23.90,-46.60',dia:'Sexta'});await api('createUser',{email:'ana@zoe.com',nome:'Ana Souza',senha:'Temp12345',papel:'membro'})}""")
    lid=entra(b,'lid@zoe.com','Temp12345','NovaSenha123'); ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123')
    assert ana.locator('.nv[aria-label="Consolidação"]').count()==0
    adm.click('.nv[aria-label="Consolidação"]'); adm.wait_for_selector('#vmapa .leaflet-container, #vmapa.leaflet-container',timeout=8000)
    adm.fill('#vt_nome','Pedro Lima'); adm.fill('#vt_apelido','Pedrão'); adm.fill('#vt_telefone','(11) 98888-7777')
    adm.click('button:has-text("Salvar visitante")'); adm.wait_for_selector('text=Marque no mapa')
    box=adm.locator('#vmapa').bounding_box(); adm.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)  # pino
    adm.wait_for_selector('text=Pino marcado'); adm.wait_for_selector('.vt-perto.ok:has-text("Célula mais próxima")',timeout=8000); assert 'Célula' in adm.inner_text('#vt_perto')  # prévia antes de salvar
    adm.click('button:has-text("Salvar visitante")'); adm.wait_for_selector('.modal:has-text("Visitante lançado")'); adm.click('.modal button:has-text("Ver visitantes")')
    adm.wait_for_selector('.card:has-text("Pedro Lima")'); assert 'WhatsApp' in adm.inner_text('#view'); adm.screenshot(path=OUT+'/visitantes.png')
    # líder da célula mais próxima recebe o alerta
    n=lid.evaluate("async()=>JSON.stringify(await api('listNotifications',{}))"); assert 'Pedro Lima' in n and 'visitante' in n, n[:300]
    sp=entra(b,'sup@zoe.com','Temp12345','NovaSenha123'); n2=sp.evaluate("async()=>JSON.stringify(await api('listNotifications',{}))"); assert 'Pedro Lima' in n2 and 'visitante' in n2, n2[:300]  # supervisor do líder também é avisado
    # decisão no culto -> feed
    adm.click('.tabs button:has-text("Aceitou Jesus")'); adm.wait_for_selector('#vj_n'); adm.fill('#vj_n','Carlos Souza'); adm.click('button:has-text("Publicar no feed")')
    adm.wait_for_selector('.sp-j:has-text("Carlos Souza")')
    ana.click('.nv[aria-label="Início"]'); ana.evaluate("SOC.igreja=null;render()"); ana.wait_for_selector('.sp-j:has-text("Carlos Souza")')
    ana.click('.sp-j button:has-text("Curtir")'); ana.wait_for_selector('.sp-j button:has-text("Curtiu")')
    ana.click('.sp-j button:has-text("Comentar")'); ana.fill('input[id^=sc_]','Glória a Deus!'); ana.press('input[id^=sc_]','Enter'); ana.wait_for_selector('.sp-c:has-text("Glória a Deus!")'); ana.screenshot(path=OUT+'/feed_decisao.png')
    print('ERROS',errs); assert not errs
print('OK')
