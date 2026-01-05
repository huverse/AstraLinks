/**
 * Theme Provider for Future Letters
 * 管理主题切换和深色模式
 */

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type ThemeType = 'purple' | 'starry' | 'ocean' | 'cloud';

interface ThemeContextType {
    theme: ThemeType;
    darkMode: boolean;
    setTheme: (theme: ThemeType) => void;
    setDarkMode: (darkMode: boolean) => void;
    toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function useTheme(): ThemeContextType {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

const STORAGE_KEYS = {
    THEME: 'future_letter_theme',
    DARK_MODE: 'future_letter_dark_mode',
} as const;

function loadStoredValue<T>(key: string, defaultValue: T): T {
    try {
        const stored = localStorage.getItem(key);
        if (stored === null) return defaultValue;
        return JSON.parse(stored) as T;
    } catch {
        return defaultValue;
    }
}

function saveStoredValue<T>(key: string, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Ignore storage errors
    }
}

interface ThemeProviderProps {
    children: ReactNode;
    initialTheme?: ThemeType;
    initialDarkMode?: boolean;
}

export function ThemeProvider({ children, initialTheme, initialDarkMode }: ThemeProviderProps) {
    const [theme, setThemeState] = useState<ThemeType>(() =>
        initialTheme || loadStoredValue(STORAGE_KEYS.THEME, 'purple')
    );
    const [darkMode, setDarkModeState] = useState<boolean>(() =>
        initialDarkMode ?? loadStoredValue(STORAGE_KEYS.DARK_MODE, false)
    );

    // Persist theme changes
    useEffect(() => {
        saveStoredValue(STORAGE_KEYS.THEME, theme);
    }, [theme]);

    // Persist dark mode changes
    useEffect(() => {
        saveStoredValue(STORAGE_KEYS.DARK_MODE, darkMode);
    }, [darkMode]);

    const setTheme = useCallback((newTheme: ThemeType) => {
        setThemeState(newTheme);
    }, []);

    const setDarkMode = useCallback((newDarkMode: boolean) => {
        setDarkModeState(newDarkMode);
    }, []);

    const toggleDarkMode = useCallback(() => {
        setDarkModeState(prev => !prev);
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, darkMode, setTheme, setDarkMode, toggleDarkMode }}>
            {children}
        </ThemeContext.Provider>
    );
}

export default ThemeProvider;
