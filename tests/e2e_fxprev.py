# Personalização do perfil: pré-visualizar efeitos de brilho ainda bloqueados
from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,1280,900)
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    h=pg.evaluate("""()=>{MEUC={fx:{},top:['x:1'],pv:{}};const ga=[{codigo:'x',ano:1,titulo:'Teste',visual:{estilo:'ouro'}}];return destPers(ga,['x:1'],{topSlots:1,fx:{brilho:30,aura:35}},2,g=>g.codigo+':'+g.ano)}""")
    assert 'Pré-visualizar todos os efeitos' in h and 'meuFxPrev' in h and '🔒 Nv 30' in h and 'disabled' not in h.split('dfx')[1].split('</div>')[0], 'html'
    assert h.count('bfx-')>=7, h.count('bfx-')
    pg.evaluate("MEUC={fx:{},top:['x:1'],pv:{}};meuFxPrev('x:1','chama');") 
    h2=pg.evaluate("""()=>destPers([{codigo:'x',ano:1,titulo:'Teste',visual:{estilo:'ouro'}}],['x:1'],{topSlots:1,fx:{brilho:30,chama:50}},2,g=>g.codigo+':'+g.ano)""")
    assert 'pré-visualizando Chamas' in h2 and 'não será salvo' in h2
    pg.evaluate("meuFx('x:1','')"); assert pg.evaluate("JSON.stringify(MEUC.pv)")=='{}'
    assert not errs, errs
    print('OK pré-visualização de efeitos'); b.close()
