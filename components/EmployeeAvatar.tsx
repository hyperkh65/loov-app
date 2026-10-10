'use client';

import Image from 'next/image';
import { Employee, ANIMAL_IMG, ANIMAL_LABEL, ORB_GRADIENT, ORB_SHADOW } from '@/lib/types';

interface Props {
  employee: Employee;
  characterImage?: string; // pre-rendered thumbnail (3D or Gemini)
  size: number;
  className?: string;
}

/**
 * Unified avatar used in chat panels, meeting rooms, team grid, etc.
 * Shows the 3D/AI character image when available, falls back to Twemoji orb.
 */
export default function EmployeeAvatar({ employee, characterImage, size, className = '' }: Props) {
  const imgSize = Math.round(size * 0.65);

  // Graceful fallback for legacy animal types no longer in the type system
  const orbGradient = ORB_GRADIENT[employee.animal] ?? 'radial-gradient(circle at 32% 28%, #e2e8f0 0%, #94a3b8 50%, #475569 100%)';
  const orbShadow = ORB_SHADOW[employee.animal] ?? '0 2px 4px rgba(0,0,0,.1)';
  const animalImg = ANIMAL_IMG[employee.animal] ?? null;
  const animalLabel = ANIMAL_LABEL[employee.animal] ?? employee.animal;

  return (
    <div
      className={`rounded-full flex-shrink-0 relative overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        background: characterImage ? '#ffffff' : orbGradient,
        boxShadow: orbShadow,
      }}
    >
      {characterImage ? (
        <img
          src={characterImage}
          alt={employee.name}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 33% 28%, rgba(255,255,255,0.7) 0%, transparent 60%)',
            }}
          />
          {animalImg && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Image
                src={animalImg}
                alt={animalLabel}
                width={imgSize}
                height={imgSize}
                unoptimized
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
