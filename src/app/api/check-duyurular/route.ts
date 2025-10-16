// src/app/api/check-duyurular/route.ts
import { NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import { Redis } from "@upstash/redis";

interface Duyuru {
  title: string;
  link: string;
  date: string;
  id: string;
}

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

const DUYURULAR_URL = "https://ankara.adalet.gov.tr/Arsiv/tumu";
const BASE_URL = "https://ankara.adalet.gov.tr";

async function fetchDuyurular(): Promise<Duyuru[]> {
  const selector = "div.media";
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(DUYURULAR_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "tr-TR,tr;q=0.8,en-US;q=0.5,en;q=0.3",
        },
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);
      const duyurular: Duyuru[] = [];

      $(selector).each((i, el) => {
        const titleEl = $(el).find(".media-body h4 a, .media-body a[href]").first();
        const dateEl = $(el).find(".media-body .date, .media-body p.date, .media-body small").first();

        const title = titleEl.text().trim();
        let link = titleEl.attr("href") || "";
        const date = dateEl.text().trim() || "Tarih Yok";

        if (link && !/^https?:\/\//i.test(link)) {
          link = BASE_URL + link;
        }

        if (title && link) {
          duyurular.push({
            title: title.replace(/\s\s+/g, " ").trim(),
            link,
            date,
            id: link.split("/").pop() || i.toString(),
          });
        }
      });

      if (duyurular.length === 0) {
        throw new Error("Duyuru bulunamadı. Web sitesi yapısı değişmiş olabilir.");
      }

      return duyurular;
    } catch (error: unknown) {
      if (attempt === MAX_RETRIES) throw error;
      const delayTime = Math.pow(2, attempt) * 1000;
      console.warn(
        `Duyuru çekme hatası (Deneme ${attempt}/${MAX_RETRIES}). ${delayTime / 1000}s sonra tekrar denenecek.`
      );
      await new Promise((res) => setTimeout(res, delayTime));
    }
  }

  throw new Error("Duyuru çekme döngüsü tamamlanamadı.");
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
