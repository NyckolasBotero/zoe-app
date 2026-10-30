# Online / digitando no chat
from playwright.sync_api import sync_playwright
import os
exec(open('tests/e2e_pessoas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    adm.evaluate("""async()=>{await api('createUser',{nome:'Ana Souza',email:'ana@zoe.com',senha:'Temp12345',papel:'membro'});await api('createUser',{nome:'Bruno Álvares',email:'bruno@zoe.com',senha:'Temp12345',papel:'membro'})}""")
    ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123'); bru=entra(b,'bruno@zoe.com','Temp12345','NovaSenha123')
    bru.evaluate("chTick()"); ana.evaluate("chTick()")
    # Ana abre a conversa com o Bruno: ele aparece online
    ana.click('#bch'); ana.wait_for_selector('#ch_q'); ana.fill('#ch_q','bru'); ana.wait_for_selector('.chr:has-text("Bruno") .pdot',timeout=8000)
    ana.click('.chr:has-text("Bruno")'); ana.wait_for_function("document.querySelector('#ch_st')&&document.querySelector('#ch_st').textContent==='online'",timeout=8000)
    # Bruno abre a conversa e digita
    bru.click('#bch'); bru.fill('#ch_q','ana'); bru.click('.chr:has-text("Ana")'); bru.wait_for_selector('#ch_t')
    bru.type('#ch_t','Pa',delay=50)
    ana.wait_for_function("document.querySelector('#ch_st').textContent==='digitando…'",timeout=10000)
    ana.screenshot(path=OUT+'/chat_digitando.png')
    ana.wait_for_function("document.querySelector('#ch_st').textContent==='online'",timeout=15000)  # parou de digitar
    # Bruno fica invisível: Ana o vê offline
    bru.click('.chh button[aria-label="Voltar"]'); bru.click('.chv'); bru.wait_for_selector('.chv.off')
    ana.wait_for_function("document.querySelector('#ch_st').textContent!=='online'",timeout=15000)
    print('ERRS',errs); assert not errs
print('OK')
