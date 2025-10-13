// src/app/page.tsx

"use client";

import React, { useState, useEffect } from "react";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/utils"; 
import Link from "next/link"; 

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
  
  // KRİTİK DÜZELTME: lastCheck'i güvenli bir tarih değeriyle başlat
  const [lastCheck, setLastCheck] = useState<string>(new Date().toLocaleString("tr-TR")); 

  // Sadece duyuruları çekme fonksiyonu
  const fetchDuyurular = () => {
    setIsLoading(true);
    setResult("Duyurular yükleniyor...");

    fetch("/api/get-duyurular")
      .then(response => {
        if (!response.ok) {
          throw new Error(`API hatası: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        setDuyurular(data.duyurular || []);
        setResult(`Duyurular başarıyla yüklendi. Toplam: ${data.duyurular?.length || 0}`);
      })
      .catch(error => {
        console.error("Duyuruları çekerken kritik hata:", error);
        setDuyurular([]);
        setResult(
          `Kritik Hata: Veri çekilemedi. (${error instanceof Error ? error.message : "Bilinmeyen hata"})`
        );
      })
      .finally(() => {
        setIsLoading(false); // Hata olsa da olmasa da yüklemeyi kapat (Kesin Çözüm)
      });
  };


  // Manuel kontrol ve test butonu fonksiyonu
  const testDuyuruCheck = async () => {
    setIsLoading(true);
    setResult("Kontrol başlatıldı, Telegram'a rapor bekleniyor...");

    try {
      const response = await fetch("/api/check-duyurular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`API Hatası: ${data.error || response.statusText}`);
      }
      
      setResult(`Başarılı: ${data.message}`);
      setLastCheck(new Date().toLocaleString("tr-TR"));

      // Kontrol bittikten sonra duyuruları güncelle
      fetchDuyurular(); 
      
    } catch (error) {
      setResult(
        `Hata: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`
      );
    } finally {
        // Test fonksiyonu fetchDuyurular'ı çağırdığı için burada tekrar kapatmaya gerek yok.
        // Hata durumunda kapatılması, `catch` bloğunun sorumluluğundadır.
        if (result.startsWith("Hata:")) {
           setIsLoading(false);
        }
    }
  };

  // Sayfa yüklendiğinde otomatik olarak duyuruları çek
  useEffect(() => {
    fetchDuyurular();
  }, []); 

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-gray-900 text-center">
          Ankara Adliyesi Duyuru Takip Sistemi
        </h1>

        {/* Kontrol ve Yenileme Butonları */}
        <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
          <Button 
            onClick={testDuyuruCheck} 
            disabled={isLoading}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isLoading ? "Kontrol Ediliyor..." : "Duyuruları Yenile ve Test Et (POST)"}
          </Button>
          <Button 
            onClick={fetchDuyurular} 
            disabled={isLoading}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white"
          >
            {isLoading ? "Yükleniyor..." : "Sadece Görüntüle (GET)"}
          </Button>
        </div>

        {/* Durum Kartı */}
        <Card className="shadow-lg">
          <CardHeader className="text-xl font-semibold border-b pb-3">
            Sistem Durumu
          </CardHeader>
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Son Kontrol:</span>{" "}
              {lastCheck}
            </p>
            <p className="text-sm text-gray-700">
              <span className="font-medium">Durum Mesajı:</span>{" "}
              <code className="bg-gray-200 p-1 rounded text-xs break-all">{result || "Beklemede"}</code>
            </p>
          </CardContent>
        </Card>

        {/* Duyuru Listesi */}
        <Card className="shadow-lg">
          <CardHeader className="text-xl font-semibold border-b pb-3">
            Bulunan Duyurular ({duyurular.length})
          </CardHeader>
          <CardContent className="pt-4">
            {isLoading && duyurular.length === 0 ? (
              <div className="text-center p-4 text-blue-600">Duyurular Yükleniyor...</div>
            ) : duyurular.length > 0 ? (
              <ul className="space-y-3">
                {duyurular.map((duyuru) => (
                  <li 
                    key={duyuru.id} 
                    className="border-b pb-3 last:border-b-0 last:pb-0"
                  >
                    <Link
                      href={duyuru.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {duyuru.title}
                    </Link>
                    <p className="text-xs text-gray-500 mt-1">
                      {duyuru.date && formatDateTime(duyuru.date)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center p-4 text-red-600">
                Hiç duyuru bulunamadı veya bir hata oluştu. Lütfen butona basıp deneyin.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}