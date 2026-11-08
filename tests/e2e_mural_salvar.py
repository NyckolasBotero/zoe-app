# Mural da célula: sobe foto/mexe sem salvar (rascunho), só vale após "Salvar mural"
from playwright.sync_api import sync_playwright
from PIL import Image
URL='http://localhost:8799/'; errs=[]
Image.new('RGB',(400,300),(200,60,60)).save('/tmp/mur1.jpg'); Image.new('RGB',(400,300),(40,120,200)).save('/tmp/mur2.jpg')
with sync_playwright() as p:
    b=p.chromium.launch(); a=b.new_page(); a.goto(URL); a.wait_for_selector('#lg_e'); a.fill('#lg_e','admin@zoe.com'); a.fill('#lg_s','SenhaForte123'); a.click('#lg_b'); a.wait_for_selector('#view h1',timeout=20000); a.wait_for_selector('#splash',state='detached',timeout=15000)
    a.evaluate("""async()=>{const l=await api('createUser',{email:'lid1@zoe.com',nome:'Lider Um',senha:'Temp12345',papel:'membro'});await api('createCell',{nome:'Célula Um',liderId:l.membroId,dia:'Quinta'})}"""); a.close()
    pg=b.new_page(viewport={'width':1100,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','lid1@zoe.com'); pg.fill('#lg_s','Temp12345'); pg.click('#lg_b'); pg.wait_for_timeout(1500)
    if pg.locator('#fp_a').count():
        pg.fill('#fp_a','Temp12345'); pg.fill('#fp_n','SenhaNova2026!'); pg.fill('#fp_r','SenhaNova2026!'); pg.click('button:has-text("Salvar nova senha")'); pg.wait_for_timeout(1500)
        if pg.locator('#lg_e').count(): pg.fill('#lg_e','lid1@zoe.com'); pg.fill('#lg_s','SenhaNova2026!'); pg.click('#lg_b')
    pg.wait_for_selector('#view h1',timeout=20000); pg.wait_for_timeout(800)
    pg.evaluate("document.querySelectorAll('.zoe-force,[class*=tutor]').forEach(x=>x.remove())")
    pg.evaluate("go('celula','mural')"); pg.wait_for_selector('#board',timeout=10000); pg.wait_for_timeout(600)
    n0=pg.evaluate("S.muralItems.filter(i=>i.srv).length")
    pg.set_input_files('input[type=file][accept="image/*"]','/tmp/mur1.jpg'); pg.wait_for_selector('.it2.polar',timeout=5000)  # aparece na hora
    pg.wait_for_selector('#ml_t'); pg.evaluate("MU.busy=false;closeL()"); MU=lambda: pg.evaluate("MU.dirty")
    assert MU() and 'não salvas' in pg.inner_text('#mbar')
    pg.evaluate("MU.t=0;muralLoad(true)"); pg.wait_for_timeout(1200)  # poll não pode apagar o rascunho
    assert pg.locator('.it2.polar').count()>=1, 'rascunho sumiu'
    pg.set_input_files('input[type=file][accept="image/*"]','/tmp/mur2.jpg'); pg.wait_for_selector('#ml_t',timeout=5000); pg.evaluate("MU.busy=false;closeL()")
    # mover sem salvar: posição fica
    el=pg.locator('.it2.polar').first; bx=el.bounding_box(); pg.mouse.move(bx['x']+30,bx['y']+30); pg.mouse.down(); pg.mouse.move(bx['x']+130,bx['y']+90,steps=5); pg.mouse.up()
    x1=pg.evaluate("S.muralItems[0].x"); pg.wait_for_timeout(1500); assert pg.evaluate("S.muralItems[0].x")==x1
    assert pg.evaluate("api('getCellMural',{}).then(r=>r.itens.length)")==n0, 'nada deve ter ido ao servidor antes de salvar'
    pg.click('#mbar button:has-text("Salvar mural")'); pg.wait_for_function("!MU.dirty&&!MU.saving",timeout=10000); pg.wait_for_timeout(600)
    assert pg.evaluate("api('getCellMural',{}).then(r=>r.itens.length)")==n0+2
    assert 'Mural salvo' in pg.inner_text('#mbar')
    # descartar
    pg.set_input_files('input[type=file][accept="image/*"]','/tmp/mur1.jpg'); pg.wait_for_selector('#ml_t',timeout=5000); pg.evaluate("MU.busy=false;closeL()")
    pg.click('#mbar button:has-text("Descartar")'); pg.wait_for_function("!MU.dirty&&S.muralItems.length==%d"%(n0+2),timeout=8000)
    print('ERROS:',errs); assert not errs; print('E2E MURAL SALVAR OK')
