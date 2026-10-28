from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':400,'height':820})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.evaluate("go('admin')"); pg.wait_for_selector("text=Editar tudo que foi criado")
    # cria célula pelo formulário genérico
    pg.click(".tabs button:has-text('Células')"); pg.wait_for_selector("text=Nada cadastrado ainda.")
    pg.click("button[onclick=\"admForm('')\"]"); pg.fill('#adf0','Semeadores'); pg.select_option('#adf5','Quinta'); pg.click(".box >> text=Salvar"); pg.wait_for_selector("#adl >> text=Semeadores")
    # edita
    pg.click("#adl >> text=Editar"); pg.fill('#adf0','Semeadores Renovados'); pg.click(".box >> text=Salvar"); pg.wait_for_selector("#adl >> text=Semeadores Renovados")
    # evento e vídeo
    pg.click(".tabs button:has-text('Vídeos')"); pg.wait_for_selector("text=Nada cadastrado ainda.")
    pg.click("button[onclick=\"admForm('')\"]"); pg.fill('#adf0','Aula 1'); pg.fill('#adf1','https://youtu.be/abc'); pg.click(".box >> text=Salvar"); pg.wait_for_selector("#adl >> text=Aula 1")
    pg.evaluate("go('tutoriais')"); pg.wait_for_selector("text=Aula 1")
    pg.evaluate("go('admin')"); pg.click(".tabs button:has-text('Vídeos')"); pg.wait_for_selector("#adl >> text=Aula 1")
    pg.once('dialog',lambda d:d.accept()); pg.click("#adl >> text=Remover"); pg.wait_for_selector("#adl >> text=inativo")
    pg.click(".tabs button:has-text('Ministérios')"); pg.wait_for_selector("#adl")
    pg.click("button[onclick=\"admForm('')\"]"); pg.fill('#adf0','Teatro'); pg.set_input_files("input[type=file]",'/home/claude/zoe-app/assets/img/icon-192.png'); pg.wait_for_selector("text=Nova foto escolhida"); pg.click(".box >> text=Salvar"); pg.wait_for_selector("#adl >> text=Teatro")
    pg.evaluate("go('ministerios')"); pg.wait_for_selector(".pic-ph[style*='background']")
    pg.evaluate("go('admin')"); pg.click(".tabs button:has-text('Membros')"); pg.wait_for_selector("#adl >> text=Pastor Admin")
    pg.click("#adl >> text=Editar >> nth=0"); pg.fill('#adf2','Pastor'); pg.click(".box >> text=Salvar"); pg.wait_for_selector("#adl >> text=Pastor Admin")
    pg.screenshot(path='/tmp/admin_edit.png')
print('ERROS:',errs); print('E2E ADMIN OK' if not errs else 'FALHOU')
