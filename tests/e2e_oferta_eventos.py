# Oferta liga/desliga na chamada, palestrantes ao criar evento aparecem nos cards, recesso institucional
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
def entra(br,email,senha):
    ctx=br.new_context(viewport={'width':420,'height':900}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(email+': '+str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_timeout(1500)
    if pg.locator('#fp_a').count():
        pg.fill('#fp_a','Temp12345'); pg.fill('#fp_n','SenhaNova2026!'); pg.fill('#fp_r','SenhaNova2026!'); pg.click('button:has-text("Salvar nova senha")'); pg.wait_for_timeout(1500)
        if pg.locator('#lg_e').count(): pg.fill('#lg_e',email); pg.fill('#lg_s','SenhaNova2026!'); pg.click('#lg_b')
    pg.wait_for_selector('#view h1',timeout=20000); pg.wait_for_timeout(700); return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    adm=entra(b,'admin@zoe.com','SenhaForte123'); lid=entra(b,'lid1@zoe.com','Temp12345')
    # desligado: sem campo
    lid.evaluate("go('celula','freq')"); lid.wait_for_selector('#fj',timeout=8000); assert lid.locator('#fof').count()==0,'sem campo de oferta quando desligado'
    # admin liga
    assert adm.evaluate("api('saveConfig',{OfertaAtiva:true}).then(()=>true)")
    lid=entra(b,'lid1@zoe.com','SenhaNova2026!'); lid.evaluate("go('celula','freq')"); lid.wait_for_selector('#fof',timeout=8000)
    assert adm.evaluate("api('saveConfig',{OfertaAtiva:false}).then(()=>true)")
    lid=entra(b,'lid1@zoe.com','SenhaNova2026!'); lid.evaluate("go('celula','freq')"); lid.wait_for_selector('#fj',timeout=8000); assert lid.locator('#fof').count()==0
    # palestrantes: criar evento pelo formulário
    adm.evaluate("go('admin')"); adm.wait_for_selector('#ev1',timeout=8000) if adm.locator('#ev1').count() else None
    if not adm.locator('#ev1').count(): adm.evaluate("ADM&&0; document.querySelectorAll('[onclick*=eventos]').forEach(x=>0)")
    adm.fill('#ev1','Congresso Zoe'); adm.fill('#ev2','2027-03-10')
    adm.click('text=+ Adicionar palestrante'); adm.fill('input[placeholder="Nome do palestrante"]','Pr. João Silva'); adm.click('button[onclick="addEv()"]')
    adm.wait_for_function("EVENTOS.some(e=>e.t==='Congresso Zoe'&&e.pal.length===1)",timeout=8000)
    adm.evaluate("go('eventos')"); adm.wait_for_selector('.pal-n:has-text("Pr. João Silva")',timeout=8000)
    adm.evaluate("R.ev=EVENTOS.find(e=>e.t==='Congresso Zoe').id;render()"); adm.wait_for_selector('h3:has-text("Palestrantes")',timeout=8000)
    print('ERROS:',errs); assert not errs; print('E2E OFERTA/EVENTOS OK')
