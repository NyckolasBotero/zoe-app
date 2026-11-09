# Studio Zoe v1.168: acessos só da Mídia, definidos na aprovação e mantidos em Configurações com Salvar
# rodar com: SEED_MIDIA=1 node tests/devserver.mjs
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':900,'height':1000}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1',timeout=20000)
    # aprovação: o modal já mostra o acesso padrão e permite marcar
    pg.evaluate("go('aprovacoes')"); pg.wait_for_function("S.aprov&&S.aprov.itens&&S.aprov.itens.some(x=>x.id==='IN3')",timeout=15000)
    pg.evaluate("apMotivo(S.aprov.itens.findIndex(x=>x.id==='IN3'),'autorizado')"); pg.wait_for_selector('.aps')
    txt=pg.inner_text('#modal, .modal, body'); assert 'Acesso ao Studio Zoe' in txt and 'Chat Pastoral' in txt and 'Social Mídia' in txt and 'Zoe Live Studio' in txt
    assert pg.evaluate("[...document.querySelectorAll('.aps')].filter(c=>c.checked).map(c=>c.dataset.a)")==['social']
    pg.check('.aps[data-a=proj]'); pg.check('#aps_chat')
    pg.evaluate("document.querySelector('[onclick^=apConfirma]').click()"); pg.wait_for_timeout(1200)
    # Configurações > Acessos: marcar não grava; Salvar grava; Descartar volta
    pg.evaluate("go('multimidia');mmArea('cfg')"); pg.wait_for_timeout(500); pg.evaluate("mmSub('acessos')")
    pg.wait_for_function("document.querySelector('#view').textContent.includes('Novo')",timeout=15000)
    assert 'Fora' not in pg.inner_text('#view'), 'fora da Mídia não aparece'
    assert pg.is_disabled('#sta_sv')
    box=lambda nome,area: pg.locator(f"xpath=//div[contains(@class,'opt')][.//b[text()='{nome}']]//label[contains(.,'{area}')]//input")
    assert box('Novo','Projeção').is_checked() and box('Novo','Chat Pastoral').is_checked()
    box('Leo','Zoe Live Studio').check(); box('Leo','Configurações').check(); pg.wait_for_timeout(300)
    assert not pg.is_disabled('#sta_sv') and 'falta salvar' in pg.inner_text('#view')
    assert pg.evaluate("api('studioAcessos',{}).then(d=>d.itens.find(i=>i.nome==='Leo').areas)")==['social'], 'nada gravado antes de Salvar'
    pg.click('text=Descartar alterações'); pg.wait_for_timeout(300); assert pg.is_disabled('#sta_sv') and not box('Leo','Zoe Live Studio').is_checked()
    box('Leo','Zoe Live Studio').check(); box('Bia','Projeção').check(); pg.click('#sta_sv'); pg.wait_for_timeout(1200)
    d=pg.evaluate("api('studioAcessos',{})")
    por={i['nome']:i for i in d['itens']}
    assert sorted(por['Leo']['areas'])==['live','social'] and sorted(por['Bia']['areas'])==['proj','social'] and sorted(por['Novo']['areas'])==['proj','social'] or sorted(por['Novo']['areas'])==['proj']
    assert pg.is_disabled('#sta_sv')
    print('ERROS:',errs); assert not errs; print('E2E STUDIO ACESSOS OK')
