# Escalas: supervisor lança em lote; membro confirma / pede re-escalação / troca; indicadores
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,email,senha,nova=None,vw=1200):
    pg=b.new_page(viewport={'width':vw,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',senha); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',email); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')"); return pg
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    adm.evaluate("""async()=>{await api('createUser',{email:'ana@zoe.com',nome:'Ana Souza',senha:'Temp12345',papel:'membro'});await api('createUser',{email:'beto@zoe.com',nome:'Beto Lima',senha:'Temp12345',papel:'membro'})}""")
    adm.evaluate("go('escalas')"); adm.wait_for_selector('text=Lançar escala')
    adm.click('.tabs >> text=Lançar escala')
    adm.select_option('#el_m',index=1)
    adm.fill('#el_q','Ana'); adm.wait_for_selector('#el_r .opt'); adm.click('#el_r .opt')
    adm.fill('#el_d',adm.evaluate("escAddDias(TODAY,2)")); adm.fill('#el_h','19:00')
    adm.click('.opt:has-text("Repetir em lote") .sw'); adm.wait_for_selector('button[aria-pressed]')
    adm.screenshot(path=OUT+'/escalas_lancar.png')
    adm.click('button:has-text("Salvar escala")'); adm.wait_for_selector('.toast:has-text("escala(s) criada(s)")',timeout=10000)
    adm.wait_for_selector('text=pessoas escaladas por ministério',timeout=8000) if False else adm.wait_for_selector('text=Pessoas escaladas por ministério')
    adm.screenshot(path=OUT+'/escalas_geral.png')
    ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123',vw=390)
    ana.evaluate("go('feed')"); ana.wait_for_selector('#esc_home .escl'); assert 'Minhas escalas' in ana.inner_text('#esc_home'); ana.click('#esc_home button:has-text("Abrir escalas"), #esc_home button:has-text("Ver todas")'); ana.wait_for_selector('.tabs >> text=Minhas escalas'); assert 'Vou estar lá' in ana.inner_text('#view')
    ana.evaluate("go('escalas')"); ana.wait_for_selector('.tabs >> text=Minhas escalas'); assert not ana.query_selector('text=Lançar escala')
    ana.click('.tabs >> text=Minhas escalas'); ana.wait_for_selector('text=Vou estar lá')
    ana.click('button:has-text("Vou estar lá") >> nth=0'); ana.wait_for_selector('.chip:has-text("Confirmada")',timeout=8000)
    ana.screenshot(path=OUT+'/escalas_membro.png')
    ana.click('button:has-text("Pedir re-escalação") >> nth=1'); ana.fill('#es_mo','Viagem de trabalho'); ana.click('button:has-text("Enviar ao supervisor")')
    ana.wait_for_selector('.chip:has-text("Pediu re-escalação")',timeout=8000)
    # participar
    ana.click('.tabs >> text=Participar'); ana.select_option('#ep_m',index=2); ana.click('button:has-text("Enviar pedido")'); ana.wait_for_selector('.chip:has-text("Aguardando")',timeout=8000)
    adm.evaluate("escRec()"); adm.wait_for_selector('text=Pedidos de re-escalação'); adm.wait_for_function("document.body.innerText.includes('Viagem de trabalho')",timeout=8000)
    adm.click('.tabs >> text=Pedidos'); adm.wait_for_selector('button:has-text("Aprovar")'); adm.click('button:has-text("Aprovar")'); adm.wait_for_selector('.toast:has-text("aprovado")',timeout=8000)
    adm.click('.tabs >> text=Visão geral'); adm.screenshot(path=OUT+'/escalas_geral2.png')
    # vaga em aberto: o supervisor lança sem escolher ninguém e a Ana se oferece pelo Início
    adm.click('.tabs >> text=Lançar escala'); adm.select_option('#el_m',index=2); adm.fill('#el_d',adm.evaluate("escAddDias(TODAY,3)")); adm.fill('#el_h','10:00'); adm.fill('#el_v','2')
    assert 'vaga' in adm.inner_text('#view').lower()
    adm.click('button:has-text("Salvar escala")'); adm.wait_for_selector('.toast:has-text("vaga(s) aberta(s)")',timeout=10000)
    ana.evaluate("escRec();go('feed')"); ana.wait_for_selector('#esc_home .escl:has-text("Vagas abertas")',timeout=10000)
    ana.click('#esc_home button:has-text("Quero servir")'); ana.wait_for_selector('.toast:has-text("Obrigado por se oferecer")',timeout=8000)
    ana.evaluate("ESC.sub='agenda';go('escalas')"); ana.wait_for_selector('.esc-l.meu .chip:has-text("Confirmada")',timeout=8000)
    print('ERRS',errs); assert not errs
print('OK')
