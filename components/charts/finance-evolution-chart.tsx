"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, CartesianGrid } from "recharts";

type Point = {
  competencia: string;
  receita: number;
  despesa: number;
  saldo: number;
};

export function FinanceEvolutionChart({ data }: { data: Point[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e1d7d9" />
          <XAxis dataKey="competencia" tick={{ fill: "#6f6568", fontSize: 12 }} />
          <YAxis tick={{ fill: "#6f6568", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              background: "rgba(255,255,255,0.95)",
              border: "1px solid #ded7d9",
              borderRadius: "12px",
              boxShadow: "0 8px 22px rgba(40,18,23,0.14)"
            }}
          />
          <Legend />
          <Line type="monotone" dataKey="receita" stroke="#cf1621" strokeWidth={3} dot={false} />
          <Line type="monotone" dataKey="despesa" stroke="#8d0f16" strokeWidth={3} dot={false} />
          <Line type="monotone" dataKey="saldo" stroke="#2a2024" strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
