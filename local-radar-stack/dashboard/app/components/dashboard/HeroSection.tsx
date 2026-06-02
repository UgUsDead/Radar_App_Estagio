"use client";

import Link from "next/link";
import { useAuth } from "../../contexts/AuthContext";

export function HeroSection({ lastUpdated, load }: { lastUpdated: Date | null, load: () => void }) {
  const { hasPermission } = useAuth();

  const navigationCards = [
    {
      href: "/feed",
      feature: "live_telemetry",
      title: "Telemetria em Direto",
      subtitle: "Janelas 3D por radar",
    },
    {
      href: "/falls",
      feature: "fall_history",
      title: "Histórico de Quedas",
      subtitle: "Reveja todos os incidentes",
    },
    {
      href: "/sla",
      feature: "sla_metrics",
      title: "Métricas de SLA",
      subtitle: "Tempos de resposta e resolução",
    },
    {
      href: "/fleet",
      feature: "fleet_metrics",
      title: "Fiabilidade da Frota",
      subtitle: "Uptime e desvios dos radares",
    },
    {
      href: "/radars",
      feature: "radar_management",
      title: "Gestão de Radares",
      subtitle: "Inventário e atribuições",
    },
  ].filter((card) => hasPermission(card.feature));

  return (
    <section className="hero modern-hero">
      <div className="hero-content">
        <p className="hero-kicker">Operações da Unidade</p>
        <h1>Comando de Cuidados Radar</h1>
        <p>
          Monitorização de quartos em tempo real, gestão de alertas e reprodução de incidentes num único espaço de trabalho.
        </p>
      </div>

      <div className="hero-navigation">
        {navigationCards.map((card) => (
          <Link key={card.href} href={card.href} className="hero-nav-card">
            <strong>{card.title}</strong>
            <span>{card.subtitle}</span>
          </Link>
        ))}
      </div>

      <div className="hero-meta modern-meta">
        <button onClick={() => void load()}>Atualizar</button>
        <span>{lastUpdated ? `Atualizado às ${lastUpdated.toLocaleTimeString()}` : "A aguardar primeira atualização"}</span>
      </div>
    </section>
  );
}
