# Studio Zoe › Projeção: fundos estáticos e dinâmicos para músicas e versículos
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg=b.new_page(viewport={'width':1400,'height':950}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("go('multimidia')"); pg.wait_for_selector('.mm-area')
    assert 'Studio Zoe' in pg.inner_text('#view h1') and 'Projeção' in pg.inner_text('.mm-area')
    assert 'Studio Zoe' in pg.inner_text('nav, .tabbar, #nav, body')
    pg.click('.tabs >> text=Layout padrão'); pg.wait_for_selector('#mmprev canvas')
    # padrão das músicas: cor sólida
    pg.select_option('select >> nth=0','cor'); pg.wait_for_function("MM.padrao.fundoTipo==='cor'")
    pg.wait_for_timeout(300)
    px=pg.evaluate("(()=>{const c=document.querySelector('#mmprev canvas'),d=c.getContext('2d').getImageData(3,3,1,1).data;return [d[0],d[1],d[2]]})()")
    c0=pg.evaluate("MM_DEF.cores[0]"); assert px[2]>px[0],px  # azul escuro (#0a1a3f)
    # imagem: sobe uma da biblioteca
    pg.select_option('select >> nth=0','imagem'); pg.wait_for_selector('text=Enviar imagem')
    pg.evaluate("""(async()=>{const c=document.createElement('canvas');c.width=64;c.height=36;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(0,0,64,36);const d=c.toDataURL('image/jpeg');const r=await mmApi('saveMidia',{titulo:'Vermelho',foto:d,mini:d});AGD.mid=null;AGD.img[r.id]=d;window.__mid=r.id})()""")
    pg.wait_for_function("window.__mid"); pg.evaluate("agCarrega()"); pg.wait_for_function("AGD.mid&&AGD.mid.length")
    pg.evaluate("renderKeep()"); pg.click('.ag-card >> nth=0'); pg.wait_for_function("MM.padrao.fundoTipo==='imagem'&&/^i:/.test(MM.padrao.fundoImg)")
    pg.wait_for_timeout(600)
    px=pg.evaluate("(()=>{const c=document.querySelector('#mmprev canvas'),d=c.getContext('2d').getImageData(3,3,1,1).data;return [d[0],d[1],d[2]]})()")
    assert px[0]>150 and px[1]<80,px
    # animação aurora + escurecer
    pg.select_option('select >> nth=1','aurora'); pg.wait_for_function("MM.padrao.fundoAnim==='aurora'")
    pg.evaluate("mmSetV('fundoEscuro',60)"); pg.wait_for_timeout(300)
    px2=pg.evaluate("(()=>{const c=document.querySelector('#mmprev canvas'),d=c.getContext('2d').getImageData(3,3,1,1).data;return [d[0],d[1],d[2]]})()"); assert px2[0]<px[0],(px,px2)
    pg.click('button:has-text("Salvar layout padrão")'); pg.wait_for_timeout(300)
    # versículos: aba própria, salva separado
    pg.click('.seg button:has-text("Versículos")'); pg.wait_for_selector('#mmprev canvas')
    assert pg.evaluate("MM.padAlvo")=='versiculos'
    pg.select_option('select >> nth=0','cor'); pg.wait_for_function("MM.layoutVers&&MM.layoutVers.fundoTipo==='cor'")
    pg.click('button:has-text("Salvar layout padrão")'); pg.wait_for_timeout(300)
    assert pg.evaluate("MM.padrao.fundoTipo")=='imagem'
    r=pg.evaluate("mmApi('listSongs',{})"); assert r['layoutVers']['fundoTipo']=='cor' and r['padrao']['fundoTipo']=='imagem',r
    u=pg.evaluate("vsUnit('v:AL_43_3_16')"); assert u and u['layout']['fundoTipo']=='cor',u
    # vídeo: campo de endereço
    pg.click('.seg button:has-text("Músicas")'); pg.select_option('select >> nth=0','video'); pg.wait_for_selector('input[placeholder="https://…/fundo.mp4"]')
    pg.screenshot(path='/tmp/fundos.png',full_page=True)
    assert not errs,errs
    print('OK fundos')
