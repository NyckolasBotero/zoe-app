# Família Zoe: visão geral, mural livre dos pastores (admin edita, todos veem), Onde estamos com mapa e foto, Fale com a igreja por último
from playwright.sync_api import sync_playwright
import os,base64
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,email,senha,nova=None,vw=1300):
    pg=b.new_page(viewport={'width':vw,'height':900}); pg.route('**/www.google.com/**',lambda r:r.fulfill(body='<html><body>mapa</body></html>',content_type='text/html')); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b')
    try: pg.wait_for_selector('#fp_n,#view h1')
    except Exception: pg.screenshot(path='/tmp/fail_login.png'); print('BODY',pg.inner_text('body')[:300]); raise
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',senha); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',email); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')"); return pg
# imagem de teste (jpeg pequeno)
from PIL import Image
Image.new('RGB',(300,400),(200,60,60)).save('/tmp/past.jpg'); Image.new('RGB',(600,400),(40,120,200)).save('/tmp/fachada.jpg')
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    adm.evaluate("api('createUser',{email:'ana@zoe.com',nome:'Ana Souza',senha:'Temp12345',papel:'membro'})")
    adm.evaluate("go('familia')"); adm.wait_for_selector('.tabs')
    tabs=adm.evaluate("[...document.querySelectorAll('.tabs button')].map(e=>e.textContent.trim())")
    assert tabs[0]=='Uma Família Para Pertencer' and tabs[-1]=='Fale com a Igreja' and tabs[1]=='Notícias', tabs
    t=adm.inner_text('#view'); assert 'Notícias' in t and 'Onde estamos' in t and 'Programação' in t and 'Nossos Pastores' in t
    adm.screenshot(path=OUT+'/fam_visao.png',full_page=True)
    # atalho "Ver detalhes"
    adm.click('.vsec:has-text("Programação") button:has-text("Ver detalhes")'); assert adm.evaluate("R.sub.familia")=='prog'
    # --- pastores: admin edita
    adm.evaluate("sub('familia','pastores')"); adm.click('button:has-text("Editar mural")'); adm.wait_for_selector('.mfbar')
    adm.set_input_files('.mfbar input[type=file]','/tmp/past.jpg'); adm.wait_for_selector('.mfit.polar')
    # arrastar a foto
    adm.evaluate("document.querySelector('.mfit.polar').scrollIntoView({block:'center'})"); adm.wait_for_timeout(900)
    bx=adm.evaluate("(()=>{const r=document.querySelector('.mfit.polar').getBoundingClientRect();return[r.x+r.width/2,r.y+r.height/2]})()")
    x0=adm.evaluate("MF.dr.pastores.find(i=>i.t==='foto').x")
    adm.mouse.move(bx[0],bx[1]); adm.mouse.down(); adm.mouse.move(bx[0]+120,bx[1]+60,steps=6); adm.mouse.up()
    x1=adm.evaluate("MF.dr.pastores.find(i=>i.t==='foto').x"); assert x1>x0+80, (x0,x1)
    adm.click('.mfbar button:has-text("Texto")'); adm.wait_for_selector('.mft')
    adm.click('.mfbar button[aria-label="Adesivo heart"]')
    # desenhar
    adm.click('.mfbar button:has-text("Desenhar")'); adm.evaluate("document.querySelector('.mfb').scrollIntoView()"); r=adm.evaluate("(()=>{const r=document.querySelector('.mfb').getBoundingClientRect();return[r.x,r.y,r.width,r.height]})()")
    adm.mouse.move(r[0]+r[2]*.2,r[1]+r[3]*.3); adm.mouse.down(); adm.mouse.move(r[0]+r[2]*.5,r[1]+r[3]*.6,steps=8); adm.mouse.up()
    assert adm.evaluate("MF.dr.pastores.filter(i=>i.t==='traco').length")==1
    adm.click('.mfbar button:has-text("Salvar para todos")'); adm.wait_for_function("!MF.ed.pastores",timeout=8000)
    assert adm.evaluate("MF.d.pastores.length")==4, adm.evaluate("MF.d.pastores.map(i=>i.t)")
    adm.screenshot(path=OUT+'/fam_pastores.png',full_page=True)
    # outro usuário vê o mesmo, sem botão de editar
    ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123'); ana.evaluate("sub('familia','pastores')==null"); ana.evaluate("go('familia','pastores')")
    ana.wait_for_selector('.mfit.polar',timeout=8000); assert ana.query_selector('button:has-text("Editar mural")') is None and ana.query_selector('.mfbar') is None
    assert ana.evaluate("document.querySelectorAll('.mfit').length")==3 and ana.evaluate("document.querySelectorAll('.mfs path').length")==1
    # --- onde estamos
    adm.evaluate("sub('familia','onde')"); adm.wait_for_selector('.onde iframe'); assert 'google.com/maps' in adm.evaluate("document.querySelector('.onde iframe').src") and 'output=embed' in adm.evaluate("document.querySelector('.onde iframe').src")
    adm.set_input_files('.onde input[type=file]','/tmp/fachada.jpg'); adm.wait_for_selector('.onde .or img',timeout=8000)
    ana.evaluate("sub('familia','onde')"); ana.wait_for_selector('.onde iframe'); ana.wait_for_selector('.onde .or img',timeout=8000); assert ana.query_selector('.onde input[type=file]') is None
    adm.screenshot(path=OUT+'/fam_onde.png',full_page=True)
    # visão geral mostra tudo
    ana.evaluate("sub('familia','visao')"); ana.wait_for_selector('.vsec .mfb'); ana.wait_for_selector('.vsec .onde .or img',timeout=8000)
    # celular
    m=entra(b,'admin@zoe.com','SenhaForte123',vw=390); m.evaluate("go('familia','pastores')"); m.wait_for_selector('.mfb'); m.wait_for_timeout(500)
    assert m.evaluate("document.documentElement.scrollWidth<=innerWidth+2"), 'rolagem horizontal no celular'
    print('ERRS',errs); assert not errs
print('OK')
