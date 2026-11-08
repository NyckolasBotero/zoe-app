# Parentes: cadastrar padrasto, editar todos os dados e trocar o parentesco; admin cria parentesco
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
def entra(br,email,senha):
    ctx=br.new_context(viewport={'width':420,'height':900}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(email+': '+str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_timeout(1500)
    if pg.locator('#fp_a').count():
        pg.fill('#fp_a','Temp12345'); pg.fill('#fp_n','SenhaNova2026!'); pg.fill('#fp_r','SenhaNova2026!'); pg.click('button:has-text("Salvar nova senha")'); pg.wait_for_timeout(1500)
        if pg.locator('#lg_e').count(): pg.fill('#lg_e',email); pg.fill('#lg_s','SenhaNova2026!'); pg.click('#lg_b')
    pg.wait_for_selector('#view h1',timeout=20000); pg.wait_for_timeout(700); return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    adm=entra(b,'admin@zoe.com','SenhaForte123'); ana=entra(b,'ana@zoe.com','Temp12345')
    # admin cria parentesco
    adm.evaluate("go('admin')"); adm.wait_for_selector('#prx_n',timeout=10000) if adm.locator('#prx_n').count() else None
    assert adm.evaluate("api('saveKinRelDef',{nome:'Sogro',inverso:'Genro/Nora'}).then(r=>r.rels.some(x=>x.k==='x_sogro'))")
    # Ana: cadastrar padrasto
    ana.evaluate("go('perfil','fam')"); ana.wait_for_selector('#kin_card',timeout=10000); ana.wait_for_function("KN.v&&KN.v.rels&&KN.v.rels.length>=3",timeout=8000)
    opts=ana.evaluate("[...document.querySelectorAll('#kn_rel option')].map(o=>o.textContent)"); assert any('padrasto' in o.lower() for o in opts) and any('madrasta' in o.lower() for o in opts) and any('sogro' in o.lower() for o in opts), opts
    ana.evaluate("kinNovoAbre()"); ana.fill('#kn_nome','Carlos Pereira'); ana.select_option('#kn_rel','padrasto'); ana.click('button:has-text("Cadastrar e vincular")')
    ana.wait_for_function("KN.v&&(KN.v.outros||[]).length===1",timeout=8000)
    # editar tudo
    ana.evaluate("kinInfo(KN.v.outros[0].pessoa.id)"); ana.wait_for_selector('#ke_nome',timeout=8000)
    ana.fill('#ke_nome','Carlos Alberto Pereira'); ana.fill('#ke_tel','61988887777'); ana.fill('#ke_ci','Goiânia'); ana.select_option('#ke_rel','pai'); ana.click('button[onclick="kinEditaSalva()"]')
    ana.wait_for_function("KN.v&&KN.v.pais.length===1&&(KN.v.outros||[]).length===0",timeout=8000)
    assert ana.evaluate("KN.v.pais[0].completo")=='Carlos Alberto Pereira'
    # atalho em Família Zoe > Árvore Zoe > Minha família
    ana.evaluate("go('familia','arvore')"); ana.wait_for_selector('button:has-text("Acrescentar familiar")',timeout=10000); ana.click('button:has-text("Editar familiar")'); ana.wait_for_selector('text=Carlos Alberto Pereira',timeout=8000); ana.keyboard.press('Escape')
    print('ERROS:',errs); assert not errs; print('E2E PARENTES OK')
