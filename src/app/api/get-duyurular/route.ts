import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

// Duyuru tipi tanımı (Arayüz)
interface Duyuru {
  title: string;
  link: string;
  date: string;
  id: string;
}

// Redis bağlantısını kur
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
  } else {
    console.warn("Redis bağlantı bilgileri eksik. Veri çekilemiyor.");
  }
} catch (error) {
  console.error("Redis bağlantı hatası:", error);
}

/**
 * GET endpoint - Ön yüz (Frontend) için duyuruları Redis'ten çeker.
 */
export async function GET() {
  try {
    if (!redis) {
      console.error("Redis objesi null. Bağlantı kurulamadı.");
      // Redis bağlantısı yoksa boş liste dön
      return NextResponse.json({ duyurular: [] }, { status: 200 });
    }

    // Redis'ten tüm duyuruları çek
    const storedDuyurular = await redis.get("all_duyurular");

    let duyurular: Duyuru[] = [];
    if (storedDuyurular) {
      duyurular = storedDuyurular as Duyuru[];
    } else {
      console.warn("Redis'te 'all_duyurular' anahtarı bulunamadı (Henüz cron çalışmamış olabilir).");
    }

    // Duyuruları ön yüze JSON formatında döndür
    return NextResponse.json({ duyurular }, { status: 200 });
    
  } catch (error) {
    console.error("Duyuru çekme sırasında API hatası:", error);
    // Hata durumunda bile boş liste döndürerek uygulamanın çökmesini engelle
    return NextResponse.json(
      { 
        duyurular: [], 
        error: "Veriler çekilirken hata oluştu" 
      },
      { status: 500 }
    );
  }
}