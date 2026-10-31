# Telão ao vivo: abas rápidas, versículo digitado (Jo 3:16), anterior/próximo, recentes, várias artes de uma vez
from playwright.sync_api import sync_playwright
import os, base64
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
for n in ('a1','a2','a3'): open('/tmp/%s.png'%n,'wb').write(PNG)
with sync_playwright() as p:
    b=p.chromium.launch(); pc=entra(b,1280,900)
    pc.evaluate("api('saveSong',{titulo:'Santo',artista:'Zoe',letra:'Santo\\nSanto'})")
    pc.evaluate("go('multimidia')"); pc.wait_for_selector('#mm_lista .opt:has-text("Santo")')
    pc.click('#mm_lista .opt:has-text("Santo") >> button:has-text("Projetar")'); pc.wait_for_selector('#mm_cur canvas')
    with pc.expect_popup() as pi: pc.click('#mm_ini')
    w=pi.value; w.wait_for_selector('#st canvas')
    ph=entra(b,390,844); ph.evaluate("go('multimidia')"); ph.wait_for_selector('.tabs'); ph.click('.tabs >> text=Controle remoto'); ph.wait_for_selector('.tl-abas')
    assert ph.locator('.tabs >> text=Versículos').count()==1 and ph.locator('.tabs >> nth=0').inner_text().count('Versículos')==0, 'Versículos virou aba do telão ao vivo'
    ph.click('.tl-abas >> text=Versículos'); ph.wait_for_selector('#vs_ref',timeout=15000)
    # leitura da referência
    r=ph.evaluate("[vsParse('1 co 13:4-7'),vsParse('sl 23'),vsParse('Jo 3 16'),vsParse('Mateus 5:3'),vsParse('xyz 1')]")
    assert r[0]['b']==46 and r[0]['c']==13 and r[0]['v1']==4 and r[0]['v2']==7, r[0]
    assert r[1]['b']==19 and r[1]['c']==23 and r[1]['v1']==1, r[1]
    assert r[2]['b']==43 and r[2]['c']==3 and r[2]['v1']==16, r[2]
    assert r[3]['b']==40 and r[3]['v1']==3, r[3]; assert r[4] is None
    # digita e transmite com Enter
    ph.fill('#vs_ref','Jo 3:16'); ph.press('#vs_ref','Enter'); ph.wait_for_function("TL.st&&TL.st.item==='v:AL_43_3_16'",timeout=10000)
    pc.wait_for_function("MM.pj&&MM.pj.item==='v:AL_43_3_16'",timeout=10000)
    ph.wait_for_selector('.tl-sl:has-text("Deus")',timeout=8000)
    ph.click('#vs_box .tl-btns button:has-text("Próximo")'); ph.wait_for_function("TL.st.item==='v:AL_43_3_17'",timeout=8000)
    ph.click('#vs_box .tl-btns button:has-text("Anterior")'); ph.wait_for_function("TL.st.item==='v:AL_43_3_16'",timeout=8000)
    ph.fill('#vs_ref','banana'); ph.press('#vs_ref','Enter'); ph.wait_for_selector('#vs_msg:has-text("Não entendi")')
    # alterna para música e volta pelos recentes
    ph.click('.tl-abas >> text=Músicas'); ph.wait_for_selector('#tl_lst .opt:has-text("Santo")'); ph.fill('#tl_q','san'); ph.click('#tl_lst .opt:has-text("Santo")'); ph.wait_for_function("TL.st.item.startsWith('m:')",timeout=8000)
    pc.wait_for_function("MM.pj.item.startsWith('m:')",timeout=8000)
    ph.wait_for_selector('#tl_rec .tl-rc:has-text("João 3:16")'); ph.click('#tl_rec .tl-rc:has-text("João 3:16")'); ph.wait_for_function("TL.st.item==='v:AL_43_3_16'",timeout=8000)
    pc.wait_for_function("MM.pj.item==='v:AL_43_3_16'",timeout=8000)
    # artes: várias de uma vez ficam guardadas; uma só vai direto ao telão
    ph.click('.tl-abas >> text=Artes'); ph.wait_for_selector('#tl_div')
    n0=ph.evaluate("(AGD.mid||[]).length"); ph.set_input_files('#tl_div input[type=file]',['/tmp/a1.png','/tmp/a2.png']); ph.wait_for_function("(AGD.mid||[]).length==%d"%(n0+2),timeout=15000)
    assert ph.evaluate("TL.st.item")=='v:AL_43_3_16', 'várias artes não mudam o telão'
    ph.set_input_files('#tl_div input[type=file]',['/tmp/a3.png']); ph.wait_for_function("TL.st.item.startsWith('i:')",timeout=15000); pc.wait_for_function("MM.pj.item.startsWith('i:')",timeout=10000)
    assert ph.locator('#tl_div .ag-card').count()==n0+3
    ph.screenshot(path=OUT+'/tl_rapido.png'); assert ph.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
    print('ERRS',errs); assert not errs
print('OK telao rapido')
