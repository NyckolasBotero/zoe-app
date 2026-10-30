# Conquista de insígnia: pop-up 3D com som; som por nível definido pelo admin
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
with sync_playwright() as p:
    b=p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required']); pg=b.new_page(viewport={'width':430,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    # sons: todos tocam sem erro
    pg.add_init_script("window.__osc=0;(()=>{const P=BaseAudioContext.prototype,O=P.createOscillator;P.createOscillator=function(){window.__osc++;return O.apply(this,arguments)}})()"); pg.reload(); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000)
    for k in ['sino','moeda','harpa','fanfarra','celestial','magico','epico','coral']:
        pg.evaluate("k=>somToca(k)",k)
    assert pg.evaluate("window.__osc")>60
    assert pg.evaluate("somDe({estilo:'celeste'})")=='celestial' and pg.evaluate("somDe({estilo:'ouro',som:'epico'})")=='epico'
    # pop-up
    pg.evaluate("cqMostra({codigo:'cust:x',titulo:'Fiel · Celeste',nivel:5,niveis:5,visual:{estilo:'celeste',forma:'hex',cor1:'#8a63c9',cor2:'#ffffff',icone:'estrela',texto:'C',som:'celestial'}},{xp:250})")
    pg.wait_for_selector('#cq .cq-badge svg'); pg.wait_for_timeout(2600); pg.screenshot(path=OUT+'/cq_celeste.png')
    assert 'Fiel · Celeste' in pg.inner_text('#cq') and '+250 XP' in pg.inner_text('#cq') and 'CONQUISTA CELESTE' in pg.inner_text('#cq')
    pg.click('#cq .cq-ok'); pg.wait_for_selector('#cq',state='detached',timeout=3000)
    # notificação não lida de insígnia dispara o pop-up uma única vez
    pg.evaluate("S.notifs={itens:[{id:'nx1',tipo:'insignia',titulo:'Nova insígnia: Perfil completo',texto:'Você ganhou +50 XP.',ref:'insignia:perfil',lida:false}],naoLidas:1};cqVerifica()")
    pg.wait_for_selector('#cq'); assert 'Perfil completo' in pg.inner_text('#cq'); pg.click('#cq .cq-ok'); pg.wait_for_selector('#cq',state='detached',timeout=3000)
    pg.evaluate("cqVerifica()"); pg.wait_for_timeout(600); assert pg.query_selector('#cq') is None
    # editor: som por nível é salvo
    pg.evaluate("go('insignias')"); pg.wait_for_timeout(600)
    pg.evaluate("crNova()"); pg.wait_for_selector('#cr_prev')
    assert pg.query_selector('text=Som da conquista')
    pg.evaluate("CR.ed.titulo='Escriba';CR.ed.criterio={tipo:'manual'};CR.ed.visual.som='harpa';crNivSetCount(3);CR.ed.niveis[2].visual.som='epico';CR.ed.niveis[2].visual.estilo='celeste'")
    pg.evaluate("crSalva()"); pg.wait_for_timeout(900)
    d=pg.evaluate("api('listInsigniaDefs').then(r=>r.defs.find(x=>x.titulo==='Escriba'))")
    print(d and [d['visual'].get('som'),[n['visual'].get('som') for n in d.get('niveis',[])]])
    assert d and d['visual'].get('som')=='harpa' and d['niveis'][-1]['visual']['som']=='epico' and d['niveis'][-1]['visual']['estilo']=='celeste'
    print('ERRS',errs); assert not errs
print('OK')
