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
    pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')"); pg.add_style_tag(content='#pushbar{display:none!important}'); return pg
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
    # o supervisor recebe primeiro; o líder só depois que o supervisor encaminhar
    n=lid.evaluate("async()=>JSON.stringify(await api('listNotifications',{}))"); assert 'Pedro Lima' not in n, n[:300]
    sp=entra(b,'sup@zoe.com','Temp12345','NovaSenha123'); n2=sp.evaluate("async()=>JSON.stringify(await api('listNotifications',{}))"); assert 'Pedro Lima' in n2 and 'Visitante para encaminhar' in n2, n2[:300]
    sp.click('.nv[aria-label="Consolidação"]'); sp.click('.tabs button:has-text("Visitantes")'); sp.wait_for_selector('.card:has-text("Pedro Lima")'); assert 'Aguardando o supervisor' in sp.inner_text('#view')
    sp.click('button:has-text("Encaminhar")'); sp.wait_for_selector('text=Encaminhado',timeout=8000); sp.wait_for_selector('.vtfl:has-text("Encaminhado em")',timeout=8000)
    n=lid.evaluate("async()=>JSON.stringify(await api('listNotifications',{}))"); assert 'Pedro Lima' in n and 'visitante' in n, n[:300]
    lid.click('.nv[aria-label="Consolidação"]'); lid.click('.tabs button:has-text("Visitantes")'); lid.wait_for_selector('button:has-text("Aceitar consolidar")'); lid.click('button:has-text("Aceitar consolidar")'); lid.wait_for_selector('.vtfl:has-text("Aceito por")',timeout=8000)
    # ficha geral: supervisor e líder veem; membro comum não
    assert ana.locator('.nv[aria-label="Fichas de membros"]').count()==0
    sp.click('.nv[aria-label="Fichas de membros"]'); sp.wait_for_selector('#fi_q'); lid.click('.nv[aria-label="Fichas de membros"]'); lid.wait_for_selector('#fi_q')
    adm.click('.nv[aria-label="Fichas de membros"]'); adm.wait_for_selector('#fi_q'); adm.fill('#fi_q','Sup'); adm.wait_for_selector('.opt:has-text("Sup Norte")'); adm.click('.opt:has-text("Sup Norte")'); adm.wait_for_selector('h3:has-text("Linha do tempo")',timeout=8000)
    t=adm.inner_text('#view'); assert 'Datas importantes' in t and 'Presenças' in t and 'Cursos' in t and 'Inscrições em eventos' in t and 'Uso do aplicativo' in t, t[:400]
    adm.screenshot(path=OUT+'/ficha.png',full_page=True)
    assert adm.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
    # decisão no culto -> feed
    adm.click('.nv[aria-label="Consolidação"]'); adm.wait_for_selector('.tabs button:has-text("Aceitou Jesus")')
    adm.click('.tabs button:has-text("Aceitou Jesus")'); adm.wait_for_selector('#vj_n'); adm.fill('#vj_n','Carlos Souza'); adm.click('button:has-text("Publicar no feed")')
    adm.wait_for_selector('.sp-j:has-text("Carlos Souza")')
    ana.click('.nv[aria-label="Início"]'); ana.evaluate("SOC.igreja=null;render()"); ana.wait_for_selector('.sp-j:has-text("Carlos Souza")')
    ana.click('.sp-j button:has-text("Curtir")'); ana.wait_for_selector('.sp-j button:has-text("Curtiu")')
    ana.click('.sp-j button:has-text("Comentar")'); ana.fill('input[id^=sc_]','Glória a Deus!'); ana.press('input[id^=sc_]','Enter'); ana.wait_for_selector('.sp-c:has-text("Glória a Deus!")'); ana.screenshot(path=OUT+'/feed_decisao.png')
    print('ERROS',errs); assert not errs
print('OK')
