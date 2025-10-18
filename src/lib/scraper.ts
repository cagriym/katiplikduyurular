// src/lib/scraper.ts
import puppeteer from 'puppeteer';
import axios from 'axios';
import * as cheerio from 'cheerio';

export interface Duyuru {
  title: string;
  link: string;
  date: string;
  id: string;
}

const DUYURULAR_URL = "https://ankara.adalet.gov.tr/Arsiv/tumu";
const BASE_URL = "https://ankara.adalet.gov.tr";

/**
 * Puppeteer ile daha güvenilir scraping
 */
export async function fetchDuyurularWithPuppeteer(): Promise<Duyuru[]> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
    });

    const page = await browser.newPage();
    
    // User agent ayarla
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Sayfayı yükle (60 saniye timeout)
    await page.goto(DUYURULAR_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Sayfa içeriğini al
    const content = await page.content();
    
    // Cheerio ile parse et
    const $ = cheerio.load(content);
    const duyurular: Duyuru[] = [];

    const selector = "div.media";
    
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
  } catch (error) {
    console.error('Puppeteer scraping hatası:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Axios/Cheerio ile hızlı scraping (fallback)
 */
export async function fetchDuyurularWithAxios(): Promise<Duyuru[]> {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(DUYURULAR_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          "Cache-Control": "max-age=0",
        },
        timeout: 30000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
      });

      const $ = cheerio.load(response.data);
      const duyurular: Duyuru[] = [];

      const selector = "div.media";
      
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
        throw new Error("Duyuru bulunamadı.");
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

/**
 * Ana scraping fonksiyonu - önce Axios, başarısız olursa Puppeteer
 */
export async function fetchDuyurular(): Promise<Duyuru[]> {
  try {
    console.log('Axios ile duyuru çekme deneniyor...');
    return await fetchDuyurularWithAxios();
  } catch (axiosError) {
    console.warn('Axios başarısız, Puppeteer deneniyor...', axiosError);
    try {
      return await fetchDuyurularWithPuppeteer();
    } catch (puppeteerError) {
      console.error('Puppeteer de başarısız:', puppeteerError);
      throw new Error('Her iki scraping yöntemi de başarısız oldu.');
    }
  }
}
