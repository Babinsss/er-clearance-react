import React from 'react';
import { Link, usePage } from '@inertiajs/react';

export default function PortalLayout({ children }) {
    const { auth } = usePage().props;

    return (
        <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
            {/* Dark Top Navigation Bar */}
            <nav className="bg-[#0f172a] border-b-4 border-teal-500 text-white px-6 py-3 flex justify-between items-center shadow-md z-10">
                
                {/* Logo Area */}
                <div className="flex items-center space-x-3">
                    <div className="flex space-x-2">
                        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center overflow-hidden border border-slate-700 relative">
                            <img 
                                src="/images/capiz.jpg" 
                                alt="Province of Capiz Logo" 
                                className="w-full h-full object-contain p-0.5"
                                onError={(e) => { e.target.style.display='none'; e.target.nextElementSibling.style.display='flex'; }}
                            />
                            <span className="hidden text-slate-900 text-[7px] font-bold text-center leading-none">CAPIZ</span>
                        </div>
                        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center overflow-hidden border border-slate-700 relative">
                            <img 
                                src="/images/rmph.jpg" 
                                alt="RMPH Logo" 
                                className="w-full h-full object-contain p-0.5"
                                onError={(e) => { e.target.style.display='none'; e.target.nextElementSibling.style.display='flex'; }}
                            />
                            <span className="hidden text-rose-600 text-[7px] font-bold text-center leading-none">RMPH</span>
                        </div>
                    </div>
                    
                    <span className="text-lg font-bold tracking-tight border-l border-slate-700 pl-3">
                        <span className="text-white">RMPH</span> <span className="text-teal-400">Clearance</span>
                    </span>
                </div>

                {/* Right Actions */}
                <div className="flex items-center space-x-6">
                    <Link href="/dashboard" className="text-sm font-bold text-white hover:text-teal-400 transition-colors">
                        Dashboard
                    </Link>
                    
                    <div className="flex items-center space-x-3">
                        {/* User Badge */}
                        <div className="bg-slate-800 rounded-full px-4 py-1.5 flex items-center border border-slate-700">
                            <span className="relative flex h-2 w-2 mr-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                            </span>
                            <span className="text-xs font-extrabold tracking-wide uppercase">
                                {auth?.user?.name || 'ALIZA MAE ARBATIN'}
                            </span>
                        </div>

                        {/* Log Out */}
                        <Link 
                            href={route('logout')} 
                            method="post" 
                            as="button"
                            className="border border-slate-600 rounded px-4 py-1.5 text-xs font-bold tracking-wide hover:bg-slate-800 transition-colors uppercase"
                        >
                            Log Out
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Page Content */}
            <main className="flex-1 flex overflow-hidden">
                {children}
            </main>
        </div>
    );
}