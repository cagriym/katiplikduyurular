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
 * Telegram'a mesaj gönder
 */
async function sendTelegramMessage(message: string): Promise<void> {
  if (!TG_TOKEN || !TG_CHAT_ID) {
    console.error("Telegram bot bilgileri eksik!");
    return;
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
      {
        chat_id: TG_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }
    );
    console.log("Telegram mesajı gönderildi.");
  } catch (error) {
    console.error("Telegram mesajı gönderilemedi:", error);
  }
}

/**
 * Ankara Adliyesi duyurular sayfasından duyuruları çek
 */
async function fetchDuyurular(): Promise<Duyuru[]> {
  const maxRetries = 3;
  let lastError: unknown; 

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Duyurular sayfası çekiliyor... (Deneme ${attempt})`);
      const response = await axios.get(DUYURULAR_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const duyurular: Duyuru[] = [];

      // Güvenilir bir şekilde duyuruları bulmak için birden fazla selector kullanıyoruz
      $(
        "a[href*='/duyuru/'], a[href*='/ilan/'], .duyuru-item, .news-item"
      ).each((index, element) => {
        const $element = $(element);

        let title = $element.text().trim();
        let link = $element.attr("href") || "";
        let date = $element.find(".date, .tarih").first().text().trim() || "";


        // Eğer element liste elemanı değilse (örneğin sadece <a>) ve boşsa, linki kendisinden al
        if ($element.is('a') && title.length < 10) {
             title = $element.text().trim();
             link = $element.attr("href") || "";
        }
        
        // Eğer link bir liste elemanının içindeki link ise
        if (!link) {
            const innerLink = $element.find('a').first();
            link = innerLink.attr('href') || '';
            title = innerLink.text().trim() || title;
        }

        // Mantıklı duyuru başlıklarını filtrele
        if (
          title &&
          title.length > 10 &&
          !title.includes("BASIN DUYURULARI") &&
          !title.includes("TÜMÜ") &&
          !title.includes("Ana Sayfa") &&
          link &&
          (link.includes("duyuru") || link.includes("ilan") || link.includes("basin"))
        ) {
          const fullLink = link.startsWith("http")
            ? link
            : `https://ankara.adalet.gov.tr${
                link.startsWith("/") ? link : "/" + link
              }`;

          // Duyuru ID'si oluşturma
          const id = Buffer.from(title + link)
            .toString("base64")
            .substring(0, 16);

          // Tekrar edenleri engellemek için basit bir kontrol
          if (!duyurular.some(d => d.id === id)) {
              duyurular.push({
                title,
                link: fullLink,
                date: date || new Date().toLocaleDateString("tr-TR"),
                id,
              });
          }
        }
      });
      
      console.log(`${duyurular.length} duyuru bulundu`);
      // En yeni duyurular en başta olacak şekilde sıralıyoruz (genellikle sitede böyledir)
      return duyurular.slice(0, 50); // Sadece ilk 50 tanesini döndürelim
    } catch (error) {
      lastError = error;
      console.error(`Deneme ${attempt} başarısız:`, error);
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  // Tüm denemeler başarısız olursa hatayı fırlat
  throw lastError; 
}

/**
 * Yeni duyuruları kontrol et ve bildirim gönder
 */
async function checkForNewDuyurular(): Promise<void> {
  let previousDuyurular: Duyuru[] = [];
  let currentDuyurular: Duyuru[] = [];
  let newDuyurular: Duyuru[] = [];

  try {
    // 1. Önceki duyuruları Redis'ten çek
    if (redis) {
      const storedData = await redis.get("all_duyurular");
      if (storedData) {
        previousDuyurular = storedData as Duyuru[];
        console.log(`${previousDuyurular.length} adet önceki duyuru Redis'ten yüklendi.`);
      }
    }

    // 2. Mevcut duyuruları çek
    try {
        currentDuyurular = await fetchDuyurular();
    } catch (e) {
        // Scraping başarısız olursa, eski veriyi koruyarak devam et
        console.warn("Scraping başarısız oldu, eski veriler korunuyor. Hata:", e);
        if (previousDuyurular.length > 0) {
            await sendTelegramMessage(`
            ⚠️ <b>DUYURU ÇEKME HATASI</b>
            
            Ankara Adliyesi sitesine ulaşılamadı. Eski veriler korunuyor.
            
            #Hata #Scraping
            `.trim());
        }
        return; 
    }

    if (currentDuyurular.length === 0) {
      console.warn("Scraping başarılı oldu ancak hiç duyuru bulunamadı.");
      // İlk defa veya Redis boşken sıfır sonuç gelirse:
      if (previousDuyurular.length === 0) {
         await sendTelegramMessage(`
          ⚠️ <b>DUYURU BULUNAMADI</b>
          
          Kontrol tamamlandı ancak sitede hiç duyuru bulunamadı.
          
          #Hata
          `.trim());
      }
      return; 
    }

    // 3. Yeni duyuruları bul
    const previousIds = new Set(previousDuyurular.map(d => d.id));
    
    // Sadece en son çekilen ilk 10 duyuru içinde yenileri arayalım
    for (const duyuru of currentDuyurular.slice(0, 10)) {
        if (!previousIds.has(duyuru.id)) {
            newDuyurular.push(duyuru);
        }
    }

    // Yeni bulunanları en yeni başa gelecek şekilde ters çevir
    newDuyurular.reverse(); 

    // 4. Yeni duyuru varsa bildirim gönder
    if (newDuyurular.length > 0) {
        let message = `🆕 <b>${newDuyurular.length} Adet Yeni Duyuru!</b>\n\n`;

        newDuyurular.forEach(duyuru => {
            message += `📋 <b>${duyuru.title}</b>\n`;
            message += `📅 ${duyuru.date}\n`;
            message += `🔗 <a href="${duyuru.link}">Görüntüle</a>\n\n`;
        });
        message += "#AnkaraAdliye #YeniDuyuru";

        await sendTelegramMessage(message);
    } else {
        console.log("Yeni duyuru bulunamadı.");
    }
    
    // 5. Redis'i güncelle
    if (redis) {
        // En son çekilen duyuruları Redis'e yaz
        await redis.set("all_duyurular", currentDuyurular, { ex: 60 * 60 * 24 * 7 }); // 7 gün sakla
        console.log("Redis'teki duyurular güncellendi.");
    }

  } catch (error) {
    console.error("Duyuru kontrolü sırasında kritik hata:", error);
    await sendTelegramMessage(`
    ❌ <b>KRİTİK HATA</b>
    
    Duyuru kontrolü sırasında beklenmedik bir hata oluştu:
    <code>${error instanceof Error ? error.message : "Bilinmeyen Hata"}</code>
    
    #KritikHata
    `.trim());
    throw error;
  }
}

/**
 * API Route Handler (CRON JOB)
 */
export async function GET(request: NextRequest) {
  // CRON_SECRET kontrolü
  try {
    const authHeader = request.headers.get("authorization");
    const expectedAuth = process.env.CRON_SECRET || "default-secret";

    if (authHeader !== `Bearer ${expectedAuth}`) {
      return NextResponse.json({ error: "Unauthorized - CRON_SECRET Yanlış" }, { status: 401 });
    }

    await checkForNewDuyurular();

    return NextResponse.json({
      success: true,
      message: "Duyuru kontrolü tamamlandı.",
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
    const { test = false, reset = false } = body;

    if (test) {
      // POST testi için Redis'i sıfırlama seçeneği (Opsiyonel)
      if (redis && reset) {
           await redis.del("all_duyurular");
           console.log("Redis verisi sıfırlandı.");
      }
      
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
