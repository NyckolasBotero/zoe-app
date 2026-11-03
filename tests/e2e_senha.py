# Recuperação de senha: telas do login (esqueci / falar com meu pastor) e geração de senha temporária pelo responsável
from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,390,800)
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.evaluate("showLogin()"); pg.wait_for_selector('#lg_e')
    assert pg.locator('text=Esqueci minha senha').count()==1 and pg.locator('text=Falar com meu pastor').count()==1
    pg.click('text=Esqueci minha senha'); pg.fill('#es_e','ana@zoe.com'); pg.click('#es_b'); pg.wait_for_selector('#cd_c')
    pg.fill('#cd_c','123456'); pg.fill('#cd_n','NovaSenha123'); pg.fill('#cd_r','Diferente123'); pg.click('#cd_b'); pg.wait_for_selector('text=As senhas não são iguais')
    pg.fill('#cd_c','123456'); pg.fill('#cd_n','NovaSenha123'); pg.fill('#cd_r','NovaSenha123'); pg.click('#cd_b'); pg.wait_for_selector('text=Código inválido ou expirado')
    pg.click('text=Falar com meu pastor'); pg.fill('#aj_e','ana@zoe.com'); pg.click('#aj_b'); pg.wait_for_selector('text=Pedido enviado')
    pg.screenshot(path='/tmp/senha.png')
    assert not errs, errs
    print('OK recuperação de senha (telas)'); b.close()
