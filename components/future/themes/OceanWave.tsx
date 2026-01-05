/**
 * Ocean Wave Theme Background
 * 大海主题 - CSS波浪动画 + 水面反光效果
 */

import React from 'react';

export default function OceanWave({ darkMode = false }: { darkMode?: boolean }) {
    const baseColor = darkMode ? '#0a1628' : '#0e4166';
    const waveColor1 = darkMode ? '#0d2847' : '#1a6b8c';
    const waveColor2 = darkMode ? '#0f3459' : '#2089a8';
    const waveColor3 = darkMode ? '#123a66' : '#25a0c4';

    return (
        <div
            className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
            style={{ backgroundColor: baseColor }}
            aria-hidden="true"
        >
            {/* Gradient overlay */}
            <div
                className="absolute inset-0"
                style={{
                    background: `linear-gradient(180deg,
                        ${darkMode ? 'rgba(10,22,40,0.9)' : 'rgba(14,65,102,0.7)'} 0%,
                        ${darkMode ? 'rgba(15,52,89,0.6)' : 'rgba(26,107,140,0.5)'} 50%,
                        transparent 100%)`
                }}
            />

            {/* Sun/Moon reflection */}
            <div
                className="absolute"
                style={{
                    top: '10%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: darkMode ? '60px' : '100px',
                    height: darkMode ? '60px' : '100px',
                    borderRadius: '50%',
                    background: darkMode
                        ? 'radial-gradient(circle, rgba(200,220,255,0.8) 0%, rgba(200,220,255,0) 70%)'
                        : 'radial-gradient(circle, rgba(255,220,150,0.9) 0%, rgba(255,200,100,0) 70%)',
                    filter: 'blur(10px)',
                }}
            />

            {/* Light reflection on water */}
            <div
                className="absolute"
                style={{
                    top: '20%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '200px',
                    height: '60%',
                    background: `linear-gradient(180deg,
                        ${darkMode ? 'rgba(200,220,255,0.15)' : 'rgba(255,220,150,0.2)'} 0%,
                        transparent 100%)`,
                    clipPath: 'polygon(40% 0%, 60% 0%, 80% 100%, 20% 100%)',
                    animation: 'shimmer 3s ease-in-out infinite',
                }}
            />

            {/* Wave layers */}
            <svg
                className="absolute bottom-0 left-0 w-full"
                style={{ height: '40%' }}
                viewBox="0 0 1440 320"
                preserveAspectRatio="none"
            >
                <defs>
                    <linearGradient id="wave1Gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={waveColor1} stopOpacity="0.8" />
                        <stop offset="100%" stopColor={waveColor1} stopOpacity="0.4" />
                    </linearGradient>
                    <linearGradient id="wave2Gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={waveColor2} stopOpacity="0.7" />
                        <stop offset="100%" stopColor={waveColor2} stopOpacity="0.3" />
                    </linearGradient>
                    <linearGradient id="wave3Gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={waveColor3} stopOpacity="0.6" />
                        <stop offset="100%" stopColor={waveColor3} stopOpacity="0.2" />
                    </linearGradient>
                </defs>

                {/* Back wave */}
                <path
                    fill="url(#wave1Gradient)"
                    d="M0,160L48,176C96,192,192,224,288,213.3C384,203,480,149,576,138.7C672,128,768,160,864,181.3C960,203,1056,213,1152,197.3C1248,181,1344,139,1392,117.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
                    style={{ animation: 'waveMove1 8s ease-in-out infinite' }}
                />

                {/* Middle wave */}
                <path
                    fill="url(#wave2Gradient)"
                    d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,218.7C672,235,768,245,864,234.7C960,224,1056,192,1152,181.3C1248,171,1344,181,1392,186.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
                    style={{ animation: 'waveMove2 6s ease-in-out infinite' }}
                />

                {/* Front wave */}
                <path
                    fill="url(#wave3Gradient)"
                    d="M0,288L48,272C96,256,192,224,288,218.7C384,213,480,235,576,250.7C672,267,768,277,864,272C960,267,1056,245,1152,234.7C1248,224,1344,224,1392,224L1440,224L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
                    style={{ animation: 'waveMove3 4s ease-in-out infinite' }}
                />
            </svg>

            {/* CSS Animations */}
            <style>{`
                @keyframes waveMove1 {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(-30px); }
                }
                @keyframes waveMove2 {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(20px); }
                }
                @keyframes waveMove3 {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(-15px); }
                }
                @keyframes shimmer {
                    0%, 100% { opacity: 0.5; }
                    50% { opacity: 0.8; }
                }
            `}</style>
        </div>
    );
}
