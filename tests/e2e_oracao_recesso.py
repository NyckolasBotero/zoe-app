# Oração (pedir, orei, aviso), álbum da supervisão, visita na chamada, recesso no perfil da célula
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
def entra(br,email,senha='Temp12345'):
    ctx=br.new_context(viewport={'width':420,'height':900}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(email+': '+str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_timeout(1500)
    if pg.locator('#fp_a').count():
        pg.fill('#fp_a','Temp12345'); pg.fill('#fp_n','SenhaNova2026!'); pg.fill('#fp_r','SenhaNova2026!'); pg.click('button:has-text("Salvar nova senha")'); pg.wait_for_timeout(1500)
        if pg.locator('#lg_e').count(): pg.fill('#lg_e',email); pg.fill('#lg_s','SenhaNova2026!'); pg.click('#lg_b')
    pg.wait_for_selector('#view h1',timeout=20000); pg.wait_for_timeout(700); return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    ana=entra(b,'ana@zoe.com'); beto=entra(b,'beto@zoe.com'); lid=entra(b,'lid1@zoe.com'); sup=entra(b,'sup@zoe.com')
    # pedido da Ana
    ana.evaluate("go('celula','oracao')"); ana.wait_for_selector('#ox'); ana.fill('#ox','Orem pelo meu trabalho'); ana.click('button:has-text("Enviar pedido")')
    ana.wait_for_function("document.querySelector('#view').textContent.includes('Seu pedido')",timeout=8000)
    # Beto vê e ora
    beto.evaluate("go('celula','oracao')"); beto.wait_for_selector('button:has-text("Orei por você")',timeout=8000); beto.click('button:has-text("Orei por você")')
    beto.wait_for_function("document.querySelector('#view').textContent.includes('Você orou')",timeout=8000)
    ana.evaluate("oracRecarrega()"); ana.wait_for_function("document.querySelector('#view').textContent.includes('orou(aram) por você')",timeout=8000)
    # líder e supervisor foram avisados
    for pg in (lid,sup):
        n=pg.evaluate("api('listNotifications').then(r=>r.itens.filter(n=>n.tipo==='oracao').length)"); assert n>=1,'aviso de oração'
    # álbum: só supervisor
    assert sup.locator('text=Álbum da supervisão').count()>=1 or sup.evaluate("NAV.some(n=>n[0]==='album')")
    sup.evaluate("go('album')"); sup.wait_for_selector('text=Álbum da supervisão 📸',timeout=8000)
    assert lid.evaluate("!(cg().supervisor)"), 'líder comum sem álbum'
    # chamada exige a visita da supervisão
    lid.evaluate("go('celula','freq')"); lid.wait_for_selector('#fvs',timeout=8000)
    # recesso no perfil da célula
    lid.evaluate("go('celula','perfilc')"); lid.wait_for_selector('#rc_i',timeout=8000)
    lid.evaluate("(()=>{const d=new Date(Date.now()+864e5*20).toISOString().slice(0,10);$('#rc_f').value=d})()"); lid.click('button:has-text("Iniciar recesso")')
    lid.wait_for_function("document.querySelector('#rcbox').textContent.includes('Recesso')&&document.querySelector('#rcbox').textContent.includes('previsão')",timeout=8000)
    n=sup.evaluate("api('listNotifications').then(r=>r.itens.filter(n=>n.tipo==='recesso').length)"); assert n>=1,'supervisor avisado do recesso'
    lid.click('button:has-text("Encerrar recesso")'); lid.wait_for_function("document.querySelector('#rcbox').textContent.includes('Nenhum recesso')",timeout=8000)
    print('ERROS:',errs); assert not errs; print('E2E ORACAO/RECESSO OK')
