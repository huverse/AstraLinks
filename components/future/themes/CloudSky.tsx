/**
 * Cloud Sky Theme Background
 * 云层遨游主题 - 云朵SVG飘动 + 阳光/月光切换
 */

import React, { useEffect, useState } from 'react';

interface Cloud {
    id: number;
    x: number;
    y: number;
    scale: number;
    opacity: number;
    speed: number;
    type: number;
}

export default function CloudSky({ darkMode = false }: { darkMode?: boolean }) {
    const [clouds, setClouds] = useState<Cloud[]>([]);

    useEffect(() => {
        // Generate initial clouds
        const initialClouds: Cloud[] = Array.from({ length: 8 }, (_, i) => ({
            id: i,
            x: Math.random() * 120 - 10,
            y: Math.random() * 60 + 10,
            scale: Math.random() * 0.5 + 0.5,
            opacity: Math.random() * 0.4 + 0.3,
            speed: Math.random() * 0.02 + 0.01,
            type: Math.floor(Math.random() * 3),
        }));
        setClouds(initialClouds);

        // Animate clouds
        const interval = setInterval(() => {
            setClouds(prev => prev.map(cloud => {
                let newX = cloud.x + cloud.speed;
                if (newX > 110) newX = -20;
                return { ...cloud, x: newX };
            }));
        }, 50);

        return () => clearInterval(interval);
    }, []);

    const skyGradient = darkMode
        ? 'linear-gradient(180deg, #0a1628 0%, #1a2a4a 40%, #2a3a5a 100%)'
        : 'linear-gradient(180deg, #87CEEB 0%, #B0E0E6 40%, #E0F7FA 100%)';

    const cloudColor = darkMode ? 'rgba(200, 220, 255, 0.15)' : 'rgba(255, 255, 255, 0.9)';
    const cloudShadow = darkMode ? 'rgba(100, 130, 180, 0.1)' : 'rgba(0, 0, 0, 0.05)';

    // Cloud SVG paths
    const cloudPaths = [
        // Fluffy cloud
        'M25,60 Q10,60 10,50 Q10,40 25,40 Q30,25 50,25 Q70,25 75,40 Q90,40 90,50 Q90,60 75,60 Z',
        // Elongated cloud
        'M20,55 Q5,55 5,45 Q5,35 20,35 Q25,25 40,25 Q60,25 70,35 Q95,35 95,45 Q95,55 80,55 Z',
        // Puffy cloud
        'M30,60 Q15,60 15,50 Q15,42 28,42 Q35,30 50,30 Q65,30 72,42 Q85,42 85,50 Q85,60 70,60 Z',
    ];

    return (
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" style={{ background: skyGradient }} aria-hidden="true">
            {/* Sun or Moon */}
            <div
                className="absolute transition-all duration-1000"
                style={{
                    top: darkMode ? '8%' : '5%',
                    right: darkMode ? '15%' : '10%',
                    width: darkMode ? '60px' : '80px',
                    height: darkMode ? '60px' : '80px',
                    borderRadius: '50%',
                    background: darkMode
                        ? 'radial-gradient(circle, #E8E8E8 0%, #C8C8C8 50%, #A8A8A8 100%)'
                        : 'radial-gradient(circle, #FFE066 0%, #FFD700 50%, #FFA500 100%)',
                    boxShadow: darkMode
                        ? '0 0 30px rgba(200,200,200,0.3), 0 0 60px rgba(200,200,200,0.1)'
                        : '0 0 60px rgba(255,200,50,0.5), 0 0 120px rgba(255,200,50,0.3)',
                }}
            />

            {/* Moon craters (only in dark mode) */}
            {darkMode && (
                <div
                    className="absolute"
                    style={{
                        top: '9%',
                        right: '16%',
                        width: '50px',
                        height: '50px',
                    }}
                >
                    <div
                        className="absolute rounded-full bg-gray-400/30"
                        style={{ width: '12px', height: '12px', top: '10px', left: '8px' }}
                    />
                    <div
                        className="absolute rounded-full bg-gray-400/20"
                        style={{ width: '8px', height: '8px', top: '25px', left: '25px' }}
                    />
                    <div
                        className="absolute rounded-full bg-gray-400/25"
                        style={{ width: '6px', height: '6px', top: '15px', left: '30px' }}
                    />
                </div>
            )}

            {/* Light rays (day mode) */}
            {!darkMode && (
                <div
                    className="absolute"
                    style={{
                        top: '-10%',
                        right: '0',
                        width: '50%',
                        height: '60%',
                        background: 'linear-gradient(135deg, rgba(255,255,200,0.3) 0%, transparent 60%)',
                        pointerEvents: 'none',
                    }}
                />
            )}

            {/* Stars (night mode) */}
            {darkMode && (
                <div className="absolute inset-0">
                    {Array.from({ length: 50 }, (_, i) => (
                        <div
                            key={i}
                            className="absolute rounded-full bg-white"
                            style={{
                                width: `${Math.random() * 2 + 1}px`,
                                height: `${Math.random() * 2 + 1}px`,
                                top: `${Math.random() * 60}%`,
                                left: `${Math.random() * 100}%`,
                                opacity: Math.random() * 0.5 + 0.3,
                                animation: `twinkle ${Math.random() * 3 + 2}s ease-in-out infinite`,
                                animationDelay: `${Math.random() * 2}s`,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Clouds */}
            {clouds.map(cloud => (
                <svg
                    key={cloud.id}
                    className="absolute"
                    style={{
                        left: `${cloud.x}%`,
                        top: `${cloud.y}%`,
                        transform: `scale(${cloud.scale})`,
                        opacity: cloud.opacity,
                        transition: 'left 0.05s linear',
                    }}
                    width="100"
                    height="70"
                    viewBox="0 0 100 70"
                >
                    <path
                        d={cloudPaths[cloud.type]}
                        fill={cloudColor}
                        style={{
                            filter: `drop-shadow(2px 4px 6px ${cloudShadow})`,
                        }}
                    />
                </svg>
            ))}

            {/* Birds (day mode only) */}
            {!darkMode && (
                <div className="absolute inset-0 pointer-events-none">
                    {[1, 2, 3].map(i => (
                        <div
                            key={i}
                            className="absolute text-2xl"
                            style={{
                                top: `${15 + i * 8}%`,
                                animation: `birdFly ${20 + i * 5}s linear infinite`,
                                animationDelay: `${i * 7}s`,
                                opacity: 0.6,
                            }}
                        >
                            〰
                        </div>
                    ))}
                </div>
            )}

            {/* CSS Animations */}
            <style>{`
                @keyframes twinkle {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 0.8; }
                }
                @keyframes birdFly {
                    0% { left: -10%; }
                    100% { left: 110%; }
                }
            `}</style>
        </div>
    );
}
