from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,1280,1100)
    pg.add_style_tag(content='#pushbar{display:none!important}')
    pg.evaluate("go('admin')"); pg.wait_for_timeout(500)
    pg.evaluate("sub('admin','def')") if False else None
    pg.evaluate("admGrupo('cel')"); pg.wait_for_selector('#app_p',timeout=8000)
    assert pg.input_value('#app_p')=='3' and pg.input_value('#app_f')=='6'
    pg.fill('#app_p','4'); pg.fill('#app_f','5'); pg.click('button:has-text("Salvar regras")'); pg.wait_for_timeout(800)
    cfg=pg.evaluate("api('getPublicConfig',{}).catch(()=>null)"); 
    print(pg.evaluate("[S.presPart,S.faltasEx]")); assert pg.evaluate("S.presPart")==4 and pg.evaluate("S.faltasEx")==5
    pg.locator('#app_p').scroll_into_view_if_needed(); pg.screenshot(path=OUT+'/regras_part.png')
    print('ERRS',errs); assert not errs
print('OK regras ui')
