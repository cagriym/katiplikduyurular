// src/app/api/cron-notification/route.ts
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Redis } from "@upstash/redis";
import { fetchDuyurular, type Duyuru } from "@/lib/scraper";

// Telegram ayarları
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;
const CRON_SECRET = process.env.CRON_SECRET;

// Redis bağlantısı
let redis: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (err) {
  console.error("Redis bağlantısı hatası:", err);
}

// Telegram mesajı gönder
async function sendTelegramMessage(message: string) {
  if (!TG_TOKEN || !TG_CHAT_ID) {
    throw new Error("Telegram bilgileri eksik");
  }

  try {
    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      chat_id: TG_CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    });
  } catch (error) {
    console.error("Telegram mesaj gönderme hatası:", error);
    throw error;
  }
}

// Duyuruları formatla
function formatDuyuruList(duyurular: Duyuru[], count: number = 3): string {
  if (duyurular.length === 0) return "📋 Henüz duyuru bulunamadı.";

  let msg = `📋 <b>Son ${count} Duyuru</b>\n\n`;
  duyurular.slice(0, count).forEach((d, i) => {
    msg += `${i + 1}. <b>${d.title}</b>\n📅 ${d.date}\n🔗 <a href="${d.link}">Duyuruyu Gör</a>\n\n`;
  });
  msg += "#AnkaraAdliye #Duyuru";
  return msg;
}

// Yeni duyuruları kontrol et ve bildir
export async function GET(request: NextRequest) {
  try {
    // Güvenlik kontrolü
    const authHeader = request.headers.get("authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!redis) {
      return NextResponse.json(
        { error: "Redis bağlantısı yok" },
        { status: 500 }
      );
    }

    console.log("Cron job çalışıyor - duyurular kontrol ediliyor...");

    // Duyuruları çek
    const duyurular = await fetchDuyurular();

    if (duyurular.length === 0) {
      console.log("Duyuru bulunamadı");
      return NextResponse.json({ 
        success: true, 
        message: "Duyuru bulunamadı" 
      });
    }

    // Eski duyuruları Redis'ten al
    const storedDuyurular = await redis.get("all_duyurular");
    let oldDuyurular: Duyuru[] = [];
    
    if (storedDuyurular) {
      try {
        oldDuyurular = JSON.parse(storedDuyurular as string);
      } catch {}
    }

    // Yeni duyuruları bul (ID karşılaştırması)
    const oldIds = new Set(oldDuyurular.map(d => d.id));
    const newDuyurular = duyurular.filter(d => !oldIds.has(d.id));

    // Yeni duyuru varsa bildir
    if (newDuyurular.length > 0) {
      console.log(`${newDuyurular.length} yeni duyuru bulundu!`);
      
      const message = `🆕 <b>YENİ DUYURU!</b>\n\n${formatDuyuruList(newDuyurular, newDuyurular.length)}`;
      await sendTelegramMessage(message);
      
      // Redis'i güncelle
      await redis.set("all_duyurular", JSON.stringify(duyurular));
      await redis.set("last_check_timestamp", new Date().toISOString());
      
      return NextResponse.json({
        success: true,
        message: `${newDuyurular.length} yeni duyuru bildirildi`,
        newCount: newDuyurular.length,
        totalCount: duyurular.length,
      });
    } else {
      console.log("Yeni duyuru yok");
      
      // Yine de Redis'i güncelle (kontrol zamanı için)
      await redis.set("all_duyurular", JSON.stringify(duyurular));
      await redis.set("last_check_timestamp", new Date().toISOString());
      
      return NextResponse.json({
        success: true,
        message: "Yeni duyuru yok",
        newCount: 0,
        totalCount: duyurular.length,
      });
    }
  } catch (error) {
    console.error("Cron job hatası:", error);
    const errorMessage = error instanceof Error ? error.message : "Bilinmeyen hata";
    
    // Hata durumunda da Telegram bildirimi gönder
    try {
      await sendTelegramMessage(
        `⚠️ <b>Duyuru Kontrol Hatası</b>\n\nHata: ${errorMessage}`
      );
    } catch {}
    
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
