#!/usr/bin/env python3
"""Gera index.html (documento completo para hospedar) a partir de src/app.html (conteúdo do app)."""
import re, json, subprocess, datetime, hashlib, os
s = open('src/app.html', encoding='utf-8').read()
# identificação da versão: data/hora da geração (horário de Brasília) + último commit; também vai para version.json
def _git(*a):
    try: return subprocess.check_output(['git', *a], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception: return ''
_agora = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3)))
# número da versão (1.N): sobe 1 a cada geração com o código-fonte diferente da anterior; refazer o build sem mexer no código mantém o número
_h = hashlib.sha1(s.replace('__ZVER__', '').encode('utf-8')).hexdigest()[:10]
try: _ant = json.load(open('version.json', encoding='utf-8'))
except Exception: _ant = {}
if _ant.get('h') == _h: _zv = _ant
else: _zv = {'id': _agora.strftime('%Y%m%d-%H%M%S'), 'data': _agora.strftime('%d/%m/%Y %H:%M'), 'h': _h, 'v': '1.' + str(int(str(_ant.get('v', '1.0')).split('.')[-1]) + 1)}
s = s.replace('__ZVER__', json.dumps(_zv), 1)
open('version.json', 'w', encoding='utf-8').write(json.dumps(_zv))
title = re.search(r'<title>.*?</title>', s).group(0)
body = s.replace(title, '', 1).replace('<meta name="claude:viewport-fit-sides" content="cover">', '', 1)
# links e <style> vão no <head>; o resto no <body>
head_parts = re.findall(r'<link[^>]*>', body) + re.findall(r'<style>.*?</style>', body, re.S)
for p in head_parts: body = body.replace(p, '', 1)
html = f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1D904F">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Zoe">
<link rel="manifest" href="manifest.json">
<link rel="icon" type="image/png" href="assets/img/icon-192.png">
<link rel="apple-touch-icon" href="assets/img/icon-180.png">
{title}
{chr(10).join(p for p in head_parts if p.startswith('<link'))}
<style>:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
{chr(10).join(p for p in head_parts if p.startswith('<style'))}
</head>
<body>
{body.strip()}
</body>
</html>
'''
open('index.html', 'w', encoding='utf-8').write(html)
print('index.html gerado', len(html), 'bytes')
