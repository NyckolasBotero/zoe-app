# Projeção unificada: músicas, Bíblia digitada (Mateus 5), banners com duplo clique, Esc limpa o telão
from playwright.sync_api import sync_playwright
import os, base64
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
for n in ('a1','a2','a3'): open('/tmp/%s.png'%n,'wb').write(PNG)
with sync_playwright() as p:
    b=p.chromium.launch(); pc=entra(b,1280,900)
    pc.evaluate("api('saveSong',{titulo:'Santo',artista:'Zoe',letra:'Santo\\nSanto'})")
    pc.evaluate("go('multimidia')"); pc.wait_for_selector('#pj_lst .opt:has-text("Santo")')
    pc.click('#pj_lst .opt:has-text("Santo")'); pc.wait_for_selector('#mm_cur canvas')
    with pc.expect_popup() as pi: pc.click('#mm_ini')
    w=pi.value; w.wait_for_selector('#st canvas')
    pc.add_style_tag(content='#pushbar{display:none!important}')
    assert pc.locator('#pj_songs').count()==1 and pc.locator('#pj_bib').count()==1 and pc.locator('#pj_ban').count()==1
    # digita o livro e o capítulo: sugestões de capítulos e versículos aparecem
    pc.fill('#bp_q','Mateus 5'); pc.wait_for_selector('#bp_ver [data-k="v:AL_40_5_3"]',timeout=15000)
    assert pc.locator('.bp-caps .chip').count()==28, pc.locator('.bp-caps .chip').count()
    pc.click('#bp_ver [data-k="v:AL_40_5_3"]'); pc.wait_for_function("MM.pj.item==='v:AL_40_5_3'",timeout=10000)
    pc.click('button[aria-label="Próximo versículo"]'); pc.wait_for_function("MM.pj.item==='v:AL_40_5_4'",timeout=10000)
    pc.fill('#bp_q','Jo 3:16'); pc.press('#bp_q','Enter'); pc.wait_for_function("MM.pj.item==='v:AL_43_3_16'",timeout=10000)
    w.wait_for_function("document.body.innerText.includes('Deus')",timeout=8000)
    # Esc tira o conteúdo da tela e clicar na música traz de volta
    pc.keyboard.press('Escape'); pc.wait_for_function("MM.pj.pausado===true",timeout=5000)
    pc.click('#pj_lst .opt:has-text("Santo")'); pc.wait_for_function("MM.pj.item.startsWith('m:')&&!MM.pj.pausado",timeout=8000)
    # banners: um clique só seleciona, duplo clique transmite; vários arquivos ficam guardados
    n0=pc.evaluate("(AGD.mid||[]).length"); pc.set_input_files('#pj_ban input[type=file]',['/tmp/a1.png','/tmp/a2.png']); pc.wait_for_function("(AGD.mid||[]).length==%d"%(n0+2),timeout=15000)
    pc.evaluate("$('#pj_ban').innerHTML=pjBannersHTML()"); pc.click('#pj_ban .pj-bn:not(.ev) >> nth=0'); assert pc.evaluate("MM.pj.item.startsWith('m:')")
    pc.dblclick('#pj_ban .pj-bn:not(.ev) >> nth=0'); pc.wait_for_function("MM.pj.item.startsWith('i:')",timeout=10000)
    # celular: o controle remoto só passa slides
    ph=entra(b,390,844); ph.add_style_tag(content='#pushbar{display:none!important}'); ph.evaluate("go('multimidia')"); ph.wait_for_selector('.tabs'); ph.click('.tabs >> text=Controle remoto'); ph.wait_for_selector('.rc')
    assert ph.locator('.rc .tl-p').count()==0 and ph.locator('.tl-abas').count()==0
    assert ph.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
    ph.screenshot(path=OUT+'/tl_rapido.png'); pc.screenshot(path=OUT+'/pj_tela.png')
    print('ERRS',errs); assert not errs
print('OK projecao')
