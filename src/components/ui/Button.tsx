import React from 'react';
import { cn } from '@/lib/utils'; // cn fonksiyonunun varlığını varsayıyoruz

// Hata giderildi: Geçici yerel 'cn' tanımı kaldırıldı.
// const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');

// ESLint uyarısını/hatasını gidermek için ButtonProps interface'i kaldırıldı.
// Doğrudan React.ButtonHTMLAttributes<HTMLButtonElement> tipi kullanıldı.

/**
 * Button bileşeni.
 * Adlandırılmış dışa aktarma (Named Export) olarak tanımlanmıştır.
 */
export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, children, ...props }) => {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
        "bg-blue-600 text-white hover:bg-blue-700 h-10 px-4 py-2", // Varsayılan stil
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};
