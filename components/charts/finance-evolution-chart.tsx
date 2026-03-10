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
          <CartesianGrid strokeDasharray="3 3" stroke="#d9d2d4" />
          <XAxis dataKey="competencia" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="receita" stroke="#cf1621" strokeWidth={2} />
          <Line type="monotone" dataKey="despesa" stroke="#8d0f16" strokeWidth={2} />
          <Line type="monotone" dataKey="saldo" stroke="#2a2024" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
