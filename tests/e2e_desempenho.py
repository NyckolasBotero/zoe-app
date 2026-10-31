# Painel "Desempenho e capacidade": medição das requisições, envio agregado, gráficos, tabelas e calculadora
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,w,h):
    ctx=b.new_context(viewport={'width':w,'height':h}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); return pg
with sync_playwright() as p:
    b=p.chromium.launch(); a=entra(b,1280,900)
    assert a.evaluate("MET.on"),'medição ligada depois do login'
    n0=a.evaluate("Object.values(MET.ser).reduce((x,g)=>x+g.n,0)"); assert n0>0,'as requisições do login/boot foram medidas'
    a.evaluate("async()=>{for(let i=0;i<4;i++)await api('listEvents');await api('ping')}")
    live=a.evaluate("MET.live.filter(x=>x.a==='listEvents').length"); assert live==4
    assert a.evaluate("MET.live.every(x=>x.rtt>=0)") and a.evaluate("MET.live.some(x=>x.srv>=0)")
    # envia tudo e confere no servidor
    a.evaluate("metFlush(true)"); a.wait_for_function("!metBusy&&Object.keys(MET.det).length<=1",timeout=10000)
    g=a.evaluate("api('getMetrics',{horas:6,dias:1})"); assert g['serie'] and g['serie'][0]['n']>0 and g['serie'][0]['ap']>=1; assert any(r['a']=='listEvents' and r['n']>=4 for r in g['det'])
    assert a.evaluate("api('getMetrics',{horas:6,dias:1}).then(m=>m.serie[0].slot.length)")==16,'intervalo no formato yyyy-MM-dd HH:mm'
    # abre a aba Desempenho (computador: um grupo por página)
    a.evaluate("go('admin')"); a.wait_for_selector('.admtabs'); a.click('.admtabs button:has-text("Desempenho")')
    a.wait_for_selector('svg[aria-label="Tempo de resposta ao longo do tempo"]',timeout=10000)
    assert a.evaluate("document.querySelectorAll('#view svg path').length")>=3
    assert a.locator('#view .stat b').first.inner_text()!='0','o painel mostra as requisições medidas'
    for t in ['Responsividade','Requisições e erros','Páginas que mais pesam','Ações que mais pesam','Quantas pessoas o Apps Script aguenta?']: assert a.locator('#view h3:has-text("%s")'%t).count()==1,t
    assert 'Registro de uso' in a.inner_text('#view') or 'listEvents' in a.inner_text('#view')
    # calculadora: mais gente e cadeado mais pesado muda a situação
    a.fill('#cp_n','300'); a.fill('#cp_r','6'); a.fill('#cp_s','200'); a.fill('#cp_k','0')
    t1=a.inner_text('#capOut'); assert 'Folgado' in t1 and 'Vai travar' not in t1.split('\n')[0], t1[:300]; assert 'por volta de 525' in t1,t1[:120]
    a.fill('#cp_s','3000'); t2=a.inner_text('#capOut'); assert 'Vai travar' in t2
    a.fill('#cp_s','200'); a.fill('#cp_k','2000'); t3=a.inner_text('#capOut'); assert 'cadeado das escritas' in t3,t3[:200]
    a.fill('#cp_k','0'); a.fill('#cp_d','50'); a.fill('#cp_s','3000'); assert a.inner_text('#capOut')!=t2,'reduzir consultas muda o resultado'
    a.click('button:has-text("Voltar aos valores medidos")'); assert a.evaluate("CAP.srv===null&&CAP.red===0")
    # ping manual
    a.click('#mp_b'); a.wait_for_selector('text=Última medição',timeout=20000); assert '8/8' in a.inner_text('#view')
    a.screenshot(path=OUT+'/desempenho_desktop.png',full_page=True)
    # muda período
    a.select_option('select >> nth=0','6'); a.wait_for_selector('svg[aria-label="Tempo de resposta ao longo do tempo"]',timeout=10000)
    # celular: tudo na mesma página, carregamento sob demanda
    m=entra(b,390,844); m.evaluate("go('admin')"); m.wait_for_selector('button:has-text("Carregar medições")'); m.click('button:has-text("Carregar medições")')
    m.wait_for_selector('svg[aria-label="Tempo de resposta ao longo do tempo"]',timeout=10000)
    assert m.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),'sem rolagem horizontal no celular'
    m.screenshot(path=OUT+'/desempenho_cel.png',full_page=True)
    # membro comum não tem o painel
    print('ERROS JS:',errs); assert not errs
    b.close(); print('OK desempenho')
