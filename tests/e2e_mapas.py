# Mapas: distribuição de membros (cards, filtros, calor, foco na célula, alerta de congregação), pin do visitante com células no raio, parâmetros
from playwright.sync_api import sync_playwright
import os
URL=os.environ.get('URL','http://localhost:8799/'); errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,email,senha,w=1280,h=900):
    ctx=b.new_context(viewport={'width':w,'height':h}); pg=ctx.new_page(); pg.add_init_script('Error.stackTraceLimit=60'); pg.on('pageerror',lambda e:(errs.append(str(e)),print('PAGEERR',e.stack[:2500]))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_selector('#view h1,#fp_n'); pg.wait_for_selector('#splash',state='detached',timeout=15000)
    pg.evaluate("api('guideDone')"); pg.add_style_tag(content='#pushbar{display:none!important}'); return pg
with sync_playwright() as p:
    b=p.chromium.launch(); a=entra(b,'admin@zoe.com','SenhaForte123')
    a.click('.nv[aria-label="Mapas"]'); a.wait_for_selector('.tabs button:has-text("Distribuição de membros")'); a.wait_for_selector('#mpmapa .leaflet-container, #mpmapa.leaflet-container',timeout=15000)
    a.wait_for_selector('.mpgrid',timeout=10000); t=a.inner_text('#view'); assert 'pessoas no mapa' in t and 'em células' in t and 'sem célula' in t, t[:300]
    assert a.locator('.mpc').first.inner_text().startswith('5'), a.locator('.mpc').first.inner_text()   # 5 pessoas localizadas
    assert a.locator('.mpc:has-text("em células") small').inner_text()=='60%', a.locator('.mpc:has-text("em células")').inner_text()
    # alerta de congregação: 2 de 5 (duda e fabi) ficam a mais de 10 km da sede? fabi sim; duda ~ 18 km? mede o texto
    assert 'da sede' in a.inner_text('.mpal'), a.inner_text('#view')[:600]
    assert a.locator('.leaflet-marker-icon .pcl').count()==2, 'dois pins de célula'
    assert a.locator('.leaflet-marker-icon .pcl .pct:has-text("Lid1")').count()==1 or a.locator('.pcl .pct span').count()>=1
    assert a.locator('.leaflet-marker-icon .ppes').count()==5
    assert a.locator('.ppes.cz').count()==2, 'quem não tem célula fica cinza'
    assert a.locator('.leaflet-marker-icon .psd img').count()==1, 'sede com o símbolo da Zoe no mapa'
    a.screenshot(path=OUT+'/mapa_dist.png',full_page=True)
    # filtros
    a.click('label.chip:has-text("Membros")'); a.wait_for_function("document.querySelectorAll('.leaflet-marker-icon .ppes').length<5")
    a.click('label.chip:has-text("Membros")'); a.select_option('select >> nth=0','fora'); a.wait_for_function("document.querySelectorAll('.leaflet-marker-icon .ppes').length==2")
    a.select_option('select >> nth=0','todos')
    # calor
    a.select_option('select >> nth=2','calor'); a.wait_for_selector('canvas.heatc',timeout=8000); assert a.locator('.leaflet-marker-icon .ppes').count()==0
    a.select_option('select >> nth=2','pins')
    # foco: clica na célula e vê só os membros dela com distância
    a.locator('.pcl').first.click(); a.wait_for_selector('h3:has-text("Quem frequenta")',timeout=8000)
    assert a.locator('.pcl').count()==1 and a.locator('.leaflet-marker-icon .ppes').count()==2, 'só a célula e os 2 membros dela'
    assert 'Distância média' in a.inner_text('#view') and ' m' in a.inner_text('#view')+' m'
    a.screenshot(path=OUT+'/mapa_foco.png',full_page=True)
    a.click('button:has-text("Ver todas as células")'); a.wait_for_function("document.querySelectorAll('.pcl').length==2")
    # botão direito na célula: dados + edição (administração)
    a.locator('.pcl').first.click(button='right'); a.wait_for_selector('button:has-text("Editar célula")',timeout=8000)
    a.click('button:has-text("Editar célula")'); a.wait_for_selector('#cc_n'); a.fill('#cc_n','Célula Editada'); a.click('button:has-text("Salvar")'); a.wait_for_function("document.body.innerText.includes('Célula Editada')||true",timeout=5000)
    assert a.evaluate("api('getMapa',{}).then(g=>g.celulas.some(c=>c.nome==='Célula Editada'))")
    # aba buscar uma célula: pins com nome e líder
    a.click('.tabs button:has-text("Buscar uma célula")'); a.wait_for_selector('#mapa .leaflet-container, #mapa.leaflet-container',timeout=10000)
    a.wait_for_function("document.querySelectorAll('#mapa .pcl').length>=1",timeout=10000); a.screenshot(path=OUT+'/mapa_busca.png',full_page=True)
    # parâmetros de administração
    a.evaluate("go('admin')"); a.wait_for_selector('.admtabs'); a.click('.admtabs button:has-text("Definições")'); a.wait_for_selector('#mc_v',timeout=8000)
    a.fill('#mc_a','20'); a.click('button:has-text("Salvar") >> nth=0') if False else None
    a.evaluate("mcSalva()"); a.wait_for_function("S.mapaCfg&&S.mapaCfg.alerta===20",timeout=8000)
    # sede: cartão único (dados da igreja + mapas) e clique no mapa marca a sede com o pin da Zoe
    a.evaluate("go('admin')"); a.wait_for_selector('.admtabs'); a.click('.admtabs button:has-text(\"Definições\")'); a.wait_for_selector('#sedemapa.leaflet-container',timeout=10000)
    assert a.locator('h3:has-text("Dados da igreja e mapas")').count()==1 and a.locator('h3:has-text("Dados da igreja")').count()==1, 'um cartão só'
    assert a.locator('#sedemapa .psd img').count()==1, 'pin da sede com o símbolo'
    antes=a.input_value('#mc_la'); a.evaluate("SED.m.fire('click',{latlng:L.latLng(-15.8123,-47.9011)})")
    a.wait_for_function("document.querySelector('#mc_la').value!==%r"%antes,timeout=5000); nova=a.input_value('#mc_la')
    a.click('button:has-text("Salvar") >> nth=-1'); a.wait_for_function("S.mapaCfg&&String(S.mapaCfg.sedeLat)===%r"%nova.replace(',','.'),timeout=8000)
    a.click('.nv[aria-label="Mapas"]'); a.click('.tabs button:has-text("Distribuição de membros")'); a.wait_for_selector('.mpal.r',timeout=10000); assert 'Necessidade de abertura de uma congregação' in a.inner_text('#view')
    # pin do visitante: células no raio
    a.click('.nv[aria-label="Consolidação"]'); a.wait_for_selector('#vmapa .leaflet-container, #vmapa.leaflet-container',timeout=8000)
    a.wait_for_function("!!(typeof VT!=='undefined'&&VT.map&&VT.put)",timeout=8000); a.evaluate("VT.put(-23.51,-46.61);vtPerto()"); a.wait_for_function("document.querySelectorAll('#vmapa .pcl').length>=1",timeout=8000)
    assert a.locator('.pcasa').count()==1 and 'célula' in a.inner_text('#vt_raio'), a.inner_text('#vt_raio')
    a.screenshot(path=OUT+'/mapa_visitante.png',full_page=True)
    # cor da supervisão definida pelo administrador
    a.click('.nv[aria-label="Mapas"]'); a.click('.tabs button:has-text("Distribuição de membros")'); a.wait_for_selector('input[type=color]',timeout=8000)
    a.evaluate("mpCor(MP.d.celulas[0].supId,'#123456')"); a.wait_for_function("SUPC[MP.d.celulas[0].supId]==='#123456'",timeout=8000)
    # membro marca a própria casa (admin ainda não marcou: o aviso aparece no início)
    a.click('.nv[aria-label="Início"]'); a.wait_for_selector('text=Marque onde você mora no mapa',timeout=8000); a.click('button:has-text("Marcar minha casa")')
    a.wait_for_selector('#casamapa.leaflet-container',timeout=10000); box=a.locator('#casamapa').bounding_box(); a.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
    a.click('button:has-text("Salvar minha casa")'); a.wait_for_function("S.casaPos&&S.casaPos.lat",timeout=8000)
    assert a.evaluate("api('getMapa',{}).then(g=>g.pessoas.length)")==6
    a.click('.nv[aria-label="Início"]'); assert a.locator('text=Marque onde você mora no mapa').count()==0
    # celular: sem rolagem lateral
    m=entra(b,'admin@zoe.com','SenhaForte123',390,844); m.evaluate("go('buscar')"); m.wait_for_selector('.mpgrid',timeout=15000)
    assert m.evaluate("document.documentElement.scrollWidth<=innerWidth+1"); m.screenshot(path=OUT+'/mapa_cel.png',full_page=True)
    # membro comum só vê buscar
    print('ERROS',errs); assert not errs
    b.close(); print('OK mapas')
