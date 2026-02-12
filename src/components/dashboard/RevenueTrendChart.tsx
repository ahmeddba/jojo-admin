"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface RevenueTrendChartProps {
  data: { date: string; amount: number }[];
}

export function RevenueTrendChart({ data }: RevenueTrendChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-US", { weekday: "short" }),
  }));

  return (
    <ResponsiveContainer width="100%" height={256}>
      <AreaChart data={formatted} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradientGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0B5F3D" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#0B5F3D" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#D3CEC7" vertical={false} />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "#4A4A4A" }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "#4A4A4A" }}
          tickFormatter={(v: number) =>
            v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
          }
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#2B2B2B",
            border: "none",
            borderRadius: "8px",
            color: "#fff",
            fontSize: 12,
          }}
          formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]}
          labelStyle={{ color: "#C8A45B" }}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="#0B5F3D"
          strokeWidth={2.5}
          fill="url(#gradientGreen)"
          dot={false}
          activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2, fill: "#0B5F3D" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
