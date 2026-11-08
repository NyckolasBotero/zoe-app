# Transcrição de PDF no próprio aparelho (pdf.js) + leitura do texto
import base64
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
B64=base64.b64encode(open('/tmp/mini.pdf','rb').read()).decode()
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':420,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1',timeout=20000)
    pg.evaluate("""(B64)=>{LICOES.unshift({id:'LX1',t:'Bom samaritano',s:'teste',c:'Fé',u:'https://exemplo.com/a.pdf',tt:false});window.__saved=null;
      const o=api;api=async(a,d)=>{if(a==='getLessonPdf')return{pdf:B64};if(a==='saveLessonText'){window.__saved=d.texto;return{ok:true}}if(a==='getLessonText')return{titulo:'Bom samaritano',texto:window.__saved,url:'',por:'Admin',em:'2026-11-08'};return o(a,d)};go('licoes')}""",B64)
    pg.wait_for_selector('#lt_LX1'); pg.click('#lt_LX1'); pg.wait_for_function("window.__saved",timeout=20000)
    t=pg.evaluate("window.__saved"); print(repr(t)); assert 'bom samaritano' in t.lower() and 'Ame o proximo' in t and t.count('\n')>=1, t
    pg.wait_for_selector('#layer .modal'); assert 'Texto transcrito' in pg.inner_text('#layer')
    print('ERROS:',errs); assert not errs; print('E2E LICAO PDF OK')
