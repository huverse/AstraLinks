import { useState } from 'react';
import { adminAPI, setAuthToken } from '../services/api';
import { LogIn } from 'lucide-react';

export default function Login({ onLogin }: { onLogin: () => void }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const data = await adminAPI.login(username, password);

            if (!data.user?.isAdmin) {
                setError('只有管理员可以登录后台');
                return;
            }

            setAuthToken(data.token);
            onLogin();
        } catch (err: any) {
            setError(err.message || '登录失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
                <div className="flex items-center justify-center mb-8">
                    <div className="bg-blue-500 p-3 rounded-full">
                        <LogIn className="text-white" size={32} />
                    </div>
                </div>

                <h1 className="text-3xl font-bold text-center mb-2">管理员后台</h1>
                <p className="text-gray-500 text-center mb-8">Admin Panel</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">用户名</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            placeholder="输入管理员用户名"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">密码</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            placeholder="输入密码"
                            required
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
                    >
                        {loading ? '登录中...' : '登录'}
                    </button>
                </form>
            </div>
        </div>
    );
}
