/*
 * Reklamsız YouTube — app.js
 *
 * YouTube videolarını / oynatma listelerini:
 *   - reklamsız (youtube-nocookie gömülü oynatıcıyla),
 *   - hesap açmadan / giriş yapmadan
 * oynatır; eklenen her kayıt tarayıcının localStorage alanında tutulur.
 *
 * Not: Saf yardımcı fonksiyonlar (URL çözümleme vb.) Node ortamında da
 * test edilebilsin diye `module.exports` ile dışa aktarılır.
 */
(() => {
  'use strict';

  /* ================= Sabitler ================= */

  const STORE_KEY = 'reklamsiz_youtube_library_v1';
  const LAST_KEY = 'reklamsiz_youtube_last_v1';
  const EMBED_BASE = 'https://www.youtube-nocookie.com/embed';
  const EMBED_PARAMS = 'autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&hl=tr';

  const thumbUrl = (videoId) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

  const PLAYLIST_ICON =
    '<svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 6h11M4 12h11M4 18h6"/>' +
    '<path d="M16.5 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none"/></svg>';

  /* ================= Saf yardımcı fonksiyonlar ================= */

  /**
   * Girilen metni YouTube linki olarak çözümler.
   * Kabul edilenler: watch?v=, youtu.be, /shorts/, /embed/, /live/, /v/,
   * music.youtube.com, m.youtube.com, youtube-nocookie.com, /playlist?list=
   * ve çıplak 11 haneli video ID'si.
   * @returns {{videoId: string|null, playlistId: string|null, original: string} | null}
   */
  function parseYouTubeUrl(raw) {
    if (raw === null || raw === undefined) return null;
    const input = String(raw).trim();
    if (!input) return null;

    // Çıplak video ID'si (örn: dQw4w9WgXcQ)
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
      return {
        videoId: input,
        playlistId: null,
        original: `https://www.youtube.com/watch?v=${input}`,
      };
    }

    let url;
    try {
      url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    } catch {
      return null;
    }

    const host = url.hostname.toLowerCase();
    const isYouTube =
      /(^|\.)youtube\.com$/.test(host) ||
      /(^|\.)youtube-nocookie\.com$/.test(host) ||
      /(^|\.)youtu\.be$/.test(host);
    if (!isYouTube) return null;

    let videoId = null;
    let playlistId = null;

    if (/(^|\.)youtu\.be$/.test(host)) {
      videoId = url.pathname.split('/').filter(Boolean)[0] || null;
    } else {
      videoId = url.searchParams.get('v');
      const pathMatch = url.pathname.match(/^\/(shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})\b/);
      if (pathMatch) videoId = pathMatch[2];
      if (/^\/playlist\/?$/.test(url.pathname)) {
        playlistId = url.searchParams.get('list');
      }
    }

    // Herhangi bir YouTube linkindeki list parametresi (örn: watch?v=..&list=..)
    if (!playlistId && url.searchParams.get('list')) {
      playlistId = url.searchParams.get('list');
    }

    if (videoId && !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) videoId = null;
    if (playlistId) {
      playlistId = playlistId.trim();
      if (!/^[a-zA-Z0-9_-]{2,}$/.test(playlistId)) playlistId = null;
    }

    if (!videoId && !playlistId) return null;
    return { videoId, playlistId, original: url.toString() };
  }

  /** Kayıt için reklamsız gömülü oynatıcı adresini üretir. */
  function embedUrlFor(item) {
    if (item.kind === 'playlist') {
      return `${EMBED_BASE}/videoseries?list=${encodeURIComponent(item.playlistId)}&${EMBED_PARAMS}`;
    }
    return `${EMBED_BASE}/${encodeURIComponent(item.videoId)}?${EMBED_PARAMS}`;
  }

  /** Çözümlenen linkten kütüphane kaydı oluşturur. */
  function makeItem(parsed) {
    const kind = parsed.videoId ? 'video' : 'playlist';
    const key = parsed.videoId || parsed.playlistId;
    return {
      id: `${kind}:${key}`,
      kind,
      videoId: parsed.videoId || null,
      playlistId: parsed.playlistId || null,
      title: null,
      url: parsed.original,
      addedAt: Date.now(),
    };
  }

  /** Gösterim başlığı (gerçek başlık yoksa genel başlık). */
  function displayTitle(item) {
    const base = item.kind === 'playlist' ? 'Oynatma Listesi' : 'Video';
    return item.title || `${base} • ${item.videoId || item.playlistId}`;
  }

  /**
   * oEmbed üzerinden video/liste başlığı getirir.
   * Önce YouTube'un kendi ucu, sonra noembed denenir; ikisi de
   * başarısız olursa null döner (oynatma bu adıma bağlı değildir).
   */
  async function fetchTitle(item) {
    const target =
      item.kind === 'playlist'
        ? `https://www.youtube.com/playlist?list=${item.playlistId}`
        : `https://www.youtube.com/watch?v=${item.videoId}`;
    const sources = [
      `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`,
      `https://noembed.com/embed?url=${encodeURIComponent(target)}`,
    ];
    for (const src of sources) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        const res = await fetch(src, { signal: ctrl.signal });
        if (!res.ok) continue;
        const data = await res.json();
        if (data && typeof data.title === 'string' && data.title.trim()) {
          return data.title.trim().slice(0, 200);
        }
      } catch {
        /* bir sonraki kaynağı dene */
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }

  /* ================= Depolama (localStorage) ================= */

  function isValidItem(x) {
    return (
      x &&
      typeof x.id === 'string' &&
      (x.kind === 'video' || x.kind === 'playlist') &&
      (x.kind === 'video' ? /^[a-zA-Z0-9_-]{11}$/.test(x.videoId || '') : !!x.playlistId)
    );
  }

  function loadLibrary() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(isValidItem) : [];
    } catch {
      return [];
    }
  }

  function saveLibrary(list) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false; // kota aşımı / depolama kapalı
    }
  }

  /* ================= Node/test ortamı: burada dur ================= */

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = {
        parseYouTubeUrl,
        embedUrlFor,
        makeItem,
        displayTitle,
        fetchTitle,
        STORE_KEY,
        LAST_KEY,
      };
    }
    return;
  }

  /* ================= Arayüz ================= */

  const $ = (sel) => document.querySelector(sel);

  const form = $('#add-form');
  const input = $('#url-input');
  const notice = $('#notice');
  const welcome = $('#welcome');
  const playerSection = $('#player-section');
  const player = $('#player');
  const npBadge = $('#np-badge');
  const npTitle = $('#np-title');
  const npSub = $('#np-sub');
  const npOpen = $('#np-open-yt');
  const npCopy = $('#np-copy');
  const npRemove = $('#np-remove');
  const playerNote = $('#player-note');
  const grid = $('#library-grid');
  const emptyBox = $('#library-empty');
  const libCount = $('#lib-count');
  const clearBtn = $('#clear-all');
  const toastEl = $('#toast');

  let library = loadLibrary();
  let current = null;
  let toastTimer = null;

  /* ---------- küçük yardımcılar ---------- */

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* eski tarayıcı: aşağıdakini dene */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.className = 'visually-hidden';
      ta.setAttribute('readonly', '');
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  /* ---------- kütüphane görünümü ---------- */

  function cardFor(item) {
    const card = document.createElement('article');
    card.className = 'card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute(
      'aria-label',
      `${item.kind === 'playlist' ? 'Oynatma listesi' : 'Video'}: ${displayTitle(item)}`
    );

    const thumb = document.createElement('div');
    thumb.className = 'thumb';

    if (item.kind === 'video') {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = '';
      img.src = thumbUrl(item.videoId);
      img.addEventListener('error', () => {
        thumb.classList.add('thumb-fallback');
        img.remove();
      });
      thumb.appendChild(img);
    } else {
      thumb.classList.add('thumb-playlist');
      thumb.innerHTML = PLAYLIST_ICON;
    }

    const badge = document.createElement('span');
    badge.className = 'thumb-badge';
    badge.textContent = item.kind === 'playlist' ? 'Oynatma Listesi' : 'Video';
    thumb.appendChild(badge);

    const del = document.createElement('button');
    del.className = 'card-del';
    del.type = 'button';
    del.title = 'Kütüphaneden kaldır';
    del.setAttribute('aria-label', 'Kütüphaneden kaldır');
    del.textContent = '🗑';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removeItem(item.id);
    });

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = displayTitle(item);

    const meta = document.createElement('p');
    meta.className = 'card-meta';
    const date = new Date(item.addedAt).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    meta.textContent = `${date} • ${item.kind === 'playlist' ? 'Oynatma listesi' : 'Video'}`;

    body.append(title, meta);
    card.append(thumb, del, body);

    card.addEventListener('click', () => playItem(item, { scroll: true }));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        playItem(item, { scroll: true });
      }
    });

    return card;
  }

  function renderLibrary() {
    grid.textContent = '';
    libCount.textContent = library.length ? `(${library.length})` : '';
    emptyBox.hidden = library.length > 0;
    clearBtn.hidden = library.length === 0;
    for (const item of library) grid.appendChild(cardFor(item));
  }

  /* ---------- oynatma ---------- */

  function playItem(item, opts = {}) {
    current = item;
    player.src = embedUrlFor(item);
    playerSection.hidden = false;
    welcome.hidden = true;

    npBadge.textContent = item.kind === 'playlist' ? 'Oynatma Listesi' : 'Video';
    npBadge.className = 'badge ' + (item.kind === 'playlist' ? 'badge-list' : 'badge-video');
    npTitle.textContent = displayTitle(item);
    npSub.textContent =
      item.kind === 'playlist'
        ? `Liste ID: ${item.playlistId} • Reklamsız gömülü oynatıcı, giriş gerekmez.`
        : `Video ID: ${item.videoId} • Reklamsız gömülü oynatıcı, giriş gerekmez.`;
    npOpen.href = item.url;
    playerNote.hidden = item.kind !== 'playlist';

    updateRemoveButton();

    try {
      localStorage.setItem(LAST_KEY, item.id);
    } catch {
      /* depolama kapalıysa yoksay */
    }

    if (opts.scroll) playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateRemoveButton() {
    npRemove.hidden = !(current && library.some((x) => x.id === current.id));
  }

  /* ---------- ekleme akışı ---------- */

  function refreshTitle(item) {
    fetchTitle(item).then((t) => {
      if (!t) return;
      item.title = t;
      saveLibrary(library);
      renderLibrary();
      if (current && current.id === item.id) npTitle.textContent = displayTitle(item);
    });
  }

  function addFromInput() {
    const parsed = parseYouTubeUrl(input.value);
    if (!parsed) {
      toast('❌ Geçerli bir YouTube video veya oynatma listesi linki yapıştıramadık.');
      input.focus();
      return;
    }

    const probe = makeItem(parsed);
    let item = library.find((x) => x.id === probe.id);
    const isNew = !item;

    if (isNew) {
      item = probe;
      library.unshift(item);
      if (!saveLibrary(library)) {
        toast('⚠️ Tarayıcı depolaması yazılamadı — kayıtlar kalıcı olmayabilir.');
      }
      renderLibrary();
      refreshTitle(item);
    }

    input.value = '';
    playItem(item, { scroll: true });
    toast(
      isNew
        ? '✅ Kütüphanene eklendi, şimdi reklamsız oynatılıyor.'
        : '▶ Kütüphanende zaten vardı, şimdi oynatılıyor.'
    );

    // Link hem video hem liste içeriyorsa listeyi de eklemeyi öner
    if (parsed.videoId && parsed.playlistId) showPlaylistNotice(parsed.playlistId);
  }

  /** "Bu video bir listede — listeyi de ekle" uyarısı. */
  function showPlaylistNotice(playlistId) {
    if (library.some((x) => x.kind === 'playlist' && x.playlistId === playlistId)) {
      notice.hidden = true;
      return;
    }

    notice.textContent = '';

    const text = document.createElement('span');
    text.textContent =
      '🔗 Bu video bir oynatma listesine ait. Listedeki tüm videoları sırayla izlemek için listeyi de kütüphanene ekle:';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'notice-btn';
    addBtn.textContent = 'Oynatma listesini de ekle ▶';
    addBtn.addEventListener('click', () => {
      const item = makeItem({
        videoId: null,
        playlistId,
        original: `https://www.youtube.com/playlist?list=${playlistId}`,
      });
      if (!library.some((x) => x.id === item.id)) {
        library.unshift(item);
        saveLibrary(library);
        renderLibrary();
        refreshTitle(item);
        toast('✅ Oynatma listesi kütüphanene eklendi.');
      }
      notice.hidden = true;
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'notice-close';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Bildirimi kapat');
    closeBtn.addEventListener('click', () => {
      notice.hidden = true;
    });

    notice.append(text, addBtn, closeBtn);
    notice.hidden = false;
  }

  /* ---------- silme işlemleri ---------- */

  function removeItem(id) {
    library = library.filter((x) => x.id !== id);
    saveLibrary(library);
    renderLibrary();
    if (current && current.id === id) updateRemoveButton();
    toast('🗑 Kütüphaneden kaldırıldı.');
  }

  /* ---------- olaylar ---------- */

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    addFromInput();
  });

  npCopy.addEventListener('click', async () => {
    if (!current) return;
    const ok = await copyText(current.url);
    toast(ok ? '📋 Link panoya kopyalandı.' : '❌ Kopyalanamadı — linki elle seçip kopyala.');
  });

  npRemove.addEventListener('click', () => {
    if (current) removeItem(current.id);
  });

  clearBtn.addEventListener('click', () => {
    if (!library.length) return;
    const ok = window.confirm(
      'Kütüphanendeki tüm kayıtları silmek istediğine emin misin? Bu işlem geri alınamaz.'
    );
    if (!ok) return;
    library = [];
    saveLibrary(library);
    try {
      localStorage.removeItem(LAST_KEY);
    } catch {
      /* yoksay */
    }
    current = null;
    player.removeAttribute('src');
    playerSection.hidden = true;
    welcome.hidden = false;
    renderLibrary();
    toast('🗑 Kütüphane temizlendi.');
  });

  // "/" tuşu link kutusuna odaklanır
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      input.focus();
    }
  });

  /* ---------- açılış: kütüphaneyi çiz, son izleneni yükle ---------- */

  renderLibrary();

  let lastId = null;
  try {
    lastId = localStorage.getItem(LAST_KEY);
  } catch {
    /* yoksay */
  }
  // Son izlenen kayıt silinmişse kütüphanedeki en yeni kaydı aç
  const last = library.find((x) => x.id === lastId) || library[0];
  if (last) playItem(last);
})();
