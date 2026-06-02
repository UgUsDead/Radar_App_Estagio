import "./globals.css";
import type { Metadata } from "next";
import { AuthProvider } from "./contexts/AuthContext";

export const metadata: Metadata = {
  title: "Painel de Monitorização Radar",
  description: "Monitorização local por radar mmWave para lares de idosos"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
