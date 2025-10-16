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
 * Ankara Adliyesi arşiv sayfasından duyuruları çek
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

    // GÜNCELLENMİŞ MANTIK: Duyuru listesini çekme
    // .media-list li yerine daha genel bir seçici kullanıldı
    $("div.col-md-9 div.media").each((i, element) => {
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
        duyurular.push({
          title: title,
          link: link, // Artık tam URL
          date: date || "Tarih Yok",
          id: link.split("/").pop() || i.toString(),
        });
      }
    });

    // Debug amaçlı: Kaç duyuru bulunduğunu logla
    console.log(
      `Web sitesinden başarıyla çekilen duyuru sayısı: ${duyurular.length}`
    );

    return duyurular;
  } catch (error: unknown) {
    console.error("Duyuru çekme hatası:", error);
    return [];
  }
}

/**
 * Telegram'a mesaj gönder
 */
async function sendTelegramReply(
  chatId: string,
  message: string
): Promise<void> {
  if (!TG_TOKEN) {
    console.error(
      "HATA: TG_TOKEN ortam değişkeni eksik. Mesaj gönderilemedi. Lütfen Vercel ortam değişkenlerini kontrol edin."
    );
    return;
  }

  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML", // HTML formatını desteklemesi için
    });
  } catch (error: unknown) {
    const errorMessage = axios.isAxiosError(error)
      ? error.response?.data || error.message
      : error instanceof Error
      ? error.message
      : "Bilinmeyen Hata";

    // Detaylı hata logu: Telegram mesajı gönderme hatası
    console.error("Telegram mesajı gönderme hatası (API):", errorMessage);
  }
}

/**
 * Duyuru listesini Telegram mesajı formatına dönüştürür.
 */
function formatDuyuruList(duyurular: Duyuru[]): string {
  if (duyurular.length === 0) {
    return "📋 <b>Henüz güncel duyuru bulunamadı.</b> (Web sitesi yapısı değişmiş veya geçici bir hata olabilir.)"; // Hata durumunda daha açıklayıcı mesaj
  }

  let message = "📋 <b>Son 3 Duyuru</b>\n\n";

  duyurular.slice(0, 3).forEach((duyuru, index) => {
    const cleanTitle = duyuru.title.replace(/\s\s+/g, " ").trim();
    message += `${index + 1}. <b>${cleanTitle}</b>\n`;
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

    // Mesaj tipi kontrolü
    if (!body.message || !body.message.text || !body.message.chat) {
      return NextResponse.json({ success: true });
    }

    const message = body.message;
    const chatId = message.chat.id.toString();
    const text = message.text.toLowerCase().trim();
    // Komutların /start, /duyuru gibi kelime olarak kontrol edilmesi için
    const command = text.split(" ")[0].split("@")[0];

    console.log(
      `Telegram mesajı alındı: "${text}" - Chat ID: ${chatId} - Komut: ${command}`
    );

    let replyMessage =
      "Bilinmeyen komut. Duyuruları görmek için /duyuru yazabilirsiniz.";

    if (command === "/start") {
      replyMessage =
        "👋 Merhaba! Ankara Adliyesi duyurularını takip etmek için hazırım.\n\nSon duyuruları görmek için: <b>/duyuru</b>";
    } else if (command === "/duyuru") {
      const duyurular = await fetchDuyurular();
      replyMessage = formatDuyuruList(duyurular);
    } else if (command === "/ayarlar") {
      replyMessage =
        "⚙️ <b>Ayarlar ve Bilgi Menüsü</b>\n\nBu bot, Ankara Adliyesi'nin 'Zabıt Katipliği Sınavları' gibi belirli duyurularını düzenli olarak kontrol eder ve bildirir.\n\n<b>Mevcut Durum:</b> Bot, cron job aracılığıyla düzenli olarak kontrol yapacak şekilde ayarlanmıştır. Manuel bildirim ayarı şu an için mevcut değildir.\n\n<b>Son Duyurular:</b> /duyuru";
    } else {
      // HATA AYIKLAMA: Botun yanıt vermediği durumlar için geri bildirim
      console.warn(`Bilinmeyen veya desteklenmeyen komut: ${command}`);
    }

    await sendTelegramReply(chatId, replyMessage);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Telegram webhook işleme hatası (Üst Seviye):", error);

    const errorMessage =
      error instanceof Error ? error.message : "Bilinmeyen bir hata oluştu";

    return NextResponse.json(
      {
        success: false,
        message:
          "İç sunucu hatası, ancak Telegram isteği başarılı kabul edildi.",
        details: errorMessage,
      },
      { status: 200 }
    );
  }
}
