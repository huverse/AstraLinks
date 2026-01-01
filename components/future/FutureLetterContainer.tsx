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

interface FutureLetterContainerProps {
    onBack: () => void;
}

export default function FutureLetterContainer({ onBack }: FutureLetterContainerProps) {
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
                // TODO: Implement settings page
                return (
                    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex items-center justify-center">
                        <div className="text-center">
                            <p className="text-xl mb-4">设置页面开发中...</p>
                            <button
                                onClick={handleBackToHome}
                                className="px-6 py-2 bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
                            >
                                返回首页
                            </button>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return renderView();
}
