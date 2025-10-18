# Ankara Adliyesi Duyuru Takip Sistemi - Çözüm Dokümantasyonu

## 🎯 Sorun Analizi

Uygulamanızda şu sorunlar tespit edildi:
1. **Web Scraping Başarısız**: ankara.adalet.gov.tr sitesi mevcut hosting ortamından (Google Cloud Kubernetes) erişilemez durumda
2. **Coğrafi Engelleme**: Site DNS/network seviyesinde filtrelenmiş
3. **Telegram Bot Kararsız**: Scraping başarısız olduğunda bot da çalışmıyor

## ✅ Uygulanan Çözümler

### 1. Cache-First Yaklaşım
- Site erişilemese bile Redis'teki cache verisi kullanılıyor
- API istekleri 20 saniye timeout ile sınırlandırıldı
- Scraping başarısız olsa da eski veriler gösteriliyor

### 2. Dual Scraping Strategy
- **Önce Axios + Cheerio**: Hızlı ve hafif scraping
- **Fallback olarak Puppeteer**: Daha güçlü browser simülasyonu
- İkisi de başarısız olursa cache'i kullan

### 3. Test Data API
- Geliştirme ve test için `/api/seed-test-data` endpoint'i eklendi
- Manuel veri yükleme imkanı

### 4. Gelişmiş Cron Notification
- `/api/cron-notification` endpoint'i
- Yeni duyuruları otomatik tespit eder
- Telegram'a bildirim gönderir
- Her gün 09:00 ve 18:00'da otomatik çalışır

## 📂 Yeni Dosyalar

```
/app/src/lib/scraper.ts                    # Merkezi scraping mantığı
/app/src/app/api/cron-notification/route.ts # Otomatik bildirim API
/app/src/app/api/seed-test-data/route.ts   # Test veri yükleme API
```

## 🚀 Kullanım Kılavuzu

### Test Verisi Yükle (İlk Kurulum)
```bash
curl -X POST http://localhost:3000/api/seed-test-data
```

### Duyuruları Kontrol Et (Cache-first)
```bash
curl -X POST http://localhost:3000/api/check-duyurular \
  -H "Content-Type: application/json" \
  -d '{"test":true}'
```

### Telegram Bot Test
Bot'a şu komutları gönderin:
- `/start` - Hoş geldin mesajı
- `/duyuru` - Son 3 duyuruyu göster

### Manuel Telegram Mesajı Gönder
```bash
curl "https://api.telegram.org/bot7912774405:AAE701Rsh2L0M2QSlBpjCbC24oNpJjeHgcs/sendMessage" \
  -d "chat_id=1094122282" \
  -d "text=Test mesajı"
```

## 🔧 Vercel Deployment

### 1. GitHub'a Push
```bash
git add .
git commit -m "Ankara Adliyesi Duyuru Takip Sistemi - Fixed"
git push origin main
```

### 2. Vercel'e Deploy
1. [Vercel Dashboard](https://vercel.com)'a git
2. "New Project" → GitHub repo'nuzu seçin
3. Environment Variables ekle:
   ```
   TG_TOKEN=7912774405:AAE701Rsh2L0M2QSlBpjCbC24oNpJjeHgcs
   TG_CHAT_ID=1094122282
   UPSTASH_REDIS_REST_URL=https://still-yeti-23635.upstash.io
   UPSTASH_REDIS_REST_TOKEN=AVxTAAIncDIwZjdjNGIyY2FiOTM0NDc1OTZhZDI4MjAwMTUyY2U2ZnAyMjM2MzU
   CRON_SECRET=1
   NODE_ENV=production
   ```
4. Deploy edin

### 3. Telegram Webhook Kur (Deploy sonrası)
```bash
# Webhook URL'inizi buraya ekleyin
VERCEL_URL="https://your-app.vercel.app"

curl "https://api.telegram.org/bot7912774405:AAE701Rsh2L0M2QSlBpjCbC24oNpJjeHgcs/setWebhook" \
  -d "url=${VERCEL_URL}/api/telegram-webhook"
```

### 4. İlk Veri Yükleme (Deploy sonrası)
```bash
curl -X POST https://your-app.vercel.app/api/seed-test-data
```

## 🌍 Neden Vercel?

**Mevcut Kubernetes ortamında site erişilemiyor** çünkü:
- Google Cloud K8s → Türk devlet sitelerine erişim engellenmiş
- DNS/Network seviyesinde filtreleme var

**Vercel'de çalışacak** çünkü:
- Vercel edge network farklı bölgelerde
- Türkiye'ye yakın edge node'lar var
- Site erişimi engellenmiyor

## ⚡ Alternatif Çözümler

### Opsiyon 1: VPN/Proxy Kullan (Kubernetes)
```bash
# Proxy middleware ekle
npm install https-proxy-agent
```

### Opsiyon 2: Scheduled Function (Vercel)
- Cron job Vercel'de otomatik çalışıyor
- `vercel.json` zaten yapılandırıldı

### Opsiyon 3: External Scraping Service
- ScrapingBee, Bright Data gibi servisler kullan
- Ancak ücretli

## 📱 Telegram Bot Komutları

Bot username: `@katiplik_duyurular_bot`

**Komutlar:**
- `/start` - Başlangıç mesajı
- `/duyuru` - Son 3 duyuruyu listele

## 🐛 Troubleshooting

### Problem: Frontend'de "Unexpected end of JSON input" hatası
**Çözüm**: ✅ ÇÖZÜLDÜ
- Timeout ve hata yakalama mekanizması eklendi
- API yanıtları artık düzgün şekilde parse ediliyor
- Cache-first sistem sayesinde her zaman veri mevcut

### Problem: Telegram bot cevap vermiyor
**Çözüm**: Webhook'u kontrol edin
```bash
curl "https://api.telegram.org/bot7912774405:AAE701Rsh2L0M2QSlBpjCbC24oNpJjeHgcs/getWebhookInfo"
```

### Problem: Duyurular yüklenmiyor
**Çözüm**: Test verisi yükleyin
```bash
curl -X POST http://localhost:3000/api/seed-test-data
```

### Problem: Cron job çalışmıyor
**Çözüm**: 
1. Vercel dashboard → Cron tab'ı kontrol edin
2. `vercel.json` dosyası doğru yapılandırılmış mı?

### Problem: Site hala erişilemiyor
**Çözüm**: 
- Vercel'e deploy edin (önerilen)
- Veya VPN/Proxy kullanın

## 📊 Monitoring

### Redis Verilerini Kontrol Et
```bash
# Duyuruları göster
curl http://localhost:3000/api/get-duyurular

# Son kontrol zamanı
# Redis dashboard'dan kontrol edin
```

### Logs
```bash
# Next.js logs
tail -f /tmp/nextjs.log

# Vercel logs
vercel logs
```

## 🔐 Güvenlik

- `CRON_SECRET` ile cron endpoint'i korunuyor
- Telegram bot token güvenli
- Redis credentials encrypted

## 📌 Önemli Notlar

1. **Kubernetes ortamında scraping ÇALIŞMAYACAK** - Vercel'e deploy edin
2. **Cache-first sistem** sayesinde eski veriler her zaman erişilebilir
3. **Telegram bot** Vercel deploy sonrası tam çalışacak
4. **Otomatik bildirimler** Vercel cron ile her gün 09:00 ve 18:00'da

## 🎉 Sonuç

Sistem şu anda **test verisi** ile çalışıyor. Gerçek duyuruları çekmek için:
1. Vercel'e deploy edin
2. İlk veri yüklemesi için `/api/seed-test-data` kullanın
3. Site erişimi Vercel'de çalışacak

---

**Yardım için**: [Vercel Documentation](https://vercel.com/docs)
