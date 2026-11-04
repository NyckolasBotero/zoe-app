# Bíblia: o texto aparece sem esperar as marcações (servidor lento) e o texto fica guardado no aparelho
# Rodar com: node tests/devserver.mjs  e depois  python3 tests/e2e_biblia.py
from playwright.sync_api import sync_playwright
import json, time
URL = 'http://localhost:8799/'; errs = []
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1200, 'height': 900}); pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.add_init_script("try{sessionStorage.setItem('zoe-pushbar','1')}catch(e){}")
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e', 'admin@zoe.com'); pg.fill('#lg_s', 'SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash', state='detached', timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("""()=>{const o=window.fetch;window.fetch=async(...a)=>{try{const b=a[1]&&a[1].body;if(typeof b==='string'&&b.includes('listMarks'))await new Promise(r=>setTimeout(r,3000))}catch(e){}return o(...a)}}""")
    t0 = time.time(); pg.evaluate("go('membro')"); pg.evaluate("R.sub.membro='biblia';render()")
    pg.wait_for_selector('#bibtxt .bv', timeout=15000); dt = time.time() - t0
    print('texto da Bíblia apareceu em %.2fs com marcações lentas (3 s)' % dt); assert dt < 2.5, dt
    # segunda visita: arquivos vêm do cache do service worker
    pg.wait_for_timeout(500)
    n = pg.evaluate("caches.open('zoe-bib-1').then(c=>c.keys()).then(k=>k.length)"); print('arquivos da Bíblia guardados:', n); assert n >= 1, n
    b.close()
print('ERRS', errs); assert not errs, errs; print('OK')
