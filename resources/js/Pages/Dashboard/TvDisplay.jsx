import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';

export default function TvDisplay({ patients = [], totalReadyCount = null }) {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        // Clock updates every second
        const clockInterval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);

        // Fetch new cleared ER patients every 10 seconds
        const dataInterval = setInterval(() => {
            router.reload({ only: ['patients', 'totalReadyCount'], preserveScroll: true, preserveState: true });
        }, 10000);

        return () => {
            clearInterval(clockInterval);
            clearInterval(dataInterval);
        };
    }, []);

    // --- DATA PRIVACY FORMATTER ---
    // Converts "DELA CRUZ, JUAN MIGUEL" -> "Dela Cruz - J."
    // Also masks names without a comma (e.g. "JUAN MIGUEL DELA CRUZ" -> "Cruz - J.", "JUAN" -> "J.")
    const formatPrivacyName = (fullName) => {
        if (!fullName) return '';

        const trimmed = String(fullName).trim();
        if (!trimmed) return '';

        const toTitleCase = (text) =>
            text
                .split(/\s+/)
                .filter(Boolean)
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');

        const parts = trimmed.split(',');
        if (parts.length >= 2) {
            const lastNamePart = parts[0].trim();
            const firstNamePart = parts.slice(1).join(' ').trim();
            const formattedLastName = toTitleCase(lastNamePart);
            const firstInitial = firstNamePart ? firstNamePart.charAt(0).toUpperCase() : '';

            return firstInitial ? `${formattedLastName} - ${firstInitial}.` : formattedLastName;
        }

        const tokens = trimmed.split(/\s+/).filter(Boolean);
        if (tokens.length === 1) {
            return `${tokens[0].charAt(0).toUpperCase()}.`;
        }

        const lastName = toTitleCase(tokens[tokens.length - 1]);
        const firstInitial = tokens[0].charAt(0).toUpperCase();
        return `${lastName} - ${firstInitial}.`;
    };

    const displayedPatients = patients.slice(0, 8);
    const totalCount = Math.max(totalReadyCount ?? patients.length, patients.length);
    const extraReadyCount = Math.max(0, totalCount - displayedPatients.length);

    return (
        <div className="min-h-screen bg-slate-900 text-white p-6 md:p-8 font-sans flex flex-col gap-6">
            <Head title="ER Billing Queue" />

            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b-2 border-teal-500/70 pb-6">
                <div className="flex items-center gap-5">
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white p-1.5 shadow-lg shrink-0 flex items-center justify-center overflow-hidden">
                        <img
                            src="/images/rmph.jpg"
                            alt="Roxas Memorial Provincial Hospital Seal"
                            className="w-full h-full object-contain"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                if (e.currentTarget.nextElementSibling) {
                                    e.currentTarget.nextElementSibling.style.display = 'flex';
                                }
                            }}
                        />
                        <span className="hidden w-full h-full items-center justify-center text-rose-700 font-black text-sm tracking-tight">
                            RMPH
                        </span>
                    </div>
                    <div>
                        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white">
                            ER Billing Queue — Please Proceed to Billing
                        </h1>
                        <p className="text-base md:text-xl text-teal-300 font-semibold mt-1">
                            Emergency Room Discharge &amp; Clearance Notice
                        </p>
                    </div>
                </div>

                <div
                    aria-label="Current Philippine time"
                    className="text-3xl md:text-4xl font-mono text-teal-300 font-bold tracking-widest bg-slate-800 px-6 py-3 rounded-xl border border-slate-700 shadow-inner self-start lg:self-auto shrink-0"
                >
                    {currentTime.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' })}
                </div>
            </header>

            {/* Bilingual Wayfinding & F07 Slip Guidance */}
            <section
                aria-label="Billing instructions"
                className="bg-slate-800/90 border border-teal-500/35 rounded-2xl p-5 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6"
            >
                <div className="space-y-1">
                    <p className="text-sm font-bold uppercase tracking-wider text-teal-300">
                        English
                    </p>
                    <p className="text-lg md:text-xl text-slate-100 font-medium leading-snug">
                        When your name shows <strong className="text-teal-300 font-bold">READY</strong>, get your <strong className="text-white font-bold">Clearance Slip (Form F07)</strong> from the <strong className="text-white font-bold">ER Nurse</strong> and proceed to the <strong className="text-white font-bold">Billing &amp; Claims Window</strong>.
                    </p>
                </div>
                <div className="space-y-1 lg:border-l lg:border-slate-700 lg:pl-6">
                    <p className="text-sm font-bold uppercase tracking-wider text-teal-300">
                        Hiligaynon / Filipino
                    </p>
                    <p className="text-lg md:text-xl text-slate-100 font-medium leading-snug">
                        Kon <strong className="text-teal-300 font-bold">READY</strong> na ang inyo ngalan, kuhaa ang <strong className="text-white font-bold">Clearance Slip (Form F07)</strong> sa <strong className="text-white font-bold">ER Nurse</strong> kag magpadulong sa <strong className="text-white font-bold">Billing &amp; Claims Window</strong>.
                    </p>
                </div>
            </section>

            <main className="flex-1 flex flex-col gap-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {displayedPatients.length === 0 ? (
                        <div className="col-span-1 lg:col-span-2 bg-slate-800/60 border border-slate-700 rounded-2xl px-8 py-16 text-center space-y-3">
                            <p className="text-slate-100 text-2xl md:text-3xl font-bold">
                                No ER patients are waiting for Billing right now.
                            </p>
                            <p className="text-slate-200 text-lg md:text-xl max-w-3xl mx-auto leading-relaxed">
                                Cleared names appear here automatically. If your clearance is finished, ask your ER Nurse for your Form F07 slip before going to the Billing &amp; Claims Window.
                            </p>
                            <p className="text-slate-300 text-base md:text-lg max-w-3xl mx-auto">
                                Wala pa sang pasyente sa ER nga nagahulat sa Billing subong. Kon tapos na ang clearance, magpangayo sang Form F07 sa ER Nurse.
                            </p>
                        </div>
                    ) : (
                        displayedPatients.map((patient, idx) => (
                            <div
                                key={patient.id || patient.enccode || idx}
                                className="bg-slate-800 border border-teal-500/40 ring-1 ring-inset ring-teal-400/15 p-6 rounded-2xl shadow-lg flex justify-between items-center gap-4 animate-fade-in motion-reduce:animate-none"
                            >
                                {/* Masked Name Applied Here */}
                                <span className="text-3xl md:text-4xl font-bold tracking-wide text-white truncate">
                                    {formatPrivacyName(patient.patient_name)}
                                </span>
                                <span className="shrink-0 px-4 py-1.5 rounded-full bg-teal-500/15 border border-teal-400/40 text-xl md:text-2xl font-bold text-teal-300 tracking-wider">
                                    READY
                                </span>
                            </div>
                        ))
                    )}
                </div>

                {extraReadyCount > 0 && (
                    <div
                        role="status"
                        className="bg-teal-950/70 border border-teal-400/40 rounded-2xl px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                        <span className="text-xl md:text-2xl font-bold text-teal-200">
                            +{extraReadyCount} more ready for Billing
                        </span>
                        <span className="text-base md:text-lg text-slate-200 font-medium">
                            Names update automatically as patients are finalized. / Awtomatiko nga naga-update ang lista.
                        </span>
                    </div>
                )}
            </main>
        </div>
    );
}