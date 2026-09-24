import React, { useState } from 'react';
import { Head, router, usePage, Link } from '@inertiajs/react';

export default function Search() {
    const [enccode, setEnccode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // Grabs the logged-in user's data automatically provided by Laravel Breeze
    const { auth } = usePage().props;

    const handleSearch = (e) => {
        e.preventDefault();
        if (enccode.trim()) {
            setIsLoading(true);
            router.get(`/clearance/${enccode}`);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
            <Head title="Search Patient - ER Clearance" />

            {/* Centralized Top Navigation Bar */}
            <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
                <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 bg-blue-600 rounded flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </div>
                    <span className="text-lg font-bold text-slate-800 tracking-tight">RMPH Clearance</span>
                </div>
                
                <div className="flex items-center space-x-4">
                    <span className="text-sm font-medium text-slate-600">
                        Logged in as: <span className="font-bold text-slate-900">{auth.user.name}</span>
                    </span>
                    <Link 
                        href={route('logout')} 
                        method="post" 
                        as="button"
                        className="text-sm font-bold text-rose-600 hover:text-rose-800 transition-colors bg-rose-50 px-3 py-1.5 rounded border border-rose-100"
                    >
                        Log Out
                    </Link>
                </div>
            </nav>

            {/* Main Search Area */}
            <div className="flex-grow flex justify-center items-center p-6">
                <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-extrabold text-slate-900">Patient Search</h1>
                        <p className="text-slate-500 mt-2 text-sm font-medium">Enter Encounter or Hospital Number</p>
                    </div>

                    <form onSubmit={handleSearch} className="space-y-5">
                        <div>
                            <input
                                type="text"
                                id="enccode"
                                value={enccode}
                                onChange={(e) => setEnccode(e.target.value)}
                                placeholder="e.g., 2026-009271"
                                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors uppercase font-medium text-slate-800 placeholder-slate-400"
                                required
                                autoFocus
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading || !enccode}
                            className={`w-full py-3 px-4 rounded-lg text-white font-bold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                                isLoading || !enccode 
                                ? 'bg-blue-400 cursor-not-allowed' 
                                : 'bg-blue-600 hover:bg-blue-700 shadow-sm'
                            }`}
                        >
                            {isLoading ? 'Locating Records...' : 'Access Clearance Dashboard'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}