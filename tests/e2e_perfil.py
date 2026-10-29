# Meu perfil: XP, insígnias bordadas, faixa, personalização por nível
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000)
    pg.evaluate("api('guideDone')")
    pg.evaluate("api('saveMember',{membro:{Nome:'Pastor Admin',DataBatismo:'2020-01-05',DataDecisao:'2019-03-02'}})")
    pg.click('.nv[aria-label="Meu perfil"]'); pg.wait_for_selector('.pf-head')
    pg.wait_for_selector('#faixa.open'); pg.wait_for_timeout(900)
    assert pg.locator('.fx-g .bd:not(.lock)').count()==2, pg.locator('.fx-g .bd:not(.lock)').count()
    assert pg.locator('.fx-g .bd.lock').count()>=1
    assert 'Nível 6' in pg.inner_text('.pf-head'), pg.inner_text('.pf-head')
    pg.screenshot(path=OUT+'/perfil_faixa.png')
    pg.click('.fx-g .bd.lock >> nth=0'); pg.wait_for_selector('.modal .bdbig.lock svg'); pg.click('.modal button:has-text("Fechar")')
    pg.click('#pf_ins'); pg.wait_for_selector('#faixa:not(.open)',state='attached')
    pg.click('.chip:has-text("Personalizar")'); pg.wait_for_selector('#pc_bio')
    assert pg.locator('.opc.lock').count()>=10
    pg.fill('#pc_bio','Servo do Senhor'); pg.click('.sws >> nth=0 >> .opc:has-text("Verde Zoe")'); pg.click('.opc-b >> nth=0'); pg.click('text=Salvar perfil'); pg.wait_for_selector('.pf.fb-zoe'); assert pg.locator('.pf-top .bd').count()==1; assert pg.locator('.pf-nv .tiersvg').count()==1; assert 'Servo do Senhor' in pg.inner_text('.pf-head')
    pg.screenshot(path=OUT+'/perfil_topo.png'); pg.click('.pf-pen'); pg.wait_for_selector('text=Minhas informações de perfil'); pg.click('.chip:has-text("Meu perfil")'); pg.wait_for_selector('.pf-head')
    pg.click('.chip:has-text("Editar perfil")'); pg.wait_for_selector('text=Minhas informações de perfil')
    pg.screenshot(path=OUT+'/perfil.png')
    m=b.new_page(viewport={'width':390,'height':800},device_scale_factor=2); m.on('pageerror',lambda e:errs.append(str(e)))
    m.goto(URL); m.wait_for_selector('#lg_e'); m.fill('#lg_e','admin@zoe.com'); m.fill('#lg_s','SenhaForte123'); m.click('#lg_b'); m.wait_for_selector('#view h1'); m.wait_for_selector('#splash',state='detached',timeout=15000); m.evaluate("api('guideDone')"); m.evaluate("go('meu')"); m.wait_for_selector('.pf-head'); m.screenshot(path=OUT+'/perfil_mobile.png'); m.evaluate("meuAbrePers()"); m.wait_for_selector('#pc_bio'); m.screenshot(path=OUT+'/perfil_pers_mobile.png',full_page=True)
    print('ERROS',errs); assert not errs
print('OK')
