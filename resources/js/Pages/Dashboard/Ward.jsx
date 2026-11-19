import React, { useState, useEffect, useRef } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import PortalLayout from '@/Layouts/PortalLayout';
import Modal from '@/Components/Modal';
import ConfirmDialog from '@/Components/ConfirmDialog';
import axios from 'axios';
import { getRequiredDepartments, isDepartmentCleared, supportsAdditionalClearance } from '@/utils/clearanceRouting';

export default function Ward({
    searchQuery,
    patient,
    clearances,
    activeQueue = [],
    clearedQueue = [],
    incomingNicuPending = [],
    incomingNicuHistory = [],
}) {
    const { auth } = usePage().props;
    const wardName = auth.user.department;
    const wardLower = (wardName || '').toLowerCase().trim();
    const isSurgOrthoWard = wardLower.includes('ortho') || wardLower.includes('surg');
    const isNicuStation = wardLower === 'nicu' || wardLower.includes('neonatal');
    const showAdditionalClearance = supportsAdditionalClearance(wardName);

    const [activeTab, setActiveTab] = useState('active');
    const [queueSearch, setQueueSearch] = useState('');
    const [isRouting, setIsRouting] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [toastMessage, setToastMessage] = useState(null);
    const [showOxygenModal, setShowOxygenModal] = useState(false);
    const [highlightedEnccode, setHighlightedEnccode] = useState(null);
    const [nicuInspectModal, setNicuInspectModal] = useState({ open: false, patient: null, orders: [], loading: false });
    const [nicuClearTarget, setNicuClearTarget] = useState(null);
    const [isClearingNicu, setIsClearingNicu] = useState(false);

    const previousClearedCount = useRef(clearedQueue.length);
    const cardRefs = useRef({});
    
    // THE BUG FIX: Tracks the current patient so background polling doesn't wipe your typing!
    const prevPatientCode = useRef(null);

    const [form, setForm] = useState({
        hospital_number: searchQuery || '',
        patient_name: patient?.name || '',
        arrival_datetime: patient?.arrival_datetime || '',
        disposition: patient?.disposition || '',
        is_oecb: '', // Blank by default to force a Yes/No choice
        has_oxygen: '', 
        oxygen_remarks: '',
        requires_or: false,
        requires_nicu: false,
    });

    useEffect(() => {
        const reloadKeys = isNicuStation
            ? ['activeQueue', 'clearedQueue', 'patient', 'clearances', 'incomingNicuPending', 'incomingNicuHistory']
            : ['activeQueue', 'clearedQueue', 'patient', 'clearances'];

        if (window.Echo) {
            window.Echo.channel('clearance-updates')
                .listen('PatientRouted', (e) => { 
                    router.reload({ 
                        only: reloadKeys, 
                        preserveScroll: true, 
                        preserveState: true 
                    });
                });
        }

        const pollInterval = setInterval(() => {
            router.reload({ 
                only: reloadKeys, 
                preserveScroll: true, 
                preserveState: true 
            });
        }, 5000); 

        if (clearedQueue.length > previousClearedCount.current) {
            new Audio('/sounds/notif.wav').play().catch(() => {});
        }
        previousClearedCount.current = clearedQueue.length;

        return () => {
            clearInterval(pollInterval);
            if (window.Echo) window.Echo.leaveChannel('clearance-updates');
        };
    }, [clearedQueue, isNicuStation]);

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

    // THE BUG FIX: Only reset the form if the actual Patient ID changed
    useEffect(() => {
        if (patient) {
            if (patient.enccode !== prevPatientCode.current) {
                setForm(prev => ({
                    ...prev,
                    patient_name: patient.name,
                    arrival_datetime: patient.arrival_datetime || '',
                    disposition: patient.disposition || '',
                    is_oecb: '',
                    has_oxygen: '',
                    oxygen_remarks: '',
                    requires_or: Boolean(patient.requires_or),
                    requires_nicu: Boolean(patient.requires_nicu),
                }));
                prevPatientCode.current = patient.enccode;
                setIsSearching(false);
            }
        } else {
            if (prevPatientCode.current !== null) {
                setForm(prev => ({
                    ...prev,
                    patient_name: '',
                    arrival_datetime: '',
                    disposition: '',
                    is_oecb: '',
                    has_oxygen: '',
                    oxygen_remarks: '',
                    requires_or: false,
                    requires_nicu: false,
                }));
            }
            prevPatientCode.current = null;
        }
    }, [patient]);

    useEffect(() => {
        if (!highlightedEnccode) return;
        const timer = setTimeout(() => setHighlightedEnccode(null), 3500);
        return () => clearTimeout(timer);
    }, [highlightedEnccode]);

    const handleOxygenToggle = (e) => {
        const val = e.target.value;
        setForm(prev => ({ ...prev, has_oxygen: val }));
        
        if (val === 'Yes') {
            setShowOxygenModal(true);
        } else {
            setForm(prev => ({ ...prev, oxygen_remarks: '' })); 
        }
    };

    const handleRoutePatient = (e) => {
        e.preventDefault();
        setIsRouting(true);
        
        router.post('/transactions', {
            enccode: patient?.enccode,
            hospital_number: form.hospital_number,
            patient_name: form.patient_name,
            arrival_datetime: form.arrival_datetime,
            disposition: form.disposition,
            room_ward: wardName,
            is_oecb: form.is_oecb === 'Yes', // Converts "Yes" to true for the database
            has_oxygen: form.has_oxygen === 'Yes',
            oxygen_remarks: form.oxygen_remarks,
            requires_or: showAdditionalClearance && Boolean(form.requires_or),
            requires_nicu: showAdditionalClearance && Boolean(form.requires_nicu),
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setIsRouting(false);
                prevPatientCode.current = null; // Clears the tracker for the next patient
                setForm({
                    hospital_number: '',
                    patient_name: '',
                    arrival_datetime: '',
                    disposition: '',
                    is_oecb: '',
                    has_oxygen: '',
                    oxygen_remarks: '',
                    requires_or: false,
                    requires_nicu: false,
                });
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
    const trimmedQueueSearch = queueSearch.trim().toLowerCase();
    const filteredDisplayQueue = trimmedQueueSearch
        ? displayQueue.filter((tx) =>
            (tx.patient_name || '').toLowerCase().includes(trimmedQueueSearch) ||
            (tx.hospital_number || '').toLowerCase().includes(trimmedQueueSearch) ||
            (tx.enccode || '').toLowerCase().includes(trimmedQueueSearch) ||
            (tx.disposition || '').toLowerCase().includes(trimmedQueueSearch)
        )
        : displayQueue;
    const hasSearchedNoMatch = Boolean(
        !isSearching &&
        searchQuery &&
        patient === null &&
        form.hospital_number.trim() === searchQuery.trim()
    );
    const routedInActive = patient?.is_routed ? activeQueue.find(tx => tx.enccode === patient.enccode) : null;
    const routedInCleared = patient?.is_routed ? clearedQueue.find(tx => tx.enccode === patient.enccode) : null;
    const routedInWardQueue = Boolean(routedInActive || routedInCleared);

    const handleViewInQueue = () => {
        if (!patient?.enccode) return;
        setQueueSearch('');
        setActiveTab(routedInCleared ? 'completed' : 'active');
        setHighlightedEnccode(patient.enccode);
        setTimeout(() => {
            const el = cardRefs.current[patient.enccode];
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 80);
    };

    const openNicuInspect = async (item) => {
        setNicuInspectModal({ open: true, patient: item, orders: [], loading: true });
        try {
            const res = await axios.get(`/clearance-data/fetch?enccode=${encodeURIComponent(item.enccode)}`, {
                headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            });
            const payload = res.data?.props || res.data?.data || res.data || {};
            setNicuInspectModal({ open: true, patient: item, orders: payload.nicuOrders || [], loading: false });
        } catch (err) {
            setNicuInspectModal({ open: true, patient: item, orders: [], loading: false });
        }
    };

    const executeClearNicu = () => {
        if (!nicuClearTarget) return;
        setIsClearingNicu(true);
        router.post('/clearance', {
            enccode: nicuClearTarget.enccode,
            department: 'NICU',
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setIsClearingNicu(false);
                setNicuClearTarget(null);
                setNicuInspectModal({ open: false, patient: null, orders: [], loading: false });
                setToastMessage('NICU clearance recorded!');
                setTimeout(() => setToastMessage(null), 3000);
            },
            onError: () => {
                setIsClearingNicu(false);
                setNicuClearTarget(null);
                setToastMessage('Failed to clear NICU station. Please try again.');
                setTimeout(() => setToastMessage(null), 4000);
            },
        });
    };

    return (
        <PortalLayout>
            <Head title={`${wardName} Dashboard`} />
            
            <div className="flex flex-col md:flex-row gap-6 w-full p-6 bg-slate-100 min-h-[calc(100vh-64px)] font-sans">
                
                {/* LEFT SIDEBAR: INTAKE FORM */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col shrink-0 w-full md:w-80 h-fit">
                    <div className="mb-6 px-2 pt-2 border-b border-slate-100 pb-4 flex justify-between items-start">
                        <div>
                            <h2 className="text-[11px] font-black text-teal-600 uppercase tracking-widest mb-1">Clinical Station</h2>
                            <div className="text-xl font-bold text-slate-800">{wardName}</div>
                        </div>
                    </div>

                    <form onSubmit={handleRoutePatient} className="space-y-5 flex-1">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 flex justify-between">
                                <span>Hospital Number</span>
                                {isSearching && <span className="text-teal-500 animate-pulse motion-reduce:animate-none">Searching...</span>}
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

                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Patient Name</label>
                            {isSearching ? (
                                <div className="w-full h-8 bg-slate-200 animate-pulse motion-reduce:animate-none rounded border border-slate-300"></div>
                            ) : (
                                <div>
                                    <input 
                                        type="text" 
                                        value={form.patient_name}
                                        readOnly
                                        className="w-full px-0 py-1 bg-transparent border-transparent text-sm font-bold text-slate-800 focus:ring-0 uppercase cursor-default" 
                                        placeholder="LASTNAME, FIRSTNAME" 
                                    />
                                    {patient?.enccode && (
                                        <p className="text-[11px] font-mono text-slate-400 mt-1 uppercase">ENC: {patient.enccode}</p>
                                    )}
                                    {hasSearchedNoMatch && (
                                        <div role="status" className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                                            <p className="font-bold">No iHOMIS encounter found</p>
                                            <p className="text-[11px] text-amber-800 mt-0.5">Verify the hospital number or encounter code and try again.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                                {showAdditionalClearance ? 'Date Admitted' : 'Arrival Time'}
                            </label>
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

                        {/* REQUIRED YES/NO RADIO BUTTONS FOR ER */}
                        {wardName === 'Emergency Room' && (
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4 mt-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                                        Is this an OECB Patient? <span className="text-rose-500 text-sm">*</span>
                                    </label>
                                    <div className="flex gap-6">
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name="is_oecb" 
                                                value="Yes" 
                                                checked={form.is_oecb === 'Yes'} 
                                                onChange={e => setForm({...form, is_oecb: e.target.value})} 
                                                className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300" 
                                                required 
                                            />
                                            <span className="text-sm font-bold text-slate-700 uppercase">Yes</span>
                                        </label>
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name="is_oecb" 
                                                value="No" 
                                                checked={form.is_oecb === 'No'} 
                                                onChange={e => setForm({...form, is_oecb: e.target.value})} 
                                                className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300" 
                                                required 
                                            />
                                            <span className="text-sm font-bold text-slate-700 uppercase">No</span>
                                        </label>
                                    </div>
                                </div>
                                
                                <div className="pt-3 border-t border-slate-200">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                                        Has Oxygen Charges? <span className="text-rose-500 text-sm">*</span>
                                    </label>
                                    <div className="flex gap-6">
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name="has_oxygen" 
                                                value="Yes" 
                                                checked={form.has_oxygen === 'Yes'} 
                                                onChange={handleOxygenToggle} 
                                                className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300" 
                                                required 
                                            />
                                            <span className="text-sm font-bold text-slate-700 uppercase">Yes</span>
                                        </label>
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input 
                                                type="radio" 
                                                name="has_oxygen" 
                                                value="No" 
                                                checked={form.has_oxygen === 'No'} 
                                                onChange={handleOxygenToggle} 
                                                className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300" 
                                                required 
                                            />
                                            <span className="text-sm font-bold text-slate-700 uppercase">No</span>
                                        </label>
                                    </div>

                                    {form.has_oxygen === 'Yes' && form.oxygen_remarks && (
                                        <div className="mt-3 text-xs font-medium text-sky-800 bg-sky-50 p-2.5 rounded border border-sky-200 italic line-clamp-2">
                                            "{form.oxygen_remarks}"
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ADDITIONAL CLEARANCE TOGGLES FOR ADMITTED WARDS (EXCLUDES ER & OUTPATIENT) */}
                        {showAdditionalClearance && (
                        <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                    Additional Clearance
                                </span>
                                <span className="text-[10px] font-semibold text-slate-400 uppercase">
                                    Optional
                                </span>
                            </div>

                            {/* OR CLEARANCE TOGGLE */}
                            <button
                                type="button"
                                disabled={isSurgOrthoWard}
                                aria-pressed={isSurgOrthoWard ? true : Boolean(form.requires_or)}
                                onClick={() => setForm(prev => ({ ...prev, requires_or: !prev.requires_or }))}
                                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                                    isSurgOrthoWard
                                        ? 'bg-teal-50/70 border-teal-200 text-teal-800 cursor-default'
                                        : form.requires_or
                                            ? 'bg-teal-50 border-teal-500 text-teal-900 ring-1 ring-teal-500 shadow-sm'
                                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                                }`}
                            >
                                <div className="min-w-0">
                                    <div className="text-xs font-extrabold uppercase tracking-wide flex items-center gap-1.5">
                                        <span>Clear in OR</span>
                                        {isSurgOrthoWard && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">Default</span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                                        {isSurgOrthoWard ? 'Included automatically for this ward' : 'Operating Room clearance (e.g. C-Section / Surgery)'}
                                    </p>
                                </div>
                                <span
                                    aria-hidden="true"
                                    className={`shrink-0 inline-flex items-center w-10 h-5 rounded-full p-0.5 transition-colors ${
                                        (isSurgOrthoWard || form.requires_or) ? 'bg-teal-600 justify-end' : 'bg-slate-300 justify-start'
                                    }`}
                                >
                                    <span className="w-4 h-4 rounded-full bg-white shadow-sm"></span>
                                </span>
                            </button>

                            {/* BABY / NICU CLEARANCE TOGGLE */}
                            <button
                                type="button"
                                disabled={isNicuStation}
                                aria-pressed={isNicuStation ? true : Boolean(form.requires_nicu)}
                                onClick={() => setForm(prev => ({ ...prev, requires_nicu: !prev.requires_nicu }))}
                                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                                    isNicuStation
                                        ? 'bg-sky-50/70 border-sky-200 text-sky-800 cursor-default'
                                        : form.requires_nicu
                                            ? 'bg-sky-50 border-sky-500 text-sky-900 ring-1 ring-sky-500 shadow-sm'
                                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                                }`}
                            >
                                <div className="min-w-0">
                                    <div className="text-xs font-extrabold uppercase tracking-wide flex items-center gap-1.5">
                                        <span>Baby · NICU Clearance</span>
                                        {isNicuStation && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">Current</span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                                        {isNicuStation ? 'Originating from NICU ward' : 'Toggle if patient is a Baby requiring NICU clearance'}
                                    </p>
                                </div>
                                <span
                                    aria-hidden="true"
                                    className={`shrink-0 inline-flex items-center w-10 h-5 rounded-full p-0.5 transition-colors ${
                                        (isNicuStation || form.requires_nicu) ? 'bg-sky-600 justify-end' : 'bg-slate-300 justify-start'
                                    }`}
                                >
                                    <span className="w-4 h-4 rounded-full bg-white shadow-sm"></span>
                                </span>
                            </button>
                        </div>
                        )}

                        <div className="pt-2 mt-6 border-t border-slate-100">
                            {patient?.is_routed ? (
                                <div className="space-y-2.5">
                                    <div className="w-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold py-2.5 px-3 rounded-lg flex items-center justify-center space-x-2 text-sm">
                                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
                                        <span>Already Routed</span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {routedInWardQueue && (
                                            <button
                                                type="button"
                                                onClick={handleViewInQueue}
                                                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-3 rounded-lg shadow-sm transition-colors flex items-center justify-center space-x-2 text-xs"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                                <span>View in Queue</span>
                                            </button>
                                        )}
                                        <a
                                            href={`/print-clearance/document?enccode=${encodeURIComponent(patient.enccode)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 px-3 rounded-lg shadow-sm transition-colors flex items-center justify-center space-x-2 text-xs"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                                            <span>Print F07</span>
                                        </a>
                                    </div>
                                </div>
                            ) : (
                                <button 
                                    type="submit" 
                                    disabled={!patient || isRouting}
                                    className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 text-white font-bold py-3 px-4 rounded-lg shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:cursor-not-allowed"
                                >
                                    {isRouting ? (
                                        <>
                                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            <span>Routing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                            <span>Route Clearance</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                {/* MAIN CONTENT: DYNAMIC TRACKING */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 shrink-0">
                        <div className="flex items-center space-x-3">
                            <h3 className="text-lg font-bold text-slate-800">Clearance Tracker</h3>
                            <span className="inline-flex rounded-full h-2 w-2 bg-teal-500" title="Live Sync Active" aria-hidden="true"></span>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                            <div className="relative w-full sm:w-64">
                                <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                <input
                                    type="text"
                                    value={queueSearch}
                                    onChange={(e) => setQueueSearch(e.target.value)}
                                    aria-label="Search clearance tracker queue"
                                    placeholder="Search queue (name or #)..."
                                    className="w-full pl-9 pr-8 py-1.5 rounded-lg border-slate-300 shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm transition-all"
                                />
                                {queueSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setQueueSearch('')}
                                        aria-label="Clear queue search"
                                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <div className="flex p-1 bg-slate-200/60 rounded-lg shadow-inner shrink-0 flex-wrap gap-1">
                                <button 
                                    type="button"
                                    onClick={() => setActiveTab('active')} 
                                    className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${activeTab === 'active' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Active 
                                    {activeQueue.length > 0 && <span className="ml-1 bg-rose-500 text-white text-[11px] px-1.5 py-0.5 rounded-full">{activeQueue.length}</span>}
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setActiveTab('completed')} 
                                    className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${activeTab === 'completed' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Completed History
                                </button>
                                {isNicuStation && (
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('nicu')}
                                        className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${activeTab === 'nicu' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        NICU Clearances
                                        {incomingNicuPending.length > 0 && (
                                            <span className="ml-1.5 bg-sky-600 text-white text-[11px] px-1.5 py-0.5 rounded-full">{incomingNicuPending.length}</span>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 p-6 space-y-4 bg-slate-50/50">
                        {activeTab === 'nicu' && isNicuStation ? (
                            <div className="space-y-6">
                                <div>
                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">
                                        Pending Babies Requiring NICU Clearance ({incomingNicuPending.length})
                                    </h4>
                                    {incomingNicuPending.length === 0 ? (
                                        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
                                            No pending NICU clearance requests from other wards.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {incomingNicuPending
                                                .filter((item) => !trimmedQueueSearch ||
                                                    (item.name || '').toLowerCase().includes(trimmedQueueSearch) ||
                                                    (item.hospital_number || '').toLowerCase().includes(trimmedQueueSearch) ||
                                                    (item.ward || '').toLowerCase().includes(trimmedQueueSearch))
                                                .map((item) => (
                                                    <div key={item.enccode} className="bg-white border border-sky-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                        <div>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="font-bold text-slate-800 text-base">{item.name}</span>
                                                                <span className="text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">{item.hospital_number}</span>
                                                                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200">{item.ward}</span>
                                                            </div>
                                                            <p className="text-xs text-slate-500 mt-1">
                                                                Disposition: <span className="font-semibold text-slate-700">{item.disposition || 'N/A'}</span>
                                                                {' · '}Routed {new Date(item.date).toLocaleString()}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => openNicuInspect(item)}
                                                                className="px-3.5 py-2 text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                                                            >
                                                                Inspect Orders
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setNicuClearTarget(item)}
                                                                className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm transition-colors"
                                                            >
                                                                Clear NICU
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>

                                {incomingNicuHistory.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">
                                            Recently Cleared by NICU ({incomingNicuHistory.length})
                                        </h4>
                                        <div className="space-y-2">
                                            {incomingNicuHistory.slice(0, 15).map((item) => (
                                                <div key={item.enccode} className="bg-white border border-emerald-200/80 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-slate-700 text-sm">{item.name}</span>
                                                            <span className="text-[11px] font-mono text-slate-400">{item.hospital_number}</span>
                                                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">{item.ward}</span>
                                                        </div>
                                                        <div className="text-[11px] text-slate-400 mt-0.5">
                                                            Cleared {new Date(item.cleared_date).toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                                                        ✓ NICU Cleared
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : filteredDisplayQueue.length === 0 ? (
                            <div className="text-center py-12">
                                <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                                {trimmedQueueSearch ? (
                                    <div className="space-y-2">
                                        <p className="text-sm font-medium text-slate-600">
                                            No {activeTab} clearances matching &ldquo;{queueSearch}&rdquo;.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setQueueSearch('')}
                                            className="text-xs font-bold text-teal-700 hover:text-teal-900 underline"
                                        >
                                            Clear queue search
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-sm font-medium text-slate-500">No {activeTab} clearances for {wardName}.</p>
                                )}
                            </div>
                        ) : (
                            filteredDisplayQueue.map((tx, idx) => {
                                const requiredDepts = getRequiredDepartments(tx.room_ward, Boolean(tx.requires_or), Boolean(tx.requires_nicu));
                                const gridColsClass = requiredDepts.length >= 8
                                    ? 'md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8'
                                    : requiredDepts.length === 7
                                        ? 'md:grid-cols-4 lg:grid-cols-7'
                                        : requiredDepts.length === 6
                                            ? 'md:grid-cols-3 lg:grid-cols-6'
                                            : 'md:grid-cols-5';

                                return (
                                    <div
                                        key={tx.enccode || idx}
                                        ref={(el) => { if (tx.enccode) cardRefs.current[tx.enccode] = el; }}
                                        className={`bg-white border border-slate-200 rounded-xl p-4 shadow-sm select-none transition-all duration-300 ${highlightedEnccode === tx.enccode ? 'ring-2 ring-teal-500 border-teal-500 bg-teal-50/30' : ''} ${activeTab === 'completed' ? 'opacity-90 border-emerald-200' : 'border-slate-200 hover:shadow-md'}`}
                                    >
                                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-lg flex flex-wrap items-center gap-2">
                                                    {tx.patient_name}
                                                    {tx.is_oecb && (
                                                        <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded border border-amber-300">OECB</span>
                                                    )}
                                                    {tx.requires_or && (
                                                        <span className="bg-teal-100 text-teal-800 text-[11px] font-bold px-2 py-0.5 rounded border border-teal-300">+ OR</span>
                                                    )}
                                                    {tx.requires_nicu && (
                                                        <span className="bg-sky-100 text-sky-800 text-[11px] font-bold px-2 py-0.5 rounded border border-sky-300">Baby · NICU</span>
                                                    )}
                                                    <span className="text-xs text-slate-400 font-mono border border-slate-200 px-2 py-0.5 rounded bg-slate-50">{tx.hospital_number}</span>
                                                </h4>
                                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mt-1">Disposition: {tx.disposition}</p>
                                            </div>
                                            <div className="text-right">
                                                {tx.overall_status === 'Cleared' || tx.overall_status === 'Archived' ? (
                                                    <div className="flex items-center gap-3">
                                                        <span className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                            Fully Cleared
                                                        </span>
                                                        <a href={`/print-clearance/document?enccode=${encodeURIComponent(tx.enccode)}`} target="_blank" rel="noreferrer" className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-bold bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm">
                                                            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                                                            Print F07
                                                        </a>
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                                        <svg className="w-3 h-3 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                        Routing in Progress
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className={`grid grid-cols-2 ${gridColsClass} gap-2`}>
                                            {requiredDepts.map((dept, i) => {
                                                const isApproved = isDepartmentCleared(tx.cleared_departments, dept);
                                                
                                                return (
                                                    <div key={i} className={`border rounded-lg p-2.5 text-center cursor-default transition-all duration-500 ${isApproved ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-slate-50 border-slate-200'}`}>
                                                        <div className={`text-[11px] font-black uppercase mb-1 truncate transition-colors ${isApproved ? 'text-emerald-700' : 'text-slate-500'}`}>
                                                            {dept}
                                                        </div>
                                                        
                                                        {isApproved ? (
                                                            <span className="text-emerald-600 text-xs font-bold flex items-center justify-center space-x-1">
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                                <span>Cleared</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-amber-500 text-xs font-bold flex items-center justify-center space-x-1">
                                                                <svg className="w-3 h-3 animate-pulse motion-reduce:animate-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                                <span>Pending</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* OXYGEN MODAL WITH "type=button" FIX */}
            <Modal
                show={showOxygenModal}
                onClose={() => setShowOxygenModal(false)}
                maxWidth="md"
                zIndexClass="z-[400]"
            >
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-800">Oxygen Remarks</h3>
                    <button
                        type="button"
                        aria-label="Close modal"
                        onClick={() => setShowOxygenModal(false)}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div className="p-6">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                        Provide notes for Cardio Pulmo
                    </label>
                    <textarea
                        rows="4"
                        value={form.oxygen_remarks}
                        onChange={e => setForm({...form, oxygen_remarks: e.target.value})}
                        placeholder="e.g., Used 1 tank for 4 hours..."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 resize-none"
                        autoFocus
                    ></textarea>
                    <div className="mt-4 flex justify-end gap-3">
                        <button 
                            type="button" // Fixes the bug where clicking cancel accidentally submitted the whole form!
                            onClick={() => { setForm({...form, has_oxygen: 'No', oxygen_remarks: ''}); setShowOxygenModal(false); }}
                            className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="button" // Fixes accidental form submission
                            onClick={() => setShowOxygenModal(false)}
                            className="px-4 py-2 text-sm font-bold bg-teal-600 text-white hover:bg-teal-700 rounded-lg shadow-sm transition-colors"
                        >
                            Save Notes
                        </button>
                    </div>
                </div>
            </Modal>

            {/* NICU ORDER INSPECTION MODAL */}
            <Modal
                show={nicuInspectModal.open}
                onClose={() => setNicuInspectModal({ open: false, patient: null, orders: [], loading: false })}
                maxWidth="lg"
                zIndexClass="z-[350]"
            >
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-bold text-slate-800">
                            NICU Clearance Inspection — {nicuInspectModal.patient?.name}
                        </h3>
                        <p className="text-xs text-slate-500">
                            From {nicuInspectModal.patient?.ward} · Hosp #: {nicuInspectModal.patient?.hospital_number}
                        </p>
                    </div>
                    <button
                        type="button"
                        aria-label="Close modal"
                        onClick={() => setNicuInspectModal({ open: false, patient: null, orders: [], loading: false })}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {nicuInspectModal.loading ? (
                        <div className="text-sm text-slate-500 py-6 text-center">Loading iHOMIS records...</div>
                    ) : nicuInspectModal.orders.length === 0 ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-800 font-medium">
                            No pending NICU-specific charges found in iHOMIS. Ready to clear if baby has no unsettled NICU items.
                        </div>
                    ) : (
                        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                            {nicuInspectModal.orders.map((ord, idx) => (
                                <div key={idx} className="p-3 flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-700">{ord.item_description}</span>
                                    <span className={`px-2 py-0.5 rounded font-bold ${ord.status === 'S' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                        {ord.status === 'S' ? 'Served' : ord.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={() => setNicuInspectModal({ open: false, patient: null, orders: [], loading: false })}
                            className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                            Close
                        </button>
                        <button
                            type="button"
                            onClick={() => setNicuClearTarget(nicuInspectModal.patient)}
                            className="px-4 py-2 text-sm font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg shadow-sm"
                        >
                            Clear NICU
                        </button>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                show={Boolean(nicuClearTarget)}
                onClose={() => { if (!isClearingNicu) setNicuClearTarget(null); }}
                onConfirm={executeClearNicu}
                title="Confirm NICU Clearance"
                message={`Mark NICU clearance as CLEARED for ${nicuClearTarget?.name || 'this baby'} (from ${nicuClearTarget?.ward || 'ward'})?`}
                confirmLabel="Yes, Clear NICU"
                tone="teal"
                loading={isClearingNicu}
            />

            {toastMessage && (
                <div className="fixed top-6 right-6 z-[200] flex items-center bg-teal-600 text-white px-5 py-3.5 rounded-xl shadow-2xl animate-slide-in-top motion-reduce:animate-none">
                    <div className="bg-teal-500 rounded-full p-1 mr-3">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <span className="font-bold text-sm tracking-wide">{toastMessage}</span>
                    <button type="button" aria-label="Dismiss notification" onClick={() => setToastMessage(null)} className="ml-4 text-teal-200 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            )}
        </PortalLayout>
    );
}