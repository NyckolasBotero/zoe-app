# Feed da Zoe: o admin escolhe o que aparece (ex.: Anotações dos cultos) e o feed obedece
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("async()=>{await api('saveNote',{data:TODAY,tema:'Mordomia',texto:'Anotação compartilhada de teste',igreja:true});S.cultoNotas=null}")
    pg.evaluate("go('noticias')"); pg.wait_for_selector('#fu_lista')
    pg.wait_for_function("document.querySelector('#fu_lista').innerText.includes('Anotação compartilhada de teste')",timeout=8000)
    pg.click('summary:has-text("Escolher o que aparece")'); pg.uncheck('label:has-text("Anotações dos cultos") input')
    pg.wait_for_function("!document.querySelector('#fu_lista').innerText.includes('Anotação compartilhada de teste')",timeout=8000)
    pg.check('label:has-text("Anotações dos cultos") input')
    pg.wait_for_function("document.querySelector('#fu_lista').innerText.includes('Anotação compartilhada de teste')",timeout=8000)
    assert not errs, errs
print('OK')
