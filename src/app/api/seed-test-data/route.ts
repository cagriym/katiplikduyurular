// src/app/api/seed-test-data/route.ts
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (error) {
  console.error("Redis bağlantı hatası:", error);
}

// Test verisi
const testData = [
  {
    id: "1",
    title: "2026 Yılı Tercüman Başvurularına İlişkin İlan",
    link: "https://ankara.adalet.gov.tr/Sayfalar/Duyurular/2026-yili-tercuman-basvurulari.aspx",
    date: "15.01.2025"
  },
  {
    id: "2",
    title: "İCRA DAİRELERİ AKTARILAN DOSYA LİSTELERİ",
    link: "https://ankara.adalet.gov.tr/Sayfalar/Duyurular/icra-daireleri-dosya-listeleri.aspx",
    date: "14.01.2025"
  },
  {
    id: "3",
    title: "Adalet Bakanlığı Ceza ve Tevkifevleri Genel Müdürlüğü Personel Alımı",
    link: "https://ankara.adalet.gov.tr/Sayfalar/Duyurular/ceza-tevkifevleri-personel-alimi.aspx",
    date: "13.01.2025"
  },
  {
    id: "4",
    title: "Adli Tıp Kurumu Başkanlığı 2025 Yılı Mütercim-Tercüman Alımı",
    link: "https://ankara.adalet.gov.tr/Sayfalar/Duyurular/adli-tip-mütercim-tercüman.aspx",
    date: "12.01.2025"
  },
  {
    id: "5",
    title: "Ankara Adliyesi Hizmet Binası Yenileme Çalışmaları",
    link: "https://ankara.adalet.gov.tr/Sayfalar/Duyurular/bina-yenileme.aspx",
    date: "11.01.2025"
  }
];

export async function POST() {
  try {
    if (!redis) {
      return NextResponse.json(
        { error: "Redis bağlantısı yok" },
        { status: 500 }
      );
    }

    await redis.set("all_duyurular", JSON.stringify(testData));
    await redis.set("last_check_timestamp", new Date().toISOString());

    return NextResponse.json({
      success: true,
      message: `${testData.length} test verisi Redis'e yüklendi`,
      data: testData,
    });
  } catch (error) {
    console.error("Test veri yükleme hatası:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bilinmeyen hata" },
      { status: 500 }
    );
  }
}
