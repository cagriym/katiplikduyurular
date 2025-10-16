import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import { Redis } from "@upstash/redis";

// Upstash Redis bağlantısı
let redis: Redis | null = null;
try {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log("Redis bağlantısı kuruldu");
  } else {
    console.log("Redis bilgileri eksik, veri saklama devre dışı");
  }
} catch (error) {
  console.error("Redis bağlantı hatası:", error);
}

// Telegram bot bilgileri
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

// Ankara Adliyesi arşiv sayfası (tüm duyurular burada)
const DUYURULAR_URL = "https://ankara.adalet.gov.tr/Arsiv/tumu";

interface Duyuru {
  title: string;
  link: string;
  date: string;
  id: string;
}

/**
 * Linkin tam bir URL olup olmadığını kontrol eder.
 * @param url Kontrol edilecek link
 */
const isAbsoluteUrl = (url: string) => /^(?:[a-z]+:)?\/\//i.test(url);

/**
 * Ankara Adliyesi arşiv sayfasından duyuruları çek
 * GÜNCELLEME: Doğru HTML yapısını hedeflemek için seçici güncellendi.
 */
async function fetchDuyurular(): Promise<Duyuru[]> {
  try {
    const response = await axios.get(DUYURULAR_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.8,en-US;q.5,en;q.3",
      },
    });
    const $ = cheerio.load(response.data);
    const duyurular: Duyuru[] = [];
    const baseUrl = "https://ankara.adalet.gov.tr";

    // En genel ve doğru seçici olan "div.media" kullanıldı.
    $("div.media").each((i, element) => {
      const titleElement = $(element).find(".media-body h4 a");
      const title = titleElement.text().trim();
      let link = titleElement.attr("href") || "";

      // Tarih çekme: .media-body içindeki .date sınıfı
      const date = $(element).find(".media-body .date").text().trim();

      // Link birleştirme kontrolü
      if (link && !isAbsoluteUrl(link)) {
        link = baseUrl + link;
      }

      if (title && link) {
        // Başlıkta olası birden fazla boşluğu tek boşluğa indir
        const cleanTitle = title.replace(/\s\s+/g, " ").trim();

        duyurular.push({
          title: cleanTitle,
          link: link,
          date: date || "Tarih Yok",
          id: link.split("/").pop() || i.toString(),
        });
      }
    });

    console.log(
      `[Scraper] Web sitesinden başarıyla çekilen duyuru sayısı: ${duyurular.length}`
    );

    if (duyurular.length === 0) {
      // Çekilen duyuru sayısı sıfırsa hata fırlat
      throw new Error(
        "Duyuru çekme başarısız oldu veya web sitesi yapısı değişti (Toplam 0)."
      );
    }

    return duyurular;
  } catch (error: unknown) {
    console.error("[Scraper Hata] Duyuru çekme hatası:", error);
    // Hata durumunda boş liste dönmek yerine hata fırlatmak daha doğru
    throw new Error(
      `Duyuru çekme sırasında hata oluştu: ${
        error instanceof Error ? error.message : "Bilinmeyen Hata"
      }`
    );
  }
}

/**
 * Telegram'a mesaj gönder
 */
async function sendTelegramMessage(message: string): Promise<void> {
  if (!TG_TOKEN || !TG_CHAT_ID) {
    console.error("Telegram bot bilgileri eksik. Bildirim gönderilemedi.");
    return;
  }

  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: TG_CHAT_ID,
      text: message,
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error("Telegram mesajı gönderme hatası:", error);
  }
}

/**
 * Yeni duyurular için Telegram mesajı oluşturur
 */
function formatNewDuyuruMessage(duyuru: Duyuru): string {
  return (
    `✨ <b>YENİ DUYURU!</b>\n\n` +
    `Başlık: <b>${duyuru.title}</b>\n` +
    `Tarih: 📅 ${duyuru.date}\n` +
    `Bağlantı: 🔗 <a href="${duyuru.link}">Görüntüle</a>\n\n` +
    `#AnkaraAdliye #YeniDuyuru`
  );
}

/**
 * Web sitesini kontrol eder, yeni duyuruları bulur ve Redis'e kaydeder.
 * Yeni duyuru varsa Telegram'a bildirim gönderir.
 */
async function checkForNewDuyurular() {
  if (!redis) {
    console.warn("Redis bağlantısı yok, kontrol atlanıyor.");
    return;
  }

  // 1. Web sitesinden güncel duyuruları çek
  const currentDuyurular = await fetchDuyurular();

  // 2. Redis'ten kaydedilmiş duyuruları çek
  const storedDuyurularRaw = await redis.get<Duyuru[] | null>("all_duyurular");
  const storedDuyurular: Duyuru[] = storedDuyurularRaw || [];

  // 3. Karşılaştırma için ID listesi oluştur
  const storedIds = new Set(storedDuyurular.map((d) => d.id));

  const newDuyurular: Duyuru[] = [];

  // 4. Yeni duyuruları bul
  for (const duyuru of currentDuyurular) {
    if (!storedIds.has(duyuru.id)) {
      newDuyurular.push(duyuru);
    }
  }

  // 5. Yeni duyurular varsa bildirim gönder ve Redis'i güncelle
  if (newDuyurular.length > 0) {
    console.log(`🚨 ${newDuyurular.length} yeni duyuru bulundu!`);

    for (const duyuru of newDuyurular) {
      await sendTelegramMessage(formatNewDuyuruMessage(duyuru));
    }

    // Yeni duyuruları en üste ekleyerek Redis'i güncelle
    const updatedDuyurular = [...newDuyurular, ...storedDuyurular].slice(0, 50); // En fazla 50 duyuru tut
    await redis.set("all_duyurular", updatedDuyurular);
    console.log("Redis duyuruları güncellendi ve bildirimler gönderildi.");
  } else {
    console.log("✅ Yeni duyuru bulunamadı.");
  }

  // Her zaman çekilen tüm duyuruları (güncellenen ya da güncellenmeyen) Redis'e kaydet
  // Bu, ön yüzün her zaman en güncel listeyi göstermesini sağlar.
  if (currentDuyurular.length > 0) {
    await redis.set("all_duyurular", currentDuyurular.slice(0, 50));
    console.log(
      `[Redis] Tüm duyurular güncel haliyle kaydedildi. Toplam: ${currentDuyurular.length}`
    );
  }
}

/**
 * Cron Job için GET endpoint
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const expectedAuth = `Bearer ${
      process.env.CRON_SECRET || "default-secret"
    }`;

    if (authHeader !== expectedAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Duyuru kontrolü başlatılıyor (Cron)...");
    await checkForNewDuyurular();

    return NextResponse.json({
      success: true,
      message: "Duyuru kontrolü tamamlandı",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("API hatası:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Duyuru kontrolü sırasında hata oluştu",
        details: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 500 }
    );
  }
}

/**
 * Manuel test ve sıfırlama için POST endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { test = false, reset = false } = body;

    if (test) {
      let statusMessage = "Test tamamlandı.";

      // POST testi için Redis'i sıfırlama seçeneği
      if (redis && reset) {
        await redis.del("all_duyurular");
        statusMessage = "Redis verisi sıfırlandı ve test başlatıldı.";
        console.log("Redis verisi sıfırlandı.");
      }

      await checkForNewDuyurular();

      const storedDuyurularRaw = await redis?.get<Duyuru[] | null>(
        "all_duyurular"
      );
      const storedDuyurular: Duyuru[] = storedDuyurularRaw || [];

      return NextResponse.json({
        success: true,
        message: statusMessage,
        timestamp: new Date().toISOString(),
        total_duyuru: storedDuyurular.length,
        // Bu kısım, ön yüzdeki 'Hata: Duyurular beklenmedik formatta geldi.' hatasını gidermek için eklendi.
        // Artık çekilen toplam duyuru sayısı gösterilecek.
        duyurular_success: storedDuyurular.length > 0,
      });
    }

    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Test hatası:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Test sırasında hata oluştu. Lütfen logları kontrol edin.",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
