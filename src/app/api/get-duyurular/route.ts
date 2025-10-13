import { NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

// Ankara Adliyesi arşiv sayfası (tüm duyurular burada)
const DUYURULAR_URL = "https://ankara.adalet.gov.tr/Arsiv/tumu";

interface Duyuru {
  title: string;
  link: string;
  date: string;
  id: string;
}

/**
 * Ankara Adliyesi ana sayfasından duyuruları çek
 */
async function fetchDuyurular(): Promise<Duyuru[]> {
  try {
    console.log("Duyurular çekiliyor...");
    const response = await axios.get(DUYURULAR_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.8,en-US;q=0.5,en;q=0.3",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 300;
      },
    });

    const $ = cheerio.load(response.data);
    const duyurular: Duyuru[] = [];

    // Duyuru listesini parse et - arşiv sayfasındaki duyurular bölümü
    // Önce tüm linkleri kontrol et
    $("a").each((index, element) => {
      const $element = $(element);
      const title = $element.text().trim();
      const link = $element.attr("href") || "";

      // Arşiv sayfasındaki duyuru linklerini filtrele
      if (
        title &&
        title.length > 10 &&
        !title.includes("BASIN DUYURULARI") &&
        !title.includes("TÜMÜ") &&
        !title.includes("Ana Sayfa") &&
        !title.includes("İletişim") &&
        link &&
        (link.includes("duyuru") ||
          link.includes("ilan") ||
          link.includes("basin"))
      ) {
        const fullLink = link.startsWith("http")
          ? link
          : `https://ankara.adalet.gov.tr${
              link.startsWith("/") ? link : "/" + link
            }`;

        const id = Buffer.from(title + link)
          .toString("base64")
          .substring(0, 16);

        duyurular.push({
          title,
          link: fullLink,
          date: new Date().toLocaleDateString("tr-TR"), // Tarih bulunamadığı için şimdiki tarih
          id,
        });

        console.log(`Duyuru bulundu: "${title}"`);
      }
    });

    // Eğer yukarıdaki yöntemle duyuru bulunamazsa, diğer selector'ları dene
    if (duyurular.length === 0) {
      $(
        ".duyuru-item, .news-item, .announcement-item, .list-item, .duyuru, .announcement, .haber, .archive-item, .arsiv-item, tr, .row, div"
      ).each((index, element) => {
        const $element = $(element);

        // Başlık ve link bilgilerini al
        const titleElement = $element
          .find(
            "a, .title, .baslik, h3, h4, .duyuru-baslik, .announcement-title"
          )
          .first();
        const title = titleElement.text().trim();
        const link = titleElement.attr("href") || "";

        // Tarih bilgisini al
        const dateElement = $element
          .find(
            ".date, .tarih, .published-date, time, .duyuru-tarih, .announcement-date"
          )
          .first();
        const date = dateElement.text().trim();

        if (
          title &&
          title.length > 5 &&
          !title.includes("BASIN DUYURULARI") &&
          !title.includes("Tarih") &&
          !title.includes("Başlık")
        ) {
          const fullLink = link.startsWith("http")
            ? link
            : `https://ankara.adalet.gov.tr${
                link.startsWith("/") ? link : "/" + link
              }`;

          const id = Buffer.from(title + date)
            .toString("base64")
            .substring(0, 16);

          duyurular.push({
            title,
            link: fullLink,
            date,
            id,
          });
        }
      });
    }

    // Eğer özel selector bulunamazsa, genel linkleri kontrol et
    if (duyurular.length === 0) {
      $('a[href*="duyuru"], a[href*="announcement"]').each((index, element) => {
        const $element = $(element);
        const title = $element.text().trim();
        const link = $element.attr("href") || "";

        if (title && title.length > 5) {
          const fullLink = link.startsWith("http")
            ? link
            : `https://ankara.adalet.gov.tr${
                link.startsWith("/") ? link : "/" + link
              }`;

          const id = Buffer.from(title).toString("base64").substring(0, 16);

          duyurular.push({
            title,
            link: fullLink,
            date: new Date().toLocaleDateString("tr-TR"),
            id,
          });
        }
      });
    }

    console.log(`${duyurular.length} duyuru bulundu`);
    return duyurular;
  } catch (error) {
    console.error("Duyurular çekilirken hata:", error);
    return [];
  }
}

/**
 * GET endpoint - Duyuruları döndür
 */
export async function GET() {
  try {
    const duyurular = await fetchDuyurular();

    return NextResponse.json({
      success: true,
      duyurular,
      count: duyurular.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("API hatası:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Duyurular çekilirken hata oluştu",
        details: error instanceof Error ? error.message : "Bilinmeyen hata",
        duyurular: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}
