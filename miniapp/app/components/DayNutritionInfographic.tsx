"use client";

import React from "react";

type DayStats = {
  caloriesEaten: number;
  caloriesGoal: number | null;
  proteinEaten: number;
  proteinGoal: number | null;
  fatEaten: number;
  fatGoal: number | null;
  carbsEaten: number;
  carbsGoal: number | null;
};

type DonutProps = {
  value: number;
  goal: number | null;
  label: string;
  color: string;
};

const clampProgress = (value: number, goal: number | null) => {
  if (!goal || goal <= 0) return 0;
  return Math.min(value / goal, 1);
};

function Donut({ value, goal, label, color }: DonutProps) {
  const size = 90;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = clampProgress(value, goal);
  const offset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center justify-center w-28">
      <svg width={size} height={size} className="mb-2">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="46%"
          textAnchor="middle"
          fontSize="16"
          fontWeight="700"
          fill="#2D2A32"
        >
          {Math.round(value)}
        </text>
        <text
          x="50%"
          y="63%"
          textAnchor="middle"
          fontSize="11"
          fill="#6B7280"
        >
          {goal ? `/ ${Math.round(goal)} г` : "нет цели"}
        </text>
      </svg>
      <div className="text-sm font-medium text-textPrimary">{label}</div>
    </div>
  );
}

function CaloriesDonut({ caloriesEaten, caloriesGoal }: { caloriesEaten: number; caloriesGoal: number | null }) {
  const size = 140;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = clampProgress(caloriesEaten, caloriesGoal);
  const offset = circumference * (1 - progress);
  const remaining = caloriesGoal ? Math.max(caloriesGoal - caloriesEaten, 0) : 0;

  return (
    <div className="flex flex-col items-center justify-center">
      <svg width={size} height={size} className="mb-3">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#F4CC00"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="46%"
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          fill="#2D2A32"
        >
          {caloriesGoal ? Math.round(remaining) : Math.round(caloriesEaten)}
        </text>
        <text
          x="50%"
          y="62%"
          textAnchor="middle"
          fontSize="12"
          fill="#6B7280"
        >
          {caloriesGoal ? "ккал осталось" : "ккал съели"}
        </text>
      </svg>
      <div className="flex w-full justify-between text-sm text-textSecondary">
        <div>Съедено: <span className="text-textPrimary font-semibold">{Math.round(caloriesEaten)} ккал</span></div>
        <div>Норма: <span className="text-textPrimary font-semibold">{caloriesGoal ? Math.round(caloriesGoal) : "—"} ккал</span></div>
      </div>
    </div>
  );
}

export default function DayNutritionInfographic({ stats }: { stats: DayStats }) {
  return (
    <div className="w-full flex flex-col gap-4">
      <div className="bg-white rounded-2xl p-4 shadow-soft">
        <CaloriesDonut caloriesEaten={stats.caloriesEaten} caloriesGoal={stats.caloriesGoal} />
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-soft">
        <div className="flex items-center justify-between gap-2">
          <Donut
            value={stats.carbsEaten}
            goal={stats.carbsGoal}
            label="Углеводы"
            color="#F59E0B"
          />
          <Donut
            value={stats.proteinEaten}
            goal={stats.proteinGoal}
            label="Белки"
            color="#34A853"
          />
          <Donut
            value={stats.fatEaten}
            goal={stats.fatGoal}
            label="Жиры"
            color="#3B82F6"
          />
        </div>
      </div>
    </div>
  );
}




