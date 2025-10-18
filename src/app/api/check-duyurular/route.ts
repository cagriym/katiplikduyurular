// src/app/api/check-duyurular/route.ts
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { fetchDuyurular, type Duyuru } from "@/lib/scraper";

let redis: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
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

export async function POST(request: Request) {
  try {
    if (!redis) throw new Error("Redis bağlantısı yok.");

    const body = await request.json();
    const reset = body.reset === true;
    const forceRefresh = body.forceRefresh === true;

    if (reset) {
      await redis.del("all_duyurular");
      await redis.del("last_check_timestamp");
      return NextResponse.json({ success: true, message: "Redis verileri sıfırlandı." });
    }

    // Cache-first yaklaşım: Önce cache kontrol et
    if (!forceRefresh) {
      const cachedData = await redis.get("all_duyurular");
      const lastCheck = await redis.get("last_check_timestamp");
      
      if (cachedData) {
        let duyurular;
        if (typeof cachedData === 'string') {
          duyurular = JSON.parse(cachedData);
        } else {
          duyurular = cachedData;
        }
        
        return NextResponse.json({
          success: true,
          message: `Cache'ten ${duyurular.length} duyuru getirildi. (Son kontrol: ${lastCheck || 'Bilinmiyor'})`,
          total: duyurular.length,
          fromCache: true,
          lastCheck: lastCheck || "Bilinmiyor",
        });
      }
    }

    // Cache yoksa veya forceRefresh=true ise scraping yap
    try {
      const duyurular = await fetchDuyurular();

      await redis.set("all_duyurular", JSON.stringify(duyurular));
      await redis.set("last_check_timestamp", new Date().toISOString());

      return NextResponse.json({
        success: true,
        message: `${duyurular.length} duyuru başarıyla kaydedildi.`,
        total: duyurular.length,
        fromCache: false,
      });
    } catch (scrapingError) {
      // Scraping başarısız oldu, eski cache'i dön
      const cachedData = await redis.get("all_duyurular");
      const lastCheck = await redis.get("last_check_timestamp");
      
      if (cachedData) {
        let duyurular;
        if (typeof cachedData === 'string') {
          duyurular = JSON.parse(cachedData);
        } else {
          duyurular = cachedData;
        }
        
        return NextResponse.json({
          success: true,
          message: `Site erişilemedi. Cache'ten ${duyurular.length} duyuru getirildi. (Son başarılı kontrol: ${lastCheck || 'Bilinmiyor'})`,
          total: duyurular.length,
          fromCache: true,
          lastCheck: lastCheck || "Bilinmiyor",
          warning: "Site şu anda erişilemez durumda. VPN kullanın veya Vercel'e deploy edin.",
        });
      }
      
      throw scrapingError;
    }
  } catch (error: unknown) {
    console.error("Duyuru kontrol hatası:", error);
    const errorMessage = error instanceof Error ? error.message : "Bilinmeyen Hata";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
