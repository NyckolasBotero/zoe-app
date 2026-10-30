# Criador de insígnias: níveis, parâmetros por nível, ícones novos, luz vermelha das aprovações
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    # luz vermelha
    pg.evaluate("S.aprov.pendentes=3;shell()"); pg.wait_for_selector('.nv[aria-label="Aprovações"] .rdot'); pg.evaluate("S.aprov.pendentes=0;shell()"); assert not pg.query_selector('.rdot')
    pg.evaluate("go('insignias')"); pg.wait_for_selector('text=Usuário Fiel'); assert '5 níveis' in pg.inner_text('#view')
    pg.click('button:has-text("Nova insígnia")'); pg.wait_for_selector('text=Nova insígnia')
    pg.fill('input[oninput*="titulo"]','Escriba')
    pg.select_option('select[onchange*="crCrit(\'tipo\'"]','devocionais')
    pg.select_option('select[onchange*="crNivSetCount"]','3'); pg.wait_for_selector('text=Nível 3')
    ns=pg.locator('input[oninput*="\'n\'"]'); assert ns.count()==3
    ns.nth(0).fill('1'); ns.nth(1).fill('10'); ns.nth(2).fill('100')
    pg.locator('input[oninput*="\'nome\'"]').nth(0).fill('Aprendiz'); pg.locator('input[oninput*="\'nome\'"]').nth(2).fill('Mestre')
    pg.locator('details >> text=Visual deste nível').nth(2).click(); pg.locator('details[open] button[title="pergaminho"]').first.click()
    pg.wait_for_selector('details[open] button[title="pergaminho"].on')
    pg.screenshot(path=OUT+'/niveis_form.png',full_page=True)
    pg.click('button:has-text("Salvar insígnia")'); pg.wait_for_selector('.toast:has-text("Insígnia salva")',timeout=10000)
    pg.wait_for_selector('.opt:has-text("Escriba")'); t=pg.inner_text('.opt:has-text("Escriba")'); print(t.replace('\n',' | ')); assert '3 níveis' in t
    d=pg.evaluate("api('listInsigniaDefs').then(r=>r.defs.find(x=>x.titulo==='Escriba'))"); assert [x['n'] for x in d['niveis']]==[1,10,100] and d['niveis'][2]['visual']['icone']=='pergaminho' and d['niveis'][2]['nome']=='Mestre', d
    pg.screenshot(path=OUT+'/niveis_lista.png')
    print('ERRS',errs); assert not errs
print('OK')
