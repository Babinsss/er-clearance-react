import React, { useEffect } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import InputError from '@/Components/InputError';

export default function Register({ departments = [] }) {
    const { data, setData, post, processing, errors, reset } = useForm({
        name: '',
        email: '',
        department: '',
        password: '',
        password_confirmation: '',
    });

    useEffect(() => {
        return () => {
            reset('password', 'password_confirmation');
        };
    }, []);

    const submit = (e) => {
        e.preventDefault();
        post(route('register'));
    };

    return (
        <div className="min-h-screen flex flex-col md:flex-row font-sans">
            <Head title="Register - RMPH Clearance" />

            {/* LEFT SIDEBAR (Dark Branding Section Matching Login) */}
            <div className="w-full md:w-[45%] bg-slate-900 text-white flex flex-col justify-center items-center p-8 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 opacity-80"></div>
                
                <div className="relative z-10 flex flex-col items-center max-w-md w-full">
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
                        Staff <span className="text-teal-400">Onboarding</span>
                    </h1>
                    
                    <p className="text-slate-300 font-medium mb-10 text-center">
                        Secure access provisioning for the Clearance Portal.
                    </p>

                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 w-full backdrop-blur-sm">
                        <div className="flex items-center text-teal-400 font-bold mb-4 text-sm tracking-wide">
                            <span className="relative flex h-3 w-3 mr-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
                            </span>
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

            {/* RIGHT SIDE (Registration Form) */}
            <div className="w-full md:w-[55%] bg-white flex flex-col justify-center items-center p-8 md:p-16 relative">
                
                <div className="w-full max-w-lg">
                    <h2 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">Create Account</h2>
                    <p className="text-slate-500 mb-8 font-medium">Register a new official hospital staff account.</p>

                    <form onSubmit={submit} className="space-y-5">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label htmlFor="name" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                                    Full Name
                                </label>
                                <input
                                    id="name"
                                    type="text"
                                    name="name"
                                    value={data.name}
                                    className="block w-full px-4 py-3 border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm font-medium transition-colors"
                                    autoComplete="name"
                                    isFocused={true}
                                    onChange={(e) => setData('name', e.target.value)}
                                    required
                                />
                                <InputError message={errors.name} className="mt-2" />
                            </div>

                            <div>
                                <label htmlFor="email" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                                    Email Address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    name="email"
                                    value={data.email}
                                    className="block w-full px-4 py-3 border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm font-medium transition-colors"
                                    autoComplete="username"
                                    onChange={(e) => setData('email', e.target.value)}
                                    required
                                />
                                <InputError message={errors.email} className="mt-2" />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="department" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                                System Role & Department
                            </label>
                            <select 
                                id="department"
                                name="department"
                                value={data.department}
                                onChange={(e) => setData('department', e.target.value)}
                                className="block w-full px-4 py-3 border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm font-medium transition-colors text-slate-700"
                                required
                            >
                                <option value="">Select a role or department...</option>
                                <option value="Billing & Claims">Billing & Claims</option>
                                
                                {/* Dynamic Departments from Database */}
                                {departments.length > 0 ? (
                                    departments.map((dept) => (
                                        <option key={dept.id} value={dept.name}>
                                            {dept.name}
                                        </option>
                                    ))
                                ) : (
                                    // Fallback if the database is currently empty
                                    <>
                                        <option value="Laboratory">Laboratory</option>
                                        <option value="Radiology">Radiology</option>
                                        <option value="Pharmacy">Pharmacy</option>
                                        <option value="Cardiopulmonary">Cardiopulmonary</option>
                                        <option value="CSR">CSR</option>
                                    </>
                                )}
                            </select>
                            <InputError message={errors.department} className="mt-2" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                            <div>
                                <label htmlFor="password" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    name="password"
                                    value={data.password}
                                    className="block w-full px-4 py-3 border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm font-medium transition-colors"
                                    autoComplete="new-password"
                                    onChange={(e) => setData('password', e.target.value)}
                                    required
                                />
                                <InputError message={errors.password} className="mt-2" />
                            </div>

                            <div>
                                <label htmlFor="password_confirmation" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                                    Confirm Password
                                </label>
                                <input
                                    id="password_confirmation"
                                    type="password"
                                    name="password_confirmation"
                                    value={data.password_confirmation}
                                    className="block w-full px-4 py-3 border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm font-medium transition-colors"
                                    autoComplete="new-password"
                                    onChange={(e) => setData('password_confirmation', e.target.value)}
                                    required
                                />
                                <InputError message={errors.password_confirmation} className="mt-2" />
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-6">
                            <Link
                                href={route('login')}
                                className="text-sm font-bold text-teal-600 hover:text-teal-800 transition-colors"
                            >
                                Already registered?
                            </Link>

                            <button
                                type="submit"
                                disabled={processing}
                                className={`flex justify-center items-center py-3.5 px-6 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-[#0f172a] hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-colors ${processing ? 'opacity-75 cursor-not-allowed' : ''}`}
                            >
                                Register Staff
                                <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                            </button>
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