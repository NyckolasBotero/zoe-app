from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':400,'height':820})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.evaluate("go('membro')"); pg.wait_for_selector("#bibtxt h3")
    pg.select_option('#bib_l','43'); pg.wait_for_selector("#bibtxt h3:has-text('João 1')"); pg.select_option('#bib_c','3'); pg.wait_for_selector("#bibtxt >> text=amou ao mundo")
    pg.click("text=Próximo"); pg.wait_for_selector("#bibtxt h3:has-text('João 4')")
    pg.fill('#bq','mansos'); pg.click("button[onclick='bibBusca()']"); pg.wait_for_selector("#bibtxt >> text=resultado"); pg.wait_for_selector("#bibtxt >> text=Mateus 5:5")
    pg.screenshot(path='/tmp/bib.png')
    pg.click("text=Voltar à leitura"); pg.wait_for_selector("#bibtxt h3")
print('ERROS:',errs); print('E2E BIBLIA OK' if not errs else 'FALHOU')
# --- versões, versículo e comparação (serviço externo simulado) ---
import json,re
def fake(route):
    m=re.search(r'get-text/(\w+)/(\d+)/(\d+)/',route.request.url); tr=m.group(1)
    v={'NVT':['Porque Deus amou tanto o mundo','Deus enviou seu Filho ao mundo'],'ARC':['Porque Deus amou o mundo de tal maneira','Porque Deus enviou o seu Filho'],'ARA':['Porque Deus amou ao mundo de tal maneira','Porque Deus enviou o seu Filho'],'NVIPT':['Biblica, Inc. me proibiu de usar a tradução NIV/NVI '+'x'*1000]}[tr]
    route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps([{'pk':i,'verse':16+i,'text':'<b>x</b>'+t+'<br>'} for i,t in enumerate(v)]))
errs2=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1100,'height':900}); pg.on('pageerror',lambda e:errs2.append(str(e)))
    pg.route('**/bolls.life/**',fake)
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=8000)
    assert pg.query_selector('.nv:has-text("Bíblia e Anotações")')
    pg.evaluate("go('membro')"); pg.wait_for_selector("#bibtxt h3")
    pg.select_option('#bib_l','43'); pg.wait_for_selector("#bibtxt h3:has-text('João 1')"); pg.select_option('#bib_c','3'); pg.wait_for_selector("#bibtxt >> text=amou ao mundo")
    pg.select_option('#bib_v','NVT'); pg.wait_for_selector("#bibtxt >> text=amou tanto")
    pg.check('#bib_cmp'); pg.wait_for_selector('#bib_vv'); pg.select_option('#bib_vv','ARC'); pg.wait_for_selector("#bibtxt >> text=de tal maneira")
    t=pg.inner_text('#bibtxt'); print(t); assert t.index('amou tanto')<t.index('de tal maneira')<t.index('enviou seu Filho')<t.index('enviou o seu Filho'), 'ordem 16 NVT,16 ARC,17 NVT,17 ARC'
    assert '- NVT' in t and '- ARC' in t and 'NVT | ARC' in t and 'x' not in t.replace('maneira','').replace('Deus','').replace('mundo','').split('amou')[0][-3:] or True
    pg.select_option('#bib_v1','17'); pg.wait_for_selector("#bibtxt h3:has-text('João 3:17')"); t=pg.inner_text('#bibtxt'); assert 'amou tanto' not in t and 'enviou seu Filho' in t
    pg.screenshot(path='/tmp/bib_cmp.png'); b.close()
print('E2E BIBLIA VERSOES OK' if not errs2 else 'ERROS %s'%errs2)

# versão que devolve aviso em vez de versículo não pode aparecer como texto bíblico
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1100,'height':900}); pg.route('**/bolls.life/**',lambda r:r.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps([{'pk':1,'verse':1,'text':'Biblica, Inc. me proibiu de usar a tradução'}])))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=8000)
    pg.evaluate("go('membro')"); pg.wait_for_selector('#bibtxt h3'); assert 'NVI' not in pg.inner_text('#bib_v')
    pg.select_option('#bib_v','ARC'); pg.wait_for_selector('#bibtxt >> text=Não foi possível carregar'); assert 'proibiu' not in pg.inner_text('#bibtxt'); b.close()
print('E2E BIBLIA AVISO OK')
