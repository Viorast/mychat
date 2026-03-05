'use client';

import { useState, useEffect, useCallback } from 'react';

const TABS = [
    { id: 'openrouter', label: 'OpenRouter AI', icon: '🤖' },
    { id: 'gemini', label: 'Gemini AI', icon: '✨' },
    { id: 'database', label: 'Database Context', icon: '🗄️' },
    { id: 'chat', label: 'Chat Settings', icon: '⚙️' },
    { id: 'tips', label: 'Saran & Info', icon: '💡' },
];

function InputField({ label, id, type = 'text', value, onChange, placeholder, hint }) {
    return (
        <div className="mb-5">
            <label htmlFor={id} className="block text-sm font-semibold text-gray-700 mb-1">
                {label}
            </label>
            <input
                id={id}
                type={type}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 transition"
            />
            {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
        </div>
    );
}

function SectionCard({ title, children }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
            <h3 className="text-base font-bold text-gray-800 mb-4 pb-2 border-b border-gray-100">{title}</h3>
            {children}
        </div>
    );
}

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('openrouter');
    const [settings, setSettings] = useState({
        openrouter_api_key: '',
        openrouter_model: '',
        openrouter_vision_model: '',
        gemini_api_key: '',
        gemini_model: '',
        active_database_context: 'SDA',
        max_history_messages: '10',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null); // { type: 'success'|'error', message }

    // Changed fields tracker (untuk tau mana yg diubah user)
    const [changedKeys, setChangedKeys] = useState(new Set());

    const showToast = (type, message) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    };

    const fetchSettings = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/settings');
            const data = await res.json();
            if (data.success) {
                setSettings(prev => ({ ...prev, ...data.settings }));
            } else {
                showToast('error', data.error || 'Gagal memuat settings');
            }
        } catch {
            showToast('error', 'Gagal memuat settings dari server');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    const handleChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setChangedKeys(prev => new Set([...prev, key]));
    };

    const handleSave = async () => {
        if (changedKeys.size === 0) {
            showToast('error', 'Tidak ada perubahan untuk disimpan');
            return;
        }

        // Build payload hanya dari key yg berubah
        const payload = {};
        for (const key of changedKeys) {
            payload[key] = settings[key];
        }

        try {
            setSaving(true);
            const res = await fetch('/api/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                showToast('success', `✅ Settings berhasil disimpan (${data.updated?.join(', ')})`);
                setChangedKeys(new Set());
                await fetchSettings(); // Refresh untuk tampilkan nilai terbaru (masked)
            } else {
                showToast('error', data.error || 'Gagal menyimpan settings');
            }
        } catch {
            showToast('error', 'Terjadi kesalahan jaringan');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
            {/* Toast Notification */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all
          ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <a href="/" className="p-2 hover:bg-gray-100 rounded-lg transition" title="Kembali">
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </a>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">⚙️ Admin Settings</h1>
                            <p className="text-xs text-gray-400">Konfigurasi AI, database, dan perilaku sistem</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving || changedKeys.size === 0}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed
              text-white text-sm font-semibold rounded-xl transition shadow-sm flex items-center gap-2"
                    >
                        {saving ? (
                            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Menyimpan...</>
                        ) : (
                            <><span>💾</span> Simpan{changedKeys.size > 0 ? ` (${changedKeys.size})` : ''}</>
                        )}
                    </button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-6 py-6">
                {/* Tabs */}
                <div className="flex gap-2 mb-6 bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all
                ${activeTab === tab.id
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            <span>{tab.icon}</span>
                            <span>{tab.label}</span>
                            {changedKeys.size > 0 && [...changedKeys].some(k => {
                                const tabKeys = {
                                    openrouter: ['openrouter_api_key', 'openrouter_model', 'openrouter_vision_model'],
                                    gemini: ['gemini_api_key', 'gemini_model'],
                                    database: ['active_database_context'],
                                    chat: ['max_history_messages'],
                                };
                                return tabKeys[tab.id]?.includes(k);
                            }) && (
                                    <span className="w-2 h-2 bg-orange-400 rounded-full" />
                                )}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'openrouter' && (
                    <>
                        <SectionCard title="🤖 OpenRouter AI">
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 text-sm text-blue-700">
                                OpenRouter digunakan sebagai AI utama. Dapatkan API key di{' '}
                                <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="underline font-semibold">
                                    openrouter.ai/keys
                                </a>
                            </div>
                            <InputField
                                label="API Key"
                                id="or_api_key"
                                type="password"
                                value={settings.openrouter_api_key}
                                onChange={e => handleChange('openrouter_api_key', e.target.value)}
                                placeholder="sk-or-v1-..."
                                hint="Masukkan API key baru untuk mengganti. Nilai saat ini disembunyikan."
                            />
                            <InputField
                                label="Model (Text)"
                                id="or_model"
                                value={settings.openrouter_model}
                                onChange={e => handleChange('openrouter_model', e.target.value)}
                                placeholder="stepfun/step-3.5-flash:free"
                                hint="Contoh: meta-llama/llama-3.3-70b-instruct:free, deepseek/deepseek-r1:free"
                            />
                            <InputField
                                label="Vision Model (untuk gambar)"
                                id="or_vision_model"
                                value={settings.openrouter_vision_model}
                                onChange={e => handleChange('openrouter_vision_model', e.target.value)}
                                placeholder="google/gemma-3-12b-it:free"
                                hint="Model yang digunakan ketika user mengirim gambar."
                            />
                        </SectionCard>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                            <strong>💡 Model Gratis Rekomendasi:</strong>
                            <ul className="mt-2 list-disc list-inside space-y-1 text-xs">
                                <li>stepfun/step-3.5-flash:free – Cepat, bagus untuk bahasa Indonesia</li>
                                <li>meta-llama/llama-3.3-70b-instruct:free – Kuat untuk SQL & reasoning</li>
                                <li>deepseek/deepseek-r1:free – Reasoning mendalam (lambat)</li>
                                <li>google/gemma-3-12b-it:free – Bagus untuk vision/multimodal</li>
                            </ul>
                        </div>
                    </>
                )}

                {activeTab === 'gemini' && (
                    <>
                        <SectionCard title="✨ Gemini AI">
                            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-5 text-sm text-purple-700">
                                Gemini digunakan sebagai fallback saat OpenRouter error/rate limit, dan untuk embedding RAG. Dapatkan API key di{' '}
                                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline font-semibold">
                                    Google AI Studio
                                </a>
                            </div>
                            <InputField
                                label="API Key"
                                id="gem_api_key"
                                type="password"
                                value={settings.gemini_api_key}
                                onChange={e => handleChange('gemini_api_key', e.target.value)}
                                placeholder="AIza..."
                                hint="Masukkan API key baru untuk mengganti. Nilai saat ini disembunyikan."
                            />
                            <InputField
                                label="Model"
                                id="gem_model"
                                value={settings.gemini_model}
                                onChange={e => handleChange('gemini_model', e.target.value)}
                                placeholder="gemini-2.5-flash"
                                hint="Contoh: gemini-2.0-flash, gemini-2.5-flash, gemini-1.5-pro"
                            />
                        </SectionCard>
                    </>
                )}

                {activeTab === 'database' && (
                    <>
                        <SectionCard title="🗄️ Database Context Aktif">
                            <p className="text-sm text-gray-500 mb-5">
                                Pilih schema database yang diakses AI. Perubahan berlaku pada chat berikutnya.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                    {
                                        key: 'SDA',
                                        label: 'Schema SDA',
                                        desc: 'Data internal perusahaan: absensi karyawan, tiket pekerjaan, aduan nossa pelanggan.',
                                        icon: '🏢',
                                        color: 'blue',
                                        tables: ['log_absen', 'm_ticket', 'nossa_closed'],
                                    },
                                    {
                                        key: 'DVO',
                                        label: 'Schema DVO',
                                        desc: 'Monitoring jaringan pelanggan: Access Point, status perangkat, trafik, data pelanggan.',
                                        icon: '📡',
                                        color: 'green',
                                        tables: ['ap_detail', 'ap_status', 'customer_data', 'traffic_log'],
                                    },
                                ].map(db => (
                                    <button
                                        key={db.key}
                                        onClick={() => handleChange('active_database_context', db.key)}
                                        className={`relative text-left p-5 rounded-2xl border-2 transition-all
                      ${settings.active_database_context === db.key
                                                ? db.color === 'blue'
                                                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                                                    : 'border-green-500 bg-green-50 shadow-sm'
                                                : 'border-gray-200 bg-white hover:border-gray-300'
                                            }`}
                                    >
                                        {settings.active_database_context === db.key && (
                                            <span className="absolute top-3 right-3 text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                                ✓ Aktif
                                            </span>
                                        )}
                                        <div className="text-2xl mb-2">{db.icon}</div>
                                        <div className="font-bold text-gray-800 mb-1">{db.label}</div>
                                        <div className="text-sm text-gray-500 mb-3">{db.desc}</div>
                                        <div className="flex flex-wrap gap-1">
                                            {db.tables.map(t => (
                                                <span key={t} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-md font-mono">
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    </button>
                                ))}
                            </div>
                            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-800">
                                ⚠️ Pastikan database yang dipilih sudah terhubung dan env <code className="font-mono">DATABASE_URL</code> (SDA) atau <code className="font-mono">DVO_DATABASE_URL</code> (DVO) sudah diset di file <code>.env</code>
                            </div>
                        </SectionCard>
                    </>
                )}

                {activeTab === 'chat' && (
                    <>
                        <SectionCard title="⚙️ Pengaturan Chat">
                            <div className="mb-6">
                                <label className="block text-sm font-semibold text-gray-700 mb-3">
                                    Jumlah Maksimal History Context
                                    <span className="ml-2 font-normal text-gray-400 text-xs">(saat ini: {settings.max_history_messages} pesan)</span>
                                </label>
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-400 font-mono w-6">4</span>
                                    <input
                                        type="range"
                                        min="4"
                                        max="19"
                                        step="1"
                                        value={settings.max_history_messages}
                                        onChange={e => handleChange('max_history_messages', e.target.value)}
                                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                    <span className="text-sm text-gray-400 font-mono w-6">19</span>
                                </div>
                                <div className="mt-3 flex justify-center">
                                    <span className="text-3xl font-bold text-blue-600">{settings.max_history_messages}</span>
                                    <span className="text-sm text-gray-400 ml-2 self-end mb-1">pesan</span>
                                </div>
                                <p className="text-xs text-gray-400 text-center mt-1">
                                    Semakin banyak history, semakin banyak token yang digunakan. Min: 4, Maks: 19.
                                </p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
                                <div className="font-semibold mb-2">Panduan Nilai History:</div>
                                <div className="space-y-1 text-xs">
                                    <div className="flex gap-2"><span className="font-mono bg-gray-200 px-1 rounded">4–6</span><span>Hemat token, fokus pada pesan terakhir</span></div>
                                    <div className="flex gap-2"><span className="font-mono bg-blue-100 px-1 rounded text-blue-700">8–12</span><span>Seimbang (direkomendasikan)</span></div>
                                    <div className="flex gap-2"><span className="font-mono bg-orange-100 px-1 rounded text-orange-700">13–19</span><span>Konteks panjang, lebih banyak token terpakai</span></div>
                                </div>
                            </div>
                        </SectionCard>
                    </>
                )}

                {activeTab === 'tips' && (
                    <SectionCard title="💡 Saran & Informasi">
                        <div className="space-y-4 text-sm text-gray-700">
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                <div className="font-bold text-blue-800 mb-1">🔑 API Key</div>
                                <p>Ganti API key jika mendapat error rate limit atau unauthorized. Sistem akan otomatis menggunakan key terbaru tanpa perlu restart server.</p>
                            </div>
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                                <div className="font-bold text-green-800 mb-1">🔄 Fallback Otomatis</div>
                                <p>Jika OpenRouter error atau rate limit, sistem otomatis beralih ke Gemini sebagai fallback. Pastikan API key Gemini selalu valid.</p>
                            </div>
                            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                                <div className="font-bold text-purple-800 mb-1">🗄️ Switching Database</div>
                                <p>Setelah mengganti context database (SDA/DVO), chat berikutnya akan menggunakan schema yang baru. Chat yang sedang berlangsung tidak terpengaruh.</p>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <div className="font-bold text-amber-800 mb-1">⚡ Cache Settings</div>
                                <p>Settings di-cache selama 30 detik. Setelah menyimpan, perubahan akan berlaku maksimal 30 detik kemudian untuk permintaan chat baru.</p>
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                <div className="font-bold text-gray-800 mb-2">🧑‍💻 Admin Account</div>
                                <div className="text-xs font-mono bg-white p-2 rounded border border-gray-200">
                                    <div>Email: <span className="text-blue-600">admin@tmachat.local</span></div>
                                    <div>Password: <span className="text-gray-500">admin123</span></div>
                                    <div className="mt-1 text-orange-600">⚠️ Segera ganti password admin di database!</div>
                                </div>
                            </div>
                        </div>
                    </SectionCard>
                )}
            </div>
        </div>
    );
}
