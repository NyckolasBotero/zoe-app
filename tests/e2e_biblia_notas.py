# Bíblia: marcar versículo, comentar, anotação do culto, Maratona dentro da Bíblia
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
    adm.evaluate("""async()=>{const c=await api('createCell',{nome:'Célula Norte',dia:'Quinta'});await api('createUser',{email:'ana@zoe.com',nome:'Ana Souza',senha:'Temp12345',papel:'membro',celulaId:c.id})}""")
    adm.click('.nv[aria-label="Bíblia e Anotações"]'); adm.wait_for_selector('#bibtxt .bv'); adm.evaluate("bibGo(43,3)"); adm.wait_for_selector('#bibtxt .bv:nth-child(16)')
    adm.click('#bibtxt .bv >> nth=15'); adm.wait_for_selector('.bpan')
    adm.click('.bpan .mcor[aria-label="Marca-texto amarelo"]'); adm.wait_for_selector('#bibtxt .bv span[style*="background"]')
    adm.fill('#bv_c','Amor de Deus por todos'); adm.check('#bv_p'); adm.click('.bpan button:has-text("Adicionar às anotações do culto")'); adm.wait_for_selector('.cultoBar, .card:has-text("Anotação do culto em andamento")')
    adm.screenshot(path=OUT+'/biblia_marca.png')
    # marcação permanece depois de recarregar
    adm.evaluate("BM.key='';bibShow()"); adm.wait_for_selector('#bibtxt .bv span[style*="background"]')
    adm.click('button:has-text("Abrir anotação")'); adm.wait_for_selector('#cu_t'); adm.fill('#cu_t','Mordomia Cristã'); adm.fill('#cu_d','2026-11-01') if False else None
    assert 'Tema Mordomia Cristã' in adm.inner_text('#cu_tt'), adm.inner_text('#cu_tt')
    adm.click('button:has-text("Salvar anotação")'); adm.wait_for_selector('.sp:has-text("Anotação do culto")'); assert 'Mordomia' in adm.inner_text('#view')
    # Ana (outra pessoa) vê comentário público na Bíblia
    ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123'); ana.click('.nv[aria-label="Bíblia e Anotações"]'); ana.wait_for_selector('#bibtxt .bv'); ana.evaluate("bibGo(43,3)"); ana.wait_for_selector('.bvp:has-text("Amor de Deus")')
    ana.screenshot(path=OUT+'/biblia_publico.png')
    print('ERROS',errs); assert not errs
print('OK')
