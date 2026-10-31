# Divulgar imagem e evento no telão pelo celular; ficam salvos na agenda de hoje
from playwright.sync_api import sync_playwright
import os
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); pc=entra(b,1280,900)
    pc.evaluate("api('saveSong',{titulo:'Santo',artista:'Zoe',letra:'Santo\\nSanto'})")
    mid=pc.evaluate("api('saveMidia',{titulo:'Convite',foto:'data:image/png;base64,iVBORw0KGgo=',mini:'data:image/png;base64,iVBORw0KGgo='})")
    pc.evaluate("go('multimidia')"); pc.wait_for_selector('#pj_lst .opt:has-text("Santo")')
    pc.click('#pj_lst .opt:has-text("Santo")'); pc.wait_for_selector('#mm_cur canvas')
    with pc.expect_popup() as pi: pc.click('#mm_ini')
    w=pi.value; w.wait_for_selector('#st canvas')
    ph=entra(b,390,844); ph.add_style_tag(content='#pushbar{display:none!important}'); ph.evaluate("go('multimidia')"); ph.wait_for_selector('#pj_ban .pj-bn:not(.ev)')
    ph.click('#pj_ban .pj-bn:not(.ev) >> nth=0'); assert ph.evaluate("MM.pj.item").startswith('m:'); ph.dblclick('#pj_ban .pj-bn:not(.ev) >> nth=0'); ph.wait_for_function("MM.pj.item.startsWith('i:')",timeout=8000)
    pc.wait_for_function("MM.pj&&MM.pj.item&&MM.pj.item.startsWith('i:')",timeout=8000)
    pc.screenshot(path=OUT+'/pj_tela.png'); ph.screenshot(path=OUT+'/tl_divulga.png')
    pc.keyboard.press('Escape'); pc.wait_for_function("MM.pj.pausado===true",timeout=5000)
    pc.evaluate("api('createEvent',{titulo:'Dia do Amigo',data:TODAY,hora:'19:00',local:'Igreja'})")
    for pg in (pc,ph): pg.evaluate("async()=>{mapEvents(await api('listEvents'))}")
    ph.evaluate("pjRender();$('#pj_ban').innerHTML=pjBannersHTML()")
    ev=pc.evaluate("EVENTOS.length")
    if ev:
        ph.dblclick('#pj_ban .pj-bn.ev >> nth=0'); ph.wait_for_function("MM.pj.item.startsWith('e:')",timeout=8000)
        pc.wait_for_function("MM.pj.item.startsWith('e:')",timeout=8000)
    print('eventos',ev,'ERRS',errs); assert not errs
print('OK')
