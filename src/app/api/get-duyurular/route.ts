// src/app/api/get-duyurular/route.ts

import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

interface Duyuru {
  title: string;
  link: string;
  date: string;
  id: string;
}

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
    let duyurular: Duyuru[] = [];
    let statusMessage = "Duyurular başarıyla yüklendi.";
    let lastCheck = null;

    if (!redis) {
      statusMessage =
        "Redis bağlantısı yok. Duyurular geçici olarak kullanılamıyor.";
      return NextResponse.json(
        { duyurular: [], statusMessage, total: 0, lastCheck: null },
        { status: 200 }
      );
    }

    const storedDuyurular = await redis.get("all_duyurular");
    lastCheck = (await redis.get("last_check_timestamp")) as string | null;

    if (storedDuyurular) {
      if (typeof storedDuyurular === 'string') {
        duyurular = JSON.parse(storedDuyurular);
      } else {
        duyurular = storedDuyurular as Duyuru[];
      }
    }

    if (duyurular.length === 0) {
      statusMessage =
        "Redis'te henüz duyuru bulunamadı. Lütfen 'Duyuruları Yenile' butonuna tıklayarak ilk kontrolü başlatın.";
    }

    return NextResponse.json(
      {
        duyurular,
        statusMessage,
        total: duyurular.length,
        lastCheck: lastCheck || "Bilinmiyor",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Duyuru çekme API hatası:", error);
    // Hata durumunda bile JSON dönmeli
    return NextResponse.json(
      {
        duyurular: [],
        statusMessage:
          "Hata: Sunucu tarafında veri çekilirken bir sorun oluştu.",
        total: 0,
        lastCheck: null,
      },
      { status: 500 }
    );
  }
}
