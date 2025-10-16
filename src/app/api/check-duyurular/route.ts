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
    console.error("Telegram bot bilgileri eksik. Bildirim gönderilemiyor.");
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
 * KRİTİK GÜNCELLEME: Seçiciler daha esnek hale getirildi.
 */
async function fetchDuyurular(): Promise<Duyuru[]> {
  const selector = "div.media";
  const MAX_RETRIES = 3;
  const baseUrl = "https://ankara.adalet.gov.tr";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[Duyuru Kontrolü] Duyuru çekme denemesi: ${attempt}/${MAX_RETRIES}`
      );

      const response = await axios.get(DUYURULAR_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q.8",
          "Accept-Language": "tr-TR,tr;q.8,en-US;q.5,en;q.3",
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      const duyurular: Duyuru[] = [];

      $(selector).each((i, element) => {
        // Başlık ve linki bulmak için daha esnek seçiciler kullanıldı (h4 a, a[href])
        const titleElement = $(element)
          .find(".media-body h4 a, .media-body a[href]")
          .first();
        const title = titleElement.text().trim();
        let link = titleElement.attr("href") || "";

        // Tarih bilgisini bulmak için daha fazla varyasyon denendi (.date, p.date, small)
        const dateElement = $(element)
          .find(".media-body .date, .media-body p.date, .media-body small")
          .first();
        const date = dateElement.text().trim();

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
        `[Duyuru Kontrolü] Web sitesinden başarıyla çekilen duyuru sayısı: ${duyurular.length} (Deneme: ${attempt})`
      );

      if (duyurular.length === 0) {
        // Duyuru bulunamadıysa, web sitesi yapısı değişmiş demektir.
        throw new Error(
          `Duyuru bulunamadı (Toplam 0). Web sitesi yapısı veya seçici "${selector}" değişmiş olabilir.`
        );
      }

      return duyurular;
    } catch (error: unknown) {
      if (attempt === MAX_RETRIES) {
        console.error(
          `[Duyuru Kontrolü Hata] Tüm ${MAX_RETRIES} deneme başarısız oldu:`,
          error
        );
        throw new Error(
          `Duyuru çekme sırasında hata oluştu: ${
            error instanceof Error ? error.message : "Bilinmeyen Hata"
          }`
        );
      }

      const delayTime = Math.pow(2, attempt) * 1000;
      console.log(
        `[Duyuru Kontrolü] Bağlantı hatası (${
          error instanceof Error
            ? error.message.split("\n")[0]
            : "Bilinmeyen Hata"
        }), ${delayTime / 1000} saniye sonra tekrar deneniyor...`
      );
      await delay(delayTime);
    }
  }
  throw new Error("Duyuru çekme döngüsü tamamlanamadı.");
}

/**
 * Yeni duyuruları kontrol eder ve Redis'i günceller.
 */
async function checkForNewDuyurular(): Promise<void> {
  if (!redis) {
    console.error("Redis bağlantısı yok. Kontrol yapılamıyor.");
    return;
  }

  const newDuyurular = await fetchDuyurular();

  const storedDuyurularJson = await redis.get("all_duyurular");
  const storedDuyurular: Duyuru[] = storedDuyurularJson
    ? JSON.parse(storedDuyurularJson as string)
    : [];

  const oldDuyuruIds = new Set(storedDuyurular.map((d) => d.id));
  const newUnseenDuyurular = newDuyurular.filter(
    (d) => !oldDuyuruIds.has(d.id)
  );

  if (newUnseenDuyurular.length > 0) {
    console.log(
      `${newUnseenDuyurular.length} yeni duyuru bulundu! Bildirim gönderiliyor.`
    );

    const latestDuyuru = newUnseenDuyurular[0];
    const message = `🔔 <b>YENİ DUYURU!</b>\n\n<b>${latestDuyuru.title}</b>\n📅 ${latestDuyuru.date}\n🔗 <a href="${latestDuyuru.link}">Duyuruyu Görüntüle</a>\n\n#AnkaraAdliye #YeniDuyuru`;

    await sendTelegramMessage(message);

    // Yeni duyuruları en üste ekle
    const updatedDuyurular = [
      ...newDuyurular,
      ...storedDuyurular.filter(
        (d) => !newDuyurular.some((n) => n.id === d.id)
      ),
    ];
    try {
      await redis.set("all_duyurular", JSON.stringify(updatedDuyurular));
    } catch (error) {
      console.error("Redis'e duyuru yazma hatası:", error);
      throw new Error("Redis'e duyuru yazılamadı.");
    }
  } else {
    console.log("Yeni duyuru bulunamadı. Veri seti güncelleniyor.");
    // Sadece mevcut duyuruları Redis'e kaydet (Eski duyuruların silinmesini önler)
    try {
      await redis.set("all_duyurular", JSON.stringify(newDuyurular));
    } catch (error) {
      console.error("Redis'e duyuru yazma hatası:", error);
      throw new Error("Redis'e duyuru yazılamadı.");
    }
  }
}

/**
 * Cron job tarafından çağrılan endpoint (GET)
 */
export async function GET(request: NextRequest) {
  try {
    const secret =
      request.headers.get("Authorization")?.split(" ")[1] ||
      request.nextUrl.searchParams.get("secret");

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: "CRON_SECRET Yanlış" },
        { status: 401 }
      );
    }

    await checkForNewDuyurular();

    return NextResponse.json({
      success: true,
      message: "Duyuru kontrolü tamamlandı.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("API hatası (GET):", error);
    // Hata durumunda bile her zaman JSON döndürerek JSON parse hatasını engelle
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
      // POST testi için Redis'i sıfırlama seçeneği
      if (redis && reset) {
        await redis.del("all_duyurular");
        console.log("Redis verisi sıfırlandı.");
      }

      await checkForNewDuyurular();

      return NextResponse.json({
        success: true,
        message: reset
          ? "Redis sıfırlandı ve test tamamlandı."
          : "Test tamamlandı",
        timestamp: new Date().toISOString(),
      });
    }

    // Redis bağlantısını kontrol et
    if (!redis) {
      console.error("Redis bağlantısı kurulamadı.");
      return NextResponse.json(
        {
          success: false,
          error: "Redis bağlantısı kurulamadı. Lütfen Redis yapılandırmasını kontrol edin.",
        },
        { status: 500 }
      );
    }

    // Verileri Sıfırla (Redis) butonu için sadece sıfırlama işlemi
    if (reset) {
      try {
        await redis.del("all_duyurular");
        return NextResponse.json({
          success: true,
          message: "Redis verileri başarıyla sıfırlandı.",
          timestamp: new Date().toISOString(),
        });
      } catch (redisError) {
        console.error("Redis sıfırlama hatası:", redisError);
        return NextResponse.json(
          {
            success: false,
            error: "Redis sıfırlama işlemi sırasında bir hata oluştu.",
            details: redisError instanceof Error ? redisError.message : "Bilinmeyen hata",
          },
          { status: 500 }
        );
      }
    }

    try {
      if (!redis) {
        console.error("Redis bağlantısı kurulamadı.");
        return NextResponse.json(
          {
            success: false,
            error: "Redis bağlantısı kurulamadı. Lütfen Redis yapılandırmasını kontrol edin.",
          },
          { status: 500 }
        );
      }

      // Redis'ten duyuru verilerini al
      const duyurular = await redis.get("all_duyurular");

      if (!duyurular) {
        // Redis'te veri yoksa kullanıcıya bilgi mesajı döndür
        return NextResponse.json(
          {
            success: true,
            message: "Redis'te henüz duyuru bulunamadı. Lütfen 'Duyuruları Yenile' butonuna tıklayarak ilk kontrolü başlatın.",
            toplam: 0,
            important: "Duyuru listesi şu anda boş. Lütfen yukarıdaki 'Duyuruları Yenile ve Test Et' butonuna tıklayarak yeni verileri çekin.",
          },
          { status: 200 }
        );
      }

      // Redis'ten dönen veriyi JSON.parse ile işleyin
      let parsedDuyurular: Duyuru[];
      try {
        parsedDuyurular = typeof duyurular === "string" ? JSON.parse(duyurular) : [];
      } catch (error) {
        console.error("Redis'ten dönen duyurular JSON parse edilemedi:", error);
        return NextResponse.json(
          {
            success: false,
            error: "Redis'ten dönen duyurular işlenemedi. Veri formatını kontrol edin.",
          },
          { status: 500 }
        );
      }

      // Duyuruları döndür
      return NextResponse.json(
        {
          success: true,
          message: "Duyurular başarıyla alındı.",
          toplam: parsedDuyurular.length,
          data: parsedDuyurular,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("Redis işlem hatası:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Redis işlemleri sırasında bir hata oluştu.",
          details: error instanceof Error ? error.message : "Bilinmeyen hata",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Geçersiz istek. Lütfen doğru parametreleri gönderdiğinizden emin olun.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("Test/Sıfırlama hatası (POST):", error);
    // Hata durumunda bile her zaman JSON döndürerek JSON parse hatasını engelle
    return NextResponse.json(
      {
        success: false,
        error: "Test veya Sıfırlama sırasında beklenmeyen bir hata oluştu.",
        details: error instanceof Error ? error.message : "Bilinmeyen hata",
      },
      { status: 500 }
    );
  }
}
