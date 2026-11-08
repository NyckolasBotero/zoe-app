from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':420,'height':900})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_timeout(1200)
    r=pg.evaluate("""async()=>{
      await api('saveLesson',{titulo:'Parábola do Semeador',resumo:'Os tipos de coração',conteudo:'O semeador saiu a semear e parte da semente caiu à beira do caminho. Jesus explicou que a semente é a palavra de Deus anunciada. O coração endurecido não permite que a palavra produza frutos. A terra boa representa quem ouve a palavra e persevera com paciência.'});
      for(const t of ['Paz de Cristo','A armadura de Deus','Fé e obras']) await api('saveLesson',{titulo:t,resumo:'x'});
      const ls=await api('listLessons');const lic=ls.find(l=>l.titulo==='Parábola do Semeador').id;
      const c=await api('createCell',{nome:'Célula Teste',liderId:S.membroId,dia:'Quarta'});
      await api('saveMember',{celulaId:c.id}).catch(()=>0);
      const hoje=new Date(Date.now()-864e5*2).toISOString().slice(0,10);
      await api('saveAttendance',{celulaId:c.id,data:hoje,presentes:[],licaoId:lic,confirmaDia:true});
      return c.id}""")
    pg.evaluate(f"S.celId='{r}';save&&save();hydrate().then(()=>{{shell();go('celula','hist')}})"); pg.wait_for_timeout(2500)
    pg.evaluate("QZ.ld=null;go('celula','hist')"); pg.wait_for_selector("h2:has-text('Quiz das lições')",timeout=8000)
    assert 'Parábola do Semeador' in pg.inner_text('#view')
    print('ERROS:',errs); assert not errs; print('E2E QUIZ LIDER OK')
