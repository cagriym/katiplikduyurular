import React from "react";
import { cn } from "@/lib/utils"; // cn fonksiyonunun varlığını varsayıyoruz

// Varsayılan cn fonksiyonu (uygulama çalışmazsa utils.ts dosyasının gerekliliğini gösterir)
// Bu geçici tanım kaldırılmalı ve sadece import'taki cn kullanılmalıdır.
// const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');

// Hata giderildi: Boş CardProps interface'i kaldırıldı.
// interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Ana Card bileşeni.
 * Adlandırılmış dışa aktarma (Named Export) olarak tanımlanmıştır.
 */
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => (
  <div
    className={cn(
      "rounded-xl border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

// CardHeaderProps, title prop'u içerdiği için kalmalıdır, ancak boş olmadığı için hata vermez.
interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
}

/**
 * Card Başlık bileşeni.
 * Adlandırılmış dışa aktarma (Named Export) olarak tanımlanmıştır.
 */
export const CardHeader: React.FC<CardHeaderProps> = ({
  className,
  children,
  title,
  ...props
}) => (
  <div
    className={cn("flex flex-col space-y-1.5 p-6 border-b", className)}
    {...props}
  >
    {/* Eğer title prop'u varsa, onu bir h3 olarak gösterir */}
    {title ? (
      <h3 className="text-2xl font-semibold leading-none tracking-tight">
        {title}
      </h3>
    ) : (
      children
    )}
  </div>
);

// Hata giderildi: Boş CardContentProps interface'i kaldırıldı.
// interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Card İçerik bileşeni.
 * Adlandırılmış dışa aktarma (Named Export) olarak tanımlanmıştır.
 */
export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => (
  <div className={cn("p-6 pt-0", className)} {...props}>
    {children}
  </div>
);
