"use client";

import { useMemo } from "react";

interface MonthlyData {
  date: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface MonthlyNutritionChartProps {
  data: MonthlyData[];
  loading?: boolean;
}

export default function MonthlyNutritionChart({ data, loading }: MonthlyNutritionChartProps) {
  // Вычисляем максимальные значения для нормализации осей
  const maxValues = useMemo(() => {
    if (!data || data.length === 0) {
      return { calories: 2000, protein: 200, fat: 100, carbs: 300 };
    }

    const maxCalories = Math.max(...data.map(d => d.calories), 2000);
    const maxProtein = Math.max(...data.map(d => d.protein), 200);
    const maxFat = Math.max(...data.map(d => d.fat), 100);
    const maxCarbs = Math.max(...data.map(d => d.carbs), 300);

    return {
      calories: Math.ceil(maxCalories / 500) * 500, // Округляем до 500
      protein: Math.ceil(maxProtein / 50) * 50, // Округляем до 50
      fat: Math.ceil(maxFat / 25) * 25, // Округляем до 25
      carbs: Math.ceil(maxCarbs / 50) * 50 // Округляем до 50
    };
  }, [data]);

  if (loading) {
    return (
      <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <h3 className="font-semibold text-textPrimary mb-3">📊 Динамика питания за месяц</h3>
        <div className="text-center text-textSecondary py-8">Загрузка данных...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <h3 className="font-semibold text-textPrimary mb-3">📊 Динамика питания за месяц</h3>
        <div className="text-center text-textSecondary py-8">Нет данных за этот месяц</div>
      </div>
    );
  }

  const chartHeight = 200;
  const chartWidth = Math.max(400, data.length * 12); // Минимальная ширина 400px
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  // Функция для нормализации значений
  const normalizeValue = (value: number, max: number) => {
    return max > 0 ? (value / max) * graphHeight : 0;
  };

  // Генерируем точки для линий
  const generatePath = (values: number[], max: number) => {
    if (values.length === 0) return '';
    const points = values.map((value, index) => {
      const x = padding.left + (index / (values.length - 1 || 1)) * graphWidth;
      const y = padding.top + graphHeight - normalizeValue(value, max);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    });
    return points.join(' ');
  };

  const caloriesPath = generatePath(
    data.map(d => d.calories),
    maxValues.calories
  );
  const proteinPath = generatePath(
    data.map(d => d.protein * 10), // Умножаем на 10 для визуализации
    maxValues.protein * 10
  );
  const fatPath = generatePath(
    data.map(d => d.fat * 10),
    maxValues.fat * 10
  );
  const carbsPath = generatePath(
    data.map(d => d.carbs * 10),
    maxValues.carbs * 10
  );

  // Генерируем метки для оси X (каждые 5 дней или меньше если дней мало)
  const labelInterval = data.length > 20 ? 5 : data.length > 10 ? 3 : 2;
  const xLabels = data
    .map((d, index) => ({ date: d.date, index }))
    .filter((_, i) => i % labelInterval === 0 || i === data.length - 1)
    .map(({ date, index }) => {
      const day = new Date(date + 'T12:00:00').getDate();
      return { day, index };
    });

  return (
    <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
      <h3 className="font-semibold text-textPrimary mb-4">📊 Динамика питания за месяц</h3>
      
      <div className="overflow-x-auto -mx-4 px-4">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight + padding.bottom}`}
          className="w-full h-auto min-w-full"
          preserveAspectRatio="none"
          style={{ minHeight: `${chartHeight + padding.bottom}px` }}
        >
          {/* Сетка (горизонтальные линии) */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + graphHeight * (1 - ratio);
            return (
              <line
                key={ratio}
                x1={padding.left}
                y1={y}
                x2={chartWidth - padding.right}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
            );
          })}

          {/* Линия калорий (красная, толстая) */}
          <path
            d={caloriesPath}
            fill="none"
            stroke="#ef4444"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Линия белков (синяя, тонкая) */}
          <path
            d={proteinPath}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.7"
          />

          {/* Линия жиров (оранжевая, тонкая) */}
          <path
            d={fatPath}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.7"
          />

          {/* Линия углеводов (зеленая, тонкая) */}
          <path
            d={carbsPath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.7"
          />

          {/* Точки для калорий */}
          {data.map((d, index) => {
            if (d.calories === 0) return null;
            const x = padding.left + (index / (data.length - 1 || 1)) * graphWidth;
            const y = padding.top + graphHeight - normalizeValue(d.calories, maxValues.calories);
            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="3"
                fill="#ef4444"
              />
            );
          })}

          {/* Метки оси X */}
          {xLabels.map(({ day, index }) => {
            const x = padding.left + (index / (data.length - 1 || 1)) * graphWidth;
            return (
              <text
                key={index}
                x={x}
                y={chartHeight - padding.bottom + 20}
                textAnchor="middle"
                fontSize="10"
                fill="#6b7280"
              >
                {day}
              </text>
            );
          })}

          {/* Метки оси Y (калории) */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const value = Math.round(maxValues.calories * ratio);
            const y = padding.top + graphHeight * (1 - ratio);
            return (
              <text
                key={ratio}
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="#6b7280"
              >
                {value}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Легенда */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-red-500"></div>
          <span className="text-textSecondary">Калории (ккал)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-blue-500"></div>
          <span className="text-textSecondary">Белки (г × 10)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-amber-500"></div>
          <span className="text-textSecondary">Жиры (г × 10)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-green-500"></div>
          <span className="text-textSecondary">Углеводы (г × 10)</span>
        </div>
      </div>
    </div>
  );
}

