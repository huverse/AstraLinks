/**
 * Theme Background Component
 * 根据主题渲染对应的背景组件
 */

import React from 'react';
import type { ThemeType } from './ThemeProvider';
import PurpleGradient from './themes/PurpleGradient';
import StarryNight from './themes/StarryNight';
import OceanWave from './themes/OceanWave';
import CloudSky from './themes/CloudSky';

interface ThemeBackgroundProps {
    theme: ThemeType;
    darkMode: boolean;
}

export default function ThemeBackground({ theme, darkMode }: ThemeBackgroundProps) {
    switch (theme) {
        case 'starry':
            return <StarryNight darkMode={darkMode} />;
        case 'ocean':
            return <OceanWave darkMode={darkMode} />;
        case 'cloud':
            return <CloudSky darkMode={darkMode} />;
        case 'purple':
        default:
            return <PurpleGradient darkMode={darkMode} />;
    }
}
