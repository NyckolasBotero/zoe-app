# Canva Zoe: editor de artes nativo (texto, forma, modelo, desfazer, envio ao telão) + Sod por usuário
from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); ph=entra(b,390,844)
    ph.add_style_tag(content='#pushbar{display:none!important}')
    ph.evaluate("go('multimidia')"); ph.wait_for_selector('.tabs')
    ar=ph.inner_text('.mm-area')
    for t in ['Lives','Projeção','Social Mídia','Configurações']: assert t in ar, t
    ph.click('.mm-area button:has-text("Configurações")'); ct=ph.inner_text('.tabs')
    for t in ['Tela de pausa','Edição de layouts','Agendas']: assert t in ct, t
    ph.click('.mm-area button:has-text("Lives")'); t2=ph.inner_text('.tabs'); assert 'Estúdio' in t2 and 'Plataformas e conexão' in t2
    ph.click('.mm-area button:has-text("Social Mídia")'); ph.wait_for_selector('#cvc')
    ph.evaluate("go('artes')"); ph.wait_for_selector('#cvc')
    ph.select_option('select[aria-label="Formato da arte"]','sto'); assert ph.evaluate('[CV.w,CV.h]')==[1080,1920]
    ph.select_option('select[aria-label="Formato da arte"]','per'); ph.fill('#cv_w','900'); ph.fill('#cv_h','500'); ph.click('button:has-text("Aplicar")'); assert ph.evaluate('[CV.w,CV.h]')==[900,500]
    ph.select_option('select[aria-label="Formato da arte"]','tel')
    ph.click('.cv-b:has-text("Texto") >> nth=0'); ph.wait_for_selector('#cvp textarea')
    ph.fill('#cvp textarea','Culto de Domingo'); assert ph.evaluate("cvEl().text")=='Culto de Domingo'
    ph.click('.cv-b:has-text("Círculo")'); assert ph.evaluate("CV.els.length")==2
    ph.click('button[aria-label=Desfazer]'); assert ph.evaluate("CV.els.length")==1
    ph.click('button[aria-label=Refazer]'); assert ph.evaluate("CV.els.length")==2
    ph.click('#cvtabs >> text=Modelos'); ph.click('.cv-b:has-text("Versículo")'); assert ph.evaluate("CV.els.length")==2
    px=ph.evaluate("(()=>{const c=document.getElementById('cvc'),d=c.getContext('2d').getImageData(5,5,1,1).data;return d[0]+d[1]+d[2]})()"); assert px>0
    ph.click('#cvc',position={'x':100,'y':60}); ph.evaluate("CV.sel=CV.els[0].id"); ph.evaluate("cvDel()"); assert ph.evaluate("CV.els.length")==1
    assert ph.evaluate("(cvJpeg(45000)||'').length")>0
    ph.click('button:has-text("Salvar rascunho")'); ph.wait_for_function("CV.status==='rascunho'",timeout=8000)
    ph.click('button:has-text("Aprovar e liberar")'); ph.wait_for_function("CV.status==='aprovada'",timeout=8000)
    ph.click('.tabs >> text=Artes'); ph.wait_for_selector('.chip:has-text("Aprovada")'); ph.click('.tabs >> text=Aprovação'); ph.wait_for_selector('text=Quem aprova as artes')
    # Sod por usuário
    ph.evaluate("go('perfil','info')"); ph.wait_for_selector('text=Usar o Sod')
    on=ph.evaluate("sodOn()"); ph.click('input[aria-label="Usar o Sod"]'); ph.wait_for_function("sodOn()!=="+("true" if on else "false"),timeout=6000)
    ph.wait_for_timeout(500); ph.click('input[aria-label="Usar o Sod"]'); ph.wait_for_function("sodOn()==="+("true" if on else "false"),timeout=6000)
    print('OK canva+sod'); b.close()
