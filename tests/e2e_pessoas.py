# Pessoas (perfis abertos) e chat ao lado do sino
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
    adm.evaluate("""async()=>{await api('createUser',{nome:'Ana Souza',email:'ana@zoe.com',senha:'Temp12345',papel:'membro'});await api('createUser',{nome:'Bruno Álvares',email:'bruno@zoe.com',senha:'Temp12345',papel:'membro'})}""")
    ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123'); bru=entra(b,'bruno@zoe.com','Temp12345','NovaSenha123')
    # Ana busca o Bruno na aba Pessoas e abre o perfil
    ana.click('.nv[aria-label="Pessoas"]'); ana.wait_for_selector('#ps_q'); ana.fill('#ps_q','alvar'); ana.wait_for_selector('#ps_r .opt:has-text("Bruno")'); ana.click('#ps_r button:has-text("Ver perfil")')
    ana.wait_for_selector('.pf-head:has-text("Bruno")'); assert 'Envolvimento' in ana.inner_text('#view') and 'Mensagem' in ana.inner_text('.pf-head'); assert 'Personalizar' not in ana.inner_text('#view') and 'Como ganhar XP' not in ana.inner_text('#view')
    ana.screenshot(path=OUT+'/pessoas_perfil.png')
    # chat: Ana manda mensagem
    ana.click('.pf-head button:has-text("Mensagem")'); ana.wait_for_selector('#ch_t'); ana.fill('#ch_t','Paz, Bruno!'); ana.press('#ch_t','Enter'); ana.wait_for_selector('.chm.me:has-text("Paz, Bruno!")')
    # Bruno vê a notificação no ícone de chat e responde
    bru.evaluate("chTick()"); bru.wait_for_selector('#bch .dot'); assert bru.inner_text('#bch .dot')=='1'
    bru.click('#bch'); bru.wait_for_selector('.chr:has-text("Ana")'); assert 'Paz, Bruno!' in bru.inner_text('.chr'); bru.click('.chr:has-text("Ana")'); bru.wait_for_selector('.chm.ou:has-text("Paz, Bruno!")')
    bru.fill('#ch_t','Paz, Ana! Tudo bem?'); bru.press('#ch_t','Enter'); bru.wait_for_selector('.chm.me:has-text("Tudo bem?")'); bru.screenshot(path=OUT+'/chat_bruno.png')
    ana.wait_for_selector('.chm.ou:has-text("Tudo bem?")',timeout=15000)
    # busca por nome dentro do chat
    ana.click('.chh button[aria-label="Voltar"]'); ana.fill('#ch_q','bru'); ana.wait_for_selector('.chr:has-text("Bruno")'); ana.keyboard.press('Escape'); assert ana.locator('#chatp').count()==0
    print('ERROS',errs); assert not errs
print('OK')
