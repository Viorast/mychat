'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import SettingsPage from '../../../components/admin/SettingsPage';

export default function AdminSettingsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (status === 'loading') return;
        // Redirect jika tidak login atau bukan admin
        if (!session?.user || session.user.role !== 'admin') {
            router.push('/');
        }
    }, [session, status, router]);

    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Memuat...</p>
                </div>
            </div>
        );
    }

    if (!session?.user || session.user.role !== 'admin') {
        return null;
    }

    return <SettingsPage />;
}
