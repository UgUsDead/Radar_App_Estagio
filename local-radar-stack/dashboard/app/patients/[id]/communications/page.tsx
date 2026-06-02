"use client";

import { apiFetch } from "../../../utils/api";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireFeature } from "../../../components/auth/RequireFeature";

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

export default function PatientComms_Page({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiFetch(`/patients/${params.id}/communications`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Failed to load communications")))
      .then(setData)
      .catch(() => setData([]));
  }, [params.id]);

  if (!data) return <main className="container"><div className="panel">A carregar configuração de comunicações externas...</div></main>;
  if (data.error) return <main className="container"><div className="panel bg-red-100">{data.error}</div></main>;

  return (
    <RequireFeature feature="patient_detail">
    <main className="container p-4">
      <nav className="flex gap-4 mb-6">
        <Link href={`/patients/${params.id}`} className="text-blue-600 hover:underline">← Voltar ao Perfil do Paciente</Link>
      </nav>
      <div className="bg-white rounded-lg shadow p-6 mb-6 border border-indigo-200">
        <h1 className="text-2xl font-bold text-indigo-900 mb-6">Fluxo de Comunicação com Família e Tutores</h1>
        
        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded mb-6">
          <h2 className="text-xl font-bold text-indigo-800 mb-2">Política de Notificação (Automática)</h2>
          <p><strong>Estado do consentimento:</strong> {data.policy?.consent_granted ? "APROVADO ✅" : "PENDENTE ❌"}</p>
          <p><strong>Nível necessário para alertas:</strong> {data.policy?.min_severity_notify === "CRITICAL" ? "CRÍTICO" : (data.policy?.min_severity_notify || "CRÍTICO")}</p>
          <p><strong>Janela de silêncio:</strong> {data.policy?.silence_hours || "22:00 - 06:00"}</p>
        </div>

        <h2 className="text-xl font-bold mb-4 border-b pb-2">Contactos Registados</h2>
        {(!data.contacts || data.contacts.length === 0) ? (
           <p className="text-gray-500 italic">Nenhum contacto externo foi registado para escalonamento automático.</p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="p-3 font-semibold text-gray-600">Nome</th>
                <th className="p-3 font-semibold text-gray-600">Relação</th>
                <th className="p-3 font-semibold text-gray-600">Telefone</th>
                <th className="p-3 font-semibold text-gray-600">Notificar por</th>
              </tr>
            </thead>
            <tbody>
              {data.contacts.map((contact: any, i: number) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-bold">{contact.name}</td>
                  <td className="p-3">{contact.relation}</td>
                  <td className="p-3 font-mono">{contact.phone}</td>
                  <td className="p-3">{contact.method || "SMS"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
    </RequireFeature>
  );
}
