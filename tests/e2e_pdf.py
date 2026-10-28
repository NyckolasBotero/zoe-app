# Compressor de PDF (>10 MB), arrastar e soltar e visualizador ajustado à página
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1300,'height':800}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=8000)
    pg.evaluate("go('admin')"); pg.wait_for_selector('#bk_zone'); pg.wait_for_timeout(700)
    # arrastar e soltar um PDF e uma capa dentro do cartão
    pg.evaluate("""()=>{const z=document.getElementById('bk_zone');const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(2000)],'pequeno.pdf',{type:'application/pdf'}));
      z.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true}));z.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))}""")
    assert 'pequeno.pdf' in pg.inner_text('#bk_p_n'), pg.inner_text('#bk_p_n')
    pg.set_input_files('#bk_p',[]); 
    # PDF grande: comprime e envia
    sz=os.path.getsize('/tmp/big.pdf'); print('TAMANHO',sz/1048576); assert sz>10*1048576
    pg.fill('#bk_t','Livro Grande'); pg.set_input_files('#bk_p','/tmp/big.pdf'); assert 'comprimido' in pg.inner_text('#bk_p_n')
    pg.click('text=Adicionar livro'); pg.wait_for_selector('#cmpfb'); pg.screenshot(path=OUT+'/m_cmp.png')
    pg.wait_for_function('S.livros&&S.livros.some(l=>l.titulo==="Livro Grande")',timeout=100000)
    # leitor: página inteira visível, sem cortar
    pg.evaluate("go('biblioteca')"); pg.wait_for_selector('.livro'); pg.click('.livro >> text=Ler e comentar'); pg.wait_for_selector('#pdfcv'); pg.wait_for_function("document.querySelector('#pgn')"); pg.wait_for_timeout(1500)
    r=pg.evaluate("(()=>{const c=document.querySelector('#pdfcv').getBoundingClientRect(),w=document.querySelector('#pdfwrap').getBoundingClientRect();return [c.height,w.height,c.width,w.width,document.querySelector('#pdfwrap').scrollHeight,document.querySelector('#pdfwrap').clientHeight]})()"); print('LEITOR',r)
    assert r[0]<=r[1]+2 and r[4]<=r[5]+12, r
    assert 'de 7' in pg.inner_text('#pdfbox'), pg.inner_text('#pdfbox')[:200]
    pg.evaluate("window.scrollTo({top:0,behavior:'instant'})"); pg.wait_for_timeout(300); pg.screenshot(path=OUT+'/m_leitor.png')
    for _ in range(4): pg.click('button[aria-label="Diminuir"]')
    pg.wait_for_timeout(600); assert pg.inner_text('#pdfz').endswith('%')
    print('E2E PDF OK' if not errs else 'ERROS: %s'%errs); b.close()
