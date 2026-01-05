/**
 * Future Letters - Main Container
 * Handles internal routing and state management
 */

import React, { useState, useCallback } from 'react';
import type { FutureView } from './types';
import FutureLetterHome from './FutureLetterHome';
import ComposeLetterPage from './ComposeLetterPage';
import LetterListPage from './LetterListPage';
import ViewLetterPage from './ViewLetterPage';
import OpenLetterWall from './OpenLetterWall';
import SettingsPage from './SettingsPage';
import PhysicalLetterForm from './PhysicalLetterForm';
import { ToastProvider } from './ToastProvider';
import { ThemeProvider, useTheme } from './ThemeProvider';
import ThemeBackground from './ThemeBackground';
import GlobalMusicPlayer from '../GlobalMusicPlayer';

interface FutureLetterContainerProps {
    onBack: () => void;
}

// Inner component that can access theme context
function FutureLetterContent({ onBack }: FutureLetterContainerProps) {
    const { theme, darkMode } = useTheme();
    const [view, setView] = useState<FutureView>('home');
    const [selectedLetterId, setSelectedLetterId] = useState<string | undefined>();

    const handleNavigate = useCallback((newView: FutureView, letterId?: string) => {
        setView(newView);
        setSelectedLetterId(letterId);
    }, []);

    const handleBackToHome = useCallback(() => {
        setView('home');
        setSelectedLetterId(undefined);
    }, []);

    // 渲染当前视图
    const renderView = () => {
        switch (view) {
            case 'home':
                return (
                    <FutureLetterHome
                        onBack={onBack}
                        onNavigate={handleNavigate}
                    />
                );

            case 'compose':
                return (
                    <ComposeLetterPage
                        onBack={handleBackToHome}
                        draftId={selectedLetterId}
                    />
                );

            case 'sent':
                return (
                    <LetterListPage
                        type="sent"
                        onBack={handleBackToHome}
                        onNavigate={handleNavigate}
                    />
                );

            case 'received':
                return (
                    <LetterListPage
                        type="received"
                        onBack={handleBackToHome}
                        onNavigate={handleNavigate}
                    />
                );

            case 'drafts':
                return (
                    <LetterListPage
                        type="drafts"
                        onBack={handleBackToHome}
                        onNavigate={handleNavigate}
                    />
                );

            case 'detail':
                if (!selectedLetterId) {
                    // No letter ID, go back to home
                    return (
                        <FutureLetterHome
                            onBack={onBack}
                            onNavigate={handleNavigate}
                        />
                    );
                }
                return (
                    <ViewLetterPage
                        letterId={selectedLetterId}
                        onBack={handleBackToHome}
                        onNavigate={handleNavigate}
                    />
                );

            case 'settings':
                return (
                    <SettingsPage
                        onBack={handleBackToHome}
                    />
                );

            case 'public':
                return (
                    <OpenLetterWall
                        onBack={handleBackToHome}
                    />
                );

            case 'physical':
                if (!selectedLetterId) {
                    return (
                        <FutureLetterHome
                            onBack={onBack}
                            onNavigate={handleNavigate}
                        />
                    );
                }
                return (
                    <div className="min-h-[100dvh] text-white relative z-10">
                        <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-900/70 border-b border-white/10">
                            <div className="max-w-4xl mx-auto px-4 py-4">
                                <button
                                    onClick={() => handleNavigate('detail', selectedLetterId)}
                                    className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                                >
                                    <span>← 返回信件</span>
                                </button>
                            </div>
                        </header>
                        <main className="max-w-4xl mx-auto px-4 py-8">
                            <h1 className="text-2xl font-bold mb-6">实体信订单</h1>
                            <PhysicalLetterForm
                                letterId={selectedLetterId}
                                onCreated={(order) => {
                                    handleNavigate('detail', selectedLetterId);
                                }}
                            />
                        </main>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <>
            <ThemeBackground theme={theme} darkMode={darkMode} />
            <ToastProvider>
                {renderView()}
                <GlobalMusicPlayer />
            </ToastProvider>
        </>
    );
}

// Main container with theme provider wrapper
export default function FutureLetterContainer({ onBack }: FutureLetterContainerProps) {
    return (
        <ThemeProvider>
            <FutureLetterContent onBack={onBack} />
        </ThemeProvider>
    );
}
