# Presença por rosto: caixas sobre os rostos, lista de confirmação e registro (biblioteca e câmera simuladas)
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
STUB="""
(()=>{
 const vec=s=>{let x=s*9301+49297,a=[];for(let i=0;i<128;i++){x=(x*9301+49297)%233280;a.push(x/233280-.5)}return Float32Array.from(a)};
 window.__vec=vec; window.__faces=[];
 const cv=document.createElement('canvas');cv.width=640;cv.height=480;const g=cv.getContext('2d');setInterval(()=>{g.fillStyle='#345';g.fillRect(0,0,640,480);g.fillStyle='#fc8';g.fillRect(100,80,120,150);g.fillRect(380,120,100,130)},60);
 navigator.mediaDevices.getUserMedia=async()=>cv.captureStream(15);
 const det=()=>window.__faces.map(f=>({detection:{box:f.box},descriptor:window.__vec(f.seed)}));
 const chain=(single)=>({withFaceLandmarks:()=>({withFaceDescriptors:async()=>det(),withFaceDescriptor:async()=>det()[0]})});
 window.faceapi={nets:{tinyFaceDetector:{loadFromUri:async()=>0},faceLandmark68TinyNet:{loadFromUri:async()=>0},faceRecognitionNet:{loadFromUri:async()=>0}},TinyFaceDetectorOptions:function(o){this.o=o},detectAllFaces:()=>chain(),detectSingleFace:()=>chain(true)};
})();
"""
def entra(b,email,senha):
    ctx=b.new_context(viewport={'width':390,'height':844}); pg=ctx.new_page(); pg.add_init_script(STUB); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')"); return pg
with sync_playwright() as p:
    b=p.chromium.launch(); a=entra(b,'admin@zoe.com','SenhaForte123')
    a.evaluate("""async()=>{for(const n of ['Ana Souza','Bruno Alvares','Carla Dias'])await api('createUser',{nome:n,email:n.split(' ')[0].toLowerCase()+'@zoe.com',senha:'Temp12345',papel:'membro'});await api('createEvent',{titulo:'Culto de Domingo',data:'2099-01-10',hora:'19:00',local:'Templo'})}""")
    a.evaluate("go('admin');admGrupo('pub')"); a.wait_for_selector('button:has-text("Carregar eventos")'); a.click('button:has-text("Carregar eventos")'); a.wait_for_selector('#ck_ev')
    eid=a.evaluate("document.querySelector('#ck_ev').value")
    ids=a.evaluate("async(e)=>{const r=await api('eventoPresenca',{eventoId:e});const o={};r.membros.forEach(m=>o[m.nome.split(' ')[0]]=m.id);return o}",eid)
    # assinaturas de Ana (semente 1) e Bruno (semente 2) já indexadas
    a.evaluate("async(i)=>{await api('saveFaces',{itens:[{id:i.Ana,d:Array.from(__vec(1))},{id:i.Bruno,d:Array.from(__vec(2))}]})}",ids)
    a.click('button:has-text("Câmera de presença")'); a.wait_for_selector('#fcov #fc_go'); assert a.inner_text('#fc_n')=='2'
    # indexação: sem foto de perfil nenhuma é indexada, mas o fluxo termina sem erro
    a.evaluate("FC.info.falta=['x_inexistente']; fcDesenha()"); a.click('#fc_ix'); a.wait_for_function("document.querySelector('#fc_st').textContent.includes('sem rosto')",timeout=10000)
    a.click('#fc_go'); a.wait_for_selector('#fc_cv'); a.wait_for_function("FC&&FC.run")
    a.screenshot(path=OUT+'/face_inicio.png')
    # Ana (reconhecida) e uma pessoa desconhecida na imagem
    a.evaluate("__faces=[{seed:1,box:{x:100,y:80,width:120,height:150}},{seed:77,box:{x:380,y:120,width:100,height:130}}]")
    a.wait_for_selector('.fcard[data-id] button:has-text("Confirmar")',timeout=10000)
    assert 'Ana Souza' in a.inner_text('#fc_l'); assert 'Carla' not in a.inner_text('#fc_l')
    assert a.inner_text('#fc_info').startswith('2 rosto')
    px=a.evaluate("(()=>{const c=document.querySelector('#fc_cv'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n})()"); assert px>500,px   # caixas desenhadas
    a.screenshot(path=OUT+'/face_lista.png')
    a.click('.fcard button:has-text("Confirmar")'); a.wait_for_selector('.fcard.ok:has-text("Ana Souza")')
    # Bruno aparece mas o administrador diz que não é ele: escolhe Carla
    a.evaluate("__faces=[{seed:2,box:{x:100,y:80,width:120,height:150}}]"); a.wait_for_selector('.fcard:has-text("Bruno") button:has-text("Não é")',timeout=10000)
    a.click('.fcard:has-text("Bruno") button:has-text("Não é")'); a.wait_for_selector('.fcard input[placeholder="Buscar pelo nome"]'); a.fill('.fcard input[placeholder="Buscar pelo nome"]','carl'); a.click('.fcq button:has-text("Carla")')
    a.wait_for_selector('.fcard.ok:has-text("Carla Dias")'); a.wait_for_timeout(900)
    assert a.query_selector('.fcard:has-text("Bruno"):not(.ok)') is None   # o mesmo rosto não volta a ser sugerido como Bruno
    a.click('#fc_reg'); a.wait_for_function("FC.conf.size===0",timeout=8000)
    pres=a.evaluate("async(e)=>(await api('eventoPresenca',{eventoId:e})).presentes",eid); assert set(pres)=={ids['Ana'],ids['Carla']},pres
    # quem já está presente aparece azul e não vira sugestão de novo
    a.evaluate("__faces=[{seed:1,box:{x:100,y:80,width:120,height:150}}]"); a.wait_for_timeout(1000); assert 'Ana' not in a.inner_text('#fc_l').split('Confirmados')[0]
    a.click('button:has-text("Parar")'); a.wait_for_selector('#fc_go'); a.click('button:has-text("Apagar todos")'); a.wait_for_function("document.querySelector('#fc_n').textContent==='0'",timeout=8000)
    a.click('#fcov .fch button'); assert a.query_selector('#fcov') is None
    assert not errs,errs
    print('OK face')
