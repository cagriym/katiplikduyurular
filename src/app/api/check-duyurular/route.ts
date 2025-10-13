import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import { Redis } from "@upstash/redis";

// Upstash Redis bağlantısı (isteğe bağlı)
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
 * Telegram'a mesaj gönder
 */
async function sendTelegramMessage(message: string): Promise<void> {
  if (!TG_TOKEN || !TG_CHAT_ID) {
    console.error("Telegram bot bilgileri eksik!");
    return;
  }

  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
      {
        chat_id: TG_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }
    );

    console.log("Telegram mesajı gönderildi:", response.data);
  } catch (error) {
    console.error("Telegram mesajı gönderilemedi:", error);
  }
}

/**
 * Ankara Adliyesi duyurular sayfasından duyuruları çek
 * Tekrar deneme (Retry) mantığı dahildir.
 */
async function fetchDuyurular(): Promise<Duyuru[]> {
  const maxRetries = 3;
  let lastError: unknown; // Düzeltildi: 'any' -> 'unknown'

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `Duyurular sayfası çekiliyor... (Deneme ${attempt}/${maxRetries})`
      );

      const response = await axios.get(DUYURULAR_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "tr-TR,tr;q=0.8,en-US;q=0.5,en;q=0.3",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 300;
        },
      });

      const $ = cheerio.load(response.data);
      const duyurular: Duyuru[] = [];

      // Duyuru listesini parse et - arşiv sayfasındaki duyurular bölümü
      $("a").each((index, element) => {
        const $element = $(element);
        const title = $element.text().trim();
        const link = $element.attr("href") || "";

        // Mantıklı duyuru başlıklarını filtrele
        if (
          title &&
          title.length > 10 &&
          !title.includes("BASIN DUYURULARI") &&
          !title.includes("TÜMÜ") &&
          !title.includes("Ana Sayfa") &&
          !title.includes("İletişim") &&
          link &&
          (link.includes("duyuru") ||
            link.includes("ilan") ||
            link.includes("basin"))
        ) {
          const fullLink = link.startsWith("http")
            ? link
            : `https://ankara.adalet.gov.tr${
                link.startsWith("/") ? link : "/" + link
              }`;

          // Benzersiz ID oluştur
          const id = Buffer.from(title + link)
            .toString("base64")
            .substring(0, 16);

          duyurular.push({
            title,
            link: fullLink,
            date: new Date().toLocaleDateString("tr-TR"), // Tarih bulunamadığı için şimdiki tarih
            id,
          });
        }
      });

      // Diğer selector denemeleri
      if (duyurular.length === 0) {
        $(
          ".duyuru-item, .news-item, .announcement-item, .list-item, .duyuru, .announcement, .haber, .archive-item, .arsiv-item, tr, .row, div"
        ).each((index, element) => {
          const $element = $(element);

          // Başlık ve link bilgilerini al
          const titleElement = $element
            .find(
              "a, .title, .baslik, h3, h4, .duyuru-baslik, .announcement-title"
            )
            .first();
          const title = titleElement.text().trim();
          const link = titleElement.attr("href") || "";

          // Tarih bilgisini al - tarih bloğundan
          const dateElement = $element
            .find(
              ".date, .tarih, .published-date, time, .duyuru-tarih, .announcement-date"
            )
            .first();
          const date = dateElement.text().trim();

          if (
            title &&
            title.length > 5 &&
            !title.includes("BASIN DUYURULARI") &&
            !title.includes("Tarih") &&
            !title.includes("Başlık")
          ) {
            // Link tam URL'ye çevir
            const fullLink = link.startsWith("http")
              ? link
              : `https://ankara.adalet.gov.tr${
                  link.startsWith("/") ? link : "/" + link
                }`;

            // Benzersiz ID oluştur
            const id = Buffer.from(title + date)
              .toString("base64")
              .substring(0, 16);

            duyurular.push({
              title,
              link: fullLink,
              date,
              id,
            });
          }
        });
      }

      console.log(`${duyurular.length} duyuru bulundu`);
      return duyurular;
    } catch (error) {
      lastError = error;
      console.error(`Deneme ${attempt} başarısız:`, error);

      if (attempt < maxRetries) {
        const delay = attempt * 2000; // 2s, 4s, 6s
        console.log(`${delay}ms bekleyip tekrar deneniyor...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Tüm denemeler başarısız oldu
  console.error("Tüm denemeler başarısız oldu");
  throw lastError;
}

/**
 * Yeni duyuruları kontrol et ve bildirim gönder
 * Redis'i kullanarak sadece en son duyuruyu kontrol eder ve SAAT KISITLAMASINI uygular.
 */
async function checkForNewDuyurular(): Promise<void> {
  try {
    // Mevcut duyuruları çek
    const currentDuyurular = await fetchDuyurular();

    if (currentDuyurular.length === 0) {
      console.log("Hiç duyuru bulunamadı");
      return;
    }

    // --- SAAT KONTROLÜ ---
    const now = new Date();
    const currentHour = now.getHours();
    // 09:00 ile 18:00 (dahil) arasında bildirim göndermeyi kontrol eder.
    const isNotificationTime = currentHour >= 9 && currentHour <= 18;
    // --- SAAT KONTROLÜ BİTİŞ ---

    // Son duyuru referansını Redis'ten al
    let lastDuyuruId: string | null = null;
    if (redis) {
      try {
        lastDuyuruId = (await redis.get("last_duyuru_id")) as string | null;
        console.log(`Son duyuru ID: ${lastDuyuruId}`);
      } catch (error) {
        console.error("Redis'ten son duyuru ID alınamadı:", error);
      }
    } else {
      console.log("Redis mevcut değil, ilk duyuru referans alınacak");
    }

    // Yeni duyuru kontrolü
    const currentLastDuyuru = currentDuyurular[0];
    let hasNewDuyuru = false;

    if (!lastDuyuruId || currentLastDuyuru.id !== lastDuyuruId) {
      hasNewDuyuru = true;
      console.log(`Yeni duyuru tespit edildi: ${currentLastDuyuru.title}`);
    } else {
      console.log("Yeni duyuru yok, son duyuru aynı");
    }

    // Yeni duyuru varsa ve saat uygunsa bildirim gönder
    if (hasNewDuyuru && currentLastDuyuru) {
      if (isNotificationTime) {
        const message = `
🆕 <b>Yeni Duyuru!</b>

📋 <b>Başlık:</b> ${currentLastDuyuru.title}
📅 <b>Tarih:</b> ${currentLastDuyuru.date}
🔗 <b>Link:</b> <a href="${currentLastDuyuru.link}">Duyuruyu Görüntüle</a>

#AnkaraAdliye #Duyuru
          `.trim();

        await sendTelegramMessage(message);
      } else {
        console.log(
          `Saat ${currentHour}:00. Bildirim saati (09:00-18:00) dışında. Yeni duyuru bulundu ancak bildirim atlandı.`
        );
      }
    }

    // Manuel test amaçlı: Yeni duyuru yoksa bile, test mesajı gönder (Test ve UI'daki panel için)
    if (!hasNewDuyuru && currentLastDuyuru) {
      if (isNotificationTime) {
        const testMessage = `
🧪 <b>Test Mesajı - En Son Duyuru</b>

📋 <b>Başlık:</b> ${currentLastDuyuru.title}
📅 <b>Tarih:</b> ${currentLastDuyuru.date}
🔗 <b>Link:</b> <a href="${currentLastDuyuru.link}">Duyuruyu Görüntüle</a>

💡 Bu bir test mesajıdır. Sistem çalışıyor!

#Test #AnkaraAdliye #Duyuru
        `.trim();
        await sendTelegramMessage(testMessage);
      } else {
        console.log(
          `Saat ${currentHour}:00. Test bildirimi saati (09:00-18:00) dışında. Test bildirimi atlandı.`
        );
      }
    }

    // Son duyuru ID'sini güncelle (Her durumda güncel tutulmalı)
    if (redis && currentLastDuyuru) {
      try {
        await redis.set("last_duyuru_id", currentLastDuyuru.id);
        console.log(`Son duyuru ID güncellendi: ${currentLastDuyuru.id}`);
      } catch (error) {
        console.error("Redis'e son duyuru ID kaydedilemedi:", error);
      }
    }
  } catch (error) {
    console.error("Duyuru kontrolü sırasında hata:", error);
    throw error;
  }
}

/**
 * API Route Handler (CRON JOB)
 */
export async function GET(request: NextRequest) {
  try {
    // Authorization kontrolü (isteğe bağlı)
    const authHeader = request.headers.get("authorization");
    const expectedAuth = process.env.CRON_SECRET || "default-secret";

    if (authHeader !== `Bearer ${expectedAuth}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Duyuru kontrolü başlatılıyor...");
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
 * Manuel test için POST endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { test = false } = body;

    if (test) {
      console.log("Test modu: Duyuru kontrolü başlatılıyor...");
      await checkForNewDuyurular();

      return NextResponse.json({
        success: true,
        message: "Test tamamlandı",
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  } catch (error) {
    console.error("Test hatası:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Test sırasında hata oluştu",
        details: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 500 }
    );
  }
}