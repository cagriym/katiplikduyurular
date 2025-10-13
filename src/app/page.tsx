"use client";

import React, { useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";

interface Duyuru {
  title: string;
  link: string;
  date: string;
  id: string;
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [duyurular, setDuyurular] = useState<Duyuru[]>([]);
  const [lastCheck, setLastCheck] = useState<string>("");

  const testDuyuruCheck = async () => {
    setIsLoading(true);
    setResult("");

    try {
      const response = await fetch("/api/check-duyurular", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ test: true }),
      });

      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
      setLastCheck(new Date().toLocaleString("tr-TR"));

      // Duyuruları da çek
      await fetchDuyurular();
    } catch (error) {
      setResult(
        `Hata: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDuyurular = async () => {
    try {
      const response = await fetch("/api/get-duyurular");
      if (response.ok) {
        const data = await response.json();
        setDuyurular(data.duyurular || []);
      }
    } catch (error) {
      console.error("Duyurular çekilemedi:", error);
    }
  };

  // Sayfa yüklendiğinde duyuruları çek
  React.useEffect(() => {
    fetchDuyurular();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Ankara Adliyesi Duyuru Takip Sistemi
          </h1>
          <p className="text-lg text-gray-600">
            Ankara Adliyesi sitesindeki duyuruları takip eder ve Telegram
            üzerinden bildirim gönderir.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Sistem Bilgileri */}
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Sistem Bilgileri</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900">Özellikler:</h3>
                <ul className="mt-2 space-y-1 text-sm text-gray-600">
                  <li>• Günde iki kez (09:00 ve 18:00) otomatik kontrol</li>
                  <li>• Telegram bildirimleri</li>
                  <li>• Upstash Redis ile veri saklama</li>
                  <li>• Vercel Serverless fonksiyonları</li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-gray-900">Hedef Site:</h3>
                <a
                  href="https://ankara.adalet.gov.tr/duyurular"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  ankara.adalet.gov.tr/duyurular
                </a>
              </div>
            </CardContent>
          </Card>

          {/* Test Paneli */}
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Test Paneli</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={testDuyuruCheck}
                isLoading={isLoading}
                className="w-full"
              >
                {isLoading ? "Kontrol Ediliyor..." : "Duyuru Kontrolü Test Et"}
              </Button>

              {result && (
                <div className="mt-4">
                  <h3 className="font-medium text-gray-900 mb-2">Sonuç:</h3>
                  <pre className="bg-gray-100 p-3 rounded-md text-xs overflow-auto max-h-40">
                    {result}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Duyurular Listesi */}
        <Card className="mt-8">
          <CardHeader>
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Son Duyurular</h2>
              {lastCheck && (
                <span className="text-sm text-gray-500">
                  Son kontrol: {lastCheck}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {duyurular.length > 0 ? (
              <div className="space-y-4">
                {duyurular.slice(0, 10).map((duyuru, _index) => (
                  <div // Düzeltildi: 'index' -> '_index'
                    key={duyuru.id}
                    className="border-l-4 border-blue-500 pl-4 py-2 hover:bg-gray-50 rounded-r-md transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 mb-1 line-clamp-2">
                          {duyuru.title}
                        </h3>
                        {duyuru.date && (
                          <p className="text-sm text-gray-500 mb-2">
                            📅 {duyuru.date}
                          </p>
                        )}
                      </div>
                      {duyuru.link && (
                        <a
                          href={duyuru.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Görüntüle →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                {duyurular.length > 10 && (
                  <p className="text-sm text-gray-500 text-center mt-4">
                    Ve {duyurular.length - 10} duyuru daha...
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">
                  Henüz duyuru çekilmedi. Test butonuna tıklayarak duyuruları
                  çekebilirsiniz.
                </p>
                <Button onClick={fetchDuyurular} variant="outline">
                  Duyuruları Yenile
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Kurulum Talimatları */}
        <Card className="mt-8">
          <CardHeader>
            <h2 className="text-xl font-semibold">Kurulum Talimatları</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">
                1. Telegram Bot Oluşturma:
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>@BotFather&apos;a mesaj gönderin</li>
                <li>/newbot komutunu kullanın</li>
                <li>Bot token&apos;ınızı kaydedin</li>
                <li>Bot&apos;unuza mesaj gönderin</li>
                <li>
                  <code>
                    https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates
                  </code>{" "}
                  adresinden chat_id&apos;nizi alın
                </li>
              </ol>
            </div>

            <div>
              <h3 className="font-medium text-gray-900 mb-2">
                2. Upstash Redis:
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>
                  <a
                    href="https://upstash.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    upstash.com
                  </a>{" "}
                  adresinde ücretsiz hesap oluşturun
                </li>
                <li>Yeni Redis database oluşturun</li>
                <li>REST URL ve token&apos;larınızı kaydedin</li>
              </ol>
            </div>

            <div>
              <h3 className="font-medium text-gray-900 mb-2">
                3. Environment Variables:
              </h3>
              <p className="text-sm text-gray-600 mb-2">
                <code>env.example</code> dosyasını <code>.env.local</code>{" "}
                olarak kopyalayın ve gerekli değerleri doldurun.
              </p>
            </div>

            <div>
              <h3 className="font-medium text-gray-900 mb-2">
                4. Vercel Deploy:
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>Projeyi GitHub&apos;a push edin</li>
                <li>Vercel&apos;e bağlayın</li>
                <li>Environment variables&apos;ları ekleyin</li>
                <li>Deploy edin</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}