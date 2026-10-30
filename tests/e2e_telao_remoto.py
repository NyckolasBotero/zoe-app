# Controle remoto do telão: o celular passa os slides e o projetor do computador acompanha
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
LETRA="Santo, Santo, Santo\nÉ o Senhor\n\nDigno é o Cordeiro\nQue foi imolado\n\nGrande é o Senhor\nE digno de louvor"
def entra(b,vw,vh):
    pg=b.new_page(viewport={'width':vw,'height':vh}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')"); return pg
with sync_playwright() as p:
    b=p.chromium.launch(); pc=entra(b,1280,900)
    pc.evaluate("api('saveSong',{titulo:'Santo',artista:'Zoe',letra:%r})"%LETRA)
    pc.evaluate("go('multimidia')"); pc.wait_for_selector('#mm_lista .opt:has-text("Santo")')
    pc.click('#mm_lista .opt:has-text("Santo") >> button:has-text("Projetar")'); pc.wait_for_selector('#mm_cur canvas')
    with pc.expect_popup() as pi: pc.click('#mm_ini')
    w=pi.value; w.wait_for_selector('#st canvas'); w.wait_for_function("document.body.innerText.includes('Santo, Santo')",timeout=8000)
    # celular
    ph=entra(b,390,844); ph.evaluate("go('multimidia')"); ph.wait_for_selector('.tabs'); ph.click('.tabs >> text=Controle remoto'); ph.wait_for_selector('.tl-sl',timeout=10000)
    assert 'transmitindo' in ph.inner_text('#tl_box').lower() and 'Santo, Santo' in ph.inner_text('.tl-sl'), ph.inner_text('#tl_box')
    ph.screenshot(path=OUT+'/tl_celular.png')
    ph.click('.tl-btns >> text=Próximo'); w.wait_for_function("document.body.innerText.includes('Cordeiro')",timeout=8000)
    pc.wait_for_function("MM.pj.i===1",timeout=8000)
    ph.click('.tl-chips .chip >> nth=2'); w.wait_for_function("document.body.innerText.includes('digno de louvor')",timeout=8000)
    ph.click('.tl-p'); w.wait_for_function("document.querySelector('.mmpause').style.opacity==='1'",timeout=8000)
    ph.click('.tl-p'); w.wait_for_function("document.querySelector('.mmpause').style.opacity==='0'",timeout=8000)
    ph.click('.tl-btns >> text=Anterior'); w.wait_for_function("document.body.innerText.includes('Cordeiro')",timeout=8000)
    # o computador também publica: avança no PC e o celular vê
    pc.click('button:has-text("Próximo")'); ph.wait_for_function("document.querySelector('.tl-sl').innerText.includes('digno de louvor')",timeout=8000)
    print('ERRS',errs); assert not errs
print('OK')
