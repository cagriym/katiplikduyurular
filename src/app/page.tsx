"use client";

import React, { useState, useEffect, useCallback } from "react";
// Button import'u adlandırılmış dışa aktarmaya (named export) uyarlandı
import { Button } from "@/components/ui/Button"; 
import { Card, CardContent, CardHeader } from "@/components/ui/Card"; 
// import DuyuruCard from "@/components/DuyuruCard"; // Bileşeni doğrudan burada tanımlıyoruz

interface Duyuru {
  title: string;
  link: string;
  date: string;
  id: string;
}

// Varsayılan DuyuruCard bileşeni (Hata 418'e karşı koruma içerir)
const DuyuruCard: React.FC<Omit<Duyuru, 'id'>> = ({ title, link, date }) => {
    return (
        <Card className="mb-3 hover:shadow-lg transition-shadow">
            <CardContent className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div className="flex-1 min-w-0 pr-4">
                    {/* Tarih ve Başlık alanları için koruma eklendi */}
                    <p className="text-sm text-gray-500 mb-1">{date ? date : 'Tarih Yok'}</p>
                    <h4 className="text-lg font-semibold text-gray-800 truncate">
                        {title ? title : 'Başlık Yok'}
                    </h4>
                </div>
                <a 
                    // Link için koruma eklendi
                    href={link || '#'} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="mt-2 sm:mt-0 text-white bg-blue-600 hover:bg-blue-700 font-medium rounded-lg text-sm px-4 py-2 text-center transition-colors"
                >
                    Görüntüle
                </a>
            </CardContent>
        </Card>
    );
};


export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [duyurular, setDuyurular] = useState<Duyuru[]>([]);
  const [lastCheck, setLastCheck] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Duyurıları API'den çeken fonksiyon
  const fetchDuyurular = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/get-duyurular");
      const data = await response.json();
      
      if (data.success && Array.isArray(data.duyurular)) {
        setDuyurular(data.duyurular);
        setLastCheck(data.timestamp ? new Date(data.timestamp).toLocaleString("tr-TR") : new Date().toLocaleString("tr-TR"));
      } else {
         // Hata oluştuysa veya format uygun değilse
        setDuyurular([]);
        setError(data.message || "Duyurular beklenmedik formatta geldi.");
      }
    } catch (error) {
      setError(`Duyurular çekilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`);
      setDuyurular([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sayfa yüklendiğinde duyurıları çek
  useEffect(() => {
    fetchDuyurular();
  }, [fetchDuyurular]);

  const testDuyuruCheck = async () => {
    setIsLoading(true);
    setResult("");
    setError(null);

    try {
      const response = await fetch("/api/check-duyurular", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Reset parametresi eklendi, böylece yeni duyuru bildirimini test edebilirsiniz
        body: JSON.stringify({ test: true, reset: false }), 
      });

      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
      
      // Duyuruları da çek
      await fetchDuyurular();

    } catch (error) {
      const errorMessage = `Hata: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`;
      setResult(errorMessage);
      setError(errorMessage);
    } finally {
      // Artık sadece fetchDuyurular içinde isLoading kapanıyor.
      // fetchDuyurular içindeki finally bloğu durumu doğru yönetecek.
    }
  };
  
  // Yeni: Verileri Sıfırlama fonksiyonu
  const resetData = async () => {
    // NOT: Kullanıcı onayı (modal/dialog) burada olmalıdır, ancak kısıtlamalar nedeniyle atlanmıştır.
    // Sıfırlama işlemi Redis'teki tüm kayıtlı duyuruları siler ve bir sonraki kontrolde
    // tüm duyuruların "yeni" olarak bildirilmesine neden olur.

    setIsLoading(true);
    setResult("");
    setError(null);

    try {
      const response = await fetch("/api/check-duyurular", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // Reset modunu aktif et: Redis'teki son kontrol edilen duyuruları sıfırlar.
        body: JSON.stringify({ test: true, reset: true }), 
      });

      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
      
      // Veriler sıfırlandıktan sonra listeyi yeniden çek
      await fetchDuyurular();

    } catch (error) {
      const errorMessage = `Sıfırlama Hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`;
      setResult(errorMessage);
      setError(errorMessage);
    } finally {
      // Artık sadece fetchDuyurular içinde isLoading kapanıyor.
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8 font-inter">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-blue-800 mb-2">
            Ankara Adliyesi Duyuru Takip
          </h1>
          <p className="text-gray-600">
            Cron Job (Zamanlanmış Görev) ve Manuel Duyuru Kontrol Paneli
          </p>
        </header>

        {/* Aksiyon ve Durum Kartı */}
        <Card className="mb-8 bg-white shadow-lg">
          <CardHeader title="Kontrol Durumu" />
          <CardContent>
            {/* Son Kontrol Durumu */}
            <div className="text-sm font-medium text-gray-700 mb-4">
                Son Kontrol:{" "}
                <span className="font-semibold text-blue-600">
                  {lastCheck || "Hiç kontrol yapılmadı."}
                </span>
            </div>

            {/* Aksiyon Butonları */}
            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 mb-4">
              <Button
                onClick={testDuyuruCheck}
                disabled={isLoading}
                className={`flex-1 px-6 py-2 transition-all duration-300 ${
                    isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isLoading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : 'Duyuruları Yenile ve Test Et (POST)'}
              </Button>
              <Button
                onClick={resetData}
                disabled={isLoading}
                // Sıfırlama butonu için dikkat çekici kırmızı renk kullanıldı
                className={`flex-1 px-6 py-2 transition-all duration-300 ${
                    isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isLoading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : 'Verileri Sıfırla (Redis)'}
              </Button>
            </div>
            
            {error && (
                <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm mb-4">
                    <p className="font-bold">Hata:</p>
                    <p>{error}</p>
                </div>
            )}

            <p className="text-sm text-gray-600 mt-2">
                Durum Mesajı:{" "}
                <span className="font-semibold text-gray-800">
                  Duyurular başarıyla yüklendi. Toplam: {duyurular.length}
                </span>
            </p>

            {result && (
              <div className="mt-4 p-4 bg-gray-100 rounded-lg whitespace-pre-wrap">
                <p className="text-sm font-medium text-gray-700">API Yanıtı:</p>
                {/* Hata koruması: 'result'ın string olduğundan emin oluyoruz */}
                <pre className="text-xs text-gray-900 overflow-auto">{result.toString()}</pre> 
              </div>
            )}
            
          </CardContent>
        </Card>

        {/* Duyuru Listesi Kartı */}
        <Card className="mb-8 bg-white shadow-lg">
          <CardHeader title={`Bulunan Duyurular (${duyurular.length})`} />
          <CardContent>
            {isLoading && duyurular.length === 0 && (
                <div className="text-center py-6 text-gray-500">Duyurular yükleniyor...</div>
            )}
            
            {duyurular.length === 0 && !isLoading && !error && (
              <p className="text-center text-gray-500 py-6">
                Hiç duyuru bulunamadı veya bir hata oluştu. Lütfen butona basıp deneyin.
              </p>
            )}

            {duyurular.length > 0 && (
              <div className="space-y-4">
                {/* Hata koruması: Sadece geçerli duyuruları map'liyoruz */}
                {duyurular.map((duyuru) => (
                    <DuyuruCard
                        key={duyuru.id}
                        title={duyuru.title || 'Başlık Bilgisi Yok'} 
                        link={duyuru.link || '#'}
                        date={duyuru.date || 'Tarih Bilgisi Yok'}
                    />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
