import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';

export default function TvDisplay({ patients }) {
    // 1. Create a state to hold the current time
    const [currentTime, setCurrentTime] = useState(new Date());
    
    useEffect(() => {
        // 2. Make the clock tick every second (1000ms)
        const clockInterval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);

        // 3. Keep auto-refreshing the patient data every 10 seconds
        const dataInterval = setInterval(() => {
            router.reload({ only: ['patients'], preserveScroll: true, preserveState: true });
        }, 10000);

        return () => {
            clearInterval(clockInterval);
            clearInterval(dataInterval);
        };
    }, []);

    return (
        <div className="min-h-screen bg-slate-900 text-white p-8">
            <Head title="RMPH - Patient Queue" />
            
            <div className="flex items-center justify-between border-b-4 border-teal-500 pb-6 mb-8">
                <div className="flex items-center gap-6">
                    {/* Fixed Logo: Bigger size, proper padding, and object-contain to prevent stretching */}
                    <img 
                        src="/images/rmph.jpg" 
                        alt="RMPH Logo" 
                        className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-white p-1.5 object-contain shadow-lg" 
                    />
                    <h1 className="text-4xl md:text-5xl font-bold tracking-wider">PLEASE PROCEED TO BILLING</h1>
                </div>
                
                {/* Moving Clock wrapped in a nice digital-display box */}
                <div className="text-4xl font-mono text-teal-400 font-bold tracking-widest bg-slate-800 px-6 py-3 rounded-xl border border-slate-700 shadow-inner">
                    {currentTime.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' })}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
                {patients.length === 0 ? (
                    <div className="col-span-2 text-center text-slate-500 text-2xl font-bold mt-20 italic">
                        No patients waiting for billing at this time.
                    </div>
                ) : (
                    patients.map((patient, idx) => (
                        <div key={idx} className="bg-slate-800 border-l-8 border-teal-500 p-6 rounded-lg shadow-2xl flex justify-between items-center animate-fade-in">
                            <span className="text-4xl font-bold uppercase">{patient.patient_name}</span>
                            <span className="text-2xl font-bold text-teal-400 tracking-wider">READY</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}