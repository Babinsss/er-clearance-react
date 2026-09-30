import React, { useState, useEffect, useRef } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import PortalLayout from '@/Layouts/PortalLayout';

export default function Ward({ searchQuery, patient, clearances, activeQueue = [], clearedQueue = [] }) {
    const { auth } = usePage().props;
    const wardName = auth.user.department;

    const [activeTab, setActiveTab] = useState('active');
    const [isRouting, setIsRouting] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [toastMessage, setToastMessage] = useState(null);

    // Audio Notification Tracker
    const previousClearedCount = useRef(clearedQueue.length);

    // Form State
    const [form, setForm] = useState({
        hospital_number: searchQuery || '',
        patient_name: patient?.name || '',
        arrival_datetime: patient?.arrival_datetime || '',
        disposition: patient?.disposition || '',
    });

    // --- REAL-TIME POLLING ENGINE ---
    useEffect(() => {
        const pollInterval = setInterval(() => {
            router.reload({ 
                only: ['activeQueue', 'clearedQueue', 'patient', 'clearances'], 
                preserveScroll: true, 
                preserveState: true 
            });
        }, 5000); // Refreshes queue data every 5 seconds

        // Play sound if a patient moves to the cleared queue
        if (clearedQueue.length > previousClearedCount.current) {
            new Audio('/sounds/epic_26.mp3').play().catch(() => {});
        }
        previousClearedCount.current = clearedQueue.length;

        return () => clearInterval(pollInterval);
    }, [clearedQueue]);

    // --- DEBOUNCED SEARCH ---
    useEffect(() => {
        if (form.hospital_number.length > 5 && form.hospital_number !== searchQuery) {
            setIsSearching(true);
            const timer = setTimeout(() => {
                router.get('/', { search: form.hospital_number }, { 
                    preserveState: true, 
                    preserveScroll: true,
                    onFinish: () => setIsSearching(false)
                });
            }, 500);
            return () => clearTimeout(timer);
        } else if (form.hospital_number.length <= 5) {
            setIsSearching(false);
        }
    }, [form.hospital_number]);

    // Update form when backend finds a patient
    useEffect(() => {
        if (patient) {
            setForm(prev => ({
                ...prev,
                patient_name: patient.name,
                arrival_datetime: patient.arrival_datetime || '',
                disposition: patient.disposition || ''
            }));
            setIsSearching(false);
        }
    }, [patient]);

    const handleRoutePatient = (e) => {
        e.preventDefault();
        setIsRouting(true);
        router.post('/transactions', {
            enccode: patient?.enccode,
            hospital_number: form.hospital_number,
            patient_name: form.patient_name,
            arrival_datetime: form.arrival_datetime,
            disposition: form.disposition,
            room_ward: wardName
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setIsRouting(false);
                setForm({ hospital_number: '', patient_name: '', arrival_datetime: '', disposition: '' });
                setToastMessage("Patient successfully routed for clearance!");
                setTimeout(() => setToastMessage(null), 3000);
            },
            onError: (errors) => {
                setIsRouting(false);
                setToastMessage("Failed to route patient. Check inputs.");
                setTimeout(() => setToastMessage(null), 3000);
                console.error(errors);
            }
        });
    };

    const displayQueue = activeTab === 'active' ? activeQueue : clearedQueue;
    // Change 'Cardiopulmonary' to 'Cardio Pulmo'
    const allDepartments = ['Pharmacy', 'Laboratory', 'Radiology', 'Cardio Pulmo', 'CSR'];

    return (
        <PortalLayout>
            <Head title={`${wardName} Dashboard`} />
            
            <div className="flex flex-col md:flex-row gap-6 w-full p-6 bg-slate-100 min-h-[calc(100vh-64px)] font-sans">
                
                {/* LEFT SIDEBAR: INTAKE FORM */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col shrink-0 w-full md:w-80 h-fit">
                    <div className="mb-6 px-2 pt-2 border-b border-slate-100 pb-4 flex justify-between items-start">
                        <div>
                            <h2 className="text-[10px] font-black text-teal-600 uppercase tracking-widest mb-1">Clinical Station</h2>
                            <div className="text-xl font-bold text-slate-800">{wardName}</div>
                        </div>
                    </div>

                    <form onSubmit={handleRoutePatient} className="space-y-4 flex-1">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 flex justify-between">
                                <span>Hospital Number</span>
                                {isSearching && <span className="text-teal-500 animate-pulse">Searching...</span>}
                            </label>
                            <input 
                                type="text" 
                                value={form.hospital_number}
                                onChange={e => setForm({...form, hospital_number: e.target.value})}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 font-mono uppercase transition-colors" 
                                placeholder="e.g. 000000128607" 
                                required 
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Patient Name</label>
                            {isSearching ? (
                                <div className="w-full h-[38px] bg-slate-200 animate-pulse rounded-lg border border-slate-300"></div>
                            ) : (
                                <input 
                                    type="text" 
                                    value={form.patient_name}
                                    readOnly
                                    className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-600 focus:ring-0 uppercase cursor-not-allowed" 
                                    placeholder="LASTNAME, FIRSTNAME" 
                                />
                            )}
                        </div>

                        {/* FINANCIAL CARDS */}
                        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
                            <div className="bg-blue-50 p-2 rounded border border-blue-100 shadow-sm">
                                <p className="text-[9px] text-blue-600 uppercase font-bold">Total Charges</p>
                                <p className="text-sm font-black text-slate-800">₱ 0.00</p>
                            </div>
                            <div className="bg-amber-50 p-2 rounded border border-amber-100 shadow-sm">
                                <p className="text-[9px] text-amber-600 uppercase font-bold">Net Amount</p>
                                <p className="text-sm font-black text-slate-800">₱ 0.00</p>
                            </div>
                            <div className="bg-emerald-50 p-2 rounded border border-emerald-100 shadow-sm">
                                <p className="text-[9px] text-emerald-600 uppercase font-bold">Total Paid</p>
                                <p className="text-sm font-black text-slate-800">₱ 0.00</p>
                            </div>
                            <div className="bg-rose-50 p-2 rounded border border-rose-100 shadow-sm">
                                <p className="text-[9px] text-rose-600 uppercase font-bold">Balance</p>
                                <p className="text-sm font-black text-rose-600">₱ 0.00</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 mt-4">Arrival Time</label>
                            <input 
                                type="datetime-local" 
                                value={form.arrival_datetime}
                                onChange={e => setForm({...form, arrival_datetime: e.target.value})}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500" 
                                required 
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Disposition</label>
                            <select 
                                value={form.disposition}
                                onChange={e => setForm({...form, disposition: e.target.value})}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500" 
                                required
                            >
                                <option value="">Select status...</option>
                                <option value="Improved">Improved</option>
                                <option value="HAMA">HAMA</option>
                                <option value="Transferred">Transferred</option>
                                <option value="Absconded">Absconded</option>
                                <option value="Died">Died</option>
                            </select>
                        </div>

                        <div className="pt-4 mt-6 border-t border-slate-100">
                            <button 
                                type="submit" 
                                disabled={!patient || isRouting || patient.is_routed}
                                className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 text-white font-bold py-3 px-4 rounded-lg shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:cursor-not-allowed"
                            >
                                {isRouting ? (
                                    <>
                                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        <span>Routing...</span>
                                    </>
                                ) : patient?.is_routed ? (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                        <span>Already Routed</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                        <span>Route Clearance</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* MAIN CONTENT: DYNAMIC TRACKING */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
                        <div className="flex items-center space-x-3">
                            <h3 className="text-lg font-bold text-slate-800">Clearance Tracker</h3>
                            {/* Live polling indicator */}
                            <span className="flex h-2 w-2 relative" title="Live Sync Active">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                            </span>
                        </div>
                        
                        <div className="flex p-1 bg-slate-200/60 rounded-lg shadow-inner">
                            <button 
                                onClick={() => setActiveTab('active')} 
                                className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${activeTab === 'active' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Active 
                                {activeQueue.length > 0 && <span className="ml-1 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{activeQueue.length}</span>}
                            </button>
                            <button 
                                onClick={() => setActiveTab('completed')} 
                                className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${activeTab === 'completed' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Completed History
                            </button>
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 p-6 space-y-4 bg-slate-50/50">
                        {displayQueue.length === 0 ? (
                            <div className="text-center py-12">
                                <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                                <p className="text-sm font-medium text-slate-400">No {activeTab} clearances for {wardName}.</p>
                            </div>
                        ) : (
                            displayQueue.map((tx, idx) => (
                                <div key={idx} className={`bg-white border border-slate-200 rounded-xl p-4 shadow-sm select-none transition-all duration-300 ${activeTab === 'completed' ? 'opacity-80 border-emerald-200' : 'border-slate-200 hover:shadow-md'}`}>
                                    <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-lg">
                                                {tx.patient_name}
                                                <span className="text-xs text-slate-400 font-mono ml-2 border border-slate-200 px-2 py-0.5 rounded bg-slate-50">{tx.hospital_number}</span>
                                            </h4>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mt-1">Disposition: {tx.disposition}</p>
                                        </div>
                                        <div className="text-right">
                                            {tx.overall_status === 'Cleared' ? (
                                                <span className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                    <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                    Fully Cleared
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                                    <svg className="w-3 h-3 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                    Routing in Progress
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* DYNAMIC 5-DEPARTMENT STATUS GRID */}
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                        {allDepartments.map((dept, i) => {
                                            // The Magic: Checks the backend's array of cleared departments!
                                            const isApproved = tx.cleared_departments?.includes(dept);
                                            
                                            return (
                                                <div key={i} className={`border rounded-lg p-2.5 text-center cursor-default transition-all duration-500 ${isApproved ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-slate-50 border-slate-200'}`}>
                                                    <div className={`text-[10px] font-black uppercase mb-1 truncate transition-colors ${isApproved ? 'text-emerald-700' : 'text-slate-500'}`}>
                                                        {dept}
                                                    </div>
                                                    
                                                    {isApproved ? (
                                                        <span className="text-emerald-600 text-xs font-bold flex items-center justify-center space-x-1">
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                            <span>Cleared</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-amber-500 text-xs font-bold flex items-center justify-center space-x-1">
                                                            <svg className="w-3 h-3 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                            <span>Pending</span>
                                                        </span>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* --- SLIDING TOAST NOTIFICATION --- */}
            {toastMessage && (
                <div className="fixed top-6 right-6 z-[200] flex items-center bg-teal-600 text-white px-5 py-3.5 rounded-xl shadow-2xl animate-in slide-in-from-top-5 fade-in duration-300">
                    <div className="bg-teal-500 rounded-full p-1 mr-3">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <span className="font-bold text-sm tracking-wide">{toastMessage}</span>
                    <button onClick={() => setToastMessage(null)} className="ml-4 text-teal-200 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            )}
        </PortalLayout>
    );
}