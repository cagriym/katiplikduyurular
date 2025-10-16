// src/app/api/get-duyurular/route.ts

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

interface Duyuru {
  title: string;
  link: string;
  date: string;
  id: string;
}

/**
 * Redis bağlantısını kontrol eder veya oluşturur (Lokal/Güvenli Bağlantı).
 */
function getRedisClient(): Redis | null {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    try {
      return new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
    } catch (error) {
      console.error("Redis bağlantı hatası:", error);
      return null;
    }
  } else {
    // Bu uyarı, ortam değişkenleri Vercel'de ayarlanmadığında görünür.
    console.warn("Redis bağlantı bilgileri eksik. Veri çekilemiyor.");
    return null;
  }
}

/**
 * GET endpoint - Ön yüz (Frontend) için duyuruları Redis'ten çeker.
 */
export async function GET() {
  const redis = getRedisClient(); // Bağlantıyı burada al

  try {
    if (!redis) {
      // Redis bağlantısı yoksa boş liste dön
      return NextResponse.json({ duyurular: [] }, { status: 200 });
    }

    const storedDuyurular = await redis.get<Duyuru[] | null>("all_duyurular");

    let duyurular: Duyuru[] = [];
    if (storedDuyurular && Array.isArray(storedDuyurular)) {
      duyurular = storedDuyurular;
    }

    // Frontend'e temiz bir yanıt gönder
    return NextResponse.json(
      {
        duyurular: duyurular,
        last_updated: new Date().toISOString(), // İsteğe bağlı, son güncelleme zamanı
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Redis veya GET hatası:", error);

    // Hata durumunda bile frontend'in beklediği formatta (boş dizi) yanıt dönülür.
    return NextResponse.json({ duyurular: [] }, { status: 200 });
  }
}
