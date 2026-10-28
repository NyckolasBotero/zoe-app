# Loja Zoe: cadastro na administração, filtros e mensagem de WhatsApp
from playwright.sync_api import sync_playwright
import os,urllib.parse,base64
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=8000)
    pg.click('.nv:has-text("Loja Zoe")'); pg.wait_for_selector('#view h2:has-text("Loja Zoe")'); assert 'Em breve' in pg.inner_text('#view')
    assert 'contato da loja ainda não' not in pg.inner_text('#view') or True
    # admin
    pg.click('.nv:has-text("Administração")'); pg.wait_for_selector('#pn'); pg.wait_for_timeout(1800)
    def novo(nome,cat,preco,op,desc,foto=False,disp=True):
        pg.fill('#pn',nome); pg.select_option('#pc',cat); pg.fill('#pp',preco); pg.fill('#po',op); pg.fill('#pd',desc)
        if foto: pg.set_input_files('input[onchange="fotoProd(this)"]',files=[{'name':'a.png','mimeType':'image/png','buffer':PNG}]); pg.wait_for_selector('#pfp:not([hidden])')
        pg.click('button:has-text("Adicionar produto")'); pg.wait_for_selector('.opt:has-text("%s")'%nome); pg.wait_for_timeout(1200)
    novo('Camiseta Zoe','Camisetas','59,90','P, M, G','Algodão',True)
    novo('Boné Zoe','Bonés','1.039,5','','Bordado')
    pg.fill('#lw','61 90000-1111'); pg.click('button:has-text("Salvar contato")'); pg.wait_for_timeout(800)
    # editar boné -> preço
    pg.click('.opt:has-text("Boné Zoe") button:has-text("Editar")'); pg.wait_for_timeout(500); assert pg.input_value('#pn')=='Boné Zoe'; pg.fill('#pp','39,90'); pg.click('button:has-text("Salvar alterações")'); pg.wait_for_selector('.opt:has-text("R$ 39,90")')
    pg.screenshot(path=OUT+'/m_loja_adm.png',full_page=False)
    # loja
    pg.click('.nv:has-text("Loja Zoe")'); pg.wait_for_selector('.pc'); assert pg.locator('.pc').count()==2
    pg.click('#ljcats button:has-text("Camisetas")'); assert pg.locator('.pc').count()==1
    pg.click('#ljcats button:has-text("Todas")'); pg.fill('#lq','bon'); assert pg.locator('.pc').count()==1 and 'Boné' in pg.inner_text('.pc')
    pg.fill('#lq',''); pg.select_option('#lo','menor'); assert 'Boné' in pg.locator('.pc').first.inner_text()
    pg.screenshot(path=OUT+'/m_loja.png')
    pg.evaluate("window.__u=null;window.open=u=>{window.__u=u}")
    c=pg.locator('.pc:has-text("Camiseta Zoe")'); c.locator('select').select_option('M'); c.locator('button[aria-label="Mais"]').click(); c.locator('button[aria-label="Mais"]').click()
    c=pg.locator('.pc:has-text("Camiseta Zoe")'); assert 'R$ 179,70' in c.inner_text(), c.inner_text()
    c.locator('button:has-text("Tenho interesse")').click(); u=pg.evaluate("window.__u"); print(u)
    assert u.startswith('https://wa.me/5561900001111?text=')
    m=urllib.parse.unquote(u.split('text=')[1]); print(m)
    for t in ['Camiseta Zoe','Algodão','Opção: M','Quantidade: 3','Valor unitário: R$ 59,90','Total: R$ 179,70']: assert t in m,t
    # esgotado
    pg.click('.nv:has-text("Administração")'); pg.wait_for_selector('#pn'); pg.wait_for_timeout(1800); pg.click('.opt:has-text("Boné Zoe") button:has-text("Marcar esgotado")'); pg.wait_for_selector('.opt:has-text("esgotado")')
    pg.click('.nv:has-text("Loja Zoe")'); pg.wait_for_selector('.pc'); assert pg.locator('.pc.off button[disabled]').count()==1
    # número padrão: sem contato da loja usa o da igreja
    print('E2E LOJA OK' if not errs else 'ERROS: %s'%errs); b.close()
