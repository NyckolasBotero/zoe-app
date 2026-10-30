# Multimídia: músicas com layout, slides por linha em branco, projeção em janela, pausa com logo
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
LETRA="Santo, Santo, Santo\nÉ o Senhor\n\nDigno é o Cordeiro\nQue foi imolado\n\nGrande é o Senhor\nE digno de louvor"
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("go('multimidia')"); pg.wait_for_selector('text=Músicas do ministério Som')
    pg.click('button:has-text("Nova música")'); pg.wait_for_selector('#mm_letra')
    pg.fill('input[oninput*="titulo"]','Santo'); pg.fill('#mm_letra',LETRA)
    assert pg.inner_text('#mm_n').startswith('3 slide'), pg.inner_text('#mm_n')
    assert pg.locator('.mm-s').count()==3
    # juntar slide 2 com o 1 e dividir de volta
    pg.click('.mm-s >> nth=1 >> text=Juntar'); assert pg.locator('.mm-s').count()==2
    pg.fill('#mm_letra',LETRA); assert pg.locator('.mm-s').count()==3
    # layout próprio
    pg.uncheck('text=Usar o layout padrão >> input'); pg.wait_for_selector('.mm-form')
    pg.select_option('.mm-form select >> nth=0','estrelas') if False else None
    pg.evaluate("mmSetV('parts','estrelas');mmSetV('fonte','cinzel');mmSetV('ita',true)")
    pg.wait_for_selector('#mmprev canvas'); pg.wait_for_timeout(600); pg.screenshot(path=OUT+'/mm_editor.png')
    pg.click('button:has-text("Salvar")'); pg.wait_for_selector('.toast:has-text("Música salva")'); pg.wait_for_selector('#mm_lista .opt:has-text("Santo")')
    assert 'layout próprio' in pg.inner_text('#mm_lista')
    # layout padrão
    pg.click('.tabs >> text=Layout padrão'); pg.wait_for_selector('#mmprev canvas'); pg.evaluate("mmSetV('tam',7)"); pg.click('button:has-text("Salvar layout padrão")'); pg.wait_for_selector('.toast:has-text("Layout padrão das músicas salvo")')
    pg.click('.tabs >> text=Músicas'); pg.click('#mm_lista .opt:has-text("Santo") >> button:has-text("Projetar")'); pg.wait_for_selector('#mm_cur canvas')
    assert pg.locator('.mm-it').count()==3; pg.screenshot(path=OUT+'/mm_proj_antes.png')
    with pg.expect_popup() as pi: pg.click('#mm_ini')
    w=pi.value; w.wait_for_selector('#st canvas'); w.wait_for_function("document.querySelector('#st div div')&&document.querySelector('#st div div').textContent.includes('Santo, Santo')",timeout=8000)
    pg.wait_for_selector('text=Transmitindo'); print('modo:',pg.inner_text('.chip.g'))
    pg.click('button:has-text("Próximo")'); w.wait_for_function("document.body.innerText.includes('Cordeiro')",timeout=6000)
    pg.click('.mm-it >> nth=2'); w.wait_for_function("document.body.innerText.includes('digno de louvor')",timeout=6000)
    pg.click('button:has-text("Pausar transmissão")'); w.wait_for_function("document.querySelector('.mmpause').style.opacity==='1'",timeout=5000)
    pg.screenshot(path=OUT+'/mm_proj_pausa.png'); w.screenshot(path=OUT+'/mm_popup_pausa.png')
    pg.click('button:has-text("Retomar")'); w.wait_for_function("document.querySelector('.mmpause').style.opacity==='0'",timeout=5000); w.screenshot(path=OUT+'/mm_popup.png')
    pg.click('button:has-text("Encerrar")'); w.wait_for_function("document.querySelector('.mmpause').style.opacity==='1'",timeout=5000)
    w.close()
    # mobile
    m=b.new_page(viewport={'width':390,'height':844}); m.on('pageerror',lambda e:errs.append(str(e)))
    m.goto(URL); m.wait_for_selector('#lg_e'); m.fill('#lg_e','admin@zoe.com'); m.fill('#lg_s','SenhaForte123'); m.click('#lg_b'); m.wait_for_selector('#view h1'); m.wait_for_selector('#splash',state='detached',timeout=15000); m.evaluate("api('guideDone')")
    m.evaluate("go('multimidia')"); m.wait_for_selector('#mm_lista .opt'); m.click('button:has-text("Editar")'); m.wait_for_selector('#mmprev canvas'); m.screenshot(path=OUT+'/mm_mobile.png')
    # excluir
    pg.evaluate("mmSaiProj()"); pg.click('#mm_lista .opt:has-text("Santo") >> button[aria-label="Excluir"]'); pg.wait_for_selector('text=Nenhuma música ainda')
    print('ERRS',errs); assert not errs
print('OK')
