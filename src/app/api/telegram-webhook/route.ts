import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

// Telegram bot bilgileri
const TG_TOKEN = process.env.TG_TOKEN;
// const TG_CHAT_ID = process.env.TG_CHAT_ID; // Kaldırıldı: Kullanılmayan değişken

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
  try {
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

    // Duyuru listesini parse et
    $("a").each((index, element) => {
      const $element = $(element);
      const title = $element.text().trim();
      const link = $element.attr("href") || "";

      // Arşiv sayfasındaki duyuru linklerini filtrele
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

        const id = Buffer.from(title + link)
          .toString("base64")
          .substring(0, 16);

        duyurular.push({
          title,
          link: fullLink,
          date: new Date().toLocaleDateString("tr-TR"),
          id,
        });
      }
    });

    return duyurular;
  } catch (error) {
    console.error("Duyurular çekilirken hata:", error);
    return [];
  }
}

/**
 * Telegram'a mesaj gönder
 */
async function sendTelegramMessage(
  chatId: string,
  message: string
): Promise<void> {
  if (!TG_TOKEN) {
    console.error("Telegram bot token eksik!");
    return;
  }

  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
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
 * /duyuru komutu için son 3 duyuruyu hazırla
 */
function formatDuyuruList(duyurular: Duyuru[]): string {
  if (duyurular.length === 0) {
    return "📋 Henüz duyuru bulunamadı.";
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

    // /duyuru komutunu kontrol et
    if (text === "/duyuru") {
      const duyurular = await fetchDuyurular();
      const responseMessage = formatDuyuruList(duyurular);
      await sendTelegramMessage(chatId, responseMessage);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Telegram webhook hatası:", error);
    return NextResponse.json(
      { success: false, error: "Webhook hatası" },
      { status: 500 }
    );
  }
}