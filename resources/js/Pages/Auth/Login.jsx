import React, { useEffect } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import Checkbox from '@/Components/Checkbox';
import InputError from '@/Components/InputError';

export default function Login({ status, canResetPassword }) {
    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    useEffect(() => {
        return () => {
            reset('password');
        };
    }, []);

    const submit = (e) => {
        e.preventDefault();
        post(route('login'));
    };

    return (
       <div className="min-h-screen flex flex-col md:flex-row font-sans">
            <Head title="Log In" />

            {/* LEFT SIDEBAR (Dark Branding Section) */}
            <div className="w-full md:w-[45%] bg-slate-900 text-white flex flex-col justify-center items-center p-8 relative overflow-hidden">
                {/* Subtle gradient background effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 opacity-80"></div>
                
                <div className="relative z-10 flex flex-col items-center max-w-md w-full">
                    {/* Updated Logos (Provincial & Hospital) */}
                    <div className="flex space-x-4 mb-6">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-slate-700 relative overflow-hidden">
                            <img 
                                src="/images/capiz.jpg" 
                                alt="Province of Capiz Logo" 
                                className="w-full h-full object-contain p-1.5"
                                onError={(e) => { e.target.style.display='none'; e.target.nextElementSibling.style.display='block'; }}
                            />
                            <span className="hidden text-slate-900 text-xs font-bold text-center">CAPIZ<br/>LOGO</span>
                        </div>
                        
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-slate-700 relative overflow-hidden">
                            <img 
                                src="/images/rmph.jpg" 
                                alt="RMPH Logo" 
                                className="w-full h-full object-contain p-1.5"
                                onError={(e) => { e.target.style.display='none'; e.target.nextElementSibling.style.display='block'; }}
                            />
                            <span className="hidden text-rose-600 text-xs font-bold text-center">RMPH<br/>LOGO</span>
                        </div>
                    </div>

                    <h1 className="text-4xl font-extrabold tracking-tight mb-2">
                        RMPH <span className="text-teal-400">Clearance</span>
                    </h1>
                    
                    <p className="text-slate-300 font-medium mb-10 text-center">
                        Integrated Patient Discharge & Verification Portal
                    </p>

                    {/* System Status Box */}
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 w-full backdrop-blur-sm">
                        <div className="flex items-center text-teal-400 font-bold mb-4 text-sm tracking-wide">
                            <span className="inline-flex rounded-full h-2.5 w-2.5 mr-2 bg-teal-400" aria-hidden="true"></span>
                            SYSTEM ONLINE
                        </div>
                        
                        <ul className="space-y-3 text-sm text-slate-300 font-medium">
                            <li className="flex items-center">
                                <svg className="w-4 h-4 mr-3 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                Real-time inter-departmental syncing
                            </li>
                            <li className="flex items-center">
                                <svg className="w-4 h-4 mr-3 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                Automated SLA wait timers & alerts
                            </li>
                            <li className="flex items-center">
                                <svg className="w-4 h-4 mr-3 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                F07 Form smart printing
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* RIGHT SIDE (Login Form) */}
            <div className="w-full md:w-[55%] bg-white flex flex-col justify-center items-center p-8 md:p-16 relative">
                
                <div className="w-full max-w-md">
                    <h2 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">Welcome back</h2>
                    <p className="text-slate-500 mb-8 font-medium">Please enter your credentials to access the portal.</p>

                    {status && <div className="mb-4 font-medium text-sm text-green-600">{status}</div>}

                    <form onSubmit={submit} className="space-y-5">
                        
                        <div>
                            <label htmlFor="email" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                                Username or Email
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                                </div>
                                <input
                                    id="email"
                                    type="text"
                                    name="email"
                                    value={data.email}
                                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm font-medium transition-colors"
                                    autoComplete="username"
                                    autoFocus
                                    onChange={(e) => setData('email', e.target.value)}
                                />
                            </div>
                            <InputError message={errors.email} className="mt-2" />
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label htmlFor="password" className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                                    Password
                                </label>
                                {canResetPassword && (
                                    <Link href={route('password.request')} className="text-xs font-bold text-teal-600 hover:text-teal-800 transition-colors">
                                        Forgot password?
                                    </Link>
                                )}
                            </div>
                            
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                                </div>
                                <input
                                    id="password"
                                    type="password"
                                    name="password"
                                    value={data.password}
                                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm font-medium transition-colors"
                                    autoComplete="current-password"
                                    onChange={(e) => setData('password', e.target.value)}
                                />
                            </div>
                            <InputError message={errors.password} className="mt-2" />
                        </div>

                        <div className="block pt-2 pb-4">
                            <label className="flex items-center">
                                <Checkbox
                                    name="remember"
                                    checked={data.remember}
                                    onChange={(e) => setData('remember', e.target.checked)}
                                    className="text-slate-900 focus:ring-slate-900 rounded border-slate-300"
                                />
                                <span className="ms-2 text-sm font-medium text-slate-700">Keep me logged in</span>
                            </label>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={processing}
                                className={`w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-[#0f172a] hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-colors ${processing ? 'opacity-75 cursor-not-allowed' : ''}`}
                            >
                                Secure Login
                                <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                            </button>
                        </div>
                        
                        <div className="text-center mt-6">
                            <p className="text-sm text-slate-500 font-medium">
                                Don't have an account? <Link href={route('register')} className="font-bold text-teal-600 hover:text-teal-800">Register here</Link>
                            </p>
                        </div>
                    </form>
                </div>

                <div className="absolute bottom-6 w-full text-center">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        System Managed by ICT Section
                    </p>
                </div>
            </div>
        </div>
    );
}