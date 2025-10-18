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

    if (reset) {
      await redis.del("all_duyurular");
      await redis.del("last_check_timestamp");
      return NextResponse.json({ success: true, message: "Redis verileri sıfırlandı." });
    }

    const duyurular = await fetchDuyurular();

    await redis.set("all_duyurular", JSON.stringify(duyurular));
    await redis.set("last_check_timestamp", new Date().toISOString());

    return NextResponse.json({
      success: true,
      message: `${duyurular.length} duyuru başarıyla kaydedildi.`,
      total: duyurular.length,
    });
  } catch (error: unknown) {
    console.error("Duyuru kontrol hatası:", error);
    const errorMessage = error instanceof Error ? error.message : "Bilinmeyen Hata";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
