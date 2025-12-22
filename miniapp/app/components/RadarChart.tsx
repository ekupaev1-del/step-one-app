"use client";

import React from "react";

interface RadarChartProps {
  calories: number;
  caloriesGoal: number;
  protein: number;
  proteinGoal: number;
  fat: number;
  fatGoal: number;
  carbs: number;
  carbsGoal: number;
  water: number;
  waterGoal: number;
}

/**
 * Нормализует значения для радиолокационной диаграммы
 * Возвращает массив значений от 0 до 1 для каждой оси
 */
function normalizeValues(props: RadarChartProps): number[] {
  const {
    calories,
    caloriesGoal,
    protein,
    proteinGoal,
    fat,
    fatGoal,
    carbs,
    carbsGoal,
    water,
    waterGoal
  } = props;

  // Функция нормализации: actual / goal, ограничено до 1
  const normalize = (actual: number, goal: number): number => {
    if (goal === 0) return 0;
    return Math.min(1, actual / goal);
  };

  return [
    normalize(calories, caloriesGoal), // Калории
    normalize(protein, proteinGoal),   // Белки
    normalize(fat, fatGoal),           // Жиры
    normalize(carbs, carbsGoal),        // Углеводы
    normalize(water, waterGoal)        // Вода
  ];
}

/**
 * Компонент радиолокационной диаграммы (pentagon)
 */
export default function RadarChart(props: RadarChartProps) {
  const normalizedValues = normalizeValues(props);
  
  // Размеры диаграммы
  const size = 280; // Размер SVG
  const center = size / 2;
  const radius = 100; // Радиус для максимального значения (1.0)
  
  // 5 осей для pentagon (360 / 5 = 72 градуса между осями)
  // Начинаем с верхней оси (калории) и идем по часовой стрелке
  const axes = [
    { label: "Калории", angle: -90 },      // Верх (0°)
    { label: "Белки", angle: -18 },         // Верх-право (72°)
    { label: "Жиры", angle: 54 },           // Низ-право (144°)
    { label: "Углеводы", angle: 126 },      // Низ-лево (216°)
    { label: "Вода", angle: -162 }          // Верх-лево (288°)
  ];

  // Функция для вычисления координат точки на оси
  const getPoint = (angle: number, value: number): [number, number] => {
    const rad = (angle * Math.PI) / 180;
    const r = radius * value;
    return [
      center + r * Math.cos(rad),
      center + r * Math.sin(rad)
    ];
  };

  // Создаем точки для полигона
  const polygonPoints = axes
    .map((axis, index) => {
      const value = normalizedValues[index];
      return getPoint(axis.angle, value);
    })
    .map(([x, y]) => `${x},${y}`)
    .join(" ");

  // Создаем точки для сетки (концентрические круги)
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];
  const gridPolygons = gridLevels.map(level => {
    const points = axes
      .map(axis => getPoint(axis.angle, level))
      .map(([x, y]) => `${x},${y}`)
      .join(" ");
    return points;
  });

  return (
    <div className="flex flex-col items-center">
      {/* SVG диаграмма */}
      <svg width={size} height={size} className="mb-6">
        {/* Сетка (концентрические pentagon'ы) */}
        <g opacity="0.15">
          {gridPolygons.map((points, index) => (
            <polygon
              key={`grid-${index}`}
              points={points}
              fill="none"
              stroke="#2D2A32"
              strokeWidth="1"
            />
          ))}
        </g>

        {/* Оси (линии от центра к краям) */}
        <g stroke="#E5E5E5" strokeWidth="1">
          {axes.map((axis, index) => {
            const [x, y] = getPoint(axis.angle, 1);
            return (
              <line
                key={`axis-${index}`}
                x1={center}
                y1={center}
                x2={x}
                y2={y}
              />
            );
          })}
        </g>

        {/* Полигон с данными */}
        <polygon
          points={polygonPoints}
          fill="#F4CC00"
          fillOpacity="0.35"
          stroke="#F4CC00"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Метки осей */}
        {axes.map((axis, index) => {
          const [x, y] = getPoint(axis.angle, 1.15); // Немного дальше от края
          return (
            <text
              key={`label-${index}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-xs font-medium fill-textPrimary"
            >
              {axis.label}
            </text>
          );
        })}
      </svg>

      {/* Сводка под диаграммой */}
      <div className="w-full space-y-2 text-sm">
        <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
          <span className="text-textSecondary">Калории</span>
          <span className="font-medium text-textPrimary">
            {Math.round(props.calories)} / {Math.round(props.caloriesGoal)} ккал
          </span>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
          <span className="text-textSecondary">Белки</span>
          <span className="font-medium text-textPrimary">
            {props.protein.toFixed(1)} / {props.proteinGoal.toFixed(1)} г
          </span>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
          <span className="text-textSecondary">Жиры</span>
          <span className="font-medium text-textPrimary">
            {props.fat.toFixed(1)} / {props.fatGoal.toFixed(1)} г
          </span>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
          <span className="text-textSecondary">Углеводы</span>
          <span className="font-medium text-textPrimary">
            {props.carbs.toFixed(1)} / {props.carbsGoal.toFixed(1)} г
          </span>
        </div>
        <div className="flex justify-between items-center py-1.5">
          <span className="text-textSecondary">Вода</span>
          <span className="font-medium text-textPrimary">
            {Math.round(props.water)} / {Math.round(props.waterGoal)} мл
          </span>
        </div>
      </div>
    </div>
  );
}

























