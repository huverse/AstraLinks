/**
 * Starry Night Theme Background
 * 星空主题 - Canvas星星闪烁 + 流星效果
 */

import React, { useEffect, useRef, useCallback } from 'react';

interface Star {
    x: number;
    y: number;
    size: number;
    opacity: number;
    twinkleSpeed: number;
    twinklePhase: number;
}

interface Meteor {
    x: number;
    y: number;
    length: number;
    speed: number;
    opacity: number;
}

export default function StarryNight({ darkMode = false }: { darkMode?: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const starsRef = useRef<Star[]>([]);
    const meteorsRef = useRef<Meteor[]>([]);
    const animationRef = useRef<number>(0);

    const initStars = useCallback((width: number, height: number) => {
        const starCount = Math.floor((width * height) / 3000);
        starsRef.current = Array.from({ length: starCount }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            size: Math.random() * 2 + 0.5,
            opacity: Math.random() * 0.5 + 0.3,
            twinkleSpeed: Math.random() * 0.02 + 0.01,
            twinklePhase: Math.random() * Math.PI * 2,
        }));
    }, []);

    const spawnMeteor = useCallback((width: number, height: number) => {
        if (Math.random() > 0.005) return; // 0.5% chance per frame
        meteorsRef.current.push({
            x: Math.random() * width,
            y: 0,
            length: Math.random() * 80 + 40,
            speed: Math.random() * 8 + 4,
            opacity: 1,
        });
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initStars(canvas.width, canvas.height);
        };

        resize();
        window.addEventListener('resize', resize);

        let time = 0;

        const animate = () => {
            time += 1;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw gradient background
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            if (darkMode) {
                gradient.addColorStop(0, '#0a0a1f');
                gradient.addColorStop(0.5, '#0f0f2a');
                gradient.addColorStop(1, '#1a1a3a');
            } else {
                gradient.addColorStop(0, '#0f0f3a');
                gradient.addColorStop(0.5, '#1a1a5a');
                gradient.addColorStop(1, '#2a2a7a');
            }
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw stars with twinkling
            starsRef.current.forEach(star => {
                star.twinklePhase += star.twinkleSpeed;
                const twinkle = Math.sin(star.twinklePhase) * 0.3 + 0.7;
                const opacity = star.opacity * twinkle;

                ctx.beginPath();
                ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                ctx.fill();

                // Add subtle glow to larger stars
                if (star.size > 1.5) {
                    ctx.beginPath();
                    ctx.arc(star.x, star.y, star.size * 2, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(200, 220, 255, ${opacity * 0.2})`;
                    ctx.fill();
                }
            });

            // Spawn and update meteors
            spawnMeteor(canvas.width, canvas.height);

            meteorsRef.current = meteorsRef.current.filter(meteor => {
                meteor.x += meteor.speed * 0.7;
                meteor.y += meteor.speed;
                meteor.opacity -= 0.015;

                if (meteor.opacity <= 0) return false;

                // Draw meteor trail
                const gradient = ctx.createLinearGradient(
                    meteor.x, meteor.y,
                    meteor.x - meteor.length * 0.7, meteor.y - meteor.length
                );
                gradient.addColorStop(0, `rgba(255, 255, 255, ${meteor.opacity})`);
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

                ctx.beginPath();
                ctx.moveTo(meteor.x, meteor.y);
                ctx.lineTo(meteor.x - meteor.length * 0.7, meteor.y - meteor.length);
                ctx.strokeStyle = gradient;
                ctx.lineWidth = 2;
                ctx.stroke();

                return true;
            });

            animationRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationRef.current);
        };
    }, [darkMode, initStars, spawnMeteor]);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 w-full h-full -z-10 pointer-events-none"
            aria-hidden="true"
        />
    );
}
