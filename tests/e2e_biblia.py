from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':400,'height':820})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.evaluate("go('membro')"); pg.wait_for_selector("#bibtxt h3")
    pg.select_option('#bib_l','43'); pg.wait_for_selector("#bibtxt h3:has-text('João 1')"); pg.select_option('#bib_c','3'); pg.wait_for_selector("#bibtxt >> text=amou ao mundo")
    pg.click("text=Próximo"); pg.wait_for_selector("#bibtxt h3:has-text('João 4')")
    pg.fill('#bq','mansos'); pg.click("button[onclick='bibBusca()']"); pg.wait_for_selector("#bibtxt >> text=resultado"); pg.wait_for_selector("#bibtxt >> text=Mateus 5:5")
    pg.screenshot(path='/tmp/bib.png')
    pg.click("text=Voltar à leitura"); pg.wait_for_selector("#bibtxt h3")
print('ERROS:',errs); print('E2E BIBLIA OK' if not errs else 'FALHOU')
