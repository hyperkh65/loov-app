'use client';

import Image from 'next/image';
import { Employee, ANIMAL_IMG, ANIMAL_LABEL, ORB_GRADIENT, ORB_SHADOW } from '@/lib/types';

interface Props {
  employee: Employee;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isActive?: boolean;
  showName?: boolean;
  isSanmu?: boolean;
  onClick?: () => void;
  className?: string;
}

const SIZE_MAP = {
  sm: { px: 44, img: 28, font: 'text-[10px]' },
  md: { px: 60, img: 38, font: 'text-xs' },
  lg: { px: 80, img: 52, font: 'text-sm' },
  xl: { px: 108, img: 70, font: 'text-sm' },
};

export default function CharacterOrb({
  employee, size = 'md', isActive, showName, isSanmu, onClick, className = '',
}: Props) {
  const { px, img, font } = SIZE_MAP[size];

  return (
    <div
      className={`flex flex-col items-center gap-1.5 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      <div className="relative group" style={{ width: px, height: px }}>
        {/* 상무 gold rotating ring */}
        {isSanmu && (
          <div
            className="absolute -inset-[3px] rounded-full animate-spin-slow"
            style={{
              background: 'conic-gradient(from 0deg, #fbbf24, #f59e0b, #fde68a, #f59e0b, #fbbf24)',
              zIndex: 0,
            }}
          />
        )}

        {/* Orb sphere */}
        <div
          className={`relative rounded-full overflow-hidden transition-all duration-200 ${
            onClick ? 'group-hover:scale-110 group-hover:-translate-y-1 active:scale-95' : ''
          } ${isActive ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent' : ''}`}
          style={{
            width: px,
            height: px,
            background: ORB_GRADIENT[employee.animal],
            boxShadow: ORB_SHADOW[employee.animal],
            zIndex: 1,
          }}
        >
          {/* Shine overlay */}
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 33% 28%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.15) 40%, transparent 65%)',
              zIndex: 2,
            }}
          />

          {/* Animal image */}
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 3 }}>
            <Image
              src={ANIMAL_IMG[employee.animal]}
              alt={ANIMAL_LABEL[employee.animal]}
              width={img}
              height={img}
              className="drop-shadow-sm"
              unoptimized
            />
          </div>

          {/* Active pulse ring */}
          {isActive && (
            <div className="absolute inset-0 rounded-full border-2 border-white/60 animate-pulse" style={{ zIndex: 4 }} />
          )}
        </div>

        {/* Online indicator */}
        <div
          className="absolute bottom-0.5 right-0.5 rounded-full border-2 border-white"
          style={{ width: Math.max(10, px * 0.18), height: Math.max(10, px * 0.18), background: '#22c55e', zIndex: 5 }}
        />
      </div>

      {showName && (
        <div className="text-center">
          <p className={`font-semibold text-gray-800 leading-tight ${font}`}>{employee.name}</p>
          {size !== 'sm' && (
            <p className={`text-gray-400 ${font} mt-0.5`}>{employee.role}</p>
          )}
        </div>
      )}
    </div>
  );
}
