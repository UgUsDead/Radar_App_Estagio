"use client";

import React from "react";
import { useAuth } from "../../contexts/AuthContext";

interface RequireFeatureProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RequireFeature({ feature, children, fallback = null }: RequireFeatureProps) {
  const { hasPermission, isLoading } = useAuth();

  if (isLoading) return null;

  if (hasPermission(feature)) {
    return <>{children}</>;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  return (
    <div className="panel error-banner" style={{ margin: "1rem 0" }}>
      Acesso Negado: Necessária a permissão {feature}
    </div>
  );
}
