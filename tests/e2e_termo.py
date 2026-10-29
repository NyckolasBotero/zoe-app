# Etapa 4: termômetro da presença de Deus, resumo da reunião e botão de atualizar com vitrine
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000)
    pg.evaluate("""async()=>{const l=await api('createUser',{email:'l@zoe.com',nome:'Lider',senha:'Temp12345',papel:'membro'});const c=await api('createCell',{nome:'Semeadores',liderId:l.membroId,dia:'Quinta',inicio:'20:00'});await api('createUser',{email:'a@zoe.com',nome:'Ana Souza',senha:'Temp12345',papel:'membro',celulaId:c.id});await hydrate();S.celId=c.id;await hydrate();go('celula','freq')}""")
    pg.wait_for_selector('#term'); box=lambda: pg.evaluate("document.querySelector('#tmv svg').getAttribute('class')")
    def mover(v): pg.evaluate("v=>{const r=document.querySelector('#term');r.value=v;r.dispatchEvent(new Event('input',{bubbles:true}))}",v); pg.wait_for_timeout(120)
    assert 'ice' in box() and 'Frio' in pg.inner_text('#tml')
    mover(45); assert 'fl' in box(); s1=float(pg.evaluate("document.querySelector('#tmv svg').style.getPropertyValue('--s')")); print('escala 45:',s1)
    mover(95); s2=float(pg.evaluate("document.querySelector('#tmv svg').style.getPropertyValue('--s')")); print('escala 95:',s2); assert s2>s1+.5 and 'intensa' in pg.inner_text('#tml')
    assert pg.locator('#tmv .ep').count()==3
    pg.locator('.tmc').screenshot(path=OUT+'/m_termo.png'); mover(40); pg.locator('.tmc').screenshot(path=OUT+'/m_termo2.png'); mover(95)
    mover(10); assert 'ice' in box()
    mover(88); pg.fill('#fobs','Louvor marcante e dois testemunhos.')
    pg.check('.pr >> nth=0'); pg.click('button:has-text("Registrar frequência")'); pg.wait_for_selector('text=Histórico de presença')
    pg.wait_for_selector('.tmh svg'); pg.click('summary >> nth=0'); assert 'Resumo: Louvor marcante e dois testemunhos.' in pg.inner_text('#view')
    pg.click('.tabs button:has-text("Indicadores")'); pg.wait_for_selector('h3:has-text("Termômetro da presença de Deus")'); t=pg.inner_text('#view'); print(t[:200].replace('\n',' | ')); assert '88%' in t
    pg.screenshot(path=OUT+'/m_termo_ind.png')
    # botão atualizar
    pg.evaluate("window.__api=0;const o=window.fetch;window.fetch=function(){window.__api++;return o.apply(this,arguments)}")
    pg.click('#br'); pg.wait_for_selector('#vit'); pg.wait_for_selector('#vlog li'); pg.wait_for_timeout(250)
    pg.screenshot(path=OUT+'/m_vitrine.png')
    assert pg.evaluate("getComputedStyle(document.querySelector('#vit')).backdropFilter||getComputedStyle(document.querySelector('#vit')).webkitBackdropFilter").startswith('blur')
    pg.wait_for_selector('#vit.fim',timeout=20000); n=pg.locator('#vlog li').count(); print('passos',n); assert n>=4
    pg.wait_for_selector('#vit',state='detached',timeout=5000); assert pg.evaluate("window.__api")>=1
    assert 'Dados atualizados' in pg.inner_text('.toast')
    # continua na mesma tela, sem recarregar
    assert pg.evaluate("R.r")=='celula'
    print('ERROS',errs); assert not errs
print('OK')
