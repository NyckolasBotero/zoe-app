# Estúdio de transmissão: cenas, transições, telão espelhado, plataformas, live real via relay (ffmpeg) e Lives e Vídeos
from playwright.sync_api import sync_playwright
import os,subprocess,time,sys
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp'); RP=18790
relay=subprocess.Popen(['node','relay/server.mjs'],env={**os.environ,'PORT':str(RP),'RELAY_TOKEN':'segredo-teste','PUBLIC_URL':f'http://127.0.0.1:{RP}'},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
sink=subprocess.Popen(['ffmpeg','-loglevel','error','-listen','1','-i','rtmp://127.0.0.1:19360/live/chave','-t','40','-f','null','-'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1.5)
def entra(b,vw=1400,vh=950):
    pg=b.new_page(viewport={'width':vw,'height':vh}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')"); return pg
try:
  with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'])
    pg=entra(b)
    # configuração das plataformas (admin)
    pg.evaluate("go('multimidia')"); pg.wait_for_selector('.mm-area'); assert 'Lives' in pg.inner_text('.mm-area') and 'Projeção' in pg.inner_text('.mm-area')
    pg.click('.mm-area button:has-text("Lives")'); pg.wait_for_selector('#stu'); pg.click('.tabs >> text=Plataformas e conexão'); pg.wait_for_selector('text=Servidor de retransmissão')
    pg.fill('input[placeholder="wss://transmissao.suaigreja.com.br"]',f'ws://127.0.0.1:{RP}'); pg.fill('input[type=password] >> nth=0','segredo-teste'); pg.click('button:has-text("Testar conexão")'); pg.wait_for_function("document.querySelector('#pl_teste').textContent.includes('senha está correta')",timeout=8000)
    pg.click('.st-addb:has-text("YouTube")'); pg.wait_for_selector('text=Como obter os dados')
    pg.fill('input[placeholder="rtmp://…"]','rtmp://127.0.0.1:19360/live'); pg.fill('input[placeholder="https://www.youtube.com/@suaigreja/live"]','https://www.youtube.com/watch?v=M7lc1UVf-VE')
    pg.fill('.card:has-text("Como obter os dados") input[type=password] >> nth=0','chave'); pg.click('button:has-text("Salvar tudo")'); pg.wait_for_function("PLC.mudou===false&&PLC.d.plats[0].id",timeout=8000)
    cfg=pg.evaluate("api('getLiveCfg')"); assert cfg['plats'][0]['chave']=='chave' and cfg['relay']['url'].startswith('ws://'),cfg
    pg.screenshot(path=OUT+'/st_plataformas.png',full_page=True)
    # estúdio
    pg.click('.tabs >> text=Estúdio'); pg.wait_for_selector('#st_cenas .st-cena'); pg.wait_for_function("document.querySelectorAll('#st_cenas .st-cena').length>=3")
    # câmera falsa do Chrome na cena 2 (já tem câmera): programa = cena 1; prévia = cena 2
    pg.wait_for_function("ST.srcs&&Object.values(ST.srcs).some(s=>s.ok)",timeout=10000) if False else None
    pg.click('#st_cenas .st-cena:has-text("Câmera + legenda") .st-cn'); pg.wait_for_function("stCena(ST.prev).nome==='Câmera + legenda'")
    pg.wait_for_function("Object.values(ST.srcs).some(s=>s.ok)",timeout=12000)
    # telão espelhado: manda um versículo (Almeida, local)
    pg.evaluate("api('setTelao',{item:'v:AL_43_3_16'})"); pg.wait_for_function("ST.tm.unit&&/João 3:16/.test(ST.tm.unit.titulo)",timeout=12000)
    assert 'João 3:16' in pg.inner_text('#st_tvi'),pg.inner_text('#st_tvi')
    # transição: programa passa da cena 1 para a 2
    pg.select_option('#st_trans select >> nth=0','desfoque'); pg.click('#st_trans .st-tbtn'); pg.wait_for_function("!ST.TR&&stCena(ST.prog).nome==='Câmera + legenda'",timeout=5000)
    px=pg.evaluate("(()=>{const c=ST.cv,d=c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data;return [d[0],d[1],d[2]]})()"); assert sum(px)>0,px
    # fontes: adicionar texto e arrastar (muda a geometria)
    pg.click('.st-addb:has-text("Texto")'); pg.wait_for_selector('.st-cam.sel')
    pg.screenshot(path=OUT+'/st_estudio.png',full_page=True)
    # iniciar a transmissão de verdade
    pg.fill('#st_tit','Culto de teste'); pg.click('#st_barra .st-go'); pg.wait_for_selector('.st-live.on',timeout=20000)
    pg.wait_for_function("ST.stats&&ST.stats.saidas.length&&ST.stats.saidas[0].estado==='ok'",timeout=25000)
    assert 'AO VIVO' in pg.inner_text('#st_barra'),pg.inner_text('#st_barra')
    pg.screenshot(path=OUT+'/st_aovivo.png',full_page=True)
    # aparece em Lives e Vídeos para outra pessoa, com player do site
    live=pg.evaluate("api('getLive')"); assert live['ativa'] and live['hls'].endswith('index.m3u8'),live
    vids=pg.evaluate("api('listVideos')"); assert any(v['aoVivo'] and v['hls'] for v in vids),vids
    pg2=entra(b,390,844); pg2.evaluate("go('tutoriais')"); pg2.wait_for_selector('.vlive',timeout=10000)
    pg2.evaluate("vidRefresh()"); pg2.wait_for_function("S.videos.some(v=>v.aoVivo&&v.hls)",timeout=8000)
    pg2.evaluate("abrirVideo(S.videos.findIndex(v=>v.aoVivo))"); pg2.wait_for_selector('#lwv',timeout=5000); pg2.wait_for_function("document.getElementById('lwe').textContent.includes('assistindo')",timeout=9000)
    pg2.fill('#lwi','Amém, Pastor!'); pg2.press('#lwi','Enter'); pg.wait_for_function("ST.com.some(c=>c.texto==='Amém, Pastor!')",timeout=12000)
    pg2.screenshot(path=OUT+'/st_assistir.png')
    # encerrar
    pg.click('#st_barra .btn.red'); pg.wait_for_function("!ST.out",timeout=8000); assert pg.evaluate("api('getLive')")['ativa']==False
    print('ERRS',errs); assert not errs
  print('OK')
finally:
  relay.kill(); sink.kill()
