# Organograma modular (arrastar, menu do botão direito, permissões), fotos de perfil, nota dos livros e carrossel da tela inicial
from playwright.sync_api import sync_playwright
import os, json
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,email,senha,nova=None,w=1400):
    pg=b.new_page(viewport={'width':w,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b')
    pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',senha); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',email); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=8000)
    return pg
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    # --- carrossel sem eventos: versículos
    adm.evaluate("go('feed')"); adm.wait_for_selector('#car .cs.on')
    assert adm.query_selector('#car .vs'), 'sem eventos deve mostrar versículos'
    t0=adm.inner_text('#car .cs.on'); adm.wait_for_function("(t)=>document.querySelector('#car .cs.on').innerText!==t",arg=t0,timeout=5000)
    # --- cards ocupam a largura da tela
    w=adm.evaluate("document.querySelector('#view').getBoundingClientRect().width"); c=adm.evaluate("document.querySelector('.content').getBoundingClientRect().width"); assert c>1100, c
    # --- evento -> carrossel
    adm.evaluate("async()=>{await api('createEvent',{titulo:'Noite de Louvor',data:'2099-01-10',hora:'19:00',local:'Templo',escopo:'igreja'})}")
    adm=entra(b,'admin@zoe.com','SenhaForte123'); adm.wait_for_selector('#car .cs.on'); assert 'Noite de Louvor' in adm.inner_text('#car'), adm.inner_text('#car')
    # --- usuários e células
    adm.evaluate("async()=>{await api('createUser',{nome:'Ana Souza',email:'ana@zoe.com',senha:'Temp12345',papel:'membro'});await api('createUser',{nome:'Beto Lima',email:'beto@zoe.com',senha:'Temp12345',papel:'membro'})}")
    ids=adm.evaluate("async()=>Object.fromEntries((await api('listUsers')).map(u=>[u.email,u.membroId]))")
    adm.evaluate("async(i)=>{await api('createCell',{nome:'Alfa',liderId:i['ana@zoe.com'],supervisorId:i['admin@zoe.com'],dia:'Quinta',inicio:'20:00'});await api('createCell',{nome:'Bravo',supervisorId:i['admin@zoe.com'],dia:'Segunda',inicio:'19:30'})}",ids)
    adm=entra(b,'admin@zoe.com','SenhaForte123'); adm.evaluate("go('celula','org')"); adm.wait_for_selector('.oc.cel')
    assert adm.locator('.oc.cel').count()==2 and adm.locator('.oc.sup').count()==1
    # --- arrasta o card Alfa (mouse) e confere persistência
    box=adm.locator('.oc.cel',has_text='Alfa').bounding_box(); adm.mouse.move(box['x']+40,box['y']+15); adm.mouse.down(); adm.mouse.move(box['x']+140,box['y']+60,steps=8); adm.mouse.move(box['x']+240,box['y']+110,steps=8); adm.mouse.up()
    adm.wait_for_timeout(1200)
    lay=adm.evaluate("async()=>(await api('orgTree')).layout"); assert lay, 'layout deve ser salvo'
    xa=adm.evaluate("ORG.nodes[Object.keys(ORG.nodes).find(k=>ORG.nodes[k].nome==='Alfa')].x")
    adm=entra(b,'admin@zoe.com','SenhaForte123'); adm.evaluate("go('celula','org')"); adm.wait_for_selector('.oc.cel')
    xb=adm.evaluate("ORG.nodes[Object.keys(ORG.nodes).find(k=>ORG.nodes[k].nome==='Alfa')].x"); assert xa==xb, (xa,xb)
    # --- botão direito: vincular Bravo ao Beto
    adm.locator('.oc.cel',has_text='Bravo').click(button='right'); adm.wait_for_selector('#orgmenu'); assert 'Vincular a outro supervisor' in adm.inner_text('#orgmenu')
    adm.click('#orgmenu >> text=Vincular a outro supervisor'); adm.select_option('#om_s',value=ids['beto@zoe.com']); adm.click('.modal button:text-is("Vincular")'); adm.wait_for_selector('.toast'); tt=adm.inner_text('.toast'); assert 'Organograma atualizado' in tt, tt
    adm.wait_for_function("document.querySelectorAll('.oc.sup').length===2")
    adm.screenshot(path=OUT+'/s_org2.png')
    # --- beto agora é supervisor: vê e edita só a Bravo; ana (líder) e quem não é nada não vê
    beto=entra(b,'beto@zoe.com','Temp12345','NovaSenha123'); beto.evaluate("go('celula','org')"); beto.wait_for_selector('.oc.cel')
    assert beto.locator('.oc.cel.ed').count()==1 and 'Bravo' in beto.locator('.oc.cel.ed').inner_text(), beto.locator('.oc.cel.ed').count()
    ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123'); ana.evaluate("go('celula','freq')"); assert 'Organograma' not in ana.inner_text('.tabs')
    assert ana.evaluate("async()=>{try{await api('orgTree');return 'ok'}catch(e){return e.code}}")=='FORBIDDEN'
    # --- foto de perfil da Ana aparece no comentário do livro; nota 1 a 10
    ana.set_input_files('input[type=file]',[]) if False else None
    ana.evaluate("async()=>{S.foto='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';FOTOS[S.membroId]=S.foto;await pushMember('x')}")
    adm.evaluate("go('admin')"); adm.wait_for_selector('#bk_t'); adm.fill('#bk_t','Propósito'); adm.set_input_files('#bk_p','/tmp/demo.pdf'); adm.click('text=Adicionar livro'); adm.wait_for_selector("text=Livro adicionado")
    ana.evaluate("go('biblioteca')"); ana.click("text=Ler e comentar"); ana.wait_for_selector('#lb_nota'); ana.click('#lb_nota button:text-is("8")'); ana.wait_for_selector("#lb_nota >> text=★ 8")
    ana.fill('#lc_t','Muito bom'); ana.click('text=Publicar comentário'); ana.wait_for_selector("#lc_lista >> text=Muito bom"); ana.wait_for_selector('#lc_lista .fa img')
    adm=entra(b,'admin@zoe.com','SenhaForte123'); adm.evaluate("go('biblioteca')"); adm.wait_for_selector('.livro'); adm.click("text=Ler e comentar"); adm.click('#lb_nota button:text-is("6")'); adm.wait_for_selector("#lb_nota >> text=★ 7")
    adm.wait_for_selector('#lc_lista .fa img'); assert adm.query_selector('#lc_lista .fa img').get_attribute('src').startswith('data:image/png')
    adm.evaluate("go('biblioteca')"); adm.wait_for_selector(".livro >> text=7/10")
    print('E2E ORG OK' if not errs else 'ERROS: %s'%errs)
    b.close()
