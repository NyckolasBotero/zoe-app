# Loja: promoções por item, em lote, por categoria e na loja toda
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=8000)
    pg.evaluate("""async()=>{await api('saveProduct',{nome:'Camiseta Zoe',categoria:'Camisetas',preco:100});await api('saveProduct',{nome:'Regata Zoe',categoria:'Camisetas',preco:50});await api('saveProduct',{nome:'Boné Zoe',categoria:'Bonés',preco:40});await api('saveConfig',{LojaWhatsApp:'61900001111'});await hydrate();await recarregaProd()}""")
    pg.click('.nv:has-text("Administração")'); pg.wait_for_selector('.admtabs'); pg.evaluate("admGrupo('loja')"); pg.wait_for_selector('#ljpromo'); pg.wait_for_timeout(1500)
    # um produto, preço fixo
    pg.select_option('#jpi',label='Camiseta Zoe (R$ 100,00)'); pg.select_option('#jpt','valor'); pg.fill('#jpv','79,90'); pg.click('button:has-text("Aplicar promoção")')
    pg.wait_for_selector('.opt:has-text("Camiseta Zoe"):has-text("R$ 79,90")'); pg.wait_for_timeout(600)
    # categoria 20%
    pg.select_option('#jpe','categoria'); pg.wait_for_selector('#jpc'); pg.select_option('#jpc','Camisetas'); pg.fill('#jpv','20'); pg.click('button:has-text("Aplicar promoção")')
    pg.wait_for_selector('.opt:has-text("Regata Zoe"):has-text("R$ 40,00")'); pg.wait_for_timeout(600)
    # lote: marca o boné, 50%
    pg.select_option('#jpe','lote'); pg.check('.opt:has-text("Boné Zoe") input[type=checkbox]'); pg.fill('#jpv','50'); pg.click('button:has-text("Aplicar promoção")')
    pg.wait_for_selector('.opt:has-text("Boné Zoe"):has-text("R$ 20,00")'); pg.wait_for_timeout(600)
    pg.screenshot(path=OUT+'/m_promo_adm.png')
    # vitrine mostra o preço antigo riscado, o novo e o %
    pg.click('.nv:has-text("Loja Zoe")'); pg.wait_for_selector('.pc'); t=pg.inner_text('.pc:has-text("Boné Zoe")'); print(t.replace('\n',' | ')); assert 'R$ 40,00' in t and 'R$ 20,00' in t and '-50%' in t
    assert pg.locator('.pc:has-text("Boné Zoe") s.pold').count()==1
    pg.screenshot(path=OUT+'/m_promo_loja.png')
    pg.evaluate("window.__u=null;window.open=u=>{window.__u=u}"); pg.click('.pc:has-text("Boné Zoe") button:has-text("Tenho interesse")'); u=pg.evaluate("decodeURIComponent(window.__u||'')"); print(u); assert 'R$ 20,00' in u and 'promoção' in u
    # toda a loja 10%, depois remove tudo
    pg.click('.nv:has-text("Administração")'); pg.wait_for_selector('.admtabs'); pg.evaluate("admGrupo('loja')"); pg.wait_for_selector('#ljpromo'); pg.wait_for_timeout(800)
    pg.select_option('#jpe','todos'); pg.fill('#jpv','10'); pg.click('button:has-text("Aplicar promoção")'); pg.wait_for_selector('.opt:has-text("Camiseta Zoe"):has-text("R$ 90,00")'); pg.wait_for_timeout(500)
    pg.click('button:has-text("Remover promoção")'); pg.wait_for_function("!document.querySelector('#view').innerText.includes('(-')",timeout=8000)
    assert 'Nenhuma promoção ativa' in pg.inner_text('#ljpromo')
    # validação
    pg.select_option('#jpe','todos'); pg.fill('#jpv','95'); pg.click('button:has-text("Aplicar promoção")'); pg.wait_for_timeout(400); assert pg.locator('.opt:has-text("(-")').count()==0
    print('ERROS',errs); assert not errs
print('OK')
