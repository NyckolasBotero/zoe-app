# Excluir pessoa permanentemente: só depois de inativa e com acesso desativado
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("api('adminSave',{tipo:'membros',valores:{Nome:'Joao Teste',Email:'j@x.com'}})")
    pg.evaluate("go('admin')"); pg.wait_for_selector('.admtabs'); pg.click('.admtabs >> text=Acessos'); pg.click('button:has-text("Ver e editar") >> nth=0') if pg.query_selector('button:has-text("Ver e editar")') else None
    pg.evaluate("admCarga('membros')"); pg.wait_for_selector('#adl_membros .opt:has-text("Joao Teste")',timeout=8000)
    assert pg.locator('#adl_membros .opt:has-text("Joao Teste") button:has-text("Excluir de vez")').count()==0  # ativo: sem o botão
    pg.click('#adl_membros .opt:has-text("Joao Teste") button:has-text("Remover")'); pg.wait_for_selector('#adl_membros .opt:has-text("Joao Teste") button:has-text("Excluir de vez")',timeout=8000)
    pg.click('#adl_membros .opt:has-text("Joao Teste") button:has-text("Excluir de vez")'); pg.wait_for_selector('#pg_n')
    pg.fill('#pg_n','nome errado'); pg.click('button:has-text("Excluir permanentemente")'); pg.wait_for_timeout(800); assert pg.query_selector('#pg_n'),'confirmação errada deveria manter a janela'
    pg.fill('#pg_n','Joao Teste'); pg.click('button:has-text("Excluir permanentemente")'); pg.wait_for_function("!document.querySelector('#pg_n')",timeout=8000)
    pg.wait_for_function("!document.body.innerText.includes('Joao Teste')",timeout=8000)
    print('ERRS',errs); assert not errs
print('OK')
