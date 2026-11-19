import React, { useState, useEffect, useRef } from 'react';
import { Head, router } from '@inertiajs/react';
import PortalLayout from '@/Layouts/PortalLayout';
import Modal from '@/Components/Modal';
import BillingReportsPanel from '@/Components/BillingReportsPanel';

export default function Billing({ 
    clearedPatients = [], 
    archivedPatients = [], 
    routedPatients = [],
    costCenterStats = {},
    hospitalStats = {},
    wards = [],
    costCentersList = [],
    archivePagination = { current_page: 1, last_page: 1, per_page: 50, total: 0, from: 0, to: 0 },
    totalArchivedCount = 0, 
    archiveSearch = '', 
    archivePage = 1,
    archivePerPage = 50,
    canGenerateReports = false,
    isBillingHead = false,
}) {
    // Top-level Navigation: 'reports' (Head of Billing) | 'routing' | 'ready' | 'archived'
    const [activeTab, setActiveTab] = useState(isBillingHead ? 'reports' : 'routing');

    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState(archiveSearch || '');
    const [routingSearch, setRoutingSearch] = useState('');
    const [selectedWard, setSelectedWard] = useState('all');
    const [selectedCostCenter, setSelectedCostCenter] = useState('all');
    const [selectedStatusFilter, setSelectedStatusFilter] = useState('all'); // 'all' | 'waiting_selected' | 'almost_done'
    const [routingSubView, setRoutingSubView] = useState('queue'); // 'queue' | 'analytics'

    // Modals & Row Expansion
    const [inspectPatient, setInspectPatient] = useState(null);
    const [inspectCostCenter, setInspectCostCenter] = useState(null);
    const [expandedPatients, setExpandedPatients] = useState({});

    const toggleExpandPatient = (patientId) => {
        setExpandedPatients((prev) => ({
            ...prev,
            [patientId]: !prev[patientId],
        }));
    };

    // Archives Pagination & Print State
    const [jumpPageInput, setJumpPageInput] = useState('');
    const [isSearchingArchive, setIsSearchingArchive] = useState(false);
    const [printingEncounter, setPrintingEncounter] = useState(null);
    const [printSequence, setPrintSequence] = useState(0);
    const [awaitingArchiveConfirm, setAwaitingArchiveConfirm] = useState(null);
    const [archivingEncounter, setArchivingEncounter] = useState(null);
    const [archiveError, setArchiveError] = useState(null);
    const [soundEnabled, setSoundEnabled] = useState(true);
    
    const previousClearedCount = useRef(clearedPatients.length);
    const isFirstMount = useRef(true);

    // Current displayed list for Ready and Archived tabs
    const currentList = activeTab === 'ready' ? clearedPatients : archivedPatients;
    
    // Client-side instant filter for ready queue
    const filteredPatients = currentList.filter(patient => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase().trim();
        return (
            (patient.patient_name || '').toLowerCase().includes(term) || 
            (patient.hospital_number || '').includes(term) ||
            (patient.enccode || '').toLowerCase().includes(term)
        );
    });

    // Client-side filtering for Routed Patients
    const filteredRoutedPatients = routedPatients.filter(patient => {
        // Ward filter
        if (selectedWard !== 'all' && (patient.room_ward || '').toLowerCase() !== selectedWard.toLowerCase()) {
            return false;
        }

        // Cost Center filter
        if (selectedCostCenter !== 'all') {
            const hasTargetStation = (patient.stations || []).some(
                st => st.department === selectedCostCenter
            );
            if (!hasTargetStation) return false;

            if (selectedStatusFilter === 'waiting_selected') {
                const isWaitingOnTarget = (patient.stations || []).some(
                    st => st.department === selectedCostCenter && st.status === 'Pending'
                );
                if (!isWaitingOnTarget) return false;
            }
        }

        // Status filter
        if (selectedStatusFilter === 'almost_done' && patient.pending_stations !== 1) {
            return false;
        }

        // Search term
        if (routingSearch.trim()) {
            const term = routingSearch.toLowerCase().trim();
            const matchesName = (patient.patient_name || '').toLowerCase().includes(term);
            const matchesHosp = (patient.hospital_number || '').toLowerCase().includes(term);
            const matchesEnc = (patient.enccode || '').toLowerCase().includes(term);
            const matchesWard = (patient.room_ward || '').toLowerCase().includes(term);
            const matchesEncoder = (patient.encoded_by || '').toLowerCase().includes(term);
            return matchesName || matchesHosp || matchesEnc || matchesWard || matchesEncoder;
        }

        return true;
    });

    // 1. OPTIMIZED BACKGROUND POLLING:
    // Polls every 5s depending on current active tab.
    // Never disturbs archives pagination or search.
    useEffect(() => {
        const pollInterval = setInterval(() => {
            if (activeTab === 'routing') {
                router.reload({ 
                    only: ['routedPatients', 'costCenterStats', 'hospitalStats', 'clearedPatients'], 
                    preserveScroll: true, 
                    preserveState: true 
                });
            } else if (activeTab === 'ready') {
                router.reload({ 
                    only: ['clearedPatients', 'routedPatients'], 
                    preserveScroll: true, 
                    preserveState: true 
                });
            }
        }, 5000); 

        if (clearedPatients.length > previousClearedCount.current && soundEnabled) {
            new Audio('/sounds/notif.wav').play().catch(() => {});
        }
        
        previousClearedCount.current = clearedPatients.length;

        return () => clearInterval(pollInterval);
    }, [clearedPatients, soundEnabled, activeTab]);

    // 2. SERVER-SIDE SEARCH FOR ARCHIVES:
    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }

        if (activeTab !== 'archived') return;

        setIsSearchingArchive(true);
        const timer = setTimeout(() => {
            router.get('/', 
                { 
                    archive_page: 1, 
                    archive_search: searchTerm.trim(), 
                    archive_per_page: archivePagination.per_page || 50 
                },
                { 
                    preserveState: true, 
                    preserveScroll: true, 
                    only: ['archivedPatients', 'archivePagination', 'totalArchivedCount'],
                    onFinish: () => setIsSearchingArchive(false)
                }
            );
        }, 350);

        return () => clearTimeout(timer);
    }, [searchTerm, activeTab]);

    // Navigation and Pagination Handlers for Archives
    const navigateArchive = (page, perPage = archivePagination.per_page, search = searchTerm) => {
        setIsSearchingArchive(true);
        router.get('/', 
            { 
                archive_page: page, 
                archive_per_page: perPage,
                archive_search: (search || '').trim() 
            }, 
            { 
                preserveState: true, 
                preserveScroll: true, 
                only: ['archivedPatients', 'archivePagination', 'totalArchivedCount'],
                onFinish: () => setIsSearchingArchive(false)
            }
        );
    };

    const handlePageChange = (newPage) => {
        if (newPage < 1 || newPage > (archivePagination.last_page || 1)) return;
        navigateArchive(newPage);
    };

    const handlePerPageChange = (e) => {
        const newLimit = parseInt(e.target.value);
        navigateArchive(1, newLimit);
    };

    const handleJumpPage = (e) => {
        e.preventDefault();
        const p = parseInt(jumpPageInput);
        if (!isNaN(p) && p >= 1 && p <= (archivePagination.last_page || 1)) {
            navigateArchive(p);
            setJumpPageInput('');
        }
    };

    const handleOpenPrint = (enccode) => {
        setArchiveError(null);
        setPrintingEncounter(enccode);
        setPrintSequence((n) => n + 1);
        if (activeTab === 'ready') {
            setAwaitingArchiveConfirm(enccode);
        }
    };

    const handleConfirmArchive = (enccode) => {
        setArchiveError(null);
        setArchivingEncounter(enccode);
        router.post('/clearance/archive', { enccode }, {
            preserveScroll: true,
            preserveState: true,
            onSuccess: () => {
                setArchivingEncounter(null);
                setAwaitingArchiveConfirm(null);
                setPrintingEncounter(null);
            },
            onError: () => {
                setArchivingEncounter(null);
                setArchiveError('Failed to archive clearance. Please check your connection and try again.');
            }
        });
    };

    const handleCancelPrintArchive = () => {
        setAwaitingArchiveConfirm(null);
        setPrintingEncounter(null);
        setArchiveError(null);
    };

    // Helper to calculate page number items with ellipses
    const getPageNumbers = () => {
        const current = archivePagination.current_page || 1;
        const last = archivePagination.last_page || 1;
        if (last <= 7) {
            return Array.from({ length: last }, (_, i) => i + 1);
        }
        const delta = 2;
        const pages = [];
        for (let i = Math.max(2, current - delta); i <= Math.min(last - 1, current + delta); i++) {
            pages.push(i);
        }
        if (current - delta > 2) pages.unshift('...');
        if (current + delta < last - 1) pages.push('...');
        pages.unshift(1);
        if (last > 1) pages.push(last);
        return pages;
    };

    // Cost Center entries sorted by average turnaround time
    const costCenterEntries = Object.values(costCenterStats || {});
    const maxAvgMinutes = Math.max(...costCenterEntries.map(c => c.avg_minutes || 0), 1);

    return (
        <PortalLayout>
            <Head title={isBillingHead ? 'Head of Billing & Claims Portal' : 'Billing & Claims Portal'} />
            
            <div className="flex flex-col lg:flex-row gap-6 w-full p-4 sm:p-6 bg-slate-100 min-h-[calc(100vh-64px)] font-sans">
                
                {/* LEFT SIDEBAR */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col shrink-0 w-full lg:w-[270px]">
                    <div className="mb-5 px-1 pt-1 flex justify-between items-start border-b border-slate-100 pb-4">
                        <div>
                            <h2 className="text-lg font-extrabold text-slate-900 leading-snug tracking-tight">
                                {isBillingHead ? 'Head of Billing & Claims' : 'Billing & Claims'}
                            </h2>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                                {isBillingHead ? 'Reports & clearance oversight' : 'Finalization & F07 queue'}
                            </p>
                        </div>
                        <button 
                            type="button"
                            onClick={() => setSoundEnabled(!soundEnabled)} 
                            className="text-slate-400 hover:text-teal-600 transition-colors p-1.5 bg-slate-50 rounded-lg border border-slate-200 shadow-sm shrink-0" 
                            title={soundEnabled ? "Mute Clearance Alerts" : "Enable Clearance Alerts"}
                            aria-label={soundEnabled ? "Mute clearance alerts" : "Enable clearance alerts"}
                        >
                            {soundEnabled ? (
                                <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10c0-1.1.9-2 2-2h2l4-4v16l-4-4H7a2 2 0 01-2-2v-4z"></path></svg>
                            ) : (
                                <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h2.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg>
                            )}
                        </button>
                    </div>

                    {/* Navigation Tabs */}
                    <nav className="flex-1 space-y-1.5">
                        {/* 1. ROUTING MONITOR TAB */}
                        <button 
                            type="button"
                            onClick={() => setActiveTab('routing')} 
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                                activeTab === 'routing' 
                                    ? 'bg-amber-50 text-amber-900 border-amber-200 shadow-sm' 
                                    : 'text-slate-600 hover:bg-slate-50 border-transparent'
                            }`}
                        >
                            <div className="flex items-center space-x-2.5">
                                <span className={`p-1.5 rounded-lg ${activeTab === 'routing' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                                </span>
                                <div className="text-left">
                                    <span className="block font-bold">Routing Monitor</span>
                                    <span className={`text-[11px] font-normal ${activeTab === 'routing' ? 'text-amber-800/80' : 'text-slate-500'}`}>Active routing &amp; speed</span>
                                </div>
                            </div>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono tabular-nums font-bold ${
                                routedPatients.length > 0 ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'
                            }`}>
                                {routedPatients.length}
                            </span>
                        </button>

                        {/* 2. READY FOR PRINT TAB */}
                        <button 
                            type="button"
                            onClick={() => setActiveTab('ready')} 
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                                activeTab === 'ready' 
                                    ? 'bg-teal-50 text-teal-900 border-teal-200 shadow-sm' 
                                    : 'text-slate-600 hover:bg-slate-50 border-transparent'
                            }`}
                        >
                            <div className="flex items-center space-x-2.5">
                                <span className={`p-1.5 rounded-lg ${activeTab === 'ready' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                </span>
                                <div className="text-left">
                                    <span className="block font-bold">Ready for Print</span>
                                    <span className={`text-[11px] font-normal ${activeTab === 'ready' ? 'text-teal-800/80' : 'text-slate-500'}`}>Fully cleared queue</span>
                                </div>
                            </div>
                            {clearedPatients.length > 0 && (
                                <span className="bg-teal-600 text-white text-[11px] px-2 py-0.5 rounded-full font-mono tabular-nums font-bold">
                                    {clearedPatients.length}
                                </span>
                            )}
                        </button>

                        {/* 3. PRINTED ARCHIVES TAB */}
                        <button 
                            type="button"
                            onClick={() => setActiveTab('archived')} 
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                                activeTab === 'archived' 
                                    ? 'bg-slate-100 text-slate-900 border-slate-300 shadow-sm' 
                                    : 'text-slate-600 hover:bg-slate-50 border-transparent'
                            }`}
                        >
                            <div className="flex items-center space-x-2.5">
                                <span className={`p-1.5 rounded-lg ${activeTab === 'archived' ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-500'}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                                </span>
                                <div className="text-left">
                                    <span className="block font-bold">Printed Archives</span>
                                    <span className="text-[11px] text-slate-500 font-normal">Finalized masterlist</span>
                                </div>
                            </div>
                            {totalArchivedCount > 0 && (
                                <span className="bg-slate-600 text-white text-[11px] px-2 py-0.5 rounded-full font-mono tabular-nums font-bold">
                                    {totalArchivedCount.toLocaleString()}
                                </span>
                            )}
                        </button>

                        {/* 4. ROUTED REPORTS TAB (HEAD OF BILLING & CLAIMS / ADMIN) */}
                        {canGenerateReports && (
                            <button
                                type="button"
                                onClick={() => setActiveTab('reports')}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                                    activeTab === 'reports'
                                        ? 'bg-teal-50 text-teal-900 border-teal-200 shadow-sm'
                                        : 'text-slate-600 hover:bg-slate-50 border-transparent'
                                }`}
                            >
                                <div className="flex items-center space-x-2.5">
                                    <span className={`p-1.5 rounded-lg ${activeTab === 'reports' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                    </span>
                                    <div className="text-left">
                                        <span className="block font-bold">Routed Reports</span>
                                        <span className={`text-[11px] font-normal ${activeTab === 'reports' ? 'text-teal-800/80' : 'text-slate-500'}`}>Alphabetical &amp; disposition</span>
                                    </div>
                                </div>
                            </button>
                        )}
                    </nav>

                    {/* Quick Hospital Turnaround Widget in Sidebar */}
                    <div className="mt-8 pt-4 border-t border-slate-100 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Hospital Clearance</span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-black bg-teal-100 text-teal-800">
                                30D AVG
                            </span>
                        </div>
                        <div className="text-2xl font-black text-slate-800 tracking-tight">
                            {hospitalStats.overall_avg_formatted || '5m'}
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">Average time to clear routed patients across all stations.</p>
                        
                        <div className="mt-3 space-y-1.5 pt-2 border-t border-slate-200/60 text-[11px]">
                            {hospitalStats.fastest_dept && (
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500 flex items-center">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                                        Fastest:
                                    </span>
                                    <span className="font-bold text-slate-700">{hospitalStats.fastest_dept.name} ({hospitalStats.fastest_dept.avg_formatted})</span>
                                </div>
                            )}
                            {hospitalStats.slowest_dept && (
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500 flex items-center">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
                                        Latency:
                                    </span>
                                    <span className="font-bold text-slate-700">{hospitalStats.slowest_dept.name} ({hospitalStats.slowest_dept.avg_formatted})</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* MAIN CONTENT AREA */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative">
                    
                    {/* ========================================================================= */}
                    {/* TAB 1: ACTIVE ROUTING & COST CENTER TURNAROUND MONITOR                     */}
                    {/* ========================================================================= */}
                    {activeTab === 'routing' && (
                        <div className="flex-1 flex flex-col overflow-y-auto">
                            
                            {/* Top Header Bar */}
                            <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shrink-0">
                                <div>
                                    <div className="flex items-center space-x-2.5">
                                        <h3 className="text-lg font-extrabold text-slate-800 tracking-tight">
                                            Routing Monitor & Cost Center Turnaround
                                        </h3>
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        Monitor routed patients in real-time and track how long each cost center takes to clear them.
                                    </p>
                                </div>

                                {/* Sub-view Switcher: Queue vs Turnaround Analytics */}
                                <div className="flex items-center p-1 bg-slate-200/80 rounded-lg shadow-inner border border-slate-200">
                                    <button
                                        onClick={() => setRoutingSubView('queue')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center space-x-1.5 ${
                                            routingSubView === 'queue'
                                                ? 'bg-white text-slate-800 shadow-sm'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                                        <span>Active Patients ({routedPatients.length})</span>
                                    </button>
                                    <button
                                        onClick={() => setRoutingSubView('analytics')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center space-x-1.5 ${
                                            routingSubView === 'analytics'
                                                ? 'bg-white text-slate-800 shadow-sm'
                                                : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                                        <span>Cost Center Turnaround Stats</span>
                                    </button>
                                </div>
                            </div>

                            {/* Compact Turnaround Summary Strip */}
                            <div className="px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-500 font-semibold">Currently Routing</span>
                                        <span className="text-base font-black text-amber-700 font-mono">{routedPatients.length}</span>
                                    </div>
                                    <span className="hidden sm:inline text-slate-200" aria-hidden="true">|</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-500 font-semibold">30D Hospital Avg</span>
                                        <span className="text-base font-black text-teal-700 font-mono">{hospitalStats.overall_avg_formatted || '5m'}</span>
                                    </div>
                                    <span className="hidden sm:inline text-slate-200" aria-hidden="true">|</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-500 font-semibold">Fastest</span>
                                        <span className="font-bold text-slate-800">
                                            {hospitalStats.fastest_dept?.name || 'Pharmacy'}
                                            <span className="ml-1 font-mono text-emerald-700">({hospitalStats.fastest_dept?.avg_formatted || '3m'})</span>
                                        </span>
                                    </div>
                                    <span className="hidden sm:inline text-slate-200" aria-hidden="true">|</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-500 font-semibold">Highest Latency</span>
                                        <span className="font-bold text-slate-800">
                                            {hospitalStats.slowest_dept?.name || 'CSR'}
                                            <span className="ml-1 font-mono text-rose-700">({hospitalStats.slowest_dept?.avg_formatted || '7m'})</span>
                                        </span>
                                    </div>
                                </div>

                                {selectedCostCenter !== 'all' && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedCostCenter('all');
                                            setSelectedStatusFilter('all');
                                        }}
                                        className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg font-bold inline-flex items-center gap-1.5 transition-colors"
                                    >
                                        <span>Cost Center: {selectedCostCenter}</span>
                                        <span aria-hidden="true">✕</span>
                                    </button>
                                )}
                            </div>

                            {/* SUB-VIEW 1: ACTIVE PATIENTS QUEUE */}
                            {routingSubView === 'queue' && (
                                <>
                                    {/* Filtering & Search Bar */}
                                    <div className="p-4 px-6 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0">
                                        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                                            {/* Ward filter */}
                                            <div className="w-full sm:w-auto">
                                                <select
                                                    value={selectedWard}
                                                    onChange={(e) => setSelectedWard(e.target.value)}
                                                    className="w-full sm:w-48 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 shadow-sm"
                                                >
                                                    <option value="all">🏥 All Originating Wards</option>
                                                    {wards.map((w, idx) => (
                                                        <option key={idx} value={w}>{w}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Cost Center Station filter */}
                                            <div className="w-full sm:w-auto">
                                                <select
                                                    value={selectedCostCenter}
                                                    onChange={(e) => setSelectedCostCenter(e.target.value)}
                                                    className="w-full sm:w-48 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 shadow-sm"
                                                >
                                                    <option value="all">🏢 All Cost Centers</option>
                                                    {costCentersList.map((cc, idx) => (
                                                        <option key={idx} value={cc}>{cc}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Status Filter */}
                                            {selectedCostCenter !== 'all' && (
                                                <div className="w-full sm:w-auto">
                                                    <select
                                                        value={selectedStatusFilter}
                                                        onChange={(e) => setSelectedStatusFilter(e.target.value)}
                                                        className="w-full sm:w-48 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-amber-800 focus:ring-2 focus:ring-amber-500 shadow-sm"
                                                    >
                                                        <option value="all">Show All for {selectedCostCenter}</option>
                                                        <option value="waiting_selected">⏳ Only Waiting on {selectedCostCenter}</option>
                                                    </select>
                                                </div>
                                            )}

                                            {selectedCostCenter === 'all' && (
                                                <div className="w-full sm:w-auto">
                                                    <select
                                                        value={selectedStatusFilter}
                                                        onChange={(e) => setSelectedStatusFilter(e.target.value)}
                                                        className="w-full sm:w-44 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 shadow-sm"
                                                    >
                                                        <option value="all">All Routing Statuses</option>
                                                        <option value="almost_done">⚡ Almost Done (1 Left)</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>

                                        {/* Search Input */}
                                        <div className="w-full md:w-80 relative">
                                            <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                            <input 
                                                type="text" 
                                                placeholder="Search routed patient, hospital #, enc..." 
                                                value={routingSearch}
                                                onChange={(e) => setRoutingSearch(e.target.value)}
                                                className="w-full pl-9 pr-8 py-1.5 bg-white rounded-lg border-slate-300 shadow-sm focus:ring-2 focus:ring-amber-500 text-xs transition-all font-medium"
                                            />
                                            {routingSearch && (
                                                <button 
                                                    type="button"
                                                    aria-label="Clear routing search"
                                                    onClick={() => setRoutingSearch('')} 
                                                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Active Filter Notice */}
                                    {(selectedCostCenter !== 'all' || selectedWard !== 'all' || routingSearch) && (
                                        <div className="px-6 py-2 bg-amber-50/70 border-b border-amber-200/60 flex items-center justify-between text-xs text-amber-900 font-medium">
                                            <div className="flex items-center space-x-2">
                                                <span>Showing <strong>{filteredRoutedPatients.length}</strong> of <strong>{routedPatients.length}</strong> routed patients</span>
                                                {selectedCostCenter !== 'all' && (
                                                    <span className="bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded text-[11px] font-bold">
                                                        Cost Center: {selectedCostCenter}
                                                    </span>
                                                )}
                                                {selectedWard !== 'all' && (
                                                    <span className="bg-teal-100 text-teal-800 px-2 py-0.5 rounded text-[11px] font-bold">
                                                        Ward: {selectedWard}
                                                    </span>
                                                )}
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    setSelectedWard('all');
                                                    setSelectedCostCenter('all');
                                                    setSelectedStatusFilter('all');
                                                    setRoutingSearch('');
                                                }}
                                                className="text-[11px] font-bold text-amber-800 hover:underline"
                                            >
                                                Clear all filters
                                            </button>
                                        </div>
                                    )}

                                    {/* Table Headers */}
                                    <div className="grid grid-cols-12 gap-3 px-6 py-3 bg-white border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                                        <div className="col-span-4">Patient &amp; Ward</div>
                                        <div className="col-span-2">Elapsed Time</div>
                                        <div className="col-span-4">Clearance Progress</div>
                                        <div className="col-span-2 text-right">Station Timings</div>
                                    </div>

                                    {/* Table Body */}
                                    <div className="divide-y divide-slate-100 flex-1 overflow-y-auto">
                                        {filteredRoutedPatients.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center p-20 text-slate-500">
                                                <div className="bg-amber-50 p-4 rounded-full border border-amber-100 mb-3">
                                                    <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                </div>
                                                <h4 className="text-base font-bold text-slate-700">No Routed Patients in Queue</h4>
                                                <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">
                                                    {routedPatients.length === 0 
                                                        ? 'All hospital routed patients have successfully cleared their cost centers and moved to "Ready for Print".'
                                                        : 'No patients match your current filter selections. Try clearing your filters above.'}
                                                </p>
                                            </div>
                                        ) : (
                                            filteredRoutedPatients.map((patient) => {
                                                const elapsedMin = patient.elapsed_minutes || 0;
                                                const isLongElapsed = elapsedMin > 45;
                                                const isModerateElapsed = elapsedMin > 20 && elapsedMin <= 45;
                                                const isExpanded = Boolean(expandedPatients[patient.id]);
                                                const stations = patient.stations || [];
                                                const pendingStations = stations.filter((st) => st.status !== 'Cleared');
                                                const flags = [
                                                    patient.is_oecb ? 'OECB' : null,
                                                    patient.has_oxygen ? 'O2' : null,
                                                ].filter(Boolean);

                                                return (
                                                    <div key={patient.id} className="bg-white">
                                                        <div className="grid grid-cols-12 gap-3 px-6 py-4 items-center hover:bg-slate-50/80 transition-colors">
                                                            {/* Primary Scan Column: Patient, Identifier & Ward */}
                                                            <div className="col-span-4 min-w-0">
                                                                <div className="font-extrabold text-sm text-slate-900 leading-snug truncate">
                                                                    {patient.patient_name}
                                                                </div>
                                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-slate-600">
                                                                    <span className="font-mono font-semibold text-slate-700">
                                                                        {patient.hospital_number}
                                                                    </span>
                                                                    <span className="text-slate-300" aria-hidden="true">•</span>
                                                                    <span className="font-semibold text-teal-800">
                                                                        {patient.room_ward || 'Unknown Ward'}
                                                                    </span>
                                                                    {flags.length > 0 && (
                                                                        <>
                                                                            <span className="text-slate-300" aria-hidden="true">•</span>
                                                                            <span className="font-bold text-amber-800">{flags.join(' / ')}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                                {patient.encoded_by && (
                                                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                                                        Routed by {patient.encoded_by}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Elapsed Time */}
                                                            <div className="col-span-2">
                                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold border ${
                                                                    isLongElapsed 
                                                                        ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse motion-reduce:animate-none' 
                                                                        : (isModerateElapsed ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                                                                }`}>
                                                                    {patient.elapsed_formatted || '0m'}
                                                                </span>
                                                                <div className="text-[11px] text-slate-500 font-medium mt-1">
                                                                    {new Date(patient.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </div>
                                                            </div>

                                                            {/* Single Summary Clearance Progress */}
                                                            <div className="col-span-4">
                                                                <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
                                                                    <span>
                                                                        {patient.cleared_stations} of {patient.total_stations} cleared
                                                                    </span>
                                                                    <span className="text-[11px] font-mono text-slate-500">
                                                                        {patient.progress_percent}%
                                                                    </span>
                                                                </div>
                                                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full rounded-full transition-all duration-300 ${
                                                                            patient.progress_percent === 100 ? 'bg-teal-600' : 'bg-amber-500'
                                                                        }`}
                                                                        style={{ width: `${patient.progress_percent}%` }}
                                                                    ></div>
                                                                </div>
                                                                <p className="text-[11px] text-slate-600 mt-1.5 truncate">
                                                                    {pendingStations.length > 0
                                                                        ? `Waiting: ${pendingStations.map((st) => st.department).join(', ')}`
                                                                        : 'All stations cleared'}
                                                                </p>
                                                            </div>

                                                            {/* Row Expansion & Timeline Modal */}
                                                            <div className="col-span-2 flex items-center justify-end gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleExpandPatient(patient.id)}
                                                                    aria-expanded={isExpanded}
                                                                    aria-controls={`station-drawer-${patient.id}`}
                                                                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1 transition-colors ${
                                                                        isExpanded
                                                                            ? 'bg-slate-800 text-white border-slate-800'
                                                                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                                                    }`}
                                                                >
                                                                    <span>{isExpanded ? 'Hide' : 'Stations'}</span>
                                                                    <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setInspectPatient(patient)}
                                                                    className="p-2 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg border border-slate-200 transition-colors"
                                                                    title="Inspect full timeline and cost center breakdown"
                                                                    aria-label={`Inspect ${patient.patient_name} timeline`}
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Expandable Station Timings Drawer */}
                                                        {isExpanded && (
                                                            <div
                                                                id={`station-drawer-${patient.id}`}
                                                                className="bg-slate-50 border-t border-slate-200 px-6 py-3.5"
                                                            >
                                                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                                                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                                                                        Station Clearance &amp; Wait Timings ({patient.enccode})
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setInspectPatient(patient)}
                                                                        className="text-xs font-bold text-teal-700 hover:text-teal-900 underline"
                                                                    >
                                                                        Open Full Timeline Modal
                                                                    </button>
                                                                </div>
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                                                    {stations.map((st, idx) => {
                                                                        const isCleared = st.status === 'Cleared';
                                                                        const isFocused = selectedCostCenter === st.department;

                                                                        return (
                                                                            <div
                                                                                key={idx}
                                                                                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                                                                                    isFocused ? 'ring-2 ring-amber-400' : ''
                                                                                } ${
                                                                                    isCleared
                                                                                        ? 'bg-white border-emerald-200 text-slate-800'
                                                                                        : 'bg-amber-50/70 border-amber-200 text-amber-900'
                                                                                }`}
                                                                            >
                                                                                <div className="min-w-0 pr-2">
                                                                                    <div className="font-bold truncate">{st.department}</div>
                                                                                    <div className="text-[11px] text-slate-500 truncate">
                                                                                        {isCleared
                                                                                            ? `Cleared by ${st.cleared_by || 'Staff'}`
                                                                                            : 'Pending clearance'}
                                                                                    </div>
                                                                                </div>
                                                                                <span className={`shrink-0 font-mono font-bold text-[11px] px-2 py-0.5 rounded ${
                                                                                    isCleared
                                                                                        ? 'bg-emerald-100 text-emerald-800'
                                                                                        : 'bg-amber-100 text-amber-900'
                                                                                }`}>
                                                                                    {isCleared ? st.duration_formatted : `wait ${st.waiting_formatted}`}
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </>
                            )}

                            {/* SUB-VIEW 2: COST CENTER TURNAROUND ANALYTICS COMPARISON */}
                            {routingSubView === 'analytics' && (
                                <div className="p-6 space-y-6">
                                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <h4 className="text-base font-bold text-slate-800">
                                                    Cost Center Turnaround Time Comparison (Last 30 Days)
                                                </h4>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    Displays the average duration for each specific cost center to clear routed patients, sorted by turnaround time.
                                                </p>
                                            </div>
                                            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">
                                                {hospitalStats.total_cleared_30d?.toLocaleString() || 0} Total Clearances Recorded
                                            </span>
                                        </div>

                                        {/* Horizontal Bars Chart */}
                                        <div className="space-y-4">
                                            {[...costCenterEntries].sort((a, b) => (b.avg_minutes || 0) - (a.avg_minutes || 0)).map((cc) => {
                                                const widthPercent = Math.max(4, Math.round(((cc.avg_minutes || 0) / maxAvgMinutes) * 100));
                                                let barColor = 'from-teal-400 to-teal-500';
                                                let badgeColor = 'bg-teal-50 text-teal-800 border-teal-200';

                                                if (cc.avg_minutes > 30) {
                                                    barColor = 'from-rose-400 to-rose-500';
                                                    badgeColor = 'bg-rose-50 text-rose-800 border-rose-200';
                                                } else if (cc.avg_minutes > 15) {
                                                    barColor = 'from-amber-400 to-amber-500';
                                                    badgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
                                                }

                                                return (
                                                    <div key={cc.name} className="space-y-1">
                                                        <div className="flex justify-between items-center text-xs">
                                                            <div className="flex items-center space-x-2">
                                                                <span className="font-extrabold text-slate-700">{cc.name}</span>
                                                                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${badgeColor}`}>
                                                                    {cc.speed_rating}
                                                                </span>
                                                                {cc.pending_count > 0 && (
                                                                    <span className="bg-rose-100 text-rose-700 text-[11px] font-bold px-1.5 py-0.5 rounded font-mono">
                                                                        {cc.pending_count} currently waiting
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center space-x-3 text-slate-500 text-[11px]">
                                                                <span>Fastest: <strong className="text-slate-700">{cc.min_formatted}</strong></span>
                                                                <span>•</span>
                                                                <span>Avg: <strong className="text-slate-800 font-extrabold text-sm">{cc.avg_formatted}</strong></span>
                                                            </div>
                                                        </div>
                                                        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                                                            <div 
                                                                className={`bg-gradient-to-r ${barColor} h-full rounded-full transition-all duration-700 ease-out`}
                                                                style={{ width: `${widthPercent}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Detailed Breakdown Table */}
                                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                            <h4 className="text-sm font-bold text-slate-800">Cost Center Performance Master Matrix</h4>
                                            <span className="text-xs text-slate-400">Click any row to inspect deep dive</span>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse text-xs">
                                                <thead>
                                                    <tr className="border-b border-slate-200 bg-white text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                                        <th className="p-3 pl-6">Cost Center</th>
                                                        <th className="p-3">Average Turnaround</th>
                                                        <th className="p-3">Rating</th>
                                                        <th className="p-3">Fastest (Min)</th>
                                                        <th className="p-3">Slowest (Max)</th>
                                                        <th className="p-3">Today Clearances</th>
                                                        <th className="p-3">Total Clearances (30d)</th>
                                                        <th className="p-3">Current Waiting Queue</th>
                                                        <th className="p-3 pr-6 text-right">Details</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 font-medium">
                                                    {costCenterEntries.map((cc) => (
                                                        <tr 
                                                            key={cc.name}
                                                            onClick={() => setInspectCostCenter(cc)}
                                                            className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                                                        >
                                                            <td className="p-3 pl-6 font-extrabold text-slate-800 text-sm">
                                                                {cc.name}
                                                            </td>
                                                            <td className="p-3 font-extrabold text-slate-900">
                                                                {cc.avg_formatted}
                                                            </td>
                                                            <td className="p-3">
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                                                                    cc.speed_rating === 'Fast'
                                                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                                        : (cc.speed_rating === 'Moderate' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-rose-50 text-rose-800 border border-rose-200')
                                                                }`}>
                                                                    {cc.speed_rating}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 font-mono text-slate-600">{cc.min_formatted}</td>
                                                            <td className="p-3 font-mono text-slate-600">{cc.max_formatted}</td>
                                                            <td className="p-3">
                                                                <span className="font-bold text-slate-700">{cc.today_cleared}</span>
                                                                {cc.today_cleared > 0 && (
                                                                    <span className="text-[11px] text-slate-400 ml-1">({cc.today_avg_formatted} avg)</span>
                                                                )}
                                                            </td>
                                                            <td className="p-3 font-mono font-bold text-slate-700">{cc.total_cleared.toLocaleString()}</td>
                                                            <td className="p-3">
                                                                {cc.pending_count > 0 ? (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                                                        {cc.pending_count} waiting
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-slate-400 text-[11px]">Clear queue</span>
                                                                )}
                                                            </td>
                                                            <td className="p-3 pr-6 text-right">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setInspectCostCenter(cc);
                                                                    }}
                                                                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-bold text-[11px] transition-colors"
                                                                >
                                                                    Deep Dive
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}

                    {/* ========================================================================= */}
                    {/* TAB 2: READY FOR PRINT & ARCHIVED (ORIGINAL BILLING VIEWS)               */}
                    {/* ========================================================================= */}
                    {(activeTab === 'ready' || activeTab === 'archived') && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            
                            {/* Header */}
                            <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
                                <div className="flex items-center space-x-3">
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                                            {activeTab === 'ready' ? 'Cleared Patients' : 'F07 Archive Masterlist'}
                                        </h3>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                                            {activeTab === 'ready' 
                                                ? 'These patients have completed all departmental requirements and are ready for F07 finalization.' 
                                                : 'Full archive of all printed and finalized patient clearances.'}
                                        </p>
                                    </div>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500 -mt-3" title="Live Sync Active"></span>
                                </div>
                                
                                <div className="flex items-center space-x-2 w-full md:w-auto">
                                    {/* PER-PAGE SELECTOR (FOR ARCHIVED TAB) */}
                                    {activeTab === 'archived' && (
                                        <div className="flex items-center space-x-1.5 shrink-0">
                                            <span className="text-[11px] font-bold text-slate-400 uppercase">Per Page:</span>
                                            <select
                                                value={archivePagination.per_page || 50}
                                                onChange={handlePerPageChange}
                                                className="py-1.5 px-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 cursor-pointer"
                                            >
                                                <option value={25}>25</option>
                                                <option value={50}>50</option>
                                                <option value={100}>100</option>
                                                <option value={200}>200</option>
                                            </select>
                                        </div>
                                    )}

                                    {/* SEARCH INPUT */}
                                    <div className="w-full md:w-80 relative">
                                        <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                        <input 
                                            type="text" 
                                            placeholder={activeTab === 'ready' ? "Search cleared queue..." : "Search entire archive (name or ID)..."} 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full pl-9 pr-8 py-2 rounded-lg border-slate-300 shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm transition-all"
                                        />
                                        {searchTerm && (
                                            <button 
                                                type="button"
                                                onClick={() => setSearchTerm('')} 
                                                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                                                title="Clear search"
                                                aria-label="Clear search"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* LIVE SEARCH STATUS INDICATOR */}
                            {isSearchingArchive && (
                                <div className="px-6 py-2 bg-teal-50 text-teal-700 text-xs font-semibold flex items-center space-x-2 border-b border-teal-100">
                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                    <span>Searching database archives across all {totalArchivedCount.toLocaleString()} records...</span>
                                </div>
                            )}

                            {archiveError && (
                                <div role="alert" className="mx-6 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 flex items-center justify-between gap-3">
                                    <span>{archiveError}</span>
                                    <button
                                        type="button"
                                        onClick={() => setArchiveError(null)}
                                        className="text-rose-600 hover:text-rose-900 font-bold"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            )}

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
                                            {activeTab === 'ready' 
                                                ? 'No cleared patients ready for printing.' 
                                                : (searchTerm ? `No archived patients matching "${searchTerm}".` : 'No printed patients found.')}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {filteredPatients.map((patient, index) => (
                                            <div key={patient.id || index} className="grid grid-cols-12 gap-4 px-6 py-4 items-center bg-white hover:bg-slate-50 transition-colors">
                                                
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
                                                    <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                                                        Routed: {new Date(patient.created_at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila' })}
                                                    </div>
                                                </div>
                                                
                                                <div className="col-span-2 flex justify-center">
                                                    {activeTab === 'ready' ? (
                                                        <span className="bg-emerald-50 text-emerald-700 text-[11px] font-bold px-3 py-1.5 rounded-md border border-emerald-200 uppercase tracking-wide inline-flex items-center shadow-sm">
                                                            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                            Cleared
                                                        </span>
                                                    ) : (
                                                        <span className="bg-slate-100 text-slate-600 text-[11px] font-bold px-3 py-1.5 rounded-md border border-slate-200 uppercase tracking-wide inline-flex items-center shadow-sm">
                                                            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                                                            Archived
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                <div className="col-span-3 flex flex-wrap justify-end gap-2 pr-2">
                                                    {activeTab === 'ready' ? (
                                                        awaitingArchiveConfirm === patient.enccode ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleConfirmArchive(patient.enccode)}
                                                                    disabled={archivingEncounter === patient.enccode}
                                                                    className="inline-flex justify-center items-center px-3.5 py-2 rounded-lg text-xs font-bold transition-all shadow-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {archivingEncounter === patient.enccode ? (
                                                                        <>
                                                                            <svg className="w-3.5 h-3.5 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                                            <span>Archiving...</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
                                                                            <span>Confirm Printed & Archive</span>
                                                                        </>
                                                                    )}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenPrint(patient.enccode)}
                                                                    disabled={archivingEncounter === patient.enccode}
                                                                    className="inline-flex justify-center items-center px-3 py-2 rounded-lg text-xs font-bold transition-all border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                                                >
                                                                    Print Again
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleCancelPrintArchive}
                                                                    disabled={archivingEncounter === patient.enccode}
                                                                    className="inline-flex justify-center items-center px-2.5 py-2 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenPrint(patient.enccode)}
                                                                disabled={archivingEncounter === patient.enccode}
                                                                className="inline-flex justify-center items-center px-4 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm focus:outline-none w-full xl:w-auto bg-teal-600 text-white hover:bg-teal-700 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                                                                <span>Print F07</span>
                                                            </button>
                                                        )
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenPrint(patient.enccode)}
                                                            className="inline-flex justify-center items-center px-4 py-2.5 rounded-lg text-sm font-bold transition-all shadow-sm focus:outline-none w-full xl:w-auto bg-slate-700 text-white hover:bg-slate-800 hover:shadow-md"
                                                        >
                                                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                                            <span>Reprint</span>
                                                        </button>
                                                    )}
                                                </div>

                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                {/* SAFE FETCH URL ENCODING FOR IFRAME */}
                                {printingEncounter && (
                                    <iframe 
                                        key={`${printingEncounter}-${printSequence}`}
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

                            {/* PAGINATION TOOLBAR FOR ARCHIVED TAB */}
                            {activeTab === 'archived' && (
                                <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-medium shrink-0">
                                    <div className="flex items-center space-x-2">
                                        <span>
                                            Showing <strong className="text-slate-800">{archivePagination.from?.toLocaleString() || 0}</strong> to <strong className="text-slate-800">{archivePagination.to?.toLocaleString() || 0}</strong> of <strong className="text-slate-800 font-bold">{archivePagination.total?.toLocaleString() || 0}</strong> records
                                        </span>
                                        {searchTerm && (
                                            <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[11px] font-bold">
                                                Filtered by "{searchTerm}"
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center space-x-1">
                                        <button
                                            type="button"
                                            onClick={() => handlePageChange(1)}
                                            disabled={archivePagination.current_page <= 1}
                                            className="p-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-600"
                                            title="First Page"
                                            aria-label="First page"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>
                                        </button>

                                        <button
                                            onClick={() => handlePageChange(archivePagination.current_page - 1)}
                                            disabled={archivePagination.current_page <= 1}
                                            className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold transition-colors text-slate-700"
                                        >
                                            Prev
                                        </button>

                                        <div className="hidden sm:flex items-center space-x-1">
                                            {getPageNumbers().map((page, idx) => (
                                                page === '...' ? (
                                                    <span key={`ellipsis-${idx}`} className="px-2 py-1 text-slate-400">...</span>
                                                ) : (
                                                    <button
                                                        key={page}
                                                        onClick={() => handlePageChange(page)}
                                                        className={`min-w-[32px] h-8 rounded-md font-bold text-xs transition-colors ${archivePagination.current_page === page ? 'bg-teal-600 text-white shadow-sm' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'}`}
                                                    >
                                                        {page}
                                                    </button>
                                                )
                                            ))}
                                        </div>

                                        <button
                                            onClick={() => handlePageChange(archivePagination.current_page + 1)}
                                            disabled={archivePagination.current_page >= archivePagination.last_page}
                                            className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold transition-colors text-slate-700"
                                        >
                                            Next
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handlePageChange(archivePagination.last_page)}
                                            disabled={archivePagination.current_page >= archivePagination.last_page}
                                            className="p-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-600"
                                            title="Last Page"
                                            aria-label="Last page"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>
                                        </button>
                                    </div>

                                    <form onSubmit={handleJumpPage} className="flex items-center space-x-1.5">
                                        <span className="text-[11px] text-slate-400">Go to:</span>
                                        <input
                                            type="number"
                                            min="1"
                                            max={archivePagination.last_page || 1}
                                            value={jumpPageInput}
                                            onChange={(e) => setJumpPageInput(e.target.value)}
                                            placeholder={String(archivePagination.current_page)}
                                            className="w-14 px-2 py-1 text-xs text-center border border-slate-300 rounded-md shadow-sm focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                                        />
                                        <button
                                            type="submit"
                                            disabled={!jumpPageInput}
                                            className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-md text-[11px] disabled:opacity-40 transition-colors shadow-sm"
                                        >
                                            Go
                                        </button>
                                    </form>

                                </div>
                            )}
                        </div>
                    )}

                    {/* ========================================================================= */}
                    {/* TAB 4: ROUTED PATIENTS MASTERLIST & DISPOSITION REPORTS                   */}
                    {/* ========================================================================= */}
                    {activeTab === 'reports' && canGenerateReports && (
                        <BillingReportsPanel />
                    )}

                </div>
            </div>

            {/* ========================================================================= */}
            {/* MODAL 1: PATIENT CLEARANCE TIMELINE & COST CENTER BREAKDOWN               */}
            {/* ========================================================================= */}
            <Modal
                show={Boolean(inspectPatient)}
                onClose={() => setInspectPatient(null)}
                maxWidth="2xl"
                panelClassName="rounded-2xl border border-slate-200 max-h-[90vh] flex flex-col"
            >
                {inspectPatient && (
                    <>
                        {/* Modal Header */}
                        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-start shrink-0">
                            <div>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase tracking-wider mb-1.5">
                                    Patient Clearance Timeline
                                </span>
                                <h3 className="text-xl font-extrabold text-slate-800">
                                    {inspectPatient.patient_name}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                                    <span>Hosp #: <strong className="text-slate-700 font-mono">{inspectPatient.hospital_number}</strong></span>
                                    <span>•</span>
                                    <span>Originating Ward: <strong className="text-slate-700">{inspectPatient.room_ward}</strong></span>
                                    {inspectPatient.encoded_by && (
                                        <>
                                            <span>•</span>
                                            <span>Routed By: <strong className="text-slate-700">{inspectPatient.encoded_by}</strong></span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <button
                                type="button"
                                aria-label="Close modal"
                                onClick={() => setInspectPatient(null)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 space-y-6 overflow-y-auto flex-1">
                            
                            {/* Elapsed & Progress Summary */}
                            <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
                                <div>
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Routed Time</div>
                                    <div className="text-sm font-extrabold text-slate-800 mt-0.5">
                                        {new Date(inspectPatient.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <div className="text-[11px] text-slate-500 font-medium">{new Date(inspectPatient.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Elapsed</div>
                                    <div className="text-sm font-extrabold text-amber-700 mt-0.5">
                                        {inspectPatient.elapsed_formatted || '0m'}
                                    </div>
                                    <div className="text-[11px] text-slate-500 font-medium">In routing queue</div>
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Stations Cleared</div>
                                    <div className="text-sm font-extrabold text-emerald-700 mt-0.5">
                                        {inspectPatient.cleared_stations} / {inspectPatient.total_stations}
                                    </div>
                                    <div className="text-[11px] text-slate-500 font-medium">{inspectPatient.progress_percent}% completed</div>
                                </div>
                            </div>

                            {/* Detailed Cost Center Stations Table */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                                    Cost Center Turnaround Breakdown
                                </h4>
                                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                                                <th className="p-3 pl-4">Cost Center Station</th>
                                                <th className="p-3">Status</th>
                                                <th className="p-3">Turnaround / Waiting</th>
                                                <th className="p-3">Cleared At</th>
                                                <th className="p-3 pr-4">Cleared By</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(inspectPatient.stations || []).map((st, i) => {
                                                const isCleared = st.status === 'Cleared';
                                                return (
                                                    <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                                                        <td className="p-3 pl-4 font-bold text-slate-800">
                                                            {st.department}
                                                        </td>
                                                        <td className="p-3">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                                                                isCleared
                                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                                            }`}>
                                                                {isCleared ? '✓ Cleared' : '⏳ Pending'}
                                                            </span>
                                                        </td>
                                                        <td className="p-3">
                                                            {isCleared ? (
                                                                <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-mono text-[11px]">
                                                                    Cleared in {st.duration_formatted}
                                                                </span>
                                                            ) : (
                                                                <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-mono text-[11px]">
                                                                    Waiting {st.waiting_formatted}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-3 text-slate-600 font-mono text-[11px]">
                                                            {st.cleared_at 
                                                                ? new Date(st.cleared_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                                : '—'}
                                                        </td>
                                                        <td className="p-3 pr-4 text-slate-600 font-medium">
                                                            {st.cleared_by || '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 px-6 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
                            <button
                                type="button"
                                onClick={() => setInspectPatient(null)}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </>
                )}
            </Modal>

            {/* ========================================================================= */}
            {/* MODAL 2: COST CENTER DEEP-DIVE & TURNAROUND BENCHMARKS                   */}
            {/* ========================================================================= */}
            <Modal
                show={Boolean(inspectCostCenter)}
                onClose={() => setInspectCostCenter(null)}
                maxWidth="2xl"
                panelClassName="rounded-2xl border border-slate-200 max-h-[90vh] flex flex-col"
            >
                {inspectCostCenter && (
                    <>
                        {/* Modal Header */}
                        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-start shrink-0">
                            <div>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-300 uppercase tracking-wider mb-1.5">
                                    Cost Center Analytics
                                </span>
                                <h3 className="text-xl font-extrabold text-slate-800">
                                    {inspectCostCenter.name} Clearance Performance
                                </h3>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">
                                    Detailed clearance speed metrics, active waiting queue, and recent logs.
                                </p>
                            </div>
                            <button
                                type="button"
                                aria-label="Close modal"
                                onClick={() => setInspectCostCenter(null)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                            
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">30-Day Avg</div>
                                    <div className="text-xl font-black text-slate-800 mt-0.5">{inspectCostCenter.avg_formatted}</div>
                                    <div className="text-[11px] text-teal-700 font-bold mt-0.5">{inspectCostCenter.speed_rating} rating</div>
                                </div>
                                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fastest Clear</div>
                                    <div className="text-xl font-black text-emerald-700 mt-0.5">{inspectCostCenter.min_formatted}</div>
                                    <div className="text-[11px] text-slate-400 font-medium mt-0.5">Best record</div>
                                </div>
                                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Today Cleared</div>
                                    <div className="text-xl font-black text-sky-800 mt-0.5">{inspectCostCenter.today_cleared}</div>
                                    <div className="text-[11px] text-slate-500 font-medium mt-0.5">{inspectCostCenter.today_avg_formatted} avg today</div>
                                </div>
                                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">In Queue Now</div>
                                    <div className={`text-xl font-black mt-0.5 ${inspectCostCenter.pending_count > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                                        {inspectCostCenter.pending_count}
                                    </div>
                                    <div className="text-[11px] text-slate-400 font-medium mt-0.5">Patients waiting</div>
                                </div>
                            </div>

                            {/* Section: Patients Currently Waiting */}
                            {inspectCostCenter.pending_count > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                                        <span>⏳ Patients Currently Waiting for {inspectCostCenter.name}</span>
                                        <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded-full font-mono text-[11px]">
                                            {inspectCostCenter.pending_count}
                                        </span>
                                    </h4>
                                    <div className="border border-amber-200 bg-amber-50/40 rounded-xl overflow-hidden">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-amber-100/60 border-b border-amber-200 text-[11px] font-bold uppercase text-amber-900">
                                                    <th className="p-2.5 pl-4">Patient Name</th>
                                                    <th className="p-2.5">Hosp #</th>
                                                    <th className="p-2.5">Originating Ward</th>
                                                    <th className="p-2.5 pr-4 text-right">Elapsed Waiting</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-amber-200/50">
                                                {inspectCostCenter.pending_patients.map((p, idx) => (
                                                    <tr key={idx} className="hover:bg-amber-100/40">
                                                        <td className="p-2.5 pl-4 font-bold text-slate-800">{p.patient_name}</td>
                                                        <td className="p-2.5 font-mono text-slate-600">{p.hospital_number}</td>
                                                        <td className="p-2.5 text-slate-600">{p.room_ward}</td>
                                                        <td className="p-2.5 pr-4 text-right">
                                                            <span className="font-mono font-extrabold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                                                {p.waiting_formatted}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Section: Recent Clearances */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                                    Recent Patient Clearances at {inspectCostCenter.name}
                                </h4>
                                {(!inspectCostCenter.recent_clearances || inspectCostCenter.recent_clearances.length === 0) ? (
                                    <div className="p-6 bg-slate-50 rounded-xl text-center text-xs text-slate-400">
                                        No recent clearance logs recorded for this cost center yet.
                                    </div>
                                ) : (
                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500">
                                                    <th className="p-2.5 pl-4">Patient Name</th>
                                                    <th className="p-2.5">Ward</th>
                                                    <th className="p-2.5">Time Taken</th>
                                                    <th className="p-2.5">Cleared At</th>
                                                    <th className="p-2.5 pr-4">Cleared By</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {inspectCostCenter.recent_clearances.map((c, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50/80">
                                                        <td className="p-2.5 pl-4 font-bold text-slate-800">{c.patient_name}</td>
                                                        <td className="p-2.5 text-slate-600">{c.room_ward}</td>
                                                        <td className="p-2.5">
                                                            <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                                                                {c.duration_formatted}
                                                            </span>
                                                        </td>
                                                        <td className="p-2.5 text-slate-500 font-mono text-[11px]">
                                                            {new Date(c.cleared_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </td>
                                                        <td className="p-2.5 pr-4 text-slate-600 font-medium">
                                                            {c.cleared_by}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 px-6 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                            <button
                                onClick={() => {
                                    setSelectedCostCenter(inspectCostCenter.name);
                                    setActiveTab('routing');
                                    setRoutingSubView('queue');
                                    setInspectCostCenter(null);
                                }}
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center space-x-1"
                            >
                                <span>Filter Routing Queue by {inspectCostCenter.name}</span>
                                <span>→</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setInspectCostCenter(null)}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </>
                )}
            </Modal>

        </PortalLayout>
    );
}
