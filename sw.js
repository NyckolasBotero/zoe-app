/* Zoe: notificações no aparelho (Web Push). Sem cache de páginas: o app continua sempre atualizado. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'Zoe', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // sempre mostra: o iPhone exige que todo aviso recebido apareça, senão desliga as notificações do app
    await self.registration.showNotification(d.title || 'Ministério Zoe', { body: d.body || '', tag: d.tag || 'zoe', icon: 'assets/img/icon-192.png', badge: 'assets/img/icon-192.png', data: { url: d.url || './' }, renotify: true });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) { if ('focus' in c) { await c.focus(); return; } }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});

// Exigido para o navegador oferecer "Instalar app": só repassa a abertura de páginas à rede e avisa se estiver sem internet
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response('Sem conexão. Abra o app de novo quando a internet voltar.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })));
});
