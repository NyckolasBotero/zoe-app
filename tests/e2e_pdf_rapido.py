# PDFs rápidos: depois da 1ª abertura o livro fica no aparelho e abre na hora, mesmo com o servidor lento
# Rodar com: node tests/devserver.mjs  e depois  python3 tests/e2e_pdf_rapido.py
from playwright.sync_api import sync_playwright
import base64, time
URL = 'http://localhost:8799/'; errs = []
def pdf2():
    objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>',
            '<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>']
    out = b'%PDF-1.4\n'; offs = []
    for i, o in enumerate(objs, 1): offs.append(len(out)); out += ('%d 0 obj\n%s\nendobj\n' % (i, o)).encode()
    x = len(out); out += ('xref\n0 5\n0000000000 65535 f \n' + ''.join('%010d 00000 n \n' % o for o in offs) + 'trailer\n<</Size 5/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF' % x).encode()
    return base64.b64encode(out).decode()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_context(viewport={'width': 1200, 'height': 900}).new_page()
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.add_init_script("try{sessionStorage.setItem('zoe-pushbar','1')}catch(e){}")
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e', 'admin@zoe.com'); pg.fill('#lg_s', 'SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash', state='detached', timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("async(b)=>{await api('saveBook',{titulo:'Livro Rápido',autor:'A',descricao:'d',pdf:b})}", pdf2())
    pg.evaluate("go('biblioteca')"); pg.wait_for_selector('text=Ler e comentar'); pg.click('text=Ler e comentar')
    pg.wait_for_function("document.querySelector('#pgn')", timeout=15000); print('1ª abertura OK (veio do servidor)')
    pg.wait_for_timeout(800)
    n = pg.evaluate("KV.get('pdf:idx').then(x=>x?x.length:0)"); assert n == 1, n
    # volta, recarrega a página, deixa o servidor lento (3 s) para getBookFile e reabre
    pg.reload(); pg.wait_for_selector('#splash', state='detached', timeout=25000)
    pg.evaluate("""()=>{const o=window.fetch;window.__bf=[];window.fetch=async(...a)=>{try{const b=a[1]&&a[1].body;if(typeof b==='string'&&b.includes('getBookFile')){window.__bf.push(b);await new Promise(r=>setTimeout(r,3000))}}catch(e){}return o(...a)}}""")
    pg.evaluate("go('biblioteca')"); pg.wait_for_selector('text=Ler e comentar'); t0 = time.time(); pg.click('text=Ler e comentar')
    pg.wait_for_function("document.querySelector('#pgn')", timeout=15000); dt = time.time() - t0
    print('reabertura em %.2fs com servidor lento (3 s)' % dt); assert dt < 2.5, dt
    bf = pg.evaluate("window.__bf"); assert bf and '"arq"' in bf[0], bf
    pg.wait_for_timeout(3500)
    assert pg.evaluate("!!document.querySelector('#pgn')") and not errs, errs
    b.close()
print('ERRS', errs); assert not errs, errs; print('OK')
