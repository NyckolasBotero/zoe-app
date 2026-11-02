# Carregamento rápido: fotos, lista de Pessoas e Meu perfil ficam no aparelho e abrem na hora (mesmo sem rede)
# Rodar com: node tests/devserver.mjs  e depois  python3 tests/e2e_carregamento.py
from playwright.sync_api import sync_playwright
import json, os, time
URL = 'http://localhost:8799/'; errs = []; OUT = os.environ.get('SHOTS', '/tmp')
FOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

def novo(ctx, email, senha, nova=None):
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.add_init_script("try{sessionStorage.setItem('zoe-pushbar','1')}catch(e){}")
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e', email); pg.fill('#lg_s', senha); pg.click('#lg_b'); pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a', senha); pg.fill('#fp_n', nova); pg.fill('#fp_r', nova); pg.click('text=Salvar nova senha'); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e', email); pg.fill('#lg_s', nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash', state='detached', timeout=15000); pg.evaluate("api('guideDone')"); return pg

with sync_playwright() as p:
    b = p.chromium.launch()
    adm_ctx = b.new_context(viewport={'width': 1200, 'height': 900}); adm = novo(adm_ctx, 'admin@zoe.com', 'SenhaForte123')
    adm.evaluate("""async()=>{await api('createUser',{nome:'Ana Souza',email:'ana@zoe.com',senha:'Temp12345',papel:'membro'});await api('createUser',{nome:'Bruno Alvares',email:'bruno@zoe.com',senha:'Temp12345',papel:'membro'})}""")
    for em, nome in (('ana@zoe.com', 'Ana Souza'), ('bruno@zoe.com', 'Bruno Alvares')):
        c = b.new_context(); pg = novo(c, em, 'Temp12345', 'NovaSenha123')
        r = pg.evaluate("async(a)=>{try{await api('saveMember',{membro:{Nome:a[0],Foto:a[1]}});return 'ok'}catch(e){return e.message}}", [nome, FOTO]); assert r == 'ok', r
        c.close()

    # 1) o admin abre Pessoas: lista e fotos chegam
    adm.evaluate("Object.keys(FT).forEach(k=>FT[k]=0)")  # o app só reconsulta foto vazia depois de 60 s; aqui as fotos acabaram de ser gravadas
    adm.evaluate("go('pessoas')"); adm.wait_for_selector('#ps_r .opt', timeout=15000)
    adm.wait_for_function("document.querySelectorAll('#ps_r .opt .fa img').length>=2", timeout=15000)
    print('fotos na lista:', adm.evaluate("document.querySelectorAll('#ps_r .opt .fa img').length"))
    adm.evaluate("go('meu')"); adm.wait_for_selector('.pfnav', timeout=15000)
    adm.wait_for_function("typeof MEU!=='undefined'&&MEU&&!MEU.erro&&MEUF===1", timeout=15000)
    time.sleep(3)  # dá tempo de gravar fotos, Pessoas e perfil no aparelho

    # 2) recarrega a página e bloqueia a rede das três rotas: tudo deve aparecer só com o que ficou guardado
    chamadas = []
    def rota(route):
        corpo = route.request.post_data or ''
        try: a = json.loads(corpo).get('action')
        except Exception: a = ''
        if a in ('fotos', 'listPeople', 'profileView'):
            chamadas.append(a); return route.abort()
        route.continue_()
    adm.route('**/api*', rota)
    adm.reload(); adm.wait_for_selector('#view h1', timeout=20000); adm.wait_for_selector('#splash', state='detached', timeout=15000)

    adm.evaluate("go('pessoas')"); adm.wait_for_selector('#ps_r .opt', timeout=5000)
    adm.wait_for_function("document.querySelectorAll('#ps_r .opt .fa img').length>=2", timeout=3000)
    n = adm.evaluate("document.querySelectorAll('#ps_r .opt').length"); assert n >= 2, n
    assert 'Ana' in adm.inner_text('#ps_r') and 'Bruno' in adm.inner_text('#ps_r')
    print('Pessoas abriu sem rede com', n, 'linhas e fotos')

    adm.evaluate("go('meu')"); adm.wait_for_selector('.pfnav', timeout=5000)
    assert 'Carregando seu perfil' not in adm.inner_text('#view'), 'Meu perfil ainda mostra "Carregando"'
    adm.wait_for_selector('.pf-head', timeout=3000)
    print('Meu perfil abriu sem rede')
    adm.screenshot(path=OUT + '/carregamento_meu.png')

    # 3) ao sair, o que ficou guardado é apagado
    adm.unroute('**/api*'); adm.evaluate("sair()"); adm.wait_for_selector('#lg_e', timeout=15000)
    sobrou = adm.evaluate("""()=>new Promise(r=>{const q=indexedDB.open('zoe-kv',1);q.onsuccess=()=>{const d=q.result;if(!d.objectStoreNames.contains('kv'))return r(-1);const c=d.transaction('kv').objectStore('kv').count();c.onsuccess=()=>r(c.result);c.onerror=()=>r(-2)};q.onerror=()=>r(-3)})""")
    assert sobrou == 0, 'sobrou dado no aparelho: %s' % sobrou
    print('Dados do aparelho apagados ao sair; chamadas bloqueadas:', sorted(set(chamadas)))
    b.close()
print('ERRS', errs); assert not errs, errs; print('OK')
