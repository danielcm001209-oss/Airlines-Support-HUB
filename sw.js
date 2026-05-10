const CACHE_NAME = 'airlines-hub-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Ignorar chrome-extension, HEAD requests y otros esquemas no http/https
  if(!e.request.url.startsWith('http')) return;
  if(e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  if(
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('generativelanguage') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('fonts.googleapis')
  ){ return; }

  if(url.pathname.includes('/pdfs/airlines/')){
    e.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(e.request);
        if(cached) return cached;
        try{
          const response = await fetch(e.request);
          if(response.ok) cache.put(e.request, response.clone());
          return response;
        }catch{
          return new Response('PDF no disponible offline', {status:503});
        }
      })
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(response => {
        if(response.ok){
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener('message', async e => {
  if(e.data?.type === 'CACHE_PDFS'){
    const urls = e.data.urls || [];
    const cache = await caches.open(CACHE_NAME);
    let ok = 0, fail = 0;
    for(const url of urls){
      try{
        const res = await fetch(url);
        if(res.ok){ await cache.put(url, res); ok++; }
        else fail++;
      }catch{ fail++; }
    }
    // e.source es null cuando controller=null, usar clients.matchAll como fallback
    const clients = await self.clients.matchAll({includeUncontrolled: true});
    clients.forEach(client => 
      client.postMessage({type:'CACHE_PDFS_DONE', ok, fail})
    );
  }

  if(e.data?.type === 'GET_CACHE_STATUS'){
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const pdfKeys = keys.filter(r => r.url.includes('/pdfs/airlines/')).map(r => r.url);
    e.source?.postMessage({type:'CACHE_STATUS', pdfs:pdfKeys, total:keys.length});
  }
});