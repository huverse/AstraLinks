import { useEffect, useState } from 'react';
import { adminAPI } from '../services/api';
import { Save, FileText, RefreshCw, Shield, Key, Globe } from 'lucide-react';

export default function Settings() {
    const [termsContent, setTermsContent] = useState('');
    const [privacyContent, setPrivacyContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'terms' | 'privacy' | 'security'>('terms');

    // Security settings
    const [turnstileSiteEnabled, setTurnstileSiteEnabled] = useState(false);
    const [turnstileLoginEnabled, setTurnstileLoginEnabled] = useState(false);
    const [turnstileSiteKey, setTurnstileSiteKey] = useState('0x4AAAAAACHmC6NQQ8IJpFD8');

    const loadSettings = async () => {
        setLoading(true);
        try {
            const [termsData, privacyData] = await Promise.all([
                adminAPI.getSetting('user_agreement'),
                adminAPI.getSetting('privacy_policy')
            ]);
            setTermsContent(termsData.setting?.setting_value || '');
            setPrivacyContent(privacyData.setting?.setting_value || '');

            // Load security settings
            const [siteEnabled, loginEnabled, siteKey] = await Promise.all([
                adminAPI.getSetting('turnstile_site_enabled'),
                adminAPI.getSetting('turnstile_login_enabled'),
                adminAPI.getSetting('turnstile_site_key')
            ]);
            setTurnstileSiteEnabled(siteEnabled.setting?.setting_value === 'true');
            setTurnstileLoginEnabled(loginEnabled.setting?.setting_value === 'true');
            if (siteKey.setting?.setting_value) {
                setTurnstileSiteKey(siteKey.setting.setting_value);
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadSettings(); }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            if (activeTab === 'terms') {
                await adminAPI.updateSetting('user_agreement', termsContent);
            } else if (activeTab === 'privacy') {
                await adminAPI.updateSetting('privacy_policy', privacyContent);
            } else if (activeTab === 'security') {
                await Promise.all([
                    adminAPI.updateSetting('turnstile_site_enabled', String(turnstileSiteEnabled)),
                    adminAPI.updateSetting('turnstile_login_enabled', String(turnstileLoginEnabled)),
                    adminAPI.updateSetting('turnstile_site_key', turnstileSiteKey)
                ]);
            }
            alert('保存成功');
        } catch (err: any) {
            alert('保存失败：' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const defaultTerms = `# 用户协议

欢迎使用本服务。请仔细阅读以下条款：

## 1. 服务条款

使用本服务即表示您同意遵守本协议的所有条款和条件。

## 2. 用户责任

- 您需要对自己的账户和密码保密负责
- 禁止将账户用于任何非法活动
- 禁止分享或转让账户

## 3. 内容规范

- 禁止发布违法、暴力、色情等不当内容
- 禁止发布侵犯他人权益的内容
- 禁止发布垃圾信息或广告

## 4. 免责声明

本服务按"现状"提供，不作任何明示或暗示的保证。

## 5. 条款修改

我们保留随时修改本协议的权利，修改后的协议将在网站上公布。

---

最后更新：${new Date().toLocaleDateString('zh-CN')}
`;

    const defaultPrivacy = `# 隐私政策

我们非常重视您的隐私。本政策说明我们如何收集、使用和保护您的信息。

## 收集的信息

- 注册信息：用户名、邮箱等
- 使用数据：访问日志、功能使用情况

## 信息用途

- 提供和改进服务
- 发送重要通知
- 防止滥用

## 信息保护

我们采取适当的技术和管理措施保护您的信息安全。

## 联系我们

如有任何问题，请联系管理员。

---

最后更新：${new Date().toLocaleDateString('zh-CN')}
`;

    return (
        <div className="text-gray-900 dark:text-gray-100">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">站点设置</h1>
                <button
                    onClick={loadSettings}
                    className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                    <RefreshCw size={18} />
                    刷新
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 flex-wrap">
                <button
                    onClick={() => setActiveTab('terms')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${activeTab === 'terms'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600'
                        }`}
                >
                    <FileText size={18} />
                    用户协议
                </button>
                <button
                    onClick={() => setActiveTab('privacy')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${activeTab === 'privacy'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600'
                        }`}
                >
                    <FileText size={18} />
                    隐私政策
                </button>
                <button
                    onClick={() => setActiveTab('security')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${activeTab === 'security'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600'
                        }`}
                >
                    <Shield size={18} />
                    安全设置
                </button>
            </div>

            {/* Editor */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
                {loading ? (
                    <div className="text-center py-20 text-gray-500 dark:text-gray-400">加载中...</div>
                ) : activeTab === 'security' ? (
                    /* Security Settings Panel */
                    <div className="p-6 space-y-6">
                        <div className="border-b border-gray-200 dark:border-slate-700 pb-4 mb-4">
                            <h2 className="text-xl font-semibold flex items-center gap-2">
                                <Shield size={24} className="text-blue-500" />
                                Cloudflare Turnstile 人机验证
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                配置 Cloudflare Turnstile 以保护网站免受机器人攻击
                            </p>
                        </div>

                        {/* Site Key */}
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                <Key size={16} />
                                站点密钥 (Site Key)
                            </label>
                            <input
                                type="text"
                                value={turnstileSiteKey}
                                onChange={e => setTurnstileSiteKey(e.target.value)}
                                placeholder="0x4AAAAAACHmC6NQQ8IJpFD8"
                                className="w-full px-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                            />
                            <p className="text-xs text-gray-500">从 Cloudflare Dashboard 获取</p>
                        </div>

                        {/* Site-wide Protection Toggle */}
                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-900 rounded-lg">
                            <div className="flex items-center gap-3">
                                <Globe size={24} className="text-orange-500" />
                                <div>
                                    <h3 className="font-medium">全站入口验证</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        用户必须通过验证才能访问网站任何页面
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setTurnstileSiteEnabled(!turnstileSiteEnabled)}
                                className={`relative w-14 h-8 rounded-full transition-colors ${turnstileSiteEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'
                                    }`}
                            >
                                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${turnstileSiteEnabled ? 'translate-x-7' : 'translate-x-1'
                                    }`} />
                            </button>
                        </div>

                        {/* Login/Register Protection Toggle */}
                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-900 rounded-lg">
                            <div className="flex items-center gap-3">
                                <Shield size={24} className="text-blue-500" />
                                <div>
                                    <h3 className="font-medium">登录/注册验证</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        登录和注册表单需要通过人机验证
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setTurnstileLoginEnabled(!turnstileLoginEnabled)}
                                className={`relative w-14 h-8 rounded-full transition-colors ${turnstileLoginEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'
                                    }`}
                            >
                                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${turnstileLoginEnabled ? 'translate-x-7' : 'translate-x-1'
                                    }`} />
                            </button>
                        </div>

                        {/* Warning */}
                        {turnstileSiteEnabled && (
                            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                    ⚠️ 全站入口验证已启用。所有用户（包括已登录用户）在每次会话开始时都需要完成验证。
                                </p>
                            </div>
                        )}

                        {/* Save Button */}
                        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-slate-700">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                <Save size={18} />
                                {saving ? '保存中...' : '保存设置'}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Terms/Privacy Editor */
                    <div className="p-6">
                        <div className="mb-4">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                支持 Markdown 格式。{activeTab === 'terms' ? '此内容将在用户注册时显示。' : '此内容用于隐私政策页面。'}
                            </p>
                        </div>

                        <textarea
                            value={activeTab === 'terms' ? termsContent : privacyContent}
                            onChange={e => activeTab === 'terms'
                                ? setTermsContent(e.target.value)
                                : setPrivacyContent(e.target.value)
                            }
                            rows={20}
                            className="w-full px-4 py-3 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm resize-none bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100"
                            placeholder={activeTab === 'terms' ? defaultTerms : defaultPrivacy}
                        />

                        <div className="flex justify-between items-center mt-4">
                            <button
                                onClick={() => {
                                    if (confirm('确定使用默认模板覆盖当前内容？')) {
                                        if (activeTab === 'terms') {
                                            setTermsContent(defaultTerms);
                                        } else {
                                            setPrivacyContent(defaultPrivacy);
                                        }
                                    }
                                }}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                使用默认模板
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                <Save size={18} />
                                {saving ? '保存中...' : '保存'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Preview (only for terms/privacy) */}
            {(activeTab === 'terms' || activeTab === 'privacy') && (
                <div className="mt-8 bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
                    <div className="p-4 bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                        <h3 className="font-semibold">预览</h3>
                    </div>
                    <div className="p-6 prose dark:prose-invert max-w-none">
                        <div
                            dangerouslySetInnerHTML={{
                                __html: (activeTab === 'terms' ? termsContent : privacyContent)
                                    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                                    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                                    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                                    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
                                    .replace(/\*(.*)\*/gim, '<em>$1</em>')
                                    .replace(/^- (.*$)/gim, '<li>$1</li>')
                                    .replace(/\n/gim, '<br />')
                                    .replace(/---/gim, '<hr />')
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
