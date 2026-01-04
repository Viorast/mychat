'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, User, Eye, EyeOff, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';

/**
 * Register Page Component
 * Email/Password Registration
 */
export default function RegisterPage() {
    const router = useRouter();

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError('');
    };

    const validateForm = () => {
        if (!formData.name.trim()) {
            setError('Nama harus diisi');
            return false;
        }
        if (!formData.email.trim()) {
            setError('Email harus diisi');
            return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            setError('Format email tidak valid');
            return false;
        }
        if (formData.password.length < 6) {
            setError('Password minimal 6 karakter');
            return false;
        }
        if (formData.password !== formData.confirmPassword) {
            setError('Konfirmasi password tidak cocok');
            return false;
        }
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) return;

        setIsLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    password: formData.password
                })
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Registrasi gagal');
                return;
            }

            setSuccess(true);

            // Auto login after registration
            setTimeout(async () => {
                const result = await signIn('credentials', {
                    email: formData.email,
                    password: formData.password,
                    redirect: false
                });

                if (result?.ok) {
                    router.push('/');
                    router.refresh();
                } else {
                    router.push('/login');
                }
            }, 1500);

        } catch (err) {
            setError('Terjadi kesalahan. Silakan coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignUp = async () => {
        setIsLoading(true);
        try {
            await signIn('google', { callbackUrl: '/' });
        } catch (err) {
            setError('Gagal mendaftar dengan Google');
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="login-container">
                <div className="login-card success-card">
                    <div className="success-icon">
                        <CheckCircle size={64} />
                    </div>
                    <h1>Registrasi Berhasil!</h1>
                    <p>Akun Anda telah dibuat. Mengalihkan ke halaman utama...</p>
                </div>
                <style jsx>{`
                    .login-container {
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        padding: 20px;
                    }
                    .success-card {
                        background: #ffffff;
                        border-radius: 16px;
                        padding: 48px;
                        text-align: center;
                        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                    }
                    .success-icon {
                        color: #22c55e;
                        margin-bottom: 16px;
                    }
                    h1 {
                        font-size: 24px;
                        color: #1e293b;
                        margin: 0 0 8px 0;
                    }
                    p {
                        color: #64748b;
                        margin: 0;
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className="login-container">
            <div className="login-card">
                {/* Header */}
                <div className="login-header">
                    <div className="logo">
                        <span className="logo-icon">💬</span>
                        <span className="logo-text">TmaChat</span>
                    </div>
                    <h1>Buat Akun Baru</h1>
                    <p>Daftar untuk mulai menggunakan TmaChat</p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="error-banner">
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                )}

                {/* Register Form */}
                <form onSubmit={handleSubmit} className="login-form">
                    {/* Name Field */}
                    <div className="form-group">
                        <label htmlFor="name">Nama Lengkap</label>
                        <div className="input-wrapper">
                            <User size={18} className="input-icon" />
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Masukkan nama Anda"
                                required
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    {/* Email Field */}
                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <div className="input-wrapper">
                            <Mail size={18} className="input-icon" />
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="nama@email.com"
                                required
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    {/* Password Field */}
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <div className="input-wrapper">
                            <Lock size={18} className="input-icon" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                placeholder="Min. 6 karakter"
                                required
                                disabled={isLoading}
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* Confirm Password Field */}
                    <div className="form-group">
                        <label htmlFor="confirmPassword">Konfirmasi Password</label>
                        <div className="input-wrapper">
                            <Lock size={18} className="input-icon" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="confirmPassword"
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                placeholder="Ketik ulang password"
                                required
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 size={18} className="spinner" />
                                <span>Memproses...</span>
                            </>
                        ) : (
                            <span>Daftar</span>
                        )}
                    </button>
                </form>

                {/* Divider */}
                <div className="divider">
                    <span>atau</span>
                </div>

                {/* Google Sign Up */}
                <button
                    type="button"
                    className="btn-google"
                    onClick={handleGoogleSignUp}
                    disabled={isLoading}
                >
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <span>Daftar dengan Google</span>
                </button>

                {/* Login Link */}
                <div className="register-link">
                    <span>Sudah punya akun? </span>
                    <Link href="/login">Masuk</Link>
                </div>
            </div>

            <style jsx>{`
                .login-container {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 20px;
                }

                .login-card {
                    background: #ffffff;
                    border-radius: 16px;
                    padding: 40px;
                    width: 100%;
                    max-width: 420px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                }

                .login-header {
                    text-align: center;
                    margin-bottom: 32px;
                }

                .logo {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    margin-bottom: 16px;
                }

                .logo-icon {
                    font-size: 32px;
                }

                .logo-text {
                    font-size: 24px;
                    font-weight: 700;
                    color: #1e293b;
                }

                .login-header h1 {
                    font-size: 24px;
                    font-weight: 600;
                    color: #1e293b;
                    margin: 0 0 8px 0;
                }

                .login-header p {
                    color: #64748b;
                    margin: 0;
                    font-size: 14px;
                }

                .error-banner {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    background: #fef2f2;
                    border: 1px solid #fecaca;
                    border-radius: 8px;
                    color: #dc2626;
                    font-size: 14px;
                    margin-bottom: 24px;
                }

                .login-form {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .form-group label {
                    font-size: 14px;
                    font-weight: 500;
                    color: #374151;
                }

                .input-wrapper {
                    position: relative;
                    display: flex;
                    align-items: center;
                }

                .input-icon {
                    position: absolute;
                    left: 14px;
                    color: #9ca3af;
                    pointer-events: none;
                }

                .input-wrapper input {
                    width: 100%;
                    padding: 12px 14px 12px 44px;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    font-size: 15px;
                    transition: all 0.2s;
                    background: #f9fafb;
                }

                .input-wrapper input:focus {
                    outline: none;
                    border-color: #6366f1;
                    background: #ffffff;
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
                }

                .input-wrapper input:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .password-toggle {
                    position: absolute;
                    right: 14px;
                    background: none;
                    border: none;
                    color: #9ca3af;
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .password-toggle:hover {
                    color: #6b7280;
                }

                .btn-primary {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    padding: 14px;
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    margin-top: 8px;
                }

                .btn-primary:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 10px 20px -5px rgba(99, 102, 241, 0.4);
                }

                .btn-primary:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                }

                .spinner {
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .divider {
                    display: flex;
                    align-items: center;
                    margin: 24px 0;
                }

                .divider::before,
                .divider::after {
                    content: '';
                    flex: 1;
                    height: 1px;
                    background: #e5e7eb;
                }

                .divider span {
                    padding: 0 16px;
                    color: #9ca3af;
                    font-size: 13px;
                }

                .btn-google {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    width: 100%;
                    padding: 12px;
                    background: #ffffff;
                    border: 1px solid #e5e7eb;
                    border-radius: 10px;
                    font-size: 14px;
                    font-weight: 500;
                    color: #374151;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .btn-google:hover:not(:disabled) {
                    background: #f9fafb;
                    border-color: #d1d5db;
                }

                .btn-google:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .register-link {
                    text-align: center;
                    margin-top: 24px;
                    font-size: 14px;
                    color: #64748b;
                }

                .register-link a {
                    color: #6366f1;
                    font-weight: 500;
                    text-decoration: none;
                }

                .register-link a:hover {
                    text-decoration: underline;
                }

                @media (max-width: 480px) {
                    .login-card {
                        padding: 24px;
                    }
                }
            `}</style>
        </div>
    );
}
