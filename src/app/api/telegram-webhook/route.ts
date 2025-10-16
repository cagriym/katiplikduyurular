// src/app/api/telegram-webhook/route.ts

import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import { Redis } from "@upstash/redis";

// Telegram bot token
const TG_TOKEN = process.env.TG_TOKEN;

// Redis bağlantısı
let redis: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } else {
    console.warn("Redis bilgileri eksik.");
  }
} catch (err) {
  console.error("Redis bağlantısı hatası:", err);
}

// Ankara Adliyesi duyuruları URL
const DUYURULAR_URL = "https://ankara.adalet.gov.tr/Arsiv/tumu";

interface Duyuru {
  title: string;
  link: string;
  date: string;
  id: string;
}

interface TelegramWebhookBody {
  message?: {
    text?: string;
    chat?: { id: number };
  };
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
const isAbsoluteUrl = (url: string) => /^(?:[a-z]+:)?\/\//i.test(url);

// Web scraping ile duyuru çek
async function fetchDuyurular(): Promise<Duyuru[]> {
  const selector = "div.media";
  const baseUrl = "https://ankara.adalet.gov.tr";
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(DUYURULAR_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "tr-TR,tr;q=0.8,en-US;q=0.5,en;q=0.3",
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const duyurular: Duyuru[] = [];

      $(selector).each((i, el) => {
        const titleElement = $(el).find("h4 a, a[href]").first();
        const dateElement = $(el).find(".date, p.date, small").first();

        const title = titleElement.text().trim();
        let link = titleElement.attr("href") || "";
        const date = dateElement.text().trim() || "Tarih Yok";

        if (link && !isAbsoluteUrl(link)) link = baseUrl + link;

        if (title && link) {
          duyurular.push({
            title,
            link,
            date,
            id: link.split("/").pop() || i.toString(),
          });
        }
      });

      if (duyurular.length === 0) {
        throw new Error("Duyuru bulunamadı.");
      }

      return duyurular;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      await delay(2000 * attempt); // 2s, 4s, 6s...
    }
  }
  return [];
}

// Telegram mesaj gönder
async function sendTelegramReply(chatId: string, message: string) {
  if (!TG_TOKEN) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    });
    await delay(500); // Rate limit önleme
  } catch (err) {
    console.error("Telegram mesajı gönderilemedi:", err);
  }
}

// Duyuruları mesaj formatına çevir
function formatDuyuruList(duyurular: Duyuru[]): string {
  if (duyurular.length === 0) return "📋 Henüz duyuru bulunamadı.";

  let msg = "📋 <b>Son 3 Duyuru</b>\n\n";
  duyurular.slice(0, 3).forEach((d, i) => {
    msg += `${i + 1}. <b>${d.title}</b>\n📅 ${d.date}\n🔗 <a href="${d.link}">Duyuruyu Gör</a>\n\n`;
  });
  msg += "#AnkaraAdliye #Duyuru";
  return msg;
}

// POST endpoint
export async function POST(req: NextRequest) {
  try {
    const body: TelegramWebhookBody = await req.json();
    if (!body.message?.text || !body.message.chat?.id) return NextResponse.json({ success: true });

    const chatId = body.message.chat.id.toString();
    const text = body.message.text.trim().toLowerCase();

    let reply = "Bilinmeyen komut. /start veya /duyuru kullanabilirsiniz.";

    if (text === "/start") {
      reply = "👋 Merhaba! Son Ankara Adliyesi duyurularını görmek için /duyuru yazın.";
    } else if (text === "/duyuru") {
      let duyurular: Duyuru[] = [];

      // Önce Redis kontrol et
      if (redis) {
        const cached = await redis.get("all_duyurular");
        if (cached) {
          try {
            duyurular = JSON.parse(cached as string);
          } catch {}
        }
      }

      // Eğer Redis boşsa veya veri yoksa scraping
      if (duyurular.length === 0) {
        duyurular = await fetchDuyurular();
        if (redis) {
          await redis.set("all_duyurular", JSON.stringify(duyurular));
          await redis.set("last_check_timestamp", new Date().toISOString());
        }
      }

      reply = formatDuyuruList(duyurular);
    }

    await sendTelegramReply(chatId, reply);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Telegram webhook hatası:", err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Bilinmeyen hata" }, { status: 500 });
  }
}
