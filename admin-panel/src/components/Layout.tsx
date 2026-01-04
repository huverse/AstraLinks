import { type ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Ticket, Flag, Ban, FileText, LogOut, BarChart3, MessageSquare, Megaphone, Settings, FileCode, Moon, Sun, Share2, GitBranch, Plug, Mail } from 'lucide-react';
import { setAuthToken } from '../services/api';
import UndoToast from './UndoToast';

const navItems = [
    { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
    { path: '/users', label: '用户管理', icon: Users },
    { path: '/invitations', label: '邀请码', icon: Ticket },
    { path: '/split-invitations', label: '分裂邀请', icon: Share2 },
    { path: '/reports', label: '举报管理', icon: Flag },
    { path: '/bans', label: '封禁管理', icon: Ban },
    { path: '/logs', label: '操作日志', icon: FileText },
    { path: '/analytics', label: '数据分析', icon: BarChart3 },
    { path: '/feedback', label: '用户反馈', icon: MessageSquare },
    { path: '/announcements', label: '公告管理', icon: Megaphone },
    { path: '/future-letters', label: '时光信审核', icon: Mail },
    { path: '/config-templates', label: '配置模板', icon: FileCode },
    { path: '/workflows', label: '工作流管理', icon: GitBranch },
    { path: '/mcp-registry', label: 'MCP 注册', icon: Plug },
    { path: '/settings', label: '站点设置', icon: Settings },
];

export default function Layout({ children, onLogout }: { children: ReactNode, onLogout: () => void }) {
    const location = useLocation();
    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('admin-dark-mode');
        if (saved !== null) return saved === 'true';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('admin-dark-mode', String(darkMode));
    }, [darkMode]);

    const handleLogout = () => {
        setAuthToken(null);
        onLogout();
    };

    return (
        <div className="flex h-screen bg-gray-100 dark:bg-slate-900 transition-colors duration-300">
            {/* Sidebar */}
            <div className="w-64 bg-gray-900 dark:bg-slate-950 text-white flex flex-col">
                <div className="p-6 border-b border-gray-800 dark:border-slate-800 bg-gradient-to-r from-blue-600 to-purple-600">
                    <h1 className="text-2xl font-bold">Admin Panel</h1>
                    <p className="text-sm text-blue-200 mt-1">管理员后台</p>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    {navItems.map(item => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                                    ? 'bg-blue-500 text-white'
                                    : 'text-gray-300 hover:bg-gray-800 dark:hover:bg-slate-800'
                                    }`}
                            >
                                <Icon size={20} />
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-gray-800 dark:border-slate-800 space-y-2">
                    <button
                        onClick={() => setDarkMode(!darkMode)}
                        className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-gray-300 hover:bg-gray-800 dark:hover:bg-slate-800 transition-colors"
                    >
                        {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                        <span className="font-medium">{darkMode ? '浅色模式' : '深色模式'}</span>
                    </button>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-gray-300 hover:bg-gray-800 dark:hover:bg-slate-800 transition-colors"
                    >
                        <LogOut size={20} />
                        <span className="font-medium">退出登录</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                <div className="p-8">
                    {children}
                </div>
            </div>

            {/* Undo Toast Notifications */}
            <UndoToast />
        </div>
    );
}
