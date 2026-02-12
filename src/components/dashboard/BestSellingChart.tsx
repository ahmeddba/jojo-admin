"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface BestSellingChartProps {
  data: { name: string; quantity: number; category: string }[];
}

export function BestSellingChart({ data }: BestSellingChartProps) {
  // Find the max item to highlight it with gold
  const maxQty = Math.max(...data.map((d) => d.quantity));

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "#4A4A4A" }}
          interval={0}
          angle={0}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "#4A4A4A" }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#2B2B2B",
            border: "none",
            borderRadius: "8px",
            color: "#fff",
            fontSize: 12,
          }}
          formatter={(value: number) => [value, "Sold"]}
          labelStyle={{ color: "#C8A45B" }}
        />
        <Bar dataKey="quantity" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.quantity === maxQty ? "#C8A45B" : "#0B5F3D"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
