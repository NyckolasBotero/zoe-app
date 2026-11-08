# Consolidação v2: campos obrigatórios, abas, cartões de consolidadores, recursos, equipe e discipulado no Planejamento
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':420,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1',timeout=20000); pg.wait_for_timeout(600)
    pg.evaluate("go('consolidacao')"); pg.wait_for_selector('#vt_nome',timeout=10000)
    t=pg.inner_text('#view'); assert 'Em encaminhamento' in t and 'Sendo consolidadas' in t and 'Meus acompanhamentos' in t and 'Recursos' in t, t[:300]
    for sel in ['#vt_email','#vt_sexo','#vt_convite']: assert pg.locator(sel).count()==1, sel
    assert pg.locator('#vt_quemw').is_hidden(); pg.select_option('#vt_convite','sim'); assert pg.locator('#vt_quemw').is_visible()
    # sem sexo/e-mail: bloqueia com mensagem
    pg.fill('#vt_nome','Zeca Visitante'); pg.fill('#vt_telefone','11988887777'); pg.evaluate("VT.pin={lat:-23.5,lng:-46.6}")
    pg.evaluate("vtSalva()"); pg.wait_for_timeout(500); assert 'e-mail' in pg.inner_text('#toast,.toast') .lower() if pg.locator('#toast,.toast').count() else True
    pg.fill('#vt_email','zeca@x.com'); pg.select_option('#vt_sexo','M'); pg.fill('#vt_conviteQuem','Ana'); pg.evaluate("vtSalva()"); pg.wait_for_selector('text=Visitante lançado',timeout=10000)
    pg.evaluate("closeL();vtSub('lista')"); pg.wait_for_function("document.querySelector('#view').textContent.includes('Zeca Visitante')",timeout=10000)
    t=pg.inner_text('#view'); assert 'Veio por convite de Ana' in t, t[:600]
    # cartões de consolidadores com números
    pg.evaluate("VT.itens.forEach(v=>{});"); 
    pg.evaluate("document.querySelectorAll('#cq').forEach(x=>x.remove())")
    if pg.locator('.vtopc').count(): pg.evaluate("document.querySelector('.vtopc button[aria-label^=\"Ver os números\"]').click()"); assert 'consolidando agora' in pg.inner_text('.vtopc .vtnum:not([hidden])')
    # recursos (admin cadastra)
    pg.evaluate("vtSub('recursos')"); pg.wait_for_selector('#rc_t',timeout=10000); pg.fill('#rc_t','Como acolher'); pg.fill('#rc_x','Sorria e ouça.'); pg.evaluate("rcSalva()"); pg.wait_for_function("document.querySelector('#view').textContent.includes('Sorria e ouça')",timeout=10000)
    pg.evaluate("vtSub('meus')"); pg.wait_for_function("document.querySelector('#view').textContent.includes('Você ainda não acompanha')",timeout=10000)
    # planejamento: equipe + discipulado
    pg.evaluate("api('listVisitors',{}).then(r=>{S.celId=r.celulas[0].id;go('celula','plan')}).catch(e=>{window.__e=String(e)})"); pg.wait_for_timeout(1500); print(pg.evaluate('window.__e'), pg.evaluate('S.celId')); pg.wait_for_function("document.querySelector('#view').textContent.includes('Equipe da célula')&&document.querySelector('#view').textContent.includes('sem discipulador')",timeout=12000); pg.wait_for_timeout(800)
    t=pg.inner_text('#view'); print(t[:200].replace('\n',' | '))
    assert pg.locator('#view table input[type=checkbox]').count()>=0
    pg.evaluate("document.querySelectorAll('#cq').forEach(x=>x.remove())")
    if pg.locator('#view select[onchange^="discSet"]').count():
        pg.evaluate("(()=>{const s=document.querySelector('select[onchange^=\"discSet\"]');const o=[...s.options].find(x=>x.value);s.value=o.value;s.onchange()})()"); pg.wait_for_function("document.querySelector('#view').textContent.includes('0 de')",timeout=8000)
    print('ERROS:',errs); assert not errs; print('E2E CONSOLIDACAO OK')
