import React, { useState, useEffect, useRef } from 'react';
import { Head, router } from '@inertiajs/react';
import PortalLayout from '@/Layouts/PortalLayout';

export default function Billing({ clearedPatients }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [printingEncounter, setPrintingEncounter] = useState(null);
    
    // Notification Tracker
    const previousClearedCount = useRef(clearedPatients.length);

    const filteredPatients = clearedPatients.filter(patient => 
        patient.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        patient.hospital_number.includes(searchTerm)
    );

    // Real-Time Polling Engine
    useEffect(() => {
        const pollInterval = setInterval(() => {
            router.reload({ 
                only: ['clearedPatients'], 
                preserveScroll: true, 
                preserveState: true 
            });
        }, 5000); // 5 Seconds

        // Notify if a new patient successfully hits 'Cleared' status
        if (clearedPatients.length > previousClearedCount.current) {
            // UPDATED SOUND FILE HERE
            const audio = new Audio('/sounds/epic_26.mp3');
            audio.play().catch(e => console.log("Audio blocked by browser."));
        }
        
        previousClearedCount.current = clearedPatients.length;

        return () => clearInterval(pollInterval);
    }, [clearedPatients]);

    const handlePrint = (enccode) => {
        setPrintingEncounter(enccode);
        setTimeout(() => {
            setPrintingEncounter(null);
        }, 5000);
    };

    return (
        <PortalLayout>
            <Head title="Billing & Claims Clearance" />
            
            <div className="w-64 bg-white border-r border-slate-200 flex flex-col p-6 overflow-y-auto">
                <div className="mb-8">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Finalization Portal</h3>
                    <h2 className="text-2xl font-extrabold text-slate-800 leading-tight">Billing &<br/>Claims</h2>
                </div>

                <nav className="space-y-2">
                    <div className="flex items-center px-4 py-3 bg-teal-50 text-teal-700 border-l-4 border-teal-500 rounded-r-lg font-bold text-sm transition-colors">
                        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Ready for Print
                        {clearedPatients.length > 0 && (
                            <span className="ml-auto bg-teal-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                                {clearedPatients.length}
                            </span>
                        )}
                    </div>
                </nav>
            </div>

            <div className="flex-1 bg-slate-50 p-8 overflow-y-auto relative">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-full">
                    
                    <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Cleared Patients</h2>
                            <p className="text-sm text-slate-500 font-medium mt-1">These patients have completed all departmental requirements.</p>
                        </div>
                        
                        <div className="relative w-72">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            </div>
                            <input 
                                type="text" 
                                placeholder="Search by name or hospital #..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="block w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* NEW 12-COLUMN GRID FOR HEADERS */}
                    <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <div className="col-span-3">Patient Details</div>
                        <div className="col-span-4">Admission Info</div>
                        <div className="col-span-2">Status</div>
                        <div className="col-span-3 text-right">Action</div>
                    </div>

                    {filteredPatients.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-24 text-slate-400">
                            <div className="bg-slate-50 p-4 rounded-full mb-4">
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            </div>
                            <span className="font-medium">No cleared patients ready for printing.</span>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {filteredPatients.map((patient, index) => (
                                /* NEW 12-COLUMN GRID FOR ROWS */
                                <div key={index} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-50 transition-colors">
                                    
                                    <div className="col-span-3">
                                        <div className="font-extrabold text-slate-900">{patient.patient_name}</div>
                                        <div className="text-xs text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block mt-1">
                                            {patient.hospital_number}
                                        </div>
                                    </div>
                                    
                                    {/* Break-all forces the encounter code to wrap instead of pushing elements aside */}
                                    <div className="col-span-4 pr-4">
                                        <div className="text-xs font-medium break-all p-2 rounded-md border bg-white text-slate-600 border-slate-100">
                                            {patient.enccode}
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                                            Routed: {new Date(patient.created_at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila' })}
                                        </div>
                                    </div>
                                    
                                    <div className="col-span-2">
                                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded border border-emerald-200 uppercase tracking-wide inline-flex items-center">
                                            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                            Cleared
                                        </span>
                                    </div>
                                    
                                    <div className="col-span-3 flex justify-end">
                                        <button 
                                            onClick={() => handlePrint(patient.enccode)}
                                            disabled={printingEncounter === patient.enccode}
                                            className="inline-flex justify-center items-center bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-teal-700 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-75 w-full xl:w-auto"
                                        >
                                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                                            {printingEncounter === patient.enccode ? 'Loading Print...' : 'Print F07 Form'}
                                        </button>
                                    </div>

                                </div>
                            ))}
                        </div>
                    )}
                    
                    {/* The off-screen iframe to force the Chrome Print Modal seamlessly */}
                    {printingEncounter && (
                        <iframe 
                            src={`/print-clearance/${printingEncounter}`} 
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
        </PortalLayout>
    );
}