'use client';

import React from 'react';

interface ChartItem {
    name?: string;
    date?: string;
    value: number;
}

interface AreaChartProps {
    data: ChartItem[];
    color?: string;
    height?: number;
    showLabels?: boolean;
}

export default function AreaChart({ data = [], color = '#0070f3', height = 150, showLabels = true }: AreaChartProps) {
    if (!data || data.length === 0) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)' }}>데이터 없음</div>;

    const values = data.map(d => d.value);
    const max = Math.max(...values, 1);
    const min = Math.min(...values);
    const range = max - min || 1;
    const width = 800;

    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height * 0.1 + (1 - (d.value - min) / range) * (height * 0.8);
        return `${x},${y}`;
    }).join(' ');

    const areaPoints = `0,${height} ${points} ${width},${height}`;
    const gradId = `grad-${color.replace('#', '')}`;

    return (
        <div style={{ width: '100%', overflow: 'hidden' }}>
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height: `${height}px`, width: '100%', display: 'block' }}>
                <defs>
                    <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.3 }} />
                        <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
                    </linearGradient>
                </defs>
                <polyline points={areaPoints} fill={`url(#${gradId})`} stroke="none" />
                <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {data.length < 50 && data.map((d, i) => {
                    const x = (i / (data.length - 1)) * width;
                    const y = height * 0.1 + (1 - (d.value - min) / range) * (height * 0.8);
                    return <circle key={i} cx={x} cy={y} r="2.5" fill="#fff" stroke={color} strokeWidth="1.5" />;
                })}
            </svg>
            {showLabels && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.6rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>
                    <span>{data[0].name || data[0].date}</span>
                    <span>{data[Math.floor(data.length / 2)].name || data[Math.floor(data.length / 2)].date}</span>
                    <span>{data[data.length - 1].name || data[data.length - 1].date}</span>
                </div>
            )}
        </div>
    );
}
