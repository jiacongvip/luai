
import React, { useState, useEffect } from 'react';
import { CreditCard, Check, Zap, History, X, Loader2, AlertCircle, Download, Upload, QrCode } from 'lucide-react';
import { User, Language } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { translations } from '../utils/translations';
import { api } from '../utils/api';

interface BillingProps {
  user: User;
  language: Language;
  onUpdateCredits?: (newCredits: number) => void;
}

interface Transaction {
  id: string;
  amount: number;
  balanceAfter: number;
  type: string;
  referenceId: string;
  description: string;
  createdAt: string;
}

interface Plan {
  id: string;
  name: string;
  nameZh?: string;
  price: number;
  credits: number;
  popular?: boolean;
  features: string[];
  featuresZh?: string[];
}

const Billing: React.FC<BillingProps> = ({ user, language, onUpdateCredits }) => {
  const t = translations[language]?.billing || translations['en'].billing;
  const tCommon = translations[language]?.common || translations['en'].common;

  // 状态
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(user.credits);
  const [subscription, setSubscription] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [usageData, setUsageData] = useState<any[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  
  // 弹窗状态
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'alipay' | 'wechat' | 'stripe'>('alipay');
  const [processing, setProcessing] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // 加载数据
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [balanceData, transData, usageResult, plansData] = await Promise.all([
        api.billing.getBalance(),
        api.billing.getTransactions({ limit: 10 }),
        api.billing.getUsage('7d'),
        api.billing.getPlans(),
      ]);

      setBalance(balanceData.credits);
      setSubscription(balanceData.subscription);
      setTransactions(transData.transactions || []);
      setUsageData(usageResult.data || []);
      setPlans(plansData || []);
    } catch (err: any) {
      console.error('Failed to load billing data:', err);
      // 使用默认数据
      setPlans([
        { id: 'starter', name: 'Starter', nameZh: '入门版', price: 10, credits: 100, features: ['Access to Standard Agents', 'Basic Support'], featuresZh: ['使用标准智能体', '基础支持'] },
        { id: 'pro', name: 'Pro', nameZh: '专业版', price: 50, credits: 600, popular: true, features: ['Access to all Expert Agents', 'Priority Support', '100 Bonus Credits'], featuresZh: ['使用所有专家智能体', '优先支持', '赠送100积分'] },
        { id: 'enterprise', name: 'Enterprise', nameZh: '企业版', price: 200, credits: 2500, features: ['Custom Agent Creation', 'API Access', 'Dedicated Account Manager'], featuresZh: ['自定义智能体', 'API访问', '专属客户经理'] },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // 创建充值订单
  const handleRecharge = async (plan: Plan) => {
    setSelectedPlan(plan);
    setShowRechargeModal(true);
    setPaymentInfo(null);
    setError(null);
  };

  // 确认支付
  const confirmPayment = async () => {
    if (!selectedPlan) return;
    
    try {
      setProcessing(true);
      setError(null);
      
      const result = await api.billing.createRecharge({
        planId: selectedPlan.id,
        paymentMethod,
        amount: selectedPlan.price,
        credits: selectedPlan.credits,
      });

      setPaymentInfo(result.paymentInfo);
    } catch (err: any) {
      setError(err.message || 'Failed to create payment');
    } finally {
      setProcessing(false);
    }
  };

  // 模拟支付完成（开发环境）
  const simulatePayment = async () => {
    if (!paymentInfo?.orderId) return;
    
    try {
      setProcessing(true);
      const result = await api.billing.simulatePayment(paymentInfo.orderId);
      
      if (result.success) {
        setBalance(result.newBalance);
        if (onUpdateCredits) onUpdateCredits(result.newBalance);
        setShowRechargeModal(false);
        setPaymentInfo(null);
        loadData(); // 重新加载数据
      }
    } catch (err: any) {
      setError(err.message || 'Payment simulation failed');
    } finally {
      setProcessing(false);
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // 格式化金额
  const formatAmount = (amount: number, type: string) => {
    if (type === 'DEPOSIT') {
      return `+${amount.toFixed(2)}`;
    }
    return `-${Math.abs(amount).toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 min-h-full bg-background overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <h1 className="text-3xl font-bold text-textMain">{t.title}</h1>

        {/* Current Balance */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-1 md:col-span-2 bg-gradient-to-r from-blue-900 to-slate-900 rounded-2xl p-8 border border-border relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            <div className="relative z-10">
              <p className="text-blue-300 font-medium mb-2">{t.currentBalance}</p>
              <h2 className="text-5xl font-bold text-white mb-6">
                {balance.toFixed(2)} <span className="text-2xl text-slate-400 font-normal">{tCommon.credits}</span>
              </h2>
              <div className="flex gap-4">
                <button 
                  onClick={() => handleRecharge(plans.find(p => p.popular) || plans[1] || plans[0])}
                  className="bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/20 transition-all flex items-center gap-2"
                >
                  <Zap size={18} />
                  {t.quickRecharge}
                </button>
                <button className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-medium transition-all">
                  {t.manageSub}
                </button>
              </div>
              
              {subscription && (
                <div className="mt-4 p-3 bg-white/5 rounded-lg">
                  <p className="text-sm text-blue-200">
                    {language === 'zh' ? '当前订阅' : 'Current Plan'}: <span className="font-semibold text-white">{subscription.planId}</span>
                    {subscription.currentPeriodEnd && (
                      <span className="ml-2 text-slate-400">
                        ({language === 'zh' ? '到期' : 'expires'}: {formatDate(subscription.currentPeriodEnd)})
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-textMain font-semibold mb-1">{t.usageTrend}</h3>
              <p className="text-xs text-textSecondary mb-4">{t.last7Days}</p>
            </div>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageData.length > 0 ? usageData : [
                  { period: 'Mon', totalCredits: 40 },
                  { period: 'Tue', totalCredits: 30 },
                  { period: 'Wed', totalCredits: 20 },
                  { period: 'Thu', totalCredits: 27 },
                  { period: 'Fri', totalCredits: 18 },
                  { period: 'Sat', totalCredits: 23 },
                  { period: 'Sun', totalCredits: 34 },
                ]}>
                  <XAxis 
                    dataKey="period" 
                    tick={{fontSize: 10, fill: 'var(--color-text-secondary)'}} 
                    axisLine={false} 
                    tickLine={false}
                    tickFormatter={(value) => {
                      if (typeof value === 'string' && value.includes('T')) {
                        return new Date(value).toLocaleDateString('en', { weekday: 'short' });
                      }
                      return value;
                    }}
                  />
                  <Tooltip 
                    contentStyle={{backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--color-text-main)'}}
                    itemStyle={{color: 'var(--color-text-main)'}}
                    cursor={{fill: 'var(--color-text-secondary)', opacity: 0.1}}
                    formatter={(value: number) => [`${value.toFixed(2)} credits`, language === 'zh' ? '使用量' : 'Usage']}
                  />
                  <Bar dataKey="totalCredits" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Pricing Plans */}
        <div>
          <h2 className="text-xl font-bold text-textMain mb-6">{t.buyCredits}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div key={plan.id} className={`relative bg-surface rounded-2xl p-6 border ${plan.popular ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
                {plan.popular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    {t.mostPopular}
                  </div>
                )}
                <h3 className="text-lg font-medium text-textSecondary mb-2">
                  {language === 'zh' ? (plan.nameZh || plan.name) : plan.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-bold text-textMain">${plan.price}</span>
                  <span className="text-textSecondary">/ {plan.credits} {tCommon.credits}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {(language === 'zh' ? (plan.featuresZh || plan.features) : plan.features).map((feature, fIdx) => (
                    <li key={fIdx} className="flex items-center gap-3 text-sm text-textSecondary">
                      <div className="w-5 h-5 rounded-full bg-background flex items-center justify-center text-primary">
                        <Check size={12} strokeWidth={3} />
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button 
                  onClick={() => handleRecharge(plan)}
                  className={`w-full py-3 rounded-xl font-bold transition-colors ${plan.popular ? 'bg-primary hover:bg-primary-hover text-white' : 'bg-background hover:brightness-95 text-textMain'}`}
                >
                  {t.purchase}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <h3 className="font-bold text-textMain">{t.recentTrans}</h3>
            <button className="text-sm text-primary hover:underline flex items-center gap-1">
              <History size={14} /> {t.viewAll}
            </button>
          </div>
          <table className="w-full text-left text-sm text-textSecondary">
            <thead className="bg-background text-xs uppercase font-medium">
              <tr>
                <th className="px-6 py-3">{t.date}</th>
                <th className="px-6 py-3">{t.desc}</th>
                <th className="px-6 py-3">{t.amount}</th>
                <th className="px-6 py-3">{t.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.length > 0 ? transactions.map((txn) => (
                <tr key={txn.id} className="hover:bg-background transition-colors">
                  <td className="px-6 py-4">{formatDate(txn.createdAt)}</td>
                  <td className="px-6 py-4 text-textMain">{txn.description || txn.type}</td>
                  <td className={`px-6 py-4 ${txn.amount > 0 ? 'text-green-500' : ''}`}>
                    {formatAmount(txn.amount, txn.type)} {tCommon.credits}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-full bg-green-500/10 text-green-500 text-xs">
                      {t.completed}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-textSecondary">
                    {language === 'zh' ? '暂无交易记录' : 'No transactions yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* 充值弹窗 */}
      {showRechargeModal && selectedPlan && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-textMain">
                {language === 'zh' ? '充值积分' : 'Recharge Credits'}
              </h3>
              <button 
                onClick={() => { setShowRechargeModal(false); setPaymentInfo(null); }}
                className="text-textSecondary hover:text-textMain"
              >
                <X size={20} />
              </button>
            </div>

            {/* 套餐信息 */}
            <div className="bg-background rounded-xl p-4 mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-textMain">
                    {language === 'zh' ? (selectedPlan.nameZh || selectedPlan.name) : selectedPlan.name}
                  </p>
                  <p className="text-sm text-textSecondary">{selectedPlan.credits} {tCommon.credits}</p>
                </div>
                <p className="text-2xl font-bold text-primary">${selectedPlan.price}</p>
              </div>
            </div>

            {!paymentInfo ? (
              <>
                {/* 支付方式选择 */}
                <div className="mb-6">
                  <p className="text-sm text-textSecondary mb-3">
                    {language === 'zh' ? '选择支付方式' : 'Select Payment Method'}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'alipay', name: '支付宝', nameEn: 'Alipay', color: 'bg-blue-500' },
                      { id: 'wechat', name: '微信支付', nameEn: 'WeChat', color: 'bg-green-500' },
                      { id: 'stripe', name: 'Stripe', nameEn: 'Stripe', color: 'bg-purple-500' },
                    ].map((method) => (
                      <button
                        key={method.id}
                        onClick={() => setPaymentMethod(method.id as any)}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          paymentMethod === method.id 
                            ? 'border-primary bg-primary/10' 
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className={`w-8 h-8 ${method.color} rounded-lg mx-auto mb-2`}></div>
                        <p className="text-xs text-textMain">
                          {language === 'zh' ? method.name : method.nameEn}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-500 text-sm">
                    <AlertCircle size={16} />
                    {error}
                  </div>
                )}

                <button
                  onClick={confirmPayment}
                  disabled={processing}
                  className="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {processing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {language === 'zh' ? '处理中...' : 'Processing...'}
                    </>
                  ) : (
                    <>
                      <CreditCard size={18} />
                      {language === 'zh' ? '确认支付' : 'Confirm Payment'}
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                {/* 支付二维码/信息 */}
                <div className="text-center mb-6">
                  <div className="w-48 h-48 bg-white rounded-xl mx-auto mb-4 flex items-center justify-center">
                    <QrCode size={120} className="text-slate-400" />
                  </div>
                  <p className="text-sm text-textSecondary">
                    {language === 'zh' ? '请使用支付App扫描二维码' : 'Scan QR code with payment app'}
                  </p>
                  <p className="text-xs text-textSecondary mt-2">
                    {language === 'zh' ? '订单号' : 'Order ID'}: {paymentInfo.orderId}
                  </p>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-500 text-sm">
                    <AlertCircle size={16} />
                    {error}
                  </div>
                )}

                {/* 开发环境模拟支付按钮 */}
                <button
                  onClick={simulatePayment}
                  disabled={processing}
                  className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {processing ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {language === 'zh' ? '处理中...' : 'Processing...'}
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      {language === 'zh' ? '模拟支付完成（开发环境）' : 'Simulate Payment (Dev)'}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
