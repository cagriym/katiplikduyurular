import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

// Telegram bot bilgileri
const TG_TOKEN = process.env.TG_TOKEN;
// TG_CHAT_ID webhook handler içinde gelen mesajdan alınacağı için burada kullanılmaz.

// Ankara Adliyesi arşiv sayfası
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
 * Belirtilen süre kadar bekler.
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ankara Adliyesi arşiv sayfasından duyuruları çeker ve zaman aşımı durumunda yeniden dener.
 * Kritik: Bağlantı hatalarını (ETIMEDOUT) çözer.
 */
async function fetchDuyurular(): Promise<Duyuru[]> {
  const selector = "div.media";
  const MAX_RETRIES = 3; // Maksimum 3 deneme
  const baseUrl = "https://ankara.adalet.gov.tr";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[Telegram Scraper] Duyuru çekme denemesi: ${attempt}/${MAX_RETRIES}`
      );

      const response = await axios.get(DUYURULAR_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "tr-TR,tr;q=0.8,en-US;q.5,en;q.3",
        },
        timeout: 10000, // 10 saniye zaman aşımı
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
        `[Telegram Scraper] Web sitesinden başarıyla çekilen duyuru sayısı: ${duyurular.length} (Deneme: ${attempt})`
      );

      if (duyurular.length === 0) {
        // Duyuru çekme başarılı olduysa ama sonuç 0 ise, seçiciyi kontrol etmemiz gerekir.
        throw new Error(
          `Duyuru çekme başarısız oldu (Toplam 0). Seçiciyi kontrol edin: ${selector}`
        );
      }

      return duyurular; // Başarılı, döngüyü sonlandır.
    } catch (error: unknown) {
      if (attempt === MAX_RETRIES) {
        // Tüm denemeler başarısız olduysa, hatayı yukarı fırlat.
        console.error(
          `[Telegram Scraper Hata] Tüm ${MAX_RETRIES} deneme başarısız oldu:`,
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
        `[Telegram Scraper] Bağlantı hatası (${
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
 * Telegram'a yanıt gönder
 */
async function sendTelegramReply(
  chatId: string,
  message: string
): Promise<void> {
  if (!TG_TOKEN) {
    console.error("Telegram bot token eksik. Yanıt gönderilemedi.");
    return;
  }

  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error("Telegram mesajı gönderme hatası:", error);
  }
}

/**
 * Duyuru listesini Telegram mesajı formatına dönüştürür.
 */
function formatDuyuruList(duyurular: Duyuru[]): string {
  if (duyurular.length === 0) {
    return "📋 Henüz duyuru bulunamadı. Lütfen daha sonra tekrar deneyin.";
  }

  let message = "📋 <b>Son 3 Duyuru</b>\n\n";

  duyurular.slice(0, 3).forEach((duyuru, index) => {
    message += `${index + 1}. <b>${duyuru.title}</b>\n`;
    message += `   📅 ${duyuru.date}\n`;
    message += `   🔗 <a href="${duyuru.link}">Duyuruyu Görüntüle</a>\n\n`;
  });

  message += "#AnkaraAdliye #Duyuru";
  return message;
}

/**
 * POST endpoint - Telegram webhook
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Telegram webhook mesajını kontrol et
    if (!body.message || !body.message.text || !body.message.chat) {
      return NextResponse.json({ success: true });
    }

    const message = body.message;
    const chatId = message.chat.id.toString();
    const text = message.text;

    console.log(`Telegram mesajı alındı: "${text}" - Chat ID: ${chatId}`);

    // Komutu al (örneğin: "/duyuru")
    const command = text.split(" ")[0].toLowerCase();
    let replyMessage =
      "Bilinmeyen komut. Lütfen <b>/start</b> yazarak menüye ulaşın veya <b>/duyuru</b> yazabilirsiniz.";

    if (command === "/start") {
      replyMessage =
        "👋 Merhaba! Ankara Adliyesi duyurularını takip etmek için hazırım.\n\nSon duyuruları görmek için: <b>/duyuru</b>";
    } else if (command === "/duyuru") {
      // Duyuruları çek ve formatla
      const duyurular = await fetchDuyurular();
      replyMessage = formatDuyuruList(duyurular);
    } else if (command === "/ayarlar") {
      replyMessage =
        "⚙️ <b>Ayarlar ve Bilgi Menüsü</b>\n\nBu bot, Ankara Adliyesi'nin duyurularını düzenli olarak kontrol eder ve bildirir.\n\n<b>Mevcut Durum:</b> Bot, cron job aracılığıyla düzenli olarak kontrol yapacak şekilde ayarlanmıştır. Manuel bildirim ayarı şu an için mevcut değildir.\n\n<b>Son Duyurular:</b> /duyuru";
    } else {
      // HATA AYIKLAMA: Botun yanıt vermediği durumlar için geri bildirim
      console.warn(`Bilinmeyen veya desteklenmeyen komut: ${command}`);
    }

    await sendTelegramReply(chatId, replyMessage);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Telegram webhook işleme hatası (Üst Seviye):", error);

    const errorMessage =
      error instanceof Error ? error.message : "Bilinmeyen Hata";

    // Hata durumunda bile Telegram'a bir yanıt göndererek kullanıcıyı bilgilendir
    const fallbackChatId =
      (request.body as any)?.message?.chat?.id?.toString() || "";
    if (fallbackChatId) {
      sendTelegramReply(
        fallbackChatId,
        "❌ Üzgünüm, duyuruları çekerken bir sorun oluştu. Lütfen tekrar deneyin."
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Telegram webhook işleme hatası",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
