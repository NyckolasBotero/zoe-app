# Biblioteca virtual, testemunhos, mural (redimensionar e compartilhar) e organograma em árvore
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,email,senha,nova=None):
    pg=b.new_page(viewport={'width':1100,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b')
    pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',senha); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',email); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    return pg
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    # --- admin envia o PDF
    adm.evaluate("go('admin')"); adm.wait_for_selector('#bk_t')
    adm.fill('#bk_t','Propósito'); adm.fill('#bk_a','Autor Teste'); adm.fill('#bk_d','Um livro para a célula')
    adm.set_input_files('#bk_p','/tmp/demo.pdf'); adm.set_input_files('#bk_c','/tmp/capa.png'); adm.click('text=Adicionar livro'); adm.wait_for_selector("text=Livro adicionado")
    # --- membro lê e comenta
    adm.evaluate("async()=>{await api('createUser',{nome:'Ana Souza',email:'ana@zoe.com',senha:'Temp12345',papel:'membro'})}")
    ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123'); ana.evaluate("go('biblioteca')"); ana.wait_for_selector("text=Ler e comentar"); ana.click("text=Ler e comentar")
    ana.wait_for_selector('#pdfcv'); ana.wait_for_function("document.querySelector('#pgn')"); assert 'de 2' in ana.inner_text('#pdfbox'), ana.inner_text('#pdfbox')
    ana.click('button[aria-label="Próxima página"]'); ana.wait_for_function("document.querySelector('#pgn').value==='2'")
    assert ana.input_value('#lc_p')=='2'
    ana.fill('#lc_t','Capítulo abençoador'); ana.click('text=Publicar comentário'); ana.wait_for_selector("#lc_lista >> text=Capítulo abençoador"); assert 'pág. 2' in ana.inner_text('#lc_lista')
    ana.click("#lc_lista >> text=Amém"); ana.wait_for_selector("#lc_lista >> text=Amém · 1")
    ana.locator('#pdfbox').screenshot(path=OUT+'/s_leitor.png')
    # admin vê o comentário no feed
    adm.evaluate("go('biblioteca')"); adm.click("text=Ler e comentar"); adm.wait_for_selector("#lc_lista >> text=Capítulo abençoador")
    # --- testemunhos no Início
    ana.evaluate("go('feed')"); ana.fill('#tm_t','Cura'); ana.fill('#tm_x','Deus me curou de uma enfermidade grave.'); ana.click('text=Compartilhar testemunho'); ana.wait_for_selector("#tm_lista >> text=Deus me curou")
    adm.evaluate("go('feed')"); adm.wait_for_selector("#tm_lista >> text=Deus me curou"); adm.locator('#tm_lista').screenshot(path=OUT+'/s_home.png')
    # --- cria células com multiplicação e confere o organograma
    ids=adm.evaluate("async()=>Object.fromEntries((await api('listUsers')).map(u=>[u.email,u.membroId]))")
    adm.evaluate("async(i)=>{const a=(await api('createCell',{nome:'Semeadores',liderId:i['ana@zoe.com'],supervisorId:i['admin@zoe.com'],dia:'Quinta',inicio:'20:00'})).id;await api('createCell',{nome:'Seara',supervisorId:i['admin@zoe.com'],dia:'Segunda',maeId:a});await api('createCell',{nome:'Raízes',supervisorId:i['admin@zoe.com'],maeId:a});await api('createCell',{nome:'Vida',supervisorId:i['admin@zoe.com']});}",ids)
    adm=entra(b,'admin@zoe.com','SenhaForte123')
    adm.evaluate("go('celula','org')"); adm.wait_for_selector('#orgwrap svg'); t=adm.inner_text('#orgwrap'); assert 'Semeadores' in t and 'Seara' in t and 'Supervisão' in t, t
    adm.locator('#orgwrap').screenshot(path=OUT+'/s_org.png')
    # --- mural: foto larga inteira, redimensionar, compartilhar
    adm.evaluate("go('celula','mural')"); adm.wait_for_selector('#board')
    adm.set_input_files('input[type=file][accept="image/*"]','/tmp/wide.png'); adm.wait_for_selector('.polar img.im')
    r=adm.evaluate("(()=>{const i=document.querySelector('.polar img.im');return [i.clientWidth,i.clientHeight]})()"); assert abs(r[0]/r[1]-2.4)<0.15, r  # proporção preservada (1200x500)
    w0=adm.evaluate("document.querySelector('.polar:has(img.im)').offsetWidth")
    bx=adm.locator('.polar:has(img.im) .rz').bounding_box(); adm.mouse.move(bx['x']+14,bx['y']+14); adm.mouse.down(); adm.mouse.move(bx['x']+134,bx['y']+60,steps=5); adm.mouse.up()
    w1=adm.evaluate("document.querySelector('.polar:has(img.im)').offsetWidth"); assert w1>w0+60,(w0,w1)
    adm.screenshot(path=OUT+'/s_mural.png')
    adm.click('text=Salvar e compartilhar'); adm.wait_for_selector('text=Mural pronto'); assert adm.evaluate("document.querySelector('.modal img').naturalWidth")>400
    adm.locator('.modal .box').screenshot(path=OUT+'/s_mural_share.png')
    print('ERROS:',errs); print('E2E BIBLIOTECA OK' if not errs else 'FALHOU')
