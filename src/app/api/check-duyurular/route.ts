import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import { Redis } from "@upstash/redis";

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
 * Redis bağlantısını kontrol eder veya oluşturur.
 * Bağlantıyı sadece çağrıldığında kurar, bu sayede derleme anındaki hataları önler.
 */
function getRedisClient(): Redis | null {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    try {
      return new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
    } catch (error) {
      console.error("Redis bağlantı hatası:", error);
      return null;
    }
  } else {
    // Bu uyarı, ortam değişkenleri Vercel'de ayarlanmadığında görünür.
    console.warn(
      "Redis bilgileri eksik, veri saklama devre dışı. Lütfen UPSTASH_REDIS_REST_URL ve TOKEN değişkenlerini kontrol edin."
    );
    return null;
  }
}

/**
 * Linkin tam bir URL olup olmadığını kontrol eder.
 * @param url Kontrol edilecek link
 */
const isAbsoluteUrl = (url: string) => /^(?:[a-z]+:)?\/\//i.test(url);

/**
 * Belirtilen süre kadar bekler.
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ankara Adliyesi arşiv sayfasından duyuruları çeker ve zaman aşımı durumunda yeniden dener.
 */
async function fetchDuyurular(): Promise<Duyuru[]> {
  const selector = "div.media";
  const MAX_RETRIES = 3; // Maksimum 3 deneme
  const baseUrl = "https://ankara.adalet.gov.tr";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Scraper] Duyuru çekme denemesi: ${attempt}/${MAX_RETRIES}`);

      const response = await axios.get(DUYURULAR_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "tr-TR,tr;q=0.8,en-US;q.5,en;q.3",
        },
        timeout: 10000, // 10 saniye zaman aşımı ekleyelim
      });

      const $ = cheerio.load(response.data);
      const duyurular: Duyuru[] = [];

      $(selector).each((i, element) => {
        const titleElement = $(element).find(".media-body h4 a");
        const title = titleElement.text().trim();
        let link = titleElement.attr("href") || "";

        const date = $(element).find(".media-body .date").text().trim();

        if (link && !isAbsoluteUrl(link)) {
          link = baseUrl + link;
        }

        if (title && link) {
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
        `[Scraper] Web sitesinden başarıyla çekilen duyuru sayısı: ${duyurular.length} (Deneme: ${attempt})`
      );

      if (duyurular.length === 0) {
        // Duyuru çekme başarılı olduysa ama sonuç 0 ise, bu bir sorun
        throw new Error(
          `Duyuru çekme başarısız oldu (Toplam 0). Seçiciyi kontrol edin: ${selector}`
        );
      }

      return duyurular; // Başarılı, döngüyü sonlandır.
    } catch (error: unknown) {
      if (attempt === MAX_RETRIES) {
        // Tüm denemeler başarısız olduysa, hatayı yukarı fırlat.
        console.error(
          `[Scraper Hata] Tüm ${MAX_RETRIES} deneme başarısız oldu:`,
          error
        );
        throw new Error(
          `Duyuru çekme sırasında hata oluştu: ${
            error instanceof Error ? error.message : "Bilinmeyen Hata"
          }`
        );
      }

      // Üstel geri çekilme ile bekleme (2s, 4s, 8s...)
      const delayTime = Math.pow(2, attempt) * 1000;
      console.log(
        `[Scraper] Bağlantı hatası (${
          error instanceof Error
            ? error.message.split("\n")[0]
            : "Bilinmeyen Hata"
        }), ${delayTime / 1000} saniye sonra tekrar deneniyor...`
      );
      await delay(delayTime);
    }
  }
  // Bu satıra ulaşılmamalıdır, ancak TypeScript için eklendi.
  throw new Error("Duyuru çekme döngüsü tamamlanamadı.");
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
  const redis = getRedisClient(); // API çağrısı sırasında Redis'i kontrol et

  if (!redis) {
    console.warn("Redis bağlantısı yok, kontrol atlanıyor.");
    return;
  }

  // 1. Web sitesinden güncel duyuruları çek
  const currentDuyurular = await fetchDuyurular();

  // 2. Redis'ten kaydedilmiş duyuruları çek
  const storedDuyurularRaw = await redis.get<Duyuru[] | null>("all_duyurular");
  // Eğer storedDuyurularRaw bir JSON dizisi değilse (örneğin null ise), boş bir diziye çevir.
  const storedDuyurular: Duyuru[] = (
    Array.isArray(storedDuyurularRaw) ? storedDuyurularRaw : []
  ) as Duyuru[];

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

    // Yeni duyuruları Telegram'a gönder (İlk 3'ü gönderiyoruz)
    for (const duyuru of newDuyurular.slice(0, 3)) {
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
  if (currentDuyurular.length > 0) {
    // Mevcut duyuruları kaydederken, eğer storedDuyurular null gelirse üzerine yazarız.
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
    const expectedAuth = process.env.CRON_SECRET || "default-secret";

    if (authHeader !== `Bearer ${expectedAuth}`) {
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
      const redis = getRedisClient(); // API çağrısı sırasında Redis'i kontrol et

      // POST testi için Redis'i sıfırlama seçeneği
      if (redis && reset) {
        await redis.del("all_duyurular");
        statusMessage = "Redis verisi sıfırlandı ve test başlatıldı.";
        console.log("Redis verisi sıfırlandı.");
      }

      // Duyuruları kontrol et ve kaydet
      await checkForNewDuyurular();

      const storedDuyurularRaw = await redis?.get<Duyuru[] | null>(
        "all_duyurular"
      );
      const storedDuyurular: Duyuru[] = Array.isArray(storedDuyurularRaw)
        ? storedDuyurularRaw
        : [];

      return NextResponse.json({
        success: true,
        message: statusMessage,
        timestamp: new Date().toISOString(),
        total_duyuru: storedDuyurular.length,
        // Ön yüzdeki hatayı gidermek için: Eğer 0'dan büyükse başarılı kabul et.
        duyurular_success: storedDuyurular.length > 0,
      });
    }

    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Test hatası (Üst Seviye):", error);
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
