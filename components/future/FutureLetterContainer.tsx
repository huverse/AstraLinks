/**
 * Future Letters - Main Container
 * Handles internal routing and state management
 */

import React, { useState, useCallback } from 'react';
import type { FutureView } from './types';
import FutureLetterHome from './FutureLetterHome';
import ComposeLetterPage from './ComposeLetterPage';

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
            case 'received':
            case 'drafts':
                // TODO: Implement list pages
                return (
                    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex items-center justify-center">
                        <div className="text-center">
                            <p className="text-xl mb-4">{view} 页面开发中...</p>
                            <button
                                onClick={handleBackToHome}
                                className="px-6 py-2 bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
                            >
                                返回首页
                            </button>
                        </div>
                    </div>
                );

            case 'detail':
                // TODO: Implement detail page
                return (
                    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex items-center justify-center">
                        <div className="text-center">
                            <p className="text-xl mb-4">信件详情页开发中...</p>
                            <p className="text-white/50 mb-4">Letter ID: {selectedLetterId}</p>
                            <button
                                onClick={handleBackToHome}
                                className="px-6 py-2 bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
                            >
                                返回首页
                            </button>
                        </div>
                    </div>
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
