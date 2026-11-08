# Mensagem pastoral: chega nas Conversas do operador, abre sozinha, trava até o 👍, e o pastor vê "Visto"
from playwright.sync_api import sync_playwright
import time
URL='http://localhost:8799/'; errs=[]
def entra(br,email,viewport={'width':420,'height':900}):
    ctx=br.new_context(viewport=viewport); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(email+': '+str(e)))
    pg.add_init_script("localStorage.setItem('zoe-force','1')")
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s','Temp12345'); pg.click('#lg_b'); pg.wait_for_timeout(1500)
    if pg.locator('#fp_a').count():
        pg.fill('#fp_a','Temp12345'); pg.fill('#fp_n','SenhaNova2026!'); pg.fill('#fp_r','SenhaNova2026!'); pg.click('button:has-text("Salvar nova senha")'); pg.wait_for_timeout(1500)
        if pg.locator('#lg_e').count(): pg.fill('#lg_e',email); pg.fill('#lg_s','SenhaNova2026!'); pg.click('#lg_b')
    pg.wait_for_selector('#view h1',timeout=20000); pg.wait_for_timeout(700); return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    adm=b.new_context().new_page(); adm.goto(URL); adm.wait_for_selector('#lg_e'); adm.fill('#lg_e','admin@zoe.com'); adm.fill('#lg_s','SenhaForte123'); adm.click('#lg_b'); adm.wait_for_selector('#view h1',timeout=20000)
    def pid(n): return adm.evaluate("api('searchPeople',{q:'%s'}).then(r=>r.find(x=>x.nome.toLowerCase().startsWith('%s')).id)"%(n.capitalize(),n))
    ana,beto=pid('ana'),pid('beto')
    adm.evaluate(f"api('saveStudioAcesso',{{membroId:'{ana}',areas:['proj']}}).then(()=>api('saveStudioAcesso',{{membroId:'{beto}',areas:[],chat:true}}))"); adm.wait_for_timeout(800)
    op=entra(b,'ana@zoe.com'); pastor=entra(b,'beto@zoe.com')
    # operador está projetando (presença) e na tela do Studio
    op.evaluate("S.studio=S.studio||['proj'];PST.opAte=Date.now()+90000;api('studioPresenca',{area:'proj'})"); op.wait_for_timeout(600)
    assert op.evaluate("pstRapido()"), 'ping rápido ligado'
    # pastor vê o operador na lista de Conversas
    pastor.evaluate("chAbre()"); pastor.wait_for_function("document.querySelector('#ch_b')&&document.querySelector('#ch_b').textContent.includes('Operando agora')",timeout=10000)
    pastor.evaluate("chAbreCom(CH.ops[0].id,CH.ops[0].nome)"); pastor.wait_for_selector('#ch_t')
    assert op.locator('#chatp').count()==0, 'painel do operador fechado antes'
    t0=time.time(); pastor.fill('#ch_t','Pode passar o slide 3?'); pastor.press('#ch_t','Enter')
    op.wait_for_selector('#chpa',timeout=8000); dt=time.time()-t0; print('latência até aparecer (incl. Playwright): %.2fs'%dt); lat=op.evaluate('PST.lat[0]'); print('envio no servidor -> tela do operador: %d ms'%lat); assert lat<1800, lat
    assert 'Pode passar o slide 3?' in op.inner_text('#chpa') and 'Mensagem pastoral' in op.inner_text('#chpa')
    # trava: não fecha por botão, ícone nem Esc
    op.keyboard.press('Escape'); op.evaluate("chFecha();chatToggle()"); assert op.locator('#chatp').count()==1 and op.locator('#chatp.chlock').count()==1, 'travado'
    assert not op.locator('#chatp .chh .ib[aria-label=Fechar]').first.is_visible(), 'sem botão fechar'
    # o 👍
    op.click('.chpb'); op.wait_for_function("!document.querySelector('#chpa')",timeout=5000)
    op.evaluate("chFecha()"); assert op.locator('#chatp').count()==0, 'fecha depois do 👍'
    pastor.wait_for_function("document.querySelector('#ch_m').textContent.includes('Visto')",timeout=8000)
    print('ERROS:',errs); assert not errs; print('E2E PASTORAL OK')
