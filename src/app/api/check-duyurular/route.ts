import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import { Redis } from "@upstash/redis";

// Upstash Redis bağlantısı
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Ankara Adliyesi arşiv sayfası
const DUYURULAR_URL = "https://ankara.adalet.gov.tr/Arsiv/tumu";
const BASE_URL = "https://ankara.adalet.gov.tr";

interface Duyuru {
  title: string;
  link: string;
  date: string;
  id: string;
}

// Delay fonksiyonu
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Cheerio ile duyuru çekme
async function fetchDuyurular(): Promise<Duyuru[]> {
  const MAX_RETRIES = 3;
  const selector = "div.media";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[fetchDuyurular] Deneme: ${attempt}/${MAX_RETRIES}`);
      const res = await axios.get(DUYURULAR_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        timeout: 10000,
      });

      const $ = cheerio.load(res.data);
      const duyurular: Duyuru[] = [];

      $(selector).each((i, el) => {
        const titleEl = $(el).find(".media-body h4 a, .media-body a[href]").first();
        const dateEl = $(el).find(".media-body .date, .media-body p.date, .media-body small").first();

        let title = titleEl.text().trim();
        let link = titleEl.attr("href") || "";
        const date = dateEl.text().trim() || "Tarih Yok";

        if (!isAbsoluteUrl(link)) link = BASE_URL + link;
        if (title && link) {
          duyurular.push({
            title: title.replace(/\s\s+/g, " ").trim(),
            link,
            date,
            id: link.split("/").pop() || i.toString(),
          });
        }
      });

      console.log(`[fetchDuyurular] Toplam çekilen duyuru: ${duyurular.length}`);
      if (duyurular.length === 0) throw new Error("Duyuru bulunamadı. Seçici veya site yapısı değişmiş olabilir.");

      return duyurular;
    } catch (err: unknown) {
      console.error(`[fetchDuyurular] Hata: ${err instanceof Error ? err.message : err}`);
      if (attempt < MAX_RETRIES) {
        const wait = Math.pow(2, attempt) * 1000;
        console.log(`[fetchDuyurular] ${wait / 1000}s sonra tekrar deneniyor...`);
        await delay(wait);
      } else throw err;
    }
  }
  throw new Error("Duyurular çekilemedi.");
}

// Linkin tam URL olup olmadığını kontrol
function isAbsoluteUrl(url: string) {
  return /^(?:[a-z]+:)?\/\//i.test(url);
}

// API Endpoint
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const reset = body?.reset || false;

    if (reset) {
      await redis.del("all_duyurular");
      console.log("[POST] Redis temizlendi.");
      return NextResponse.json({ success: true, message: "Redis verileri sıfırlandı." });
    }

    // Veri çek
    const duyurular = await fetchDuyurular();

    // Redis'e yaz
    await redis.set("all_duyurular", JSON.stringify(duyurular));
    console.log(`[POST] Redis’e ${duyurular.length} duyuru kaydedildi.`);

    return NextResponse.json({
      success: true,
      message: `Başarıyla ${duyurular.length} duyuru kaydedildi.`,
      total: duyurular.length,
    });
  } catch (err: unknown) {
    console.error("[POST] Hata:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Bilinmeyen hata" },
      { status: 500 }
    );
  }
}
