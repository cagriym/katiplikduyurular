// src/app/api/telegram-webhook/route.ts

import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Redis } from "@upstash/redis";
import { fetchDuyurular, type Duyuru } from "@/lib/scraper";

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

interface TelegramWebhookBody {
  message?: {
    text?: string;
    chat?: { id: number };
  };
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

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
