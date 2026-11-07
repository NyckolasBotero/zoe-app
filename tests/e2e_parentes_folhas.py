# Parentes: cadastrar quem não usa o site, folhas por idade e marcação de cristã/congrega
from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,1280,1400)
    pg.add_style_tag(content='#pushbar{display:none!important}')
    pg.evaluate("go('arvore')"); pg.wait_for_selector('#kin_card'); pg.fill('#kin_q','Zé Inexistente'); pg.wait_for_selector('#kin_sug button:has-text("Cadastrar")'); pg.click('#kin_sug button:has-text("Cadastrar")')
    assert pg.input_value('#kn_nome')=='Zé Inexistente'
    pg.fill('#kn_nome','Hadassa Botero'); pg.select_option('#kn_rel','filha'); pg.fill('#kn_nasc','2024-02-10'); pg.check('input[name=kn_cr][value="1"]'); pg.check('input[name=kn_zo][value="1"]')
    pg.click('button:has-text("Cadastrar e vincular")'); pg.wait_for_selector('.kin-folha',timeout=10000)
    pg.evaluate('kinNovoAbre()'); pg.fill('#kn_nome','Davi Botero'); pg.select_option('#kn_rel','filho'); pg.fill('#kn_nasc','2014-05-01'); pg.check('input[name=kn_cr][value="0"]')
    pg.click('button:has-text("Cadastrar e vincular")'); pg.wait_for_function("document.querySelectorAll('.kin-folha').length==2",timeout=10000)
    t=pg.inner_text('#kin_lst'); print(t.replace('\n',' | ')); assert 'Cristã na Zoe' in t and 'Não cristã' in t
    sz=pg.evaluate("[...document.querySelectorAll('.kin-folha svg')].map(s=>+s.getAttribute('width'))"); print(sz); assert sz[0]!=sz[1]
    cols=pg.evaluate("[...document.querySelectorAll('.kin-folha svg path:first-child')].map(s=>s.getAttribute('fill'))"); assert cols[0]!=cols[1]
    # marcar: muda Davi para cristão fora da Zoe
    pg.click('.kin-folha >> nth=1 >> button.kin-fb'); pg.wait_for_selector('.modal:has-text("É cristã?")'); pg.check('input[name=ki_cr][value="1"]'); pg.check('input[name=ki_zo][value="0"]'); pg.click('.modal >> text=Salvar')
    pg.wait_for_function("document.querySelector('#kin_lst').innerText.includes('Cristã fora da Zoe')",timeout=10000)
    pg.screenshot(path=OUT+'/parentes_folhas.png',full_page=False)
    print('ERRS',errs); assert not errs
print('OK folhas')
