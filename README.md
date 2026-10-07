# Reklamsız YouTube

YouTube videolarını ve oynatma listelerini **reklamsız**, **hesap açmadan / giriş yapmadan** izlemeni sağlayan, tamamen tarayıcıda çalışan statik bir web sitesi. Eklediğin tüm linkler `localStorage` içinde tutulur; siteye tekrar girdiğinde videolarına yeniden link yazmadan ulaşırsın.

## ✨ Özellikler

- 🎬 **Reklamsız oynatma** — YouTube'un gizlilik odaklı gömülü oynatıcısı (`youtube-nocookie`) kullanılır; klasik reklamlar ve takip çerezleri engellenir.
- 🔓 **Giriş yok** — Google hesabı açmana gerek yok, hiçbir kimlik bilgisi istenmez.
- 💾 **localStorage kütüphanesi** — eklediğin her video / oynatma listesi tarayıcının `localStorage` alanına kaydedilir; tek tıkla tekrar aç, istediğini sil.
- 📋 **Oynatma listesi desteği** — `playlist?list=...` linkini yapıştır; oynatıcı içindeki listeyle listedeki **tüm videoları sırayla** izleyebilir, istediğin videoya atlayabilirsin. `watch?v=...&list=...` linklerindeyse "listeyi de ekle" uyarısı çıkar.
- 🔗 **Çoklu link formatı** — `watch?v=`, `youtu.be`, `/shorts/`, `/embed/`, `/live/`, `music.youtube.com` ve çıplak video ID'si.
- 🕒 **Kaldığın yerden devam** — siteyi kapatsan bile son izlediğin video açılışta otomatik yüklenir.
- 🖼️ **Küçük resimler ve başlıklar** — videoların küçük resmi (`i.ytimg.com`) ve başlığı (oEmbed) otomatik getirilir.
- 📱 **Mobil uyumlu** — responsive, koyu tema.

## 🚀 Çalıştırma

Hiçbir derleme adımı yok — düz statik dosyalar:

```bash
# depoyu klonla
 git clone <repo-url>
 cd reklamsiz_youtube

# herhangi bir statik sunucu ile servis et (örn:)
python3 -m http.server 8000
# veya
npx serve .
```

Tarayıcıda `http://localhost:8000` adresini aç. (Dosyaları doğrudan `file://` ile de açabilirsin.)

## 🧩 Nasıl çalışır?

1. Link kutusuna bir YouTube linki yapıştırıp **Ekle ve İzle**'ye basarsın.
2. Uygulama linkten video ID'sini / oynatma listesi ID'sini çözümler, kaydı `localStorage`'a yazar ve içeriği reklamsız gömülü oynatıcıda açar.
3. **Kütüphanem** bölümünde kaydettiğin her şeye tek tıkla geri dönebilir, istediklerini silebilirsin.

Veri akışı:

```
Link kutusu → parseYouTubeUrl() → localStorage (kütüphane)
                                → youtube-nocookie embed (oynatma)
                                → oEmbed / noembed (başlık, isteğe bağlı)
```

## 🔒 Gizlilik

- Hiçbir veri sunucuya gönderilmez; sitenin kendisi bir sunucu gerektirmez.
- Tüm kütüphane verisi yalnızca senin tarayıcında (`localStorage`) tutulur. Tarayıcı verilerini temizlersen kayıtlar silinir.
- Oynatma, YouTube'un `youtube-nocookie` alanı üzerinden yapılır; bu alan klasik `youtube.com` gömmeye göre daha az çerez kullanır.
- Video başlıkları getirilirken YouTube oEmbed, o olmazsa `noembed.com` kullanılır. Bu istekler başarısız olursa kayıtlar genel başlıkla (Video • ID) saklanmaya devam eder.

## ⚠️ Sınırlamalar

- Yaş sınırı olan veya sahibinin gömmeye izin vermediği videolar embed oynatıcıda açılmayabilir — bu durumda oynatıcı altındaki **"YouTube'da aç"** bağlantısını kullan.
- YouTube, gömülü oynatıcıda çok nadiren reklam gösterebilir; bu sayfa YouTube'un kendisini değiştiremez, ancak klasik site/oynatma reklamlarından ve ara reklamdan kaçınır.

## 🗂️ Dosyalar

| Dosya | Açıklama |
| --- | --- |
| `index.html` | Sayfa yapısı ve CSP politikası |
| `style.css` | Koyu tema, responsive stiller |
| `app.js` | URL çözümleme, localStorage kütüphanesi, oynatma mantığı |
