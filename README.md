# Ankara Adliyesi Duyuru Takip Sistemi

Bu proje, [Ankara Adliyesi](https://ankara.adalet.gov.tr/duyurular) sitesindeki duyuruları takip eden ve yeni duyurular için Telegram bildirimi gönderen bir Next.js uygulamasıdır.

## Özellikler

- 🔄 **Otomatik Kontrol**: Her gün 09:00 ve 18:00 saatlerinde otomatik kontrol
- 📱 **Telegram Bildirimleri**: Yeni duyurular için anında Telegram bildirimi
- 🤖 **Telegram Bot Komutları**: `/duyuru` komutu ile son 3 duyuru görüntüleme
- 💾 **Veri Saklama**: Upstash Redis ile duyuru geçmişi saklanır
- ☁️ **Serverless**: Vercel serverless fonksiyonları ile çalışır
- 🎯 **Web Scraping**: Cheerio ile HTML parsing
- 📊 **Test Paneli**: Web arayüzü üzerinden manuel test

## Kurulum

### 1. Projeyi Klonlayın

```bash
git clone <repository-url>
cd katiplik-kontrol
npm install
```

### 2. Telegram Bot Oluşturun

1. [@BotFather](https://t.me/botfather)'a mesaj gönderin
2. `/newbot` komutunu kullanın
3. Bot adınızı ve kullanıcı adınızı girin
4. Bot token'ınızı kaydedin
5. Bot'unuza mesaj gönderin
6. `https://api.telegram.org/bot<TOKEN>/getUpdates` adresinden chat_id'nizi alın

### 3. Upstash Redis Hesabı

1. [Upstash](https://upstash.com) adresinde ücretsiz hesap oluşturun
2. Yeni Redis database oluşturun
3. REST URL ve token'larınızı kaydedin

### 4. Environment Variables

`env.example` dosyasını `.env.local` olarak kopyalayın:

```bash
cp env.example .env.local
```

`.env.local` dosyasını düzenleyin:

```env
TG_TOKEN=your_telegram_bot_token_here
TG_CHAT_ID=your_chat_id_here
UPSTASH_REDIS_REST_URL=https://your-redis-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token_here
CRON_SECRET=your_secret_key_here
```

### 5. Geliştirme Sunucusu

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) adresinde uygulamayı görüntüleyin.

## Vercel Deploy

### 1. GitHub'a Push

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Vercel'e Bağlayın

1. [Vercel](https://vercel.com) hesabınıza giriş yapın
2. "New Project" butonuna tıklayın
3. GitHub repository'nizi seçin
4. Environment variables'ları ekleyin
5. Deploy edin

### 3. Environment Variables (Vercel)

Vercel dashboard'da aşağıdaki environment variables'ları ekleyin:

- `TG_TOKEN`
- `TG_CHAT_ID`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CRON_SECRET`

## API Endpoints

### GET `/api/check-duyurular`

Cron job tarafından çağrılır. Duyuruları kontrol eder ve yeni duyurular için Telegram bildirimi gönderir.

**Headers:**

```
Authorization: Bearer <CRON_SECRET>
```

### POST `/api/check-duyurular`

Manuel test için kullanılır.

**Body:**

```json
{
  "test": true
}
```

### POST `/api/telegram-webhook`

Telegram bot webhook endpoint'i. Bot komutlarını işler.

## Telegram Bot Komutları

### `/duyuru`

Son 3 duyuruyu listeler.

**Kullanım:**

```
/duyuru
```

**Örnek Çıktı:**

```
📋 Son 3 Duyuru

1. 2026 Yılı Tercüman Başvurularına İlişkin İlan
   📅 13.10.2025
   🔗 Duyuruyu Görüntüle

2. İCRA DAİRELERİ AKTARILAN DOSYA LİSTELERİ
   📅 13.10.2025
   🔗 Duyuruyu Görüntüle

3. Adalet Bakanlığı Ceza ve Tevkifevleri...
   📅 13.10.2025
   🔗 Duyuruyu Görüntüle

#AnkaraAdliye #Duyuru
```

## Cron Job

Vercel cron job her gün 09:00 ve 18:00 saatlerinde çalışır:

```json
{
  "crons": [
    {
      "path": "/api/check-duyurular",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/check-duyurular",
      "schedule": "0 18 * * *"
    }
  ]
}
```

## Teknolojiler

- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Cheerio** - HTML parsing
- **Axios** - HTTP client
- **Upstash Redis** - Data storage
- **Vercel** - Deployment platform

## Yapı

```
src/
├── app/
│   ├── api/
│   │   └── check-duyurular/
│   │       └── route.ts      # Ana API endpoint
│   ├── globals.css           # Global styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Dashboard
├── components/
│   └── ui/                   # UI components
└── lib/
    └── utils.ts              # Utility functions
```

## Test

Web arayüzündeki "Duyuru Kontrolü Test Et" butonunu kullanarak sistemi test edebilirsiniz.

## Lisans

MIT License
