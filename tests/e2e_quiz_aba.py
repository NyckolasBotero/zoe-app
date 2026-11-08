from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
def login(pg,e,s):
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',e); pg.fill('#lg_s',s); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_timeout(1200)
with sync_playwright() as p:
    b=p.chromium.launch(); adm=b.new_page(viewport={'width':420,'height':900}); adm.on('pageerror',lambda e:errs.append(str(e)))
    login(adm,'admin@zoe.com','SenhaForte123')
    cid=adm.evaluate("""async()=>{
      await api('saveLesson',{titulo:'Parábola do Semeador',resumo:'Os tipos de coração',conteudo:'O semeador saiu a semear e parte da semente caiu à beira do caminho. Jesus explicou que a semente é a palavra de Deus anunciada. O coração endurecido não permite que a palavra produza frutos. A terra boa representa quem ouve a palavra e persevera com paciência.'});
      const lic=(await api('listLessons')).find(l=>l.titulo==='Parábola do Semeador').id;
      const cs=await api('adminList',{tipo:'celulas'});const id=cs.itens.find(x=>x.rotulo==='Célula Norte').id;
      const mem=await api('cellMembers',{celulaId:id});const ids=mem.map(m=>m.id);
      const hoje=new Date(Date.now()-3*36e5).toISOString().slice(0,10);
      await api('saveAttendance',{celulaId:id,data:hoje,presentes:ids,licaoId:lic,confirmaDia:true});
      await api('quizPrepara',{celulaId:id});return id}""")
    ana=b.new_page(viewport={'width':420,'height':900}); ana.on('pageerror',lambda e:errs.append(str(e)))
    kill="document.querySelectorAll('#cq,.cq,.pop').forEach(e=>e.remove())"
    def ck(s):
        ana.evaluate(kill); ana.click(s)
    ana.add_init_script("window.__zap=[];window.open=(u)=>{window.__zap.push(u);return null}")
    ana.goto(URL); ana.wait_for_selector('#lg_e'); ana.fill('#lg_e','ana@zoe.com'); ana.fill('#lg_s','Temp12345'); ana.click('#lg_b'); ana.wait_for_selector('#fp_a')
    ana.fill('#fp_a','Temp12345'); ana.fill('#fp_n','SenhaNova2026!'); ana.fill('#fp_r','SenhaNova2026!'); ana.click('button:has-text("Salvar nova senha")'); ana.wait_for_timeout(1500)
    if ana.locator('#lg_e').count(): ana.fill('#lg_e','ana@zoe.com'); ana.fill('#lg_s','SenhaNova2026!'); ana.click('#lg_b')
    ana.wait_for_selector('#view h1'); ana.wait_for_timeout(1200)
    ana.evaluate(kill); ana.evaluate("go('celula','quiz')"); ana.wait_for_selector("h2:has-text('Quiz da célula')",timeout=10000)
    assert 'Regras' in ana.inner_text('#view') and ana.locator("button:has-text('Jogar')").count()>=1
    ana.evaluate(kill); ck("#view button:has-text('WhatsApp')"); z=ana.evaluate("window.__zap[0]"); assert 'wa.me' in z and 'quiz%3D' in z.replace('%3F','').replace('?','') or 'quiz=' in z or 'quiz%3D' in z, z
    ana.evaluate(kill); ck("#view button:has-text('Jogar')"); ana.wait_for_selector('.modal :text("uma única vez")'); ana.evaluate("quizComeca()")
    ana.wait_for_selector('.modal b.sp:has-text("Pergunta")')
    n=0
    while ana.locator('.modal b.sp:has-text("Pergunta")').count() and n<10:
        ana.wait_for_selector('.modal button.opc'); ana.evaluate("document.querySelectorAll('.modal button.opc')[1].click()"); ana.wait_for_timeout(600); n+=1
    ana.wait_for_selector('.modal :text("Desafiar no WhatsApp")',timeout=8000); t=ana.inner_text('.modal'); print(t[:160].replace('\n',' | ')); assert 'Desafiar no WhatsApp' in t and 'Ver ranking' in t
    ana.evaluate("closeL();go('celula','quiz')"); ana.wait_for_selector("h3:has-text('Ranking de pontos')",timeout=8000); ana.wait_for_timeout(600)
    r=ana.inner_text('#view'); assert 'você' in r and 'quizzes' in r, r[:400]
    ana.screenshot(path='/tmp/qa1.png')
    ck("button:has-text('Quizzes da célula')"); ana.wait_for_selector('details summary'); ck('details summary >> nth=0'); ana.wait_for_timeout(300)
    assert 'jogaram' in ana.inner_text('#view'); ana.screenshot(path='/tmp/qa2.png')
    ck("button:has-text('Meu histórico')"); ana.wait_for_selector("h3:has-text('Meu histórico')"); assert 'Rever' in ana.inner_text('#view')
    ck("#view button:has-text('Rever')"); ana.wait_for_selector('.modal :text("pontos")'); ana.screenshot(path='/tmp/qa3.png')
    print('ERROS:',errs); assert not errs; print('E2E QUIZ ABA OK')
