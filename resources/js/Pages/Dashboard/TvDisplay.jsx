import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';

export default function TvDisplay({ patients }) {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        // Clock updates every second
        const clockInterval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);

        // Fetch new cleared ER patients every 10 seconds
        const dataInterval = setInterval(() => {
            router.reload({ only: ['patients'], preserveScroll: true, preserveState: true });
        }, 10000);

        return () => {
            clearInterval(clockInterval);
            clearInterval(dataInterval);
        };
    }, []);

    // --- DATA PRIVACY FORMATTER ---
    // Converts "DELA CRUZ, JUAN MIGUEL" to "Dela Cruz - J."
    const formatPrivacyName = (fullName) => {
        if (!fullName) return '';
        
        // Split by the comma used in iHomis (LastName, FirstName)
        const parts = fullName.split(',');
        
        if (parts.length >= 2) {
            const lastNamePart = parts[0].trim();
            const firstNamePart = parts[1].trim();
            
            // Convert "DELA CRUZ" to "Dela Cruz" for better readability on TV
            const formattedLastName = lastNamePart.split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
                
            // Grab just the first letter of the first name
            const firstInitial = firstNamePart.charAt(0).toUpperCase();
            
            return `${formattedLastName} - ${firstInitial}.`;
        }
        
        // Fallback just in case the name has no comma
        return fullName; 
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white p-8 font-sans">
            <Head title="ER Billing Queue" />
            
            <div className="flex items-center justify-between border-b-4 border-teal-500 pb-6 mb-8">
                <div className="flex items-center gap-6">
                    <img 
                        src="/images/rmph.jpg" 
                        alt="RMPH Logo" 
                        className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-white p-1.5 object-contain shadow-lg" 
                    />
                    <div>
                        <h2 className="text-xl md:text-2xl text-teal-400 font-bold tracking-widest uppercase mb-1">EMERGENCY ROOM PATIENTS</h2>
                        <h1 className="text-4xl md:text-5xl font-bold tracking-wider">PLEASE PROCEED TO BILLING</h1>
                    </div>
                </div>
                
                <div className="text-4xl font-mono text-teal-400 font-bold tracking-widest bg-slate-800 px-6 py-3 rounded-xl border border-slate-700 shadow-inner">
                    {currentTime.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' })}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {patients.length === 0 ? (
                    <div className="col-span-1 lg:col-span-2 text-center text-slate-500 text-2xl font-bold mt-20 italic">
                        No ER patients waiting for billing at this time.
                    </div>
                ) : (
                    patients.map((patient, idx) => (
                        <div key={idx} className="bg-slate-800 border-l-8 border-teal-500 p-6 rounded-lg shadow-2xl flex justify-between items-center animate-in fade-in duration-500">
                            {/* Masked Name Applied Here */}
                            <span className="text-4xl font-bold tracking-wide">
                                {formatPrivacyName(patient.patient_name)}
                            </span>
                            <span className="text-2xl font-bold text-teal-400 tracking-wider">READY</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}