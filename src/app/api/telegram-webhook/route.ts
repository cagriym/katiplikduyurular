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
 * Ankara Adliyesi arşiv sayfasından duyuruları çek
 */
async function fetchDuyurular(): Promise<Duyuru[]> {
  // Bu fonksiyonun içeriği önceki versiyonlardan eksik, ancak sadece çağrıldığı varsayılıyor.
  // Varsayılan olarak boş array dönsün. Gerçek mantık burada olmalıdır.
  try {
    const response = await axios.get(DUYURULAR_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.8,en-US;q=0.5,en;q.3",
      },
    });
    const $ = cheerio.load(response.data);
    const duyurular: Duyuru[] = [];

    // Duyuru listesini çekme mantığı (örnek)
    $(".media-list li").each((i, element) => {
      const titleElement = $(element).find(".media-body h4 a");
      const title = titleElement.text().trim();
      const link = titleElement.attr("href") || "";
      const date = $(element).find(".media-body .date").text().trim();

      if (title && link) {
        duyurular.push({
          title: title,
          link: `https://ankara.adalet.gov.tr${link}`,
          date: date || "Tarih Yok",
          id: link.split("/").pop() || i.toString(),
        });
      }
    });

    return duyurular;
  } catch (error) {
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
    console.error("Telegram token (TG_TOKEN) eksik. Mesaj gönderilemedi.");
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
    // 'any' yerine 'unknown' kullanıldı
    // Mesaj gönderme başarısız olsa bile (örneğin bot engellendi), Webhook'a 200 dönmek için hatayı yakalayıp logluyoruz.
    // Axios hatasını kontrol etmek için bir yardımcı fonksiyon veya tür daraltma kullanılır
    const errorMessage = axios.isAxiosError(error)
      ? error.response?.data || error.message
      : error instanceof Error
      ? error.message
      : "Bilinmeyen Hata";

    console.error("Telegram mesajı gönderme hatası:", errorMessage);
  }
}

/**
 * Duyuru listesini Telegram mesajı formatına dönüştürür.
 */
function formatDuyuruList(duyurular: Duyuru[]): string {
  if (duyurular.length === 0) {
    return "📋 <b>Henüz güncel duyuru bulunamadı.</b>";
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
      // Mesaj tipi (örneğin kanal postu) desteklenmiyorsa sessizce başarılı dön
      return NextResponse.json({ success: true });
    }

    const message = body.message;
    const chatId = message.chat.id.toString();
    const text = message.text.toLowerCase().trim();
    const command = text.split(" ")[0].split("@")[0]; // Komutu ve bot adını ayır

    console.log(`Telegram mesajı alındı: "${text}" - Chat ID: ${chatId}`);

    let replyMessage =
      "Bilinmeyen komut. Duyuruları görmek için /duyuru yazabilirsiniz.";

    if (command === "/start") {
      replyMessage =
        "👋 Merhaba! Ankara Adliyesi duyurularını takip etmek için hazırım.\n\nSon duyuruları görmek için: <b>/duyuru</b>";
    } else if (command === "/duyuru") {
      const duyurular = await fetchDuyurular();
      replyMessage = formatDuyuruList(duyurular);
    } else if (command === "/ayarlar") {
      // <-- Yeni komut eklendi
      replyMessage =
        "⚙️ <b>Ayarlar Menüsü</b>\n\nBu bot, Ankara Adliyesi'nin en son duyurularını sizin için takip eder. Şu an için başka ayar seçeneği bulunmamaktadır. Gelecekte buradan bildirim sıklığınızı ayarlayabilirsiniz!";
    }

    await sendTelegramReply(chatId, replyMessage);

    // Telegram'a her zaman başarılı (200 OK) yanıtı dön
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    // 'any' yerine 'unknown' kullanıldı
    console.error("Telegram webhook işleme hatası:", error);

    // Hata mesajını güvenli bir şekilde yakala
    const errorMessage =
      error instanceof Error ? error.message : "Bilinmeyen bir hata oluştu";

    // Hata olsa bile Telegram'ın tekrar denemesini engellemek için başarılı (200) dönmek kritik
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
