# Divulgar imagem e evento no telão pelo celular; ficam salvos na agenda de hoje
from playwright.sync_api import sync_playwright
import os
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); pc=entra(b,1280,900)
    pc.evaluate("api('saveSong',{titulo:'Santo',artista:'Zoe',letra:'Santo\\nSanto'})")
    mid=pc.evaluate("api('saveMidia',{titulo:'Convite',foto:'data:image/png;base64,iVBORw0KGgo=',mini:'data:image/png;base64,iVBORw0KGgo='})")
    pc.evaluate("go('multimidia')"); pc.wait_for_selector('#mm_lista .opt:has-text("Santo")')
    pc.click('#mm_lista .opt:has-text("Santo") >> button:has-text("Projetar")'); pc.wait_for_selector('#mm_cur canvas')
    with pc.expect_popup() as pi: pc.click('#mm_ini')
    w=pi.value; w.wait_for_selector('#st canvas')
    ph=entra(b,390,844); ph.evaluate("go('multimidia')"); ph.wait_for_selector('.tabs'); ph.click('.tabs >> text=Controle remoto'); ph.wait_for_selector('#tl_div .ag-card')
    ph.click('#tl_div .ag-card button >> nth=0'); ph.wait_for_function("TL.st&&TL.st.item.startsWith('i:')",timeout=8000)
    pc.wait_for_function("MM.pj&&MM.pj.item&&MM.pj.item.startsWith('i:')",timeout=8000)
    ag=pc.evaluate("api('listAgendas')"); assert any(i['t']=='imagem' for a in ag for i in a['itens']),ag
    ph.screenshot(path=OUT+'/tl_divulga.png')
    pc.evaluate("api('createEvent',{titulo:'Dia do Amigo',data:TODAY,hora:'19:00',local:'Igreja'})")
    for pg in (pc,ph): pg.evaluate("async()=>{mapEvents(await api('listEvents'))}")
    ph.evaluate('tlDraw()')
    ev=pc.evaluate("EVENTOS.length")
    if ev:
        ph.click('#tl_div .opt >> nth=0'); ph.wait_for_timeout(1500); print(ph.evaluate('JSON.stringify(TL.st)'), ph.inner_text('.toast, #toast')[:200] if ph.query_selector('.toast, #toast') else ''); ph.wait_for_function("TL.st.item.startsWith('e:')",timeout=8000)
        pc.wait_for_function("MM.pj.item.startsWith('e:')",timeout=8000)
    print('eventos',ev,'ERRS',errs); assert not errs
print('OK')
