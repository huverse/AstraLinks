/**
 * Future Letters - Physical Letter Form
 */

import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, FileText, Loader2, MapPin, Package } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE } from '../../utils/api';
import type {
    PhysicalOptionItem,
    PhysicalOptionsResponse,
    PhysicalOrderResponse,
    PricingResponse,
} from './types';

interface PhysicalLetterFormProps {
    letterId: string;
    onCreated?: (order: PhysicalOrderResponse) => void;
}

const DEFAULT_COUNTRY = 'CN';

export default function PhysicalLetterForm({ letterId, onCreated }: PhysicalLetterFormProps) {
    const { token } = useAuth();
    const [recipientName, setRecipientName] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [recipientAddress, setRecipientAddress] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [country, setCountry] = useState(DEFAULT_COUNTRY);
    const [paperTypes, setPaperTypes] = useState<PhysicalOptionItem[]>([]);
    const [envelopeTypes, setEnvelopeTypes] = useState<PhysicalOptionItem[]>([]);
    const [paperType, setPaperType] = useState('');
    const [envelopeType, setEnvelopeType] = useState('');
    const [pricing, setPricing] = useState<PricingResponse | null>(null);
    const [isLoadingOptions, setIsLoadingOptions] = useState(false);
    const [isPricing, setIsPricing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pricingError, setPricingError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const loadOptions = async () => {
        setIsLoadingOptions(true);
        setError(null);

        try {
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/api/future/physical/options`, {
                credentials: 'include',
                headers,
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error?.message || '加载选项失败');
            }

            const data = (await response.json()) as PhysicalOptionsResponse;
            setPaperTypes(data.paperTypes || []);
            setEnvelopeTypes(data.envelopeTypes || []);

            if (!paperType && data.paperTypes?.length) {
                setPaperType(data.paperTypes[0].value);
            }

            if (!envelopeType && data.envelopeTypes?.length) {
                setEnvelopeType(data.envelopeTypes[0].value);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载选项失败');
        } finally {
            setIsLoadingOptions(false);
        }
    };

    const fetchPricing = async () => {
        if (!paperType || !envelopeType) {
            setPricing(null);
            setIsPricing(false);
            return;
        }

        setIsPricing(true);
        setPricingError(null);

        try {
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const params = new URLSearchParams();
            if (paperType) params.set('paperType', paperType);
            if (envelopeType) params.set('envelopeType', envelopeType);
            if (country) params.set('country', country);

            const response = await fetch(`${API_BASE}/api/future/physical/pricing?${params.toString()}`, {
                credentials: 'include',
                headers,
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error?.message || '获取计价失败');
            }

            setPricing(data);
        } catch (err) {
            setPricingError(err instanceof Error ? err.message : '获取计价失败');
            setPricing(null);
        } finally {
            setIsPricing(false);
        }
    };

    useEffect(() => {
        loadOptions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchPricing();
        }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paperType, envelopeType, country, token]);

    const isSubmitDisabled = useMemo(() => {
        return (
            isSubmitting ||
            !recipientName.trim() ||
            !recipientAddress.trim() ||
            !paperType ||
            !envelopeType
        );
    }, [isSubmitting, recipientName, recipientAddress, paperType, envelopeType]);

    const handleSubmit = async () => {
        if (isSubmitDisabled) return;

        setIsSubmitting(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/api/future/physical/orders`, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({
                    letterId,
                    recipientName,
                    recipientAddress,
                    recipientPhone: recipientPhone || undefined,
                    postalCode: postalCode || undefined,
                    country,
                    paperType,
                    envelopeType,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error?.message || '提交订单失败');
            }

            setSuccessMessage('订单提交成功');
            onCreated?.(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : '提交订单失败');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 text-white">
            {error && (
                <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200">
                    {error}
                </div>
            )}

            {successMessage && (
                <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-xl text-green-200">
                    {successMessage}
                </div>
            )}

            <section className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-4">
                <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-medium">收件人信息</h3>
                </div>
                <div className="space-y-3">
                    <input
                        type="text"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="收件人姓名 *"
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                    />
                    <input
                        type="tel"
                        value={recipientPhone}
                        onChange={(e) => setRecipientPhone(e.target.value)}
                        placeholder="联系电话（可选）"
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                    />
                    <textarea
                        value={recipientAddress}
                        onChange={(e) => setRecipientAddress(e.target.value)}
                        placeholder="详细地址 *"
                        rows={3}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="text"
                            value={postalCode}
                            onChange={(e) => setPostalCode(e.target.value)}
                            placeholder="邮政编码（可选）"
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                        />
                        <input
                            type="text"
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            placeholder="国家/地区"
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                        />
                    </div>
                </div>
            </section>

            <section className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-4">
                <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <h3 className="font-medium">纸张与信封</h3>
                </div>
                {isLoadingOptions ? (
                    <div className="flex items-center gap-2 text-white/60">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        加载选项中...
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3">
                        <select
                            value={paperType}
                            onChange={(e) => setPaperType(e.target.value)}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                        >
                            <option value="" disabled>请选择纸张类型</option>
                            {paperTypes.map((option) => (
                                <option key={option.value} value={option.value} className="bg-slate-800">
                                    {option.label}{option.price ? ` (+${option.price} CNY)` : ''}
                                </option>
                            ))}
                        </select>
                        <select
                            value={envelopeType}
                            onChange={(e) => setEnvelopeType(e.target.value)}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                        >
                            <option value="" disabled>请选择信封类型</option>
                            {envelopeTypes.map((option) => (
                                <option key={option.value} value={option.value} className="bg-slate-800">
                                    {option.label}{option.price ? ` (+${option.price} CNY)` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </section>

            <section className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3">
                <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-amber-400" />
                    <h3 className="font-medium">费用预估</h3>
                </div>
                {isPricing && (
                    <div className="flex items-center gap-2 text-white/60">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        计算中...
                    </div>
                )}
                {pricingError && (
                    <div className="text-sm text-red-300">{pricingError}</div>
                )}
                {!isPricing && !pricingError && !pricing && (
                    <div className="text-sm text-white/50">请选择纸张与信封以计算费用。</div>
                )}
                {pricing && (
                    <div className="space-y-2 text-sm text-white/80">
                        <div className="flex items-center justify-between">
                            <span>基础费用</span>
                            <span>{pricing.baseFee.toFixed(2)} {pricing.currency}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>纸张费用</span>
                            <span>{pricing.paperFee.toFixed(2)} {pricing.currency}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>信封费用</span>
                            <span>{pricing.envelopeFee.toFixed(2)} {pricing.currency}</span>
                        </div>
                        <div className="flex items-center justify-between font-semibold text-white">
                            <span>合计</span>
                            <span>{pricing.totalFee.toFixed(2)} {pricing.currency}</span>
                        </div>
                    </div>
                )}
            </section>

            <button
                onClick={handleSubmit}
                disabled={isSubmitDisabled}
                className="w-full py-3 px-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-medium flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/30 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                    <Package className="w-5 h-5" />
                )}
                {isSubmitting ? '提交中...' : '提交实体信订单'}
            </button>
        </div>
    );
}
