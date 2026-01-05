/**
 * Purple Gradient Theme Background (Default)
 * 紫色渐变主题
 */

import React from 'react';

export default function PurpleGradient({ darkMode = false }: { darkMode?: boolean }) {
    return (
        <div
            className="fixed inset-0 -z-10 pointer-events-none"
            aria-hidden="true"
            style={{
                background: darkMode
                    ? 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)'
                    : 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #2e1065 100%)',
            }}
        >
            {/* Subtle animated glow */}
            <div
                className="absolute inset-0 opacity-30"
                style={{
                    background: 'radial-gradient(ellipse at 30% 20%, rgba(139, 92, 246, 0.3) 0%, transparent 50%)',
                    animation: 'pulseGlow 8s ease-in-out infinite',
                }}
            />
            <div
                className="absolute inset-0 opacity-20"
                style={{
                    background: 'radial-gradient(ellipse at 70% 80%, rgba(236, 72, 153, 0.3) 0%, transparent 50%)',
                    animation: 'pulseGlow 10s ease-in-out infinite reverse',
                }}
            />

            {/* CSS Animation */}
            <style>{`
                @keyframes pulseGlow {
                    0%, 100% { opacity: 0.2; transform: scale(1); }
                    50% { opacity: 0.4; transform: scale(1.1); }
                }
            `}</style>
        </div>
    );
}
