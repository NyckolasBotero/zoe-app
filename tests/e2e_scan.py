# Cadastro facial obrigatório no login: consentimento LGPD, scanner guiado por ângulo, envio, perfil e revogação (câmera e rosto simulados)
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
STUB="""
(()=>{
 const vec=s=>{let x=s*9301+49297,a=[];for(let i=0;i<128;i++){x=(x*9301+49297)%233280;a.push(x/233280-.5)}return Float32Array.from(a)};
 window.__seed=1;window.__pose={yaw:.5,pit:.5};window.__noface=false;
 const cv=document.createElement('canvas');cv.width=640;cv.height=480;const g=cv.getContext('2d');setInterval(()=>{g.fillStyle='#345';g.fillRect(0,0,640,480);g.fillStyle='#fc8';g.fillRect(220,140,200,200)},60);
 navigator.mediaDevices.getUserMedia=async()=>cv.captureStream(15);
 const pts=()=>{const p=[];for(let i=0;i<68;i++)p.push({x:200,y:200});p[0]={x:100,y:200};p[16]={x:300,y:200};p[8]={x:200,y:300};for(let i=36;i<48;i++)p[i]={x:200,y:140};p[30]={x:100+window.__pose.yaw*200,y:140+window.__pose.pit*160};return p};
 const cur=()=>window.__noface?null:({detection:{box:{x:220,y:140,width:200,height:200},score:.9},landmarks:{positions:pts()},descriptor:vec(window.__seed)});
 window.faceapi={nets:{tinyFaceDetector:{loadFromUri:async()=>0},faceLandmark68TinyNet:{loadFromUri:async()=>0},faceRecognitionNet:{loadFromUri:async()=>0}},TinyFaceDetectorOptions:function(o){this.o=o},detectSingleFace:()=>({withFaceLandmarks:()=>({withFaceDescriptor:async()=>cur()})})};
})();
"""
POSE={'f':(.5,.5),'e':(.66,.5),'d':(.34,.5),'c':(.5,.4),'b':(.5,.6)}
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844}); a=ctx.new_page(); a.add_init_script(STUB); a.on('pageerror',lambda e:errs.append(str(e))); a.on('dialog',lambda d:d.accept())
    a.goto(URL); a.wait_for_selector('#lg_e'); a.fill('#lg_e','admin@zoe.com'); a.fill('#lg_s','SenhaForte123'); a.click('#lg_b')
    # 1) ao entrar, o cadastro facial é exigido
    a.wait_for_selector('#fgov',timeout=20000); assert 'Cadastro facial e uso de imagem' in a.inner_text('#fgov'); assert a.query_selector('#fgov button:has-text("Fechar")') is None,'não dá para fechar quando é obrigatório'
    assert a.is_disabled('#fg_go'); a.check('#fg_b'); assert a.is_disabled('#fg_go'),'precisa dos dois consentimentos'; a.check('#fg_i'); assert not a.is_disabled('#fg_go')
    a.screenshot(path=OUT+'/scan_termos.png',full_page=True)
    assert a.query_selector('#fg_sem') is not None,'no computador há a opção de dizer que está sem câmera'
    # no celular não existe essa opção, nem depois de erro de câmera
    m=b.new_context(viewport={'width':390,'height':844},user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1').new_page(); m.add_init_script(STUB); m.on('dialog',lambda d:d.accept())
    m.goto(URL); m.wait_for_selector('#lg_e'); m.fill('#lg_e','admin@zoe.com'); m.fill('#lg_s','SenhaForte123'); m.click('#lg_b'); m.wait_for_selector('#fgov',timeout=20000)
    assert m.query_selector('#fg_sem') is None,'no celular não há opção de pular'
    m.check('#fg_b'); m.check('#fg_i'); m.evaluate("(()=>{navigator.mediaDevices.getUserMedia=async()=>{const e=new Error('x');e.name='NotAllowedError';throw e}})()"); m.click('#fg_go'); m.wait_for_selector('text=Tentar de novo')
    assert 'obrigatório no celular' in m.inner_text('#fgov') and m.query_selector('#fgov button:has-text("sem câmera")') is None and m.query_selector('#fgov button:has-text("Fazer depois")') is None
    m.close()
    # no computador, depois de erro de câmera, também dá para dizer que está sem câmera
    d=b.new_context(viewport={'width':1200,'height':800}).new_page(); d.add_init_script(STUB); d.on('dialog',lambda x:x.accept())
    d.goto(URL); d.wait_for_selector('#lg_e'); d.fill('#lg_e','admin@zoe.com'); d.fill('#lg_s','SenhaForte123'); d.click('#lg_b'); d.wait_for_selector('#fgov',timeout=20000)
    d.check('#fg_b'); d.check('#fg_i'); d.evaluate("(()=>{navigator.mediaDevices.getUserMedia=async()=>{const e=new Error('x');e.name='NotFoundError';throw e}})()"); d.click('#fg_go'); d.wait_for_selector('text=Tentar de novo'); d.click('#fgov button:has-text("sem câmera")'); assert d.query_selector('#fgov') is None
    d.reload(); d.wait_for_selector('#view h1',timeout=20000); d.wait_for_timeout(1500); assert d.query_selector('#fgov') is None,'depois de dizer que está sem câmera não pergunta de novo na mesma sessão'
    d.close()
    # 2) scanner guiado: só captura quando a posição pedida é feita
    a.click('#fg_go'); a.wait_for_function("FG&&FG.run",timeout=10000)
    a.evaluate("__pose={yaw:.5,pit:.5};__seed=1"); a.wait_for_function("FG.i===1",timeout=10000)
    a.evaluate("__seed=2"); a.wait_for_function("FG.i===2",timeout=10000); a.evaluate("__seed=3"); a.wait_for_function("FG.i===3",timeout=10000)
    a.evaluate("__seed=4"); a.wait_for_timeout(1800); assert a.evaluate("FG.i")==3,'de frente não vale para o passo de virar à esquerda'
    assert 'ESQUERDA' in a.inner_text('#fg_ins')
    a.screenshot(path=OUT+'/scan_passo.png')
    tipos=['f','f','f','e','e','d','d','c','b','f']
    for i in range(3,10):
        y,pt=POSE[tipos[i]]; a.evaluate("([y,p,s])=>{__pose={yaw:y,pit:p};__seed=s}",[y,pt,i+1]); a.wait_for_function("FG.i>=%d||FG.etapa!=='scan'"%(i+1),timeout=12000)
    a.wait_for_selector('text=Tudo certo',timeout=15000)
    me=a.evaluate("api('faceMe')"); assert not me['precisa'] and me['consentido'] and me['amostras']>=8,me
    ls=a.evaluate("api('listFaces').then(r=>r.itens.map(x=>x.s.length))"); assert ls and ls[0]>=8,ls
    a.click('#fgov button:has-text("Continuar")'); assert a.query_selector('#fgov') is None
    # 4) perfil: refazer e revogar
    a.evaluate("go('perfil')"); a.evaluate("R.sub.perfil='conf';render()"); a.wait_for_selector('text=Meu rosto e imagem'); assert 'Cadastro facial feito' in a.inner_text('#view')
    a.locator('button:has-text("Refazer o scanner")').dispatch_event('click'); a.wait_for_selector('#fgov button:has-text("Fechar")'); a.click('#fgov button:has-text("Fechar")')
    a.locator('button:has-text("Apagar meus dados faciais")').dispatch_event('click'); a.wait_for_function("document.querySelector('#view').textContent.includes('revogado')",timeout=10000)
    me=a.evaluate("api('faceMe')"); assert me['revogado'] and not me['precisa'],me
    assert a.evaluate("api('listFaces').then(r=>r.itens.length)")==0
    # 5) quem já fez não é mais interrompido ao entrar de novo
    a.reload(); a.wait_for_selector('#lg_e',timeout=15000) if a.query_selector('#lg_e') else None
    a.wait_for_selector('#view h1',timeout=20000); a.wait_for_timeout(1500); assert a.query_selector('#fgov') is None
    print('ERROS JS:',errs); assert not errs
    b.close(); print('OK scan')
