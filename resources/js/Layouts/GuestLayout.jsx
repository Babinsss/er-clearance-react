import ApplicationLogo from '@/Components/ApplicationLogo';
import { Link } from '@inertiajs/react';

export default function GuestLayout({ children }) {
    return (
        <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
            <header className="bg-slate-900 border-b-4 border-teal-500 px-6 py-4 flex items-center justify-center shadow-sm">
                <Link href={route('login')} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-lg px-2 py-1">
                    <ApplicationLogo />
                </Link>
            </header>

            <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
                <div className="w-full sm:max-w-md bg-white px-6 py-6 shadow-sm border border-slate-200 rounded-xl">
                    {children}
                </div>
            </main>
        </div>
    );
}
