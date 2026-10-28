#!/usr/bin/env python3
"""Gera index.html (documento completo para hospedar) a partir de src/app.html (conteúdo do app)."""
import re
s = open('src/app.html', encoding='utf-8').read()
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
