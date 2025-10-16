"use client";

import React, { useState, useEffect, useCallback } from "react";

// Varsayılan cn fonksiyonu (tailwind sınıflarını birleştirmek için)
const cn = (...classes: (string | boolean | undefined)[]): string =>
  classes.filter(Boolean).join(" ");

// -- Yardımcı Bileşenler (Card ve Button'ın minimalist tanımları) --

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}
export const Card: React.FC<CardProps> = ({
  className,
  children,
  ...props
}) => (
  <div
    className={cn(
      "rounded-xl border bg-white text-gray-900 shadow-xl",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
}
export const CardHeader: React.FC<CardHeaderProps> = ({
  className,
  children,
  title,
  ...props
}) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 p-6 border-b border-gray-100",
      className
    )}
    {...props}
  >
    {title ? (
      <h3 className="text-2xl font-bold leading-none tracking-tight">
        {title}
      </h3>
    ) : (
      children
    )}
  </div>
);

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}
export const CardContent: React.FC<CardContentProps> = ({
  className,
  children,
  ...props
}) => (
  <div className={cn("p-6", className)} {...props}>
    {children}
  </div>
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}
export const Button: React.FC<ButtonProps> = ({
  className,
  children,
  ...props
}) => {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none",
        "bg-blue-600 text-white hover:bg-blue-700 h-10 px-4 py-2 shadow-md", // Varsayılan stil
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};
// -- Yardımcı Bileşenler Sonu --

interface Duyuru {
  title: string;
  link: string;
  date: string;
  id: string;
}

interface FetchResult {
  duyurular: Duyuru[];
  statusMessage: string;
  total: number;
  lastCheck: string | null;
}

// Ana Bileşen
export default function App() {
  const [duyurular, setDuyurular] = useState<Duyuru[]>([]);
  const [status, setStatus] = useState<string>("Yükleniyor...");
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  // Veriyi API'den çekme fonksiyonu
  const fetchDuyurular = useCallback(async () => {
    setError(null);
    try {
      // Düzeltme: Mutlak URL yerine, aynı kaynak için sadece göreceli yol kullanıldı.
      // Bu, 'window.location.origin' kaynaklı potansiyel hataları önler.
      const url = "/api/get-duyurular";

      const response = await fetch(url);

      if (!response.ok) {
        // HTTP hatası (4xx, 5xx)
        throw new Error(`API Hatası: HTTP Durum Kodu ${response.status}`);
      }

      const data: FetchResult = await response.json();

      setDuyurular(data.duyurular);
      setLastCheck(data.lastCheck);

      // Durum mesajı, hata olarak algılanmayacak şekilde ayarlandı.
      if (data.statusMessage && data.total === 0) {
        setStatus(data.statusMessage);
      } else {
        setStatus(`Duyurular başarıyla yüklendi.`);
      }
    } catch (err: unknown) {
      // 'any' yerine 'unknown' kullanıldı.
      console.error("Veri çekme hatası:", err);
      // Hata mesajını daha güvenli oluşturma
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Bilinmeyen Hata";
      setError(`Hata: Duyurular yüklenemedi. Detay: ${errorMessage}`);
      setStatus("Sonuç: HATA");
    }
  }, []);

  // Sayfa yüklendiğinde veriyi çek
  useEffect(() => {
    setIsLoading(true);
    fetchDuyurular().finally(() => setIsLoading(false));
  }, [fetchDuyurular]);

  // Duyuruları Yenile ve Test Et (POST)
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    setStatus("Duyurular Yenileniyor, lütfen bekleyin...");

    try {
      // Düzeltme: Mutlak URL yerine, aynı kaynak için sadece göreceli yol kullanıldı.
      const url = "/api/check-duyurular";

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true, reset: false }),
      });

      const result = await response.json();

      if (result.success) {
        setStatus(result.message);
        // Yeni duyurular çekildikten sonra Redis'ten güncel veriyi al
        await fetchDuyurular();
      } else {
        // Backend'den gelen hata detaylarını göster
        setError(`Hata: ${result.error}. Detay: ${result.details}`);
        setStatus("Sonuç: HATA");
      }
    } catch (err: unknown) {
      // 'any' yerine 'unknown' kullanıldı.
      console.error("Yenileme API hatası:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Bilinmeyen Hata";
      setError(
        `Hata: Yenileme işlemi sırasında sunucuya ulaşılamadı. Detay: ${errorMessage}`
      );
      setStatus("Sonuç: HATA");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Verileri Sıfırla (Redis)
  const handleReset = async () => {
    // Linter Hata Düzeltmesi: Tırnak işaretleri (\") yerine HTML varlığı (&quot;) kullanıldı.
    if (
      !window.confirm(
        "Dikkat: Bu işlem Redis'teki TÜM duyuruları silecektir. Devam etmek istiyor musunuz?"
      )
    ) {
      return;
    }

    setIsResetting(true);
    setError(null);
    setStatus("Redis verileri sıfırlanıyor...");

    try {
      // Düzeltme: Mutlak URL yerine, aynı kaynak için sadece göreceli yol kullanıldı.
      const url = "/api/check-duyurular";

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });

      const result = await response.json();

      if (result.success) {
        setStatus(result.message);
        // Sıfırlamadan sonra ön yüz verisini de sıfırla
        setDuyurular([]);
        setLastCheck(null);
      } else {
        setError(`Hata: ${result.error}. Detay: ${result.details}`);
        setStatus("Sonuç: HATA");
      }
    } catch (err: unknown) {
      // 'any' yerine 'unknown' kullanıldı.
      console.error("Sıfırlama API hatası:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Bilinmeyen Hata";
      setError(
        `Hata: Sıfırlama işlemi sırasında sunucuya ulaşılamadı. Detay: ${errorMessage}`
      );
      setStatus("Sonuç: HATA");
    } finally {
      setIsResetting(false);
    }
  };

  const formatLastCheck = (timestamp: string | null) => {
    if (!timestamp || timestamp === "Bilinmiyor")
      return "Hiç kontrol yapılmadı.";
    try {
      return new Date(timestamp).toLocaleString("tr-TR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "Tarih formatı geçersiz.";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-6">
          Ankara Adliyesi Duyuru Takip Paneli
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Kontrol ve Durum Kartı */}
          <Card className="lg:col-span-1 bg-white border-blue-200">
            <CardHeader title="Kontrol Durumu" className="bg-blue-50">
              <h3 className="text-2xl font-bold leading-none tracking-tight text-blue-800">
                Kontrol Durumu
              </h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-700">
                <span className="font-semibold">Son Kontrol:</span>{" "}
                {formatLastCheck(lastCheck)}
              </p>

              <Button
                onClick={handleRefresh}
                disabled={isRefreshing || isResetting || isLoading}
                className="w-full flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700"
              >
                {isRefreshing ? (
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 12m15.356-2H15m-6 6l2-2 2 2m-2-2v2.5"
                    />
                  </svg>
                )}
                <span>Duyuruları Yenile ve Test Et (POST)</span>
              </Button>

              <Button
                onClick={handleReset}
                disabled={isResetting || isRefreshing || isLoading}
                className="w-full flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700"
              >
                {isResetting ? (
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                )}
                <span>Verileri Sıfırla (Redis)</span>
              </Button>
            </CardContent>
          </Card>

          {/* Durum ve Hata Mesajları Kartı */}
          <Card className="lg:col-span-2 bg-white border-yellow-200">
            <CardHeader title="Sonuçlar" className="bg-yellow-50">
              <h3 className="text-2xl font-bold leading-none tracking-tight text-yellow-800">
                Sonuçlar
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center border-b pb-2">
                <p className="font-semibold text-gray-700">Durum Mesajı:</p>
                <p
                  className={`font-medium ${
                    error ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {status}
                </p>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <p className="font-semibold text-gray-700">Toplam:</p>
                <p className="font-bold text-lg text-blue-600">
                  {isLoading ? "..." : duyurular.length}
                </p>
              </div>
              {error && (
                <div className="p-3 bg-red-100 border border-red-400 rounded-lg">
                  <p className="font-semibold text-red-700">Hata:</p>
                  <p className="text-sm text-red-600 break-words">{error}</p>
                </div>
              )}
              {!error && duyurular.length === 0 && !isLoading && (
                <div className="p-3 bg-yellow-100 border border-yellow-400 rounded-lg">
                  <p className="text-sm text-yellow-700">
                    **Önemli:** Duyuru listesi şu anda boş. Lütfen yukarıdaki
                    &quot;Duyuruları Yenile ve Test Et&quot; butonuna tıklayarak
                    yeni verileri çekin.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Duyuru Listesi */}
        <Card>
          <CardHeader title={`Duyuru Listesi (${duyurular.length} Kayıt)`} />
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="text-center py-10 text-gray-500 flex justify-center items-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Duyurular yükleniyor...
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {duyurular.map((duyuru) => (
                  <li
                    key={duyuru.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between"
                  >
                    <div className="mb-2 sm:mb-0">
                      <a
                        href={duyuru.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        {duyuru.title}
                      </a>
                      <p className="text-sm text-gray-500 mt-1">
                        {duyuru.date}
                      </p>
                    </div>
                    <a
                      href={duyuru.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-blue-500 hover:text-blue-700 text-sm font-medium"
                    >
                      Görüntüle →
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
