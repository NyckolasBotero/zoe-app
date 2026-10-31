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
    # aba própria na barra de navegação: lista de autorizados (whitelist)
    a.wait_for_selector('.nv[aria-label="Presença facial"]',state='attached'); a.evaluate("(()=>{const e=document.querySelector('.nv[aria-label=\\'Presença facial\\']');e.scrollIntoView({inline:'center',block:'nearest'});e.click()})()"); a.wait_for_selector('#rf_l .rfrow')
    assert a.evaluate("RF.tipo")=='culto' and a.is_visible('#rf_cd'),'por padrão registra culto (sem evento)'
    a.select_option('#rf_tp','evento'); a.wait_for_selector('#rf_ev'); eid=a.evaluate("document.querySelector('#rf_ev').value"); assert eid
    assert not a.is_disabled('button:has-text("Abrir câmera")'),'a câmera abre mesmo sem rostos indexados (modo teste)'
    a.click('button:has-text("Abrir câmera")'); a.wait_for_selector('#fcov #fc_go'); assert not a.is_disabled('#fc_go'); a.click('#fc_go'); a.wait_for_function("FC&&FC.run&&document.querySelector('#fc_cv')"); a.wait_for_function("!document.querySelector('#fc_info').textContent.includes('Carregando')"); fcFecha=a.evaluate("fcFecha()")
    # câmera bloqueada: mensagem clara e volta ao painel
    a.click('button:has-text("Abrir câmera")'); a.wait_for_selector('#fcov #fc_go'); a.evaluate("(()=>{window.__gum=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=async()=>{const e=new Error('x');e.name='NotAllowedError';throw e}})()"); a.click('#fc_go'); a.wait_for_function("document.querySelector('#fc_st')&&document.querySelector('#fc_st').textContent.includes('bloqueada')"); a.evaluate("(()=>{navigator.mediaDevices.getUserMedia=window.__gum;fcFecha()})()")
    assert a.evaluate("document.querySelectorAll('#rf_l input:checked').length")==0
    ids=a.evaluate("async(e)=>{const r=await api('eventoPresenca',{eventoId:e});const o={};r.membros.forEach(m=>o[m.nome.split(' ')[0]]=m.id);return o}",eid)
    a.fill('#rf_q','ana'); a.wait_for_function("document.querySelectorAll('#rf_l .rfrow').length===1"); a.check('#rf_l .rfrow input'); a.wait_for_function("RF.itens.find(x=>x.nome.startsWith('Ana')).aut")
    a.fill('#rf_q','bru'); a.check('#rf_l .rfrow input'); a.wait_for_function("RF.itens.find(x=>x.nome.startsWith('Bruno')).aut"); a.fill('#rf_q','')
    assert a.evaluate("api('faceRoster').then(r=>r.itens.filter(x=>x.aut).length)")==2
    # assinaturas de Ana (semente 1) e Bruno (semente 2) já indexadas; Carla não está autorizada
    a.evaluate("async(i)=>{await api('saveFaces',{itens:[{id:i.Ana,d:Array.from(__vec(1))},{id:i.Bruno,d:Array.from(__vec(2))},{id:i.Carla,d:Array.from(__vec(3))}]})}",ids)
    assert a.evaluate("api('listFaces').then(r=>r.itens.length)")==2,'quem não está autorizado não entra'
    a.evaluate("rfCarrega()"); a.wait_for_function("RF.itens.filter(x=>x.idx).length===2"); a.wait_for_selector('button:has-text("Abrir câmera"):not([disabled])')
    a.screenshot(path=OUT+'/face_aba.png')
    # fotos de exemplo enviadas à mão: uma foto com um rosto vira amostra; foto com dois rostos é recusada; quem não está autorizado não recebe
    import zlib,struct
    def png():
        raw=b''.join(b'\x00'+b'\xff\x88\x44'*4 for _ in range(4)); ch=lambda t,d:struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
        return b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',4,4,8,2,0,0,0))+ch(b'IDAT',zlib.compress(raw))+ch(b'IEND',b'')
    open('/tmp/rosto_ex.png','wb').write(png())
    a.fill('#rf_q','ana'); a.wait_for_function("document.querySelectorAll('#rf_l .rfrow').length===1")
    a.evaluate("__faces=[{seed:5,box:{x:100,y:80,width:120,height:150}}]")
    with a.expect_file_chooser() as fc: a.click('#rf_l .rfrow button:has-text("Enviar fotos")')
    fc.value.set_files('/tmp/rosto_ex.png'); a.wait_for_function("document.querySelector('#rf_st').textContent.includes('1 foto(s) adicionada')",timeout=15000)
    assert a.evaluate("api('listFaces').then(r=>r.itens.find(x=>x.nome.startsWith('Ana')).s.length)")==1
    a.wait_for_function("document.querySelector('#rf_l').textContent.includes('1 amostra')")
    a.evaluate("__faces=[{seed:6,box:{x:100,y:80,width:120,height:150}},{seed:7,box:{x:300,y:80,width:120,height:150}}]")
    with a.expect_file_chooser() as fc: a.click('#rf_l .rfrow button:has-text("Enviar fotos")')
    fc.value.set_files('/tmp/rosto_ex.png'); a.wait_for_function("document.querySelector('#rf_st').textContent.includes('mais de um rosto')",timeout=15000)
    assert a.evaluate("api('listFaces').then(r=>r.itens.find(x=>x.nome.startsWith('Ana')).s.length)")==1
    a.evaluate("__faces=[]"); a.fill('#rf_q','carl'); a.wait_for_function("document.querySelectorAll('#rf_l .rfrow').length===1"); assert a.locator('#rf_l .rfrow button:has-text("Enviar fotos")').count()==0,'só quem está autorizado tem o botão'
    a.fill('#rf_q','')
    a.click('button:has-text("Abrir câmera")'); a.wait_for_selector('#fcov #fc_go'); assert a.inner_text('#fc_n')=='2'
    # indexação: sem foto de perfil nenhuma é indexada, mas o fluxo termina sem erro
    a.evaluate("FC.info.falta=['x_inexistente']; fcDesenha()"); a.click('#fc_ix'); a.wait_for_function("document.querySelector('#fc_st').textContent.includes('sem rosto')",timeout=10000)
    a.click('#fc_go'); a.wait_for_selector('#fc_cv'); a.wait_for_function("FC&&FC.run")
    a.screenshot(path=OUT+'/face_inicio.png')
    # Ana (reconhecida) e uma pessoa desconhecida na imagem
    a.evaluate("__faces=[{seed:1,box:{x:100,y:80,width:120,height:150}},{seed:77,box:{x:380,y:120,width:100,height:130}}]")
    a.wait_for_selector('.fcard[data-id] button:has-text("Confirmar")',timeout=10000)
    assert 'Ana Souza' in a.inner_text('#fc_l'); assert 'Carla' not in a.inner_text('#fc_l'); a.wait_for_function("document.querySelector('#fc_l').textContent.includes('não reconhecido')",timeout=10000)
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
    # culto normal (sem evento cadastrado, qualquer dia) e modo teste (não grava nada)
    a.evaluate("fcFecha()"); a.wait_for_selector('#rf_tp'); a.select_option('#rf_tp','culto'); a.wait_for_selector('#rf_cd'); a.fill('#rf_cd','2026-10-24'); a.select_option('#rf_cn','Culto de sábado')
    assert 'Sábado' in a.inner_text('#view'),'mostra o dia da semana da data escolhida'
    a.click('button:has-text("Abrir câmera")'); a.wait_for_selector('#fcov #fc_go'); assert 'Culto de sábado' in a.inner_text('#fcov .fch'); a.click('#fc_go'); a.wait_for_function("FC&&FC.run&&document.querySelector('#fc_cv')")
    a.evaluate("__faces=[{seed:1,box:{x:100,y:80,width:120,height:150}}]"); a.wait_for_selector('.fcard[data-id] button:has-text("Confirmar")',timeout=10000); a.click('.fcard button:has-text("Confirmar")'); a.wait_for_selector('.fcard.ok:has-text("Ana Souza")')
    a.click('#fc_reg'); a.wait_for_function("FC.conf.size===0",timeout=8000)
    st=a.evaluate("api('faceStats')"); assert st['geral']['ok']>=1 and st['sessoes'][0]['ctx'].startswith('Culto'),st
    cp=a.evaluate("api('cultoPresenca',{data:'2026-10-24',culto:'Culto de sábado'}).then(r=>r.presentes)"); assert cp==[ids['Ana']],cp
    assert a.evaluate("api('cultoPresenca',{data:'2026-10-25',culto:'Culto de sábado'}).then(r=>r.presentes.length)")==0
    a.evaluate("fcFecha()"); a.wait_for_selector('#rf_tp'); a.select_option('#rf_tp','teste'); a.click('button:has-text("Abrir câmera")'); a.wait_for_selector('#fcov #fc_go'); assert 'Modo teste' in a.inner_text('#fcov .fch'); a.click('#fc_go'); a.wait_for_function("FC&&FC.run&&document.querySelector('#fc_cv')")
    a.evaluate("__faces=[{seed:2,box:{x:100,y:80,width:120,height:150}}]"); a.wait_for_selector('.fcard[data-id] button:has-text("Confirmar")',timeout=10000); a.click('.fcard button:has-text("Confirmar")'); assert 'Concluir teste' in a.inner_text('#fc_reg'); a.click('#fc_reg'); a.wait_for_function("FC.conf.size===0",timeout=8000)
    assert a.evaluate("api('cultosResumo').then(r=>r.cultos.reduce((n,c)=>n+c.total,0))")==1,'o modo teste não grava presença'
    a.evaluate("fcFecha()"); a.wait_for_selector('#rf_tp'); a.select_option('#rf_tp','evento'); a.click('button:has-text("Abrir câmera")'); a.wait_for_selector('#fcov #fc_go'); a.click('#fc_go'); a.wait_for_function("FC&&FC.run&&document.querySelector('#fc_cv')")
    a.click('button:has-text("Parar")'); a.wait_for_selector('#fc_go'); a.click('button:has-text("Apagar todos")'); a.wait_for_function("document.querySelector('#fc_n').textContent==='0'",timeout=8000)
    a.click('#fcov .fch button'); assert a.query_selector('#fcov') is None
    a.wait_for_selector('#rf_l .rfrow'); a.fill('#rf_q','ana'); a.uncheck('#rf_l .rfrow input'); a.wait_for_function("!RF.itens.find(x=>x.nome.startsWith('Ana')).aut")
    assert not errs,errs
    print('OK face')
