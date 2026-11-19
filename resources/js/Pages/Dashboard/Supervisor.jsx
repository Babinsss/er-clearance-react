import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Head, router } from '@inertiajs/react';
import PortalLayout from '@/Layouts/PortalLayout';
import Modal from '@/Components/Modal';
import ConfirmDialog from '@/Components/ConfirmDialog';
import { getRequiredDepartments, isDepartmentCleared, supportsAdditionalClearance } from '@/utils/clearanceRouting';

const PAGE_SIZE = 50;
const DELAY_THRESHOLD_MIN = 30;

function getElapsedMinutes(createdAt, nowMs) {
    if (!createdAt) return 0;
    const ms = nowMs - new Date(createdAt).getTime();
    return Math.max(0, Math.floor(ms / 60000));
}

function formatElapsedDuration(minutes) {
    if (minutes < 1) return '<1m';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

export default function SupervisorDashboard({ transactions = [], wards = [] }) {
    const [activeTab, setActiveTab] = useState('all'); // 'all', 'Routing in Progress', 'Cleared', 'Cancelled', 'Archived'
    const [selectedWard, setSelectedWard] = useState('all');
    const [selectedDisposition, setSelectedDisposition] = useState('all');
    const [onlyDelayed, setOnlyDelayed] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedRows, setExpandedRows] = useState({});
    const [copiedId, setCopiedId] = useState(null);
    const [nowMs, setNowMs] = useState(() => Date.now());

    const [toastState, setToastState] = useState(null); // { message, isError }
    const isFirstMount = useRef(true);

    // Edit Patient Modal State
    const [editingPatient, setEditingPatient] = useState(null);
    const [patientForm, setPatientForm] = useState({
        hospital_number: '',
        patient_name: '',
        room_ward: '',
        arrival_datetime: '',
        disposition: '',
        overall_status: 'Routing in Progress',
        is_oecb: false,
        has_oxygen: false,
        oxygen_remarks: '',
        requires_or: false,
        requires_nicu: false,
    });
    const [isSaving, setIsSaving] = useState(false);
    const [formErrors, setFormErrors] = useState({});
    const [confirmState, setConfirmState] = useState(null);
    const [isConfirmRunning, setIsConfirmRunning] = useState(false);
    const [printingF07, setPrintingF07] = useState(null);
    const [preparingPrintEnccode, setPreparingPrintEnccode] = useState(null);

    // Real-time synchronization & live elapsed wait clock
    useEffect(() => {
        if (window.Echo) {
            window.Echo.channel('clearance-updates')
                .listen('PatientRouted', () => {
                    router.reload({
                        only: ['transactions'],
                        preserveScroll: true,
                        preserveState: true,
                    });
                });
        }

        const pollInterval = setInterval(() => {
            router.reload({
                only: ['transactions'],
                preserveScroll: true,
                preserveState: true,
            });
        }, 5000);

        const clockInterval = setInterval(() => {
            setNowMs(Date.now());
        }, 30000);

        return () => {
            clearInterval(pollInterval);
            clearInterval(clockInterval);
            if (window.Echo) window.Echo.leaveChannel('clearance-updates');
        };
    }, []);

    // Database Search Debounce across all statuses (including deep archives)
    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }

        const timer = setTimeout(() => {
            router.get(
                '/supervisor',
                searchTerm.trim() ? { search: searchTerm.trim() } : {},
                { preserveState: true, preserveScroll: true, only: ['transactions'] }
            );
        }, 350);

        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, selectedWard, selectedDisposition, onlyDelayed, searchTerm]);

    useEffect(() => {
        if (!preparingPrintEnccode) return;
        const fallback = setTimeout(() => setPreparingPrintEnccode(null), 2000);
        return () => clearTimeout(fallback);
    }, [preparingPrintEnccode, printingF07]);

    const handlePrintF07 = (enccode) => {
        if (!enccode) return;
        setPreparingPrintEnccode(enccode);
        setPrintingF07((prev) => ({
            enccode,
            seq: (prev?.seq || 0) + 1,
        }));
    };

    const showToast = (message, isError = false) => {
        setToastState({ message, isError });
        setTimeout(() => setToastState(null), isError ? 4500 : 3500);
    };

    const handleCopyHospNo = (id, hospNo) => {
        if (!hospNo || !navigator.clipboard) return;
        navigator.clipboard.writeText(hospNo).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
        }).catch(() => {});
    };

    const toggleRowExpand = (id) => {
        setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const availableDispositions = useMemo(() => {
        const set = new Set(['Improved', 'HAMA', 'Transferred', 'Absconded', 'Died']);
        transactions.forEach((t) => {
            if (t.disposition && t.disposition.trim()) {
                set.add(t.disposition.trim());
            }
        });
        return Array.from(set);
    }, [transactions]);

    // Operational Counts
    const summaryCounts = useMemo(() => {
        let inProgress = 0;
        let cleared = 0;
        let cancelled = 0;
        let archived = 0;
        let delayed = 0;

        transactions.forEach((tx) => {
            if (tx.overall_status === 'Routing in Progress') {
                inProgress += 1;
                if (getElapsedMinutes(tx.created_at, nowMs) >= DELAY_THRESHOLD_MIN) {
                    delayed += 1;
                }
            } else if (tx.overall_status === 'Cleared') {
                cleared += 1;
            } else if (tx.overall_status === 'Cancelled') {
                cancelled += 1;
            } else if (tx.overall_status === 'Archived') {
                archived += 1;
            }
        });

        return {
            total: transactions.length,
            inProgress,
            cleared,
            cancelled,
            archived,
            delayed,
        };
    }, [transactions, nowMs]);

    // Filtering logic
    const filteredTransactions = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        return transactions.filter((tx) => {
            const matchesStatus = activeTab === 'all' || tx.overall_status === activeTab;
            if (!matchesStatus) return false;

            if (selectedWard !== 'all' && (tx.room_ward || '').toLowerCase() !== selectedWard.toLowerCase()) {
                return false;
            }

            if (selectedDisposition !== 'all' && (tx.disposition || '').toLowerCase() !== selectedDisposition.toLowerCase()) {
                return false;
            }

            if (onlyDelayed) {
                if (tx.overall_status !== 'Routing in Progress') return false;
                if (getElapsedMinutes(tx.created_at, nowMs) < DELAY_THRESHOLD_MIN) return false;
            }

            if (term) {
                const matchesSearch =
                    (tx.patient_name || '').toLowerCase().includes(term) ||
                    (tx.hospital_number || '').toLowerCase().includes(term) ||
                    (tx.enccode || '').toLowerCase().includes(term) ||
                    (tx.room_ward || '').toLowerCase().includes(term) ||
                    (tx.encoded_by || '').toLowerCase().includes(term);
                if (!matchesSearch) return false;
            }

            return true;
        });
    }, [transactions, activeTab, selectedWard, selectedDisposition, onlyDelayed, searchTerm, nowMs]);

    const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
    const pagedTransactions = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredTransactions.slice(start, start + PAGE_SIZE);
    }, [filteredTransactions, currentPage]);

    const hasActiveFilters = Boolean(
        activeTab !== 'all' ||
        selectedWard !== 'all' ||
        selectedDisposition !== 'all' ||
        onlyDelayed ||
        searchTerm.trim()
    );

    const resetFilters = () => {
        setActiveTab('all');
        setSelectedWard('all');
        setSelectedDisposition('all');
        setOnlyDelayed(false);
        setSearchTerm('');
    };

    // Handlers
    const openEditModal = (tx) => {
        let formattedArrival = '';
        if (tx.arrival_datetime) {
            const d = new Date(tx.arrival_datetime);
            if (!isNaN(d.getTime())) {
                const pad = (n) => String(n).padStart(2, '0');
                formattedArrival = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            }
        }

        setEditingPatient(tx);
        setFormErrors({});
        setPatientForm({
            hospital_number: tx.hospital_number || '',
            patient_name: tx.patient_name || '',
            room_ward: tx.room_ward || (wards[0] || 'Emergency Room'),
            arrival_datetime: formattedArrival,
            disposition: tx.disposition || 'Improved',
            overall_status: tx.overall_status || 'Routing in Progress',
            is_oecb: Boolean(tx.is_oecb),
            has_oxygen: Boolean(tx.has_oxygen),
            oxygen_remarks: tx.oxygen_remarks || '',
            requires_or: Boolean(tx.requires_or),
            requires_nicu: Boolean(tx.requires_nicu),
        });
    };

    const executeSavePatient = () => {
        if (!editingPatient) return;

        setIsSaving(true);
        setFormErrors({});

        router.put(`/supervisor/transactions/${editingPatient.id}`, {
            ...patientForm,
            is_oecb: Boolean(patientForm.is_oecb),
            has_oxygen: Boolean(patientForm.has_oxygen),
            oxygen_remarks: patientForm.has_oxygen ? patientForm.oxygen_remarks : null,
            requires_or: Boolean(patientForm.requires_or),
            requires_nicu: Boolean(patientForm.requires_nicu),
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setIsSaving(false);
                setConfirmState(null);
                setEditingPatient(null);
                showToast(`Patient clearance for ${patientForm.patient_name} updated.`);
            },
            onError: (errs) => {
                setIsSaving(false);
                setConfirmState(null);
                setFormErrors(errs);
                showToast('Could not save patient changes. Review the highlighted errors.', true);
            },
        });
    };

    const handleSavePatient = (e) => {
        e.preventDefault();
        if (!editingPatient) return;

        const previousStatus = editingPatient.overall_status || 'Routing in Progress';
        const nextStatus = patientForm.overall_status;

        if (nextStatus !== previousStatus) {
            setConfirmState({
                title: 'Confirm Status Override',
                message: `Change overall clearance status for ${patientForm.patient_name || editingPatient.patient_name} from "${previousStatus}" to "${nextStatus}"?\n\nThis overrides cost-center progression and immediately updates active queues.`,
                confirmLabel: `Apply "${nextStatus}"`,
                tone: nextStatus === 'Cancelled' ? 'danger' : 'warning',
                onConfirm: () => executeSavePatient(),
            });
            return;
        }

        executeSavePatient();
    };

    const handleCancelPatient = (id, name) => {
        setConfirmState({
            title: 'Cancel Clearance Routing',
            message: `Are you sure you want to CANCEL routing for ${name}?\n\nThis will remove the patient from cost center queues.`,
            confirmLabel: 'Yes, Cancel Routing',
            tone: 'danger',
            onConfirm: () => {
                setIsConfirmRunning(true);
                router.post(`/supervisor/transactions/${id}/cancel`, {}, {
                    preserveScroll: true,
                    onSuccess: () => {
                        setConfirmState(null);
                        showToast(`Clearance routing for ${name} has been cancelled.`);
                    },
                    onError: () => {
                        setConfirmState(null);
                        showToast(`Failed to cancel routing for ${name}. Please try again.`, true);
                    },
                    onFinish: () => setIsConfirmRunning(false),
                });
            },
        });
    };

    const handleReactivatePatient = (id, name) => {
        setConfirmState({
            title: 'Re-activate Clearance Routing',
            message: `Re-activate clearance routing for ${name}?`,
            confirmLabel: 'Yes, Re-activate',
            tone: 'teal',
            onConfirm: () => {
                setIsConfirmRunning(true);
                router.post(`/supervisor/transactions/${id}/reactivate`, {}, {
                    preserveScroll: true,
                    onSuccess: () => {
                        setConfirmState(null);
                        showToast(`Clearance routing for ${name} has been re-activated.`);
                    },
                    onError: () => {
                        setConfirmState(null);
                        showToast(`Failed to re-activate routing for ${name}. Please try again.`, true);
                    },
                    onFinish: () => setIsConfirmRunning(false),
                });
            },
        });
    };

    return (
        <PortalLayout>
            <Head title="Clinical Supervisor Dashboard" />

            <div className="flex flex-col w-full p-4 sm:p-6 bg-slate-100 min-h-[calc(100vh-64px)] font-sans">
                {/* TOP HEADER & COMPACT OVERSIGHT STRIP */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between pb-5 border-b border-slate-200 gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                                Clinical Supervisor Dashboard
                            </h1>
                            <span
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-[11px] font-bold text-teal-800"
                                title="Auto-refreshing every 5 seconds"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-600" aria-hidden="true"></span>
                                Live
                            </span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
                            Monitor clearance progression across wards, resolve stalled stations, and manage routing details.
                        </p>
                    </div>

                    {/* Compact Operational Summary Strip */}
                    <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm text-xs tabular-nums">
                        <div className="flex items-center gap-2 pr-3 border-r border-slate-200">
                            <span className="text-slate-500 font-semibold">Routing</span>
                            <span className="text-base font-extrabold text-amber-700">{summaryCounts.inProgress}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                if (summaryCounts.delayed === 0 && !onlyDelayed) return;
                                setActiveTab('Routing in Progress');
                                setOnlyDelayed((prev) => !prev);
                            }}
                            aria-pressed={onlyDelayed}
                            disabled={summaryCounts.delayed === 0 && !onlyDelayed}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-bold transition-colors ${
                                onlyDelayed
                                    ? 'bg-rose-600 text-white border-rose-700'
                                    : summaryCounts.delayed > 0
                                        ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 cursor-default'
                            }`}
                            title="Filter patients routing for 30+ minutes"
                        >
                            <span>Delayed (&ge;30m)</span>
                            <span>{summaryCounts.delayed}</span>
                        </button>
                        <div className="flex items-center gap-2 pl-2 pr-3 border-r border-slate-200">
                            <span className="text-slate-500 font-semibold">Cleared</span>
                            <span className="text-base font-extrabold text-emerald-700">{summaryCounts.cleared}</span>
                        </div>
                        <div className="flex items-center gap-2 pl-1">
                            <span className="text-slate-500 font-semibold">Cancelled</span>
                            <span className="text-base font-extrabold text-rose-700">{summaryCounts.cancelled}</span>
                        </div>
                    </div>
                </div>

                {/* CONTROLS & FILTER BAR */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mt-5 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
                    {/* Status Tabs */}
                    <div className="flex p-1 bg-slate-100 rounded-lg border border-slate-200 overflow-x-auto tabular-nums" role="tablist" aria-label="Clearance status filter">
                        {[
                            { id: 'all', label: 'All Patients', count: summaryCounts.total },
                            { id: 'Routing in Progress', label: 'In Progress', count: summaryCounts.inProgress },
                            { id: 'Cleared', label: 'Cleared', count: summaryCounts.cleared },
                            { id: 'Cancelled', label: 'Cancelled', count: summaryCounts.cancelled },
                            { id: 'Archived', label: 'Archived', count: summaryCounts.archived },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={activeTab === tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id);
                                    if (tab.id !== 'Routing in Progress' && tab.id !== 'all') {
                                        setOnlyDelayed(false);
                                    }
                                }}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                                    activeTab === tab.id
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-mono ${
                                    activeTab === tab.id ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-700'
                                }`}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Ward, Disposition & Search */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        <select
                            aria-label="Filter by originating ward"
                            value={selectedWard}
                            onChange={(e) => setSelectedWard(e.target.value)}
                            className="sm:w-44 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                            <option value="all">All Wards</option>
                            {wards.map((w, idx) => (
                                <option key={idx} value={w}>{w}</option>
                            ))}
                        </select>

                        <select
                            aria-label="Filter by disposition"
                            value={selectedDisposition}
                            onChange={(e) => setSelectedDisposition(e.target.value)}
                            className="sm:w-40 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                            <option value="all">All Dispositions</option>
                            {availableDispositions.map((disp) => (
                                <option key={disp} value={disp}>{disp}</option>
                            ))}
                        </select>

                        <div className="relative w-full sm:w-64">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            </span>
                            <input
                                type="text"
                                aria-label="Search patient, hospital number, encounter, or encoder"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search patient, hospital #, enc..."
                                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    aria-label="Clear search"
                                    onClick={() => setSearchTerm('')}
                                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* PATIENTS TABLE */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 mt-5 flex-1 flex flex-col overflow-hidden">
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                                <tr>
                                    <th className="p-4 pl-6">Patient &amp; Encounter</th>
                                    <th className="p-4">Originating Ward</th>
                                    <th className="p-4">Status &amp; Disposition</th>
                                    <th className="p-4">Clearance Progression</th>
                                    <th className="p-4 pr-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-slate-100">
                                {pagedTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-14 text-center">
                                            <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                                            <p className="text-sm font-bold text-slate-700">
                                                No patient records match the active filters.
                                            </p>
                                            <p className="text-xs text-slate-500 mt-1">
                                                {hasActiveFilters
                                                    ? 'Clear or adjust the status tab, ward, disposition, or search query.'
                                                    : 'Newly routed ward and ER patients will appear here automatically.'}
                                            </p>
                                            {hasActiveFilters && (
                                                <button
                                                    type="button"
                                                    onClick={resetFilters}
                                                    className="mt-3 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700"
                                                >
                                                    Reset All Filters
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    pagedTransactions.map((tx) => {
                                        const requiredDepts = getRequiredDepartments(tx.room_ward, Boolean(tx.requires_or), Boolean(tx.requires_nicu));
                                        const clearedList = requiredDepts.filter((d) => isDepartmentCleared(tx.cleared_departments, d));
                                        const pendingList = requiredDepts.filter((d) => !isDepartmentCleared(tx.cleared_departments, d));
                                        const totalRequired = requiredDepts.length || 1;
                                        const pct = Math.round((clearedList.length / totalRequired) * 100);

                                        const isRouting = tx.overall_status === 'Routing in Progress';
                                        const elapsedMin = getElapsedMinutes(tx.created_at, nowMs);
                                        const isDelayed = isRouting && elapsedMin >= DELAY_THRESHOLD_MIN;
                                        const isModerate = isRouting && elapsedMin >= 15 && elapsedMin < DELAY_THRESHOLD_MIN;
                                        const isExpanded = Boolean(expandedRows[tx.id]);

                                        return (
                                            <tr key={tx.id} className={`hover:bg-slate-50/90 transition-colors ${isDelayed ? 'bg-rose-50/25' : ''}`}>
                                                {/* Patient & Encounter */}
                                                <td className="p-4 pl-6 align-top">
                                                    <div className="font-extrabold text-slate-900 text-sm leading-snug">
                                                        {tx.patient_name}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCopyHospNo(tx.id, tx.hospital_number)}
                                                            title="Copy Hospital Number"
                                                            className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-200 text-[11px] font-semibold transition-colors"
                                                        >
                                                            <span>{tx.hospital_number}</span>
                                                            <span className="text-teal-700 font-sans font-bold">
                                                                {copiedId === tx.id ? 'Copied' : ''}
                                                            </span>
                                                        </button>
                                                        <span className="font-mono text-slate-500 text-[11px] truncate max-w-[180px]" title={tx.enccode}>
                                                            {tx.enccode}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-slate-500 tabular-nums">
                                                        <span>
                                                            Routed {new Date(tx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at{' '}
                                                            {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        {isRouting && (
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded font-bold border ${
                                                                isDelayed
                                                                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                                                                    : isModerate
                                                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                                        : 'bg-slate-100 text-slate-700 border-slate-200'
                                                            }`}>
                                                                Waiting {formatElapsedDuration(elapsedMin)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Originating Ward */}
                                                <td className="p-4 align-top">
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
                                                        {tx.room_ward || 'Unknown Ward'}
                                                    </span>
                                                    {tx.encoded_by && (
                                                        <span className="text-[11px] text-slate-500 block mt-1">
                                                            By <span className="font-semibold text-slate-700">{tx.encoded_by}</span>
                                                        </span>
                                                    )}
                                                    {tx.arrival_datetime && (
                                                        <span className="text-[11px] text-slate-500 block mt-0.5 tabular-nums">
                                                            {supportsAdditionalClearance(tx.room_ward) ? 'Admitted' : 'Arrival'}:{' '}
                                                            {new Date(tx.arrival_datetime).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                                                            {new Date(tx.arrival_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Status & Disposition */}
                                                <td className="p-4 align-top">
                                                    <div className="mb-1.5">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                                            tx.overall_status === 'Cleared'
                                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                                : tx.overall_status === 'Cancelled'
                                                                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                                                                    : tx.overall_status === 'Archived'
                                                                        ? 'bg-slate-100 text-slate-700 border-slate-300'
                                                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                                        }`}>
                                                            {tx.overall_status}
                                                        </span>
                                                    </div>

                                                    <div className="text-xs font-semibold text-slate-600">
                                                        Disposition: <span className="font-bold text-slate-900">{tx.disposition || 'Not specified'}</span>
                                                    </div>

                                                    {(tx.is_oecb || tx.has_oxygen || tx.requires_or || tx.requires_nicu) && (
                                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                                            {tx.is_oecb ? (
                                                                <span className="bg-amber-100 text-amber-900 text-[11px] font-bold px-1.5 py-0.5 rounded border border-amber-300">
                                                                    OECB
                                                                </span>
                                                            ) : null}
                                                            {tx.has_oxygen ? (
                                                                <span className="bg-sky-100 text-sky-900 text-[11px] font-bold px-1.5 py-0.5 rounded border border-sky-300" title={tx.oxygen_remarks}>
                                                                    Oxygen{tx.oxygen_remarks ? `: ${tx.oxygen_remarks}` : ''}
                                                                </span>
                                                            ) : null}
                                                            {tx.requires_or ? (
                                                                <span className="bg-teal-100 text-teal-900 text-[11px] font-bold px-1.5 py-0.5 rounded border border-teal-300">
                                                                    + OR
                                                                </span>
                                                            ) : null}
                                                            {tx.requires_nicu ? (
                                                                <span className="bg-sky-100 text-sky-900 text-[11px] font-bold px-1.5 py-0.5 rounded border border-sky-300">
                                                                    Baby · NICU
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Station Progression (Pending focus + expandable checklist) */}
                                                <td className="p-4 align-top min-w-[230px]">
                                                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1 tabular-nums">
                                                        <span>{clearedList.length} of {requiredDepts.length} cleared</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleRowExpand(tx.id)}
                                                            aria-expanded={isExpanded}
                                                            className="text-[11px] font-bold text-teal-700 hover:text-teal-900 underline"
                                                        >
                                                            {isExpanded ? 'Hide stations' : 'All stations'}
                                                        </button>
                                                    </div>

                                                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-300 ${
                                                                pct === 100 ? 'bg-teal-600' : 'bg-amber-500'
                                                            }`}
                                                            style={{ width: `${pct}%` }}
                                                        ></div>
                                                    </div>

                                                    {pendingList.length > 0 && tx.overall_status !== 'Cancelled' ? (
                                                        <div className="text-[11px] text-amber-900 font-semibold leading-snug">
                                                            Waiting: <span className="font-bold">{pendingList.join(', ')}</span>
                                                        </div>
                                                    ) : tx.overall_status === 'Cancelled' ? (
                                                        <div className="text-[11px] text-rose-700 font-semibold">
                                                            Routing cancelled
                                                        </div>
                                                    ) : (
                                                        <div className="text-[11px] text-emerald-700 font-semibold">
                                                            All required stations cleared
                                                        </div>
                                                    )}

                                                    {isExpanded && (
                                                        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-slate-100 max-w-sm">
                                                            {requiredDepts.map((dept, i) => {
                                                                const isCleared = isDepartmentCleared(tx.cleared_departments, dept);
                                                                return (
                                                                    <span
                                                                        key={i}
                                                                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border ${
                                                                            isCleared
                                                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                                                : 'bg-slate-50 text-slate-600 border-slate-200'
                                                                        }`}
                                                                    >
                                                                        {isCleared ? (
                                                                            <svg className="w-3 h-3 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                                                            </svg>
                                                                        ) : (
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true"></span>
                                                                        )}
                                                                        <span>{dept}</span>
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Supervisor Actions */}
                                                <td className="p-4 pr-6 align-top text-right">
                                                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditModal(tx)}
                                                            className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1"
                                                            title="Edit this patient's routing information"
                                                        >
                                                            <svg className="w-3.5 h-3.5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                                            <span>Edit</span>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => handlePrintF07(tx.enccode)}
                                                            disabled={preparingPrintEnccode === tx.enccode}
                                                            className="bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1 disabled:opacity-60"
                                                            title="Print F07 clearance slip"
                                                            aria-label={`Print F07 for ${tx.patient_name}`}
                                                        >
                                                            {preparingPrintEnccode === tx.enccode ? (
                                                                <>
                                                                    <svg className="w-3.5 h-3.5 text-teal-700 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                                                    </svg>
                                                                    <span>Printing...</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <svg className="w-3.5 h-3.5 text-teal-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                                                                    <span>F07</span>
                                                                </>
                                                            )}
                                                        </button>

                                                        {tx.overall_status === 'Routing in Progress' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCancelPatient(tx.id, tx.patient_name)}
                                                                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                                                title="Cancel routing"
                                                            >
                                                                Cancel
                                                            </button>
                                                        )}

                                                        {tx.overall_status === 'Cancelled' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleReactivatePatient(tx.id, tx.patient_name)}
                                                                className="bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                                                title="Re-activate routing"
                                                            >
                                                                Reactivate
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Footer */}
                    {filteredTransactions.length > 0 && (
                        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600 font-medium tabular-nums shrink-0">
                            <span>
                                Showing <strong>{((currentPage - 1) * PAGE_SIZE + 1).toLocaleString()}</strong> to{' '}
                                <strong>{Math.min(currentPage * PAGE_SIZE, filteredTransactions.length).toLocaleString()}</strong> of{' '}
                                <strong>{filteredTransactions.length.toLocaleString()}</strong> patients
                            </span>
                            {totalPages > 1 && (
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        disabled={currentPage <= 1}
                                        className="px-3 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 font-bold text-slate-700"
                                    >
                                        Prev
                                    </button>
                                    <span className="px-2 font-mono font-bold">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={currentPage >= totalPages}
                                        className="px-3 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 font-bold text-slate-700"
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* SUPERVISOR EDIT PATIENT MODAL */}
            <Modal
                show={Boolean(editingPatient)}
                onClose={() => { if (!isSaving) setEditingPatient(null); }}
                closeable={!isSaving}
                maxWidth="2xl"
                zIndexClass="z-[200]"
                panelClassName="rounded-2xl max-h-[90vh] flex flex-col"
            >
                {editingPatient && (
                    <>
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                        Supervisor Edit
                                    </span>
                                    <span className="font-mono text-xs text-slate-500">
                                        {editingPatient.enccode}
                                    </span>
                                </div>
                                <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">
                                    Edit Routed Patient Details
                                </h3>
                            </div>
                            <button
                                type="button"
                                aria-label="Close modal"
                                onClick={() => setEditingPatient(null)}
                                disabled={isSaving}
                                className="text-slate-400 hover:text-rose-500 transition-colors p-1 disabled:opacity-50"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleSavePatient} className="p-6 space-y-4 overflow-y-auto flex-1">
                            {Object.keys(formErrors).length > 0 && (
                                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
                                    Please review the highlighted validation errors below before saving.
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Patient Full Name <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={patientForm.patient_name}
                                        onChange={(e) => setPatientForm({ ...patientForm, patient_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:ring-teal-500 focus:border-teal-500 uppercase"
                                        required
                                    />
                                    {formErrors.patient_name && <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.patient_name}</p>}
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Hospital Number <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={patientForm.hospital_number}
                                        onChange={(e) => setPatientForm({ ...patientForm, hospital_number: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-slate-800 focus:ring-teal-500 focus:border-teal-500 uppercase"
                                        required
                                    />
                                    {formErrors.hospital_number && <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.hospital_number}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Originating Room / Ward <span className="text-rose-500">*</span>
                                    </label>
                                    <select
                                        value={patientForm.room_ward}
                                        onChange={(e) => setPatientForm({ ...patientForm, room_ward: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 focus:ring-teal-500 focus:border-teal-500"
                                        required
                                    >
                                        {wards.map((w, idx) => (
                                            <option key={idx} value={w}>{w}</option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-slate-500 mt-1">
                                        Changing ward dynamically recalculates required clearance stations.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        {supportsAdditionalClearance(patientForm.room_ward) ? 'Date Admitted' : 'Arrival Date & Time'}
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={patientForm.arrival_datetime}
                                        onChange={(e) => setPatientForm({ ...patientForm, arrival_datetime: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500"
                                    />
                                    {formErrors.arrival_datetime && <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.arrival_datetime}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Patient Disposition
                                    </label>
                                    <select
                                        value={patientForm.disposition}
                                        onChange={(e) => setPatientForm({ ...patientForm, disposition: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500"
                                    >
                                        <option value="">Select disposition...</option>
                                        <option value="Improved">Improved</option>
                                        <option value="HAMA">HAMA</option>
                                        <option value="Transferred">Transferred</option>
                                        <option value="Absconded">Absconded</option>
                                        <option value="Died">Died</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Overall Clearance Status
                                    </label>
                                    <select
                                        value={patientForm.overall_status}
                                        onChange={(e) => setPatientForm({ ...patientForm, overall_status: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:ring-teal-500 focus:border-teal-500"
                                        required
                                    >
                                        <option value="Routing in Progress">Routing in Progress</option>
                                        <option value="Cleared">Cleared (Override)</option>
                                        <option value="Cancelled">Cancelled</option>
                                        <option value="Archived">Archived</option>
                                    </select>
                                    <p className="text-[11px] text-slate-500 mt-1">
                                        Status overrides prompt for confirmation before applying.
                                    </p>
                                </div>
                            </div>

                            {/* OECB, Oxygen & Additional Stations */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                                        Is this an OECB Patient?
                                    </label>
                                    <div className="flex gap-6">
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="is_oecb"
                                                checked={patientForm.is_oecb === true}
                                                onChange={() => setPatientForm({ ...patientForm, is_oecb: true })}
                                                className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300"
                                            />
                                            <span className="text-sm font-bold text-slate-700">Yes (OECB)</span>
                                        </label>
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="is_oecb"
                                                checked={patientForm.is_oecb === false}
                                                onChange={() => setPatientForm({ ...patientForm, is_oecb: false })}
                                                className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300"
                                            />
                                            <span className="text-sm font-bold text-slate-700">No</span>
                                        </label>
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-slate-200">
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                                        Has Oxygen Charges?
                                    </label>
                                    <div className="flex gap-6">
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="has_oxygen"
                                                checked={patientForm.has_oxygen === true}
                                                onChange={() => setPatientForm({ ...patientForm, has_oxygen: true })}
                                                className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300"
                                            />
                                            <span className="text-sm font-bold text-slate-700">Yes</span>
                                        </label>
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="has_oxygen"
                                                checked={patientForm.has_oxygen === false}
                                                onChange={() => setPatientForm({ ...patientForm, has_oxygen: false, oxygen_remarks: '' })}
                                                className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300"
                                            />
                                            <span className="text-sm font-bold text-slate-700">No</span>
                                        </label>
                                    </div>

                                    {patientForm.has_oxygen && (
                                        <div className="mt-3">
                                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                                                Oxygen Remarks (Notes for Cardio Pulmo)
                                            </label>
                                            <textarea
                                                rows="2"
                                                value={patientForm.oxygen_remarks}
                                                onChange={(e) => setPatientForm({ ...patientForm, oxygen_remarks: e.target.value })}
                                                placeholder="e.g. Used 1 tank for 4 hours..."
                                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                            ></textarea>
                                        </div>
                                    )}
                                </div>

                                {supportsAdditionalClearance(patientForm.room_ward) && (
                                    <div className="pt-3 border-t border-slate-200">
                                        <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                                            Additional Clearance Stations
                                        </label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                aria-pressed={Boolean(patientForm.requires_or)}
                                                onClick={() => setPatientForm({ ...patientForm, requires_or: !patientForm.requires_or })}
                                                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
                                                    patientForm.requires_or
                                                        ? 'bg-teal-50 border-teal-500 text-teal-900 ring-1 ring-teal-500'
                                                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                                                }`}
                                            >
                                                <div>
                                                    <div className="text-xs font-extrabold uppercase">Clear in OR</div>
                                                    <div className="text-[11px] text-slate-500">Operating Room clearance</div>
                                                </div>
                                                <span className={`text-[11px] font-black px-2 py-0.5 rounded ${patientForm.requires_or ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                                    {patientForm.requires_or ? 'ON' : 'OFF'}
                                                </span>
                                            </button>

                                            <button
                                                type="button"
                                                aria-pressed={Boolean(patientForm.requires_nicu)}
                                                onClick={() => setPatientForm({ ...patientForm, requires_nicu: !patientForm.requires_nicu })}
                                                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
                                                    patientForm.requires_nicu
                                                        ? 'bg-sky-50 border-sky-500 text-sky-900 ring-1 ring-sky-500'
                                                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                                                }`}
                                            >
                                                <div>
                                                    <div className="text-xs font-extrabold uppercase">Baby · NICU Clearance</div>
                                                    <div className="text-[11px] text-slate-500">Requires NICU clearance</div>
                                                </div>
                                                <span className={`text-[11px] font-black px-2 py-0.5 rounded ${patientForm.requires_nicu ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                                    {patientForm.requires_nicu ? 'ON' : 'OFF'}
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setEditingPatient(null)}
                                    className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="px-5 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 rounded-lg shadow-sm transition-colors flex items-center space-x-2"
                                >
                                    {isSaving ? (
                                        <>
                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            <span>Saving Changes...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                            <span>Save Changes</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </Modal>

            <ConfirmDialog
                show={Boolean(confirmState)}
                onClose={() => setConfirmState(null)}
                onConfirm={confirmState?.onConfirm}
                title={confirmState?.title || 'Confirm Action'}
                message={confirmState?.message || ''}
                confirmLabel={confirmState?.confirmLabel || 'Confirm'}
                tone={confirmState?.tone || 'danger'}
                loading={isSaving || isConfirmRunning}
            />

            {/* Hidden iframe triggers native browser print dialog directly over the Supervisor Dashboard */}
            {printingF07 && (
                <iframe
                    key={`${printingF07.enccode}-${printingF07.seq}`}
                    src={`/print-clearance/document?enccode=${encodeURIComponent(printingF07.enccode)}`}
                    onLoad={() => {
                        setTimeout(() => setPreparingPrintEnccode(null), 900);
                    }}
                    style={{
                        position: 'fixed',
                        top: '-10000px',
                        left: '-10000px',
                        width: '8.5in',
                        height: '5.5in',
                        border: 'none',
                    }}
                    title="Supervisor F07 Print Frame"
                />
            )}

            {/* SEMANTIC TOAST NOTIFICATION */}
            {toastState && (
                <div
                    role={toastState.isError ? 'alert' : 'status'}
                    className={`fixed top-6 right-6 z-[300] flex items-center text-white px-5 py-3.5 rounded-xl shadow-2xl border animate-slide-in-top motion-reduce:animate-none ${
                        toastState.isError ? 'bg-rose-600 border-rose-500' : 'bg-slate-900 border-slate-700'
                    }`}
                >
                    <div className={`rounded-full p-1 mr-3 ${toastState.isError ? 'bg-rose-500' : 'bg-teal-500'}`}>
                        {toastState.isError ? (
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01M10.29 3.86l-7.1 12.26A2 2 0 004.92 19h14.16a2 2 0 001.73-2.88l-7.1-12.26a2 2 0 00-3.42 0z"></path></svg>
                        ) : (
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                        )}
                    </div>
                    <span className="font-bold text-sm tracking-wide">{toastState.message}</span>
                    <button
                        type="button"
                        aria-label="Dismiss notification"
                        onClick={() => setToastState(null)}
                        className={`ml-4 transition-colors ${toastState.isError ? 'text-rose-200 hover:text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            )}
        </PortalLayout>
    );
}
