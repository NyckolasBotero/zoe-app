# Área da supervisão: tabela, detalhamento, aprovações dentro, álbum com ligação
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
def entra(br,email,senha):
    ctx=br.new_context(viewport={'width':1100,'height':900}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(email+': '+str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_timeout(1500)
    if pg.locator('#fp_a').count():
        pg.fill('#fp_a','Temp12345'); pg.fill('#fp_n','SenhaNova2026!'); pg.fill('#fp_r','SenhaNova2026!'); pg.click('button:has-text("Salvar nova senha")'); pg.wait_for_timeout(1500)
        if pg.locator('#lg_e').count(): pg.fill('#lg_e',email); pg.fill('#lg_s','SenhaNova2026!'); pg.click('#lg_b')
    pg.wait_for_selector('#view h1',timeout=20000); pg.wait_for_timeout(700); return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    sup=entra(b,'sup@zoe.com','Temp12345'); lid=entra(b,'lid1@zoe.com','Temp12345')
    assert sup.evaluate("NAV.some(n=>n[0]==='supervisao')") and sup.evaluate("temAreaSup()"), 'supervisor vê a área'
    assert not lid.evaluate("temAreaSup()"), 'líder comum não'
    # lid1 lança chamada com foto para gerar dados
    lid.evaluate("api('saveAttendance',{data:new Date(Date.now()-864e5).toISOString().slice(0,10),presentes:[],confirmaDia:true,foto:'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',visitaSup:true})").catch(lambda e:None) if False else None
    sup.evaluate("go('supervisao')"); sup.wait_for_selector('table tr.svr',timeout=10000)
    tx=sup.inner_text('#view').lower(); assert 'presença de deus' in tx and 'envolvimento 10/5' in tx
    sup.click('tr.svr >> nth=0'); sup.wait_for_selector('h3:has-text("Roadmap dos membros")',timeout=10000)
    tx=sup.inner_text('#view').lower()
    for t in ['Reuniões: presença','Agenda planejada','Pedidos de oração','Quiz da célula','Cursos da igreja','Fotos da célula']: assert t.lower() in tx,t
    sup.click('button:has-text("Voltar à tabela")'); sup.wait_for_selector('table tr.svr')
    # aprovações dentro da área
    sup.locator('button[role=tab]:has-text("Aprovações")').dispatch_event('click'); sup.wait_for_timeout(800); assert sup.locator('h1:has-text("Área da supervisão")').count()==1
    sup.locator('button[role=tab]:has-text("Álbum")').dispatch_event('click'); sup.wait_for_selector('text=Álbum da supervisão',timeout=8000)
    sup.evaluate("go('aprovacoes')"); sup.wait_for_timeout(500); assert sup.evaluate("R.r==='supervisao'&&R.sub.supervisao==='aprov'"),'aprovações redireciona'
    print('ERROS:',errs); assert not errs; print('E2E SUPERVISAO OK')
