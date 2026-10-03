import React, { useState, useEffect, useRef } from 'react';
import { Head, router } from '@inertiajs/react';
import PortalLayout from '@/Layouts/PortalLayout';

export default function Billing({ clearedPatients, archivedPatients = [] }) {
    const [activeTab, setActiveTab] = useState('ready'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [printingEncounter, setPrintingEncounter] = useState(null);
    const [soundEnabled, setSoundEnabled] = useState(true);
    
    const previousClearedCount = useRef(clearedPatients.length);
    const currentList = activeTab === 'ready' ? clearedPatients : archivedPatients;
    
    const filteredPatients = currentList.filter(patient => 
        patient.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        patient.hospital_number.includes(searchTerm)
    );

    useEffect(() => {
        const pollInterval = setInterval(() => {
            router.reload({ 
                only: ['clearedPatients', 'archivedPatients'], 
                preserveScroll: true, 
                preserveState: true 
            });
        }, 5000); 

        if (clearedPatients.length > previousClearedCount.current && soundEnabled) {
            new Audio('/sounds/notif.wav').play().catch(() => {});
        }
        
        previousClearedCount.current = clearedPatients.length;

        return () => clearInterval(pollInterval);
    }, [clearedPatients, soundEnabled]);

    const handlePrintAndArchive = (enccode) => {
        setPrintingEncounter(enccode);
        
        setTimeout(() => {
            router.post('/clearance/archive', { enccode: enccode }, {
                preserveScroll: true,
                preserveState: true,
                onSuccess: () => {
                    setPrintingEncounter(null);
                }
            });
        }, 2000);
    };

    const handleReprint = (enccode) => {
        setPrintingEncounter(enccode);
        setTimeout(() => setPrintingEncounter(null), 3000);
    };

    return (
        <PortalLayout>
            <Head title="Billing & Claims Finalization" />
            
            <div className="flex flex-col md:flex-row gap-6 w-full p-6 bg-slate-100 min-h-[calc(100vh-64px)] font-sans">
                
                {/* LEFT SIDEBAR */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col shrink-0 w-full md:w-[260px]">
                    <div className="mb-8 px-2 pt-2 flex justify-between items-start border-b border-slate-100 pb-4">
                        <div>
                            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Finalization Portal</h2>
                            <div className="text-xl font-bold text-slate-800 leading-tight">Billing &<br/>Claims</div>
                        </div>
                        <button onClick={() => setSoundEnabled(!soundEnabled)} className="text-slate-400 hover:text-teal-500 transition-colors p-1 bg-slate-50 rounded-md border border-slate-200 shadow-sm" title={soundEnabled ? "Mute Alerts" : "Enable Alerts"}>
                            {soundEnabled ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10c0-1.1.9-2 2-2h2l4-4v16l-4-4H7a2 2 0 01-2-2v-4z"></path></svg>
                            ) : (
                                <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h2.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg>
                            )}
                        </button>
                    </div>

                    <nav className="flex-1 space-y-2">
                        <button 
                            onClick={() => setActiveTab('ready')} 
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'ready' ? 'bg-teal-50 text-teal-700 border-l-4 border-teal-500 shadow-sm' : 'text-slate-500 hover:bg-slate-50 border-l-4 border-transparent'}`}
                        >
                            <div className="flex items-center space-x-3">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span>Ready for Print</span>
                            </div>
                            {clearedPatients.length > 0 && (
                                <span className="bg-teal-600 text-white text-[10px] px-2 py-0.5 rounded-full shadow-sm">
                                    {clearedPatients.length}
                                </span>
                            )}
                        </button>

                        <button 
                            onClick={() => setActiveTab('archived')} 
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'archived' ? 'bg-slate-200 text-slate-700 border-l-4 border-slate-500 shadow-sm' : 'text-slate-500 hover:bg-slate-50 border-l-4 border-transparent'}`}
                        >
                            <div className="flex items-center space-x-3">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                                <span>Printed Archives</span>
                            </div>
                        </button>
                    </nav>
                </div>

                {/* MAIN CONTENT */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative">
                    
                    <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
                        <div className="flex items-center space-x-3">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                                    {activeTab === 'ready' ? 'Cleared Patients' : 'F07 Archive'}
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">
                                    {activeTab === 'ready' ? 'These patients have completed all departmental requirements.' : 'Patients who have already been printed and finalized.'}
                                </p>
                            </div>
                            <span className="flex h-2 w-2 relative -mt-3" title="Live Sync Active">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                            </span>
                        </div>
                        
                        <div className="w-full md:w-72 relative">
                            <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            <input 
                                type="text" 
                                placeholder="Search patient name or ID..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 rounded-lg border-slate-300 shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm transition-all"
                            />
                        </div>
                    </div>

                    {/* TABLE HEADERS */}
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-white border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                        <div className="col-span-4 pl-2">Patient Details</div>
                        <div className="col-span-3">Admission Info</div>
                        <div className="col-span-2 text-center">Status</div>
                        <div className="col-span-3 text-right pr-2">Action</div>
                    </div>

                    <div className="overflow-y-auto flex-1 bg-slate-50/30">
                        {filteredPatients.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-24 text-slate-400">
                                <div className="bg-white p-4 rounded-full shadow-sm border border-slate-100 mb-4">
                                    <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                </div>
                                <span className="font-bold text-slate-500">
                                    {activeTab === 'ready' ? 'No cleared patients ready for printing.' : 'No printed patients found.'}
                                </span>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {filteredPatients.map((patient, index) => (
                                    <div key={index} className="grid grid-cols-12 gap-4 px-6 py-4 items-center bg-white hover:bg-slate-50 transition-colors">
                                        
                                        <div className={`col-span-4 pl-2 border-l-4 ${activeTab === 'ready' ? 'border-emerald-400' : 'border-slate-400'}`}>
                                            <div className="font-bold text-base text-slate-800">{patient.patient_name}</div>
                                            <div className="text-xs text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block mt-1">
                                                {patient.hospital_number}
                                            </div>
                                        </div>
                                        
                                        <div className="col-span-3 pr-4">
                                            <div className="text-[11px] font-mono break-all px-2 py-1 rounded-md border bg-slate-50 text-slate-600 border-slate-200 uppercase">
                                                {patient.enccode}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                                                Routed: {new Date(patient.created_at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila' })}
                                            </div>
                                        </div>
                                        
                                        <div className="col-span-2 flex justify-center">
                                            {activeTab === 'ready' ? (
                                                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-3 py-1.5 rounded-md border border-emerald-200 uppercase tracking-wide inline-flex items-center shadow-sm">
                                                    <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                    Cleared
                                                </span>
                                            ) : (
                                                <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-3 py-1.5 rounded-md border border-slate-200 uppercase tracking-wide inline-flex items-center shadow-sm">
                                                    <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                                                    Archived
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div className="col-span-3 flex justify-end pr-2">
                                            <button 
                                                onClick={() => activeTab === 'ready' ? handlePrintAndArchive(patient.enccode) : handleReprint(patient.enccode)}
                                                disabled={printingEncounter === patient.enccode}
                                                className={`inline-flex justify-center items-center px-4 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm focus:outline-none w-full xl:w-auto
                                                    ${printingEncounter === patient.enccode 
                                                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed' 
                                                        : (activeTab === 'ready' ? 'bg-teal-600 text-white hover:bg-teal-700 hover:shadow-md' : 'bg-slate-700 text-white hover:bg-slate-800 hover:shadow-md')}`}
                                            >
                                                {printingEncounter === patient.enccode ? (
                                                    <>
                                                        <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                        <span>Processing...</span>
                                                    </>
                                                ) : activeTab === 'ready' ? (
                                                    <>
                                                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                                                        <span>Print & Archive</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                                        <span>Reprint</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {/* SAFE FETCH URL ENCODING FOR IFRAME */}
                        {printingEncounter && (
                            <iframe 
                                src={`/print-clearance/document?enccode=${encodeURIComponent(printingEncounter)}`} 
                                style={{ 
                                    position: 'fixed', 
                                    top: '-10000px', 
                                    left: '-10000px', 
                                    width: '8.5in', 
                                    height: '5.5in',
                                    border: 'none'
                                }}
                                title="F07 Print Frame"
                            />
                        )}
                    </div>
                </div>
            </div>
        </PortalLayout>
    );
}