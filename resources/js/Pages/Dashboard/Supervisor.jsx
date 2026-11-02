import React, { useState, useEffect } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import PortalLayout from '@/Layouts/PortalLayout';

export default function SupervisorDashboard({ transactions = [], wards = [] }) {
    const { auth } = usePage().props;

    const [activeTab, setActiveTab] = useState('all'); // 'all', 'Routing in Progress', 'Cleared', 'Cancelled', 'Archived'
    const [selectedWard, setSelectedWard] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [toastMessage, setToastMessage] = useState(null);

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
        oxygen_remarks: ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [formErrors, setFormErrors] = useState({});

    // Real-time synchronization
    useEffect(() => {
        if (window.Echo) {
            window.Echo.channel('clearance-updates')
                .listen('PatientRouted', () => {
                    router.reload({
                        only: ['transactions'],
                        preserveScroll: true,
                        preserveState: true
                    });
                });
        }

        const pollInterval = setInterval(() => {
            router.reload({
                only: ['transactions'],
                preserveScroll: true,
                preserveState: true
            });
        }, 5000);

        return () => {
            clearInterval(pollInterval);
            if (window.Echo) window.Echo.leaveChannel('clearance-updates');
        };
    }, []);

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3500);
    };

    // Calculate required departments per ward
    const getRequiredDepartments = (wardStr) => {
        const base = ['Pharmacy', 'Laboratory', 'Radiology', 'Cardio Pulmo', 'CSR'];
        const ward = (wardStr || '').toLowerCase();
        const isEr = ward === 'emergency room' || ward === 'er' || ward.includes('emergency');
        const isOutpatient = ward.includes('outpatient') || ward.includes('opd') || ward.includes('hemodialysis') || ward.includes('dialysis') || ward.includes('hdu');
        const isAdmitted = !isEr && !isOutpatient;

        const depts = [...base];

        if (isAdmitted) {
            depts.push('Credit and Collection');
        }

        if (ward.includes('ortho') || ward.includes('surg')) {
            depts.push('OR');
        } else if (ward.includes('ob')) {
            depts.push('LR/DR');
        } else if (isOutpatient) {
            depts.push('HDU');
        }
        return depts;
    };

    // Filtering logic
    const filteredTransactions = transactions.filter(tx => {
        const matchesStatus = activeTab === 'all' || tx.overall_status === activeTab;
        const matchesWard = selectedWard === 'all' || (tx.room_ward || '').toLowerCase() === selectedWard.toLowerCase();

        const term = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm ||
            (tx.patient_name || '').toLowerCase().includes(term) ||
            (tx.hospital_number || '').toLowerCase().includes(term) ||
            (tx.enccode || '').toLowerCase().includes(term) ||
            (tx.room_ward || '').toLowerCase().includes(term) ||
            (tx.encoded_by || '').toLowerCase().includes(term);

        return matchesStatus && matchesWard && matchesSearch;
    });

    // Counts
    const inProgressCount = transactions.filter(t => t.overall_status === 'Routing in Progress').length;
    const clearedCount = transactions.filter(t => t.overall_status === 'Cleared').length;
    const cancelledCount = transactions.filter(t => t.overall_status === 'Cancelled').length;
    const totalCount = transactions.length;

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
            oxygen_remarks: tx.oxygen_remarks || ''
        });
    };

    const handleSavePatient = (e) => {
        e.preventDefault();
        if (!editingPatient) return;

        setIsSaving(true);
        setFormErrors({});

        router.put(`/supervisor/transactions/${editingPatient.id}`, {
            ...patientForm,
            is_oecb: Boolean(patientForm.is_oecb),
            has_oxygen: Boolean(patientForm.has_oxygen),
            oxygen_remarks: patientForm.has_oxygen ? patientForm.oxygen_remarks : null,
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setIsSaving(false);
                setEditingPatient(null);
                showToast(`Patient clearance for ${patientForm.patient_name} updated successfully.`);
            },
            onError: (errs) => {
                setIsSaving(false);
                setFormErrors(errs);
                showToast("Failed to update patient. Please check the form errors.");
            }
        });
    };

    const handleCancelPatient = (id, name) => {
        if (confirm(`Are you sure you want to CANCEL routing for ${name}?\n\nThis will remove the patient from cost center queues.`)) {
            router.post(`/supervisor/transactions/${id}/cancel`, {}, {
                preserveScroll: true,
                onSuccess: () => showToast(`Clearance routing for ${name} has been cancelled.`)
            });
        }
    };

    const handleReactivatePatient = (id, name) => {
        if (confirm(`Re-activate clearance routing for ${name}?`)) {
            router.post(`/supervisor/transactions/${id}/reactivate`, {}, {
                preserveScroll: true,
                onSuccess: () => showToast(`Clearance routing for ${name} has been re-activated.`)
            });
        }
    };

    return (
        <PortalLayout>
            <Head title="Clinical Supervisor Dashboard - RMPH" />

            <div className="flex flex-col w-full p-6 bg-slate-100 min-h-[calc(100vh-64px)] font-sans">
                
                {/* TOP HEADER */}
                <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-200 gap-4">
                    <div>
                        <div className="flex items-center space-x-2">
                            <span className="text-[11px] font-black tracking-widest text-teal-600 uppercase bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                                Management Portal
                            </span>
                            <span className="flex h-2 w-2 relative" title="Live Sync Active">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                            </span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight mt-1">
                            Clinical Supervisor Dashboard
                        </h1>
                        <p className="text-xs text-slate-500 font-medium">
                            Oversee and edit patient routing, track clearance turnaround across hospital wards, and manage disposition.
                        </p>
                    </div>

                    {/* KPI CARDS */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm min-w-[120px]">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Routed</div>
                            <div className="text-xl font-black text-slate-800">{totalCount}</div>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 shadow-sm min-w-[120px]">
                            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">In Progress</div>
                            <div className="text-xl font-black text-amber-700">{inProgressCount}</div>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 shadow-sm min-w-[120px]">
                            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Fully Cleared</div>
                            <div className="text-xl font-black text-emerald-700">{clearedCount}</div>
                        </div>
                        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 shadow-sm min-w-[120px]">
                            <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Cancelled</div>
                            <div className="text-xl font-black text-rose-700">{cancelledCount}</div>
                        </div>
                    </div>
                </div>

                {/* CONTROLS & FILTER BAR */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mt-6 flex flex-col lg:flex-row items-center justify-between gap-4">
                    
                    {/* Status Tabs */}
                    <div className="flex p-1 bg-slate-100 rounded-lg shadow-inner w-full lg:w-auto overflow-x-auto">
                        {[
                            { id: 'all', label: 'All Patients', count: totalCount },
                            { id: 'Routing in Progress', label: 'In Progress', count: inProgressCount },
                            { id: 'Cleared', label: 'Cleared', count: clearedCount },
                            { id: 'Cancelled', label: 'Cancelled', count: cancelledCount },
                            { id: 'Archived', label: 'Archived', count: transactions.filter(t => t.overall_status === 'Archived').length },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap flex items-center space-x-1.5 ${
                                    activeTab === tab.id
                                        ? 'bg-white text-teal-700 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                                    activeTab === tab.id ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-600'
                                }`}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Ward Selector & Search */}
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                        {/* Ward Filter */}
                        <div className="w-full sm:w-auto">
                            <select
                                value={selectedWard}
                                onChange={(e) => setSelectedWard(e.target.value)}
                                className="w-full sm:w-48 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                            >
                                <option value="all">🏥 All Originating Wards</option>
                                {wards.map((w, idx) => (
                                    <option key={idx} value={w}>{w}</option>
                                ))}
                            </select>
                        </div>

                        {/* Search Input */}
                        <div className="relative w-full sm:w-72">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            </span>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search patient, hospital #, enc..."
                                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                            />
                            {searchTerm && (
                                <button
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
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 mt-6 flex-1 flex flex-col overflow-hidden">
                    <div className="overflow-x-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="p-4 pl-6">Patient & Encounter Details</th>
                                    <th className="p-4">Originating Ward & Encoder</th>
                                    <th className="p-4">Disposition & Flags</th>
                                    <th className="p-4">Clearance Stations Progress</th>
                                    <th className="p-4 pr-6 text-right">Supervisor Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-slate-100">
                                {filteredTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-12 text-center">
                                            <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                                            <p className="text-sm font-medium text-slate-400">
                                                No patient records match the current filters.
                                            </p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTransactions.map((tx) => {
                                        const requiredDepts = getRequiredDepartments(tx.room_ward);

                                        return (
                                            <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                                                
                                                {/* Patient & Enc */}
                                                <td className="p-4 pl-6 align-top">
                                                    <div className="font-extrabold text-slate-800 text-sm leading-snug">
                                                        {tx.patient_name}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs">
                                                        <span className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
                                                            Hosp #: {tx.hospital_number}
                                                        </span>
                                                        <span className="font-mono text-slate-400 text-[10px]">
                                                            Enc: {tx.enccode}
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-400 mt-1">
                                                        Routed: {new Date(tx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>

                                                {/* Originating Ward */}
                                                <td className="p-4 align-top">
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
                                                        {tx.room_ward || 'Unknown Ward'}
                                                    </span>
                                                    {tx.encoded_by && (
                                                        <span className="text-[11px] text-slate-400 block mt-1">
                                                            By: <span className="font-medium text-slate-600">{tx.encoded_by}</span>
                                                        </span>
                                                    )}
                                                    {tx.arrival_datetime && (
                                                        <span className="text-[11px] text-slate-500 block mt-0.5">
                                                            Arrival: {new Date(tx.arrival_datetime).toLocaleDateString([], { month: 'short', day: 'numeric' })} {new Date(tx.arrival_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Disposition & Status & Flags */}
                                                <td className="p-4 align-top">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${
                                                            tx.overall_status === 'Cleared'
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                : (tx.overall_status === 'Cancelled'
                                                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                                    : (tx.overall_status === 'Archived'
                                                                        ? 'bg-slate-100 text-slate-600 border-slate-300'
                                                                        : 'bg-amber-50 text-amber-700 border-amber-200'))
                                                        }`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                                                                tx.overall_status === 'Cleared'
                                                                    ? 'bg-emerald-500'
                                                                    : (tx.overall_status === 'Cancelled'
                                                                        ? 'bg-rose-500'
                                                                        : (tx.overall_status === 'Archived'
                                                                            ? 'bg-slate-400'
                                                                            : 'bg-amber-500 animate-pulse'))
                                                            }`}></span>
                                                            {tx.overall_status}
                                                        </span>
                                                    </div>

                                                    <div className="text-xs font-bold text-slate-600 mb-1">
                                                        Disposition: <span className="text-slate-800">{tx.disposition || 'Not specified'}</span>
                                                    </div>

                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {tx.is_oecb ? (
                                                            <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-1.5 py-0.5 rounded border border-amber-300">
                                                                OECB
                                                            </span>
                                                        ) : null}
                                                        {tx.has_oxygen ? (
                                                            <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-sky-300" title={tx.oxygen_remarks}>
                                                                Oxygen {tx.oxygen_remarks ? `("${tx.oxygen_remarks}")` : ''}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </td>

                                                {/* Department Progress */}
                                                <td className="p-4 align-top">
                                                    <div className="flex flex-wrap gap-1 max-w-sm">
                                                        {requiredDepts.map((dept, i) => {
                                                            const isCleared = tx.cleared_departments?.some(d => {
                                                                const cleanD = (d || '').toUpperCase().trim();
                                                                const cleanTarget = dept.toUpperCase().trim();
                                                                if (cleanD === cleanTarget) return true;
                                                                if (cleanTarget === 'CREDIT AND COLLECTION' && (cleanD.includes('CREDIT') || cleanD.includes('COLLECT'))) return true;
                                                                if (cleanTarget === 'OR' && (cleanD === 'OR/LR/DR' || cleanD === 'OPERATING ROOM')) return true;
                                                                if (cleanTarget === 'LR/DR' && (cleanD === 'OR/LR/DR' || cleanD === 'LR / DR' || cleanD === 'LR' || cleanD === 'DR' || cleanD === 'DELIVERY ROOM')) return true;
                                                                if (cleanTarget === 'HDU' && (cleanD === 'HDU' || cleanD === 'CKD' || cleanD === 'DIALYSIS' || cleanD === 'DIALYSIS UNIT' || cleanD === 'HEMODIALYSIS')) return true;
                                                                if (cleanTarget === 'CARDIO PULMO' && (cleanD.includes('CARDIO') || cleanD.includes('ECG'))) return true;
                                                                return false;
                                                            });

                                                            return (
                                                                <span
                                                                    key={i}
                                                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                                                                        isCleared
                                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                                                            : 'bg-slate-100 text-slate-500 border-slate-200'
                                                                    }`}
                                                                >
                                                                    {isCleared ? '✓ ' : '○ '}{dept}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </td>

                                                {/* Supervisor Actions */}
                                                <td className="p-4 pr-6 align-top text-right">
                                                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                                        
                                                        {/* EDIT PATIENT BUTTON */}
                                                        <button
                                                            onClick={() => openEditModal(tx)}
                                                            className="bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-800 border border-amber-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center space-x-1"
                                                            title="Edit this patient's routing information"
                                                        >
                                                            <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                                            <span>Edit</span>
                                                        </button>

                                                        {/* PRINT F07 */}
                                                        <a
                                                            href={`/print-clearance/document?enccode=${encodeURIComponent(tx.enccode)}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="bg-teal-50 hover:bg-teal-100 text-teal-700 hover:text-teal-800 border border-teal-300 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center space-x-1"
                                                            title="Print F07 Clearance Form"
                                                        >
                                                            <svg className="w-3.5 h-3.5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                                                            <span>F07</span>
                                                        </a>

                                                        {/* CANCEL / REACTIVATE */}
                                                        {tx.overall_status === 'Routing in Progress' && (
                                                            <button
                                                                onClick={() => handleCancelPatient(tx.id, tx.patient_name)}
                                                                className="bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border border-rose-200 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
                                                                title="Cancel routing"
                                                            >
                                                                Cancel
                                                            </button>
                                                        )}

                                                        {tx.overall_status === 'Cancelled' && (
                                                            <button
                                                                onClick={() => handleReactivatePatient(tx.id, tx.patient_name)}
                                                                className="bg-sky-50 hover:bg-sky-100 text-sky-700 hover:text-sky-800 border border-sky-300 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
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
                </div>
            </div>

            {/* SUPERVISOR EDIT PATIENT MODAL */}
            {editingPatient && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200 my-8">
                        
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <div>
                                <div className="flex items-center space-x-2">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                        Supervisor Edit
                                    </span>
                                    <span className="font-mono text-xs text-slate-400">
                                        Enc: {editingPatient.enccode}
                                    </span>
                                </div>
                                <h3 className="text-lg font-black text-slate-800 mt-0.5">
                                    Edit Routed Patient Details
                                </h3>
                            </div>
                            <button
                                onClick={() => setEditingPatient(null)}
                                className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleSavePatient} className="p-6 space-y-4">
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Patient Name */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Patient Full Name <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={patientForm.patient_name}
                                        onChange={e => setPatientForm({ ...patientForm, patient_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:ring-teal-500 focus:border-teal-500 uppercase"
                                        required
                                    />
                                    {formErrors.patient_name && <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.patient_name}</p>}
                                </div>

                                {/* Hospital Number */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Hospital Number <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={patientForm.hospital_number}
                                        onChange={e => setPatientForm({ ...patientForm, hospital_number: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-slate-800 focus:ring-teal-500 focus:border-teal-500 uppercase"
                                        required
                                    />
                                    {formErrors.hospital_number && <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.hospital_number}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Originating Room / Ward */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Originating Room / Ward <span className="text-rose-500">*</span>
                                    </label>
                                    <select
                                        value={patientForm.room_ward}
                                        onChange={e => setPatientForm({ ...patientForm, room_ward: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 focus:ring-teal-500 focus:border-teal-500"
                                        required
                                    >
                                        {wards.map((w, idx) => (
                                            <option key={idx} value={w}>{w}</option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        Changing ward dynamically recalculates required clearance stations.
                                    </p>
                                </div>

                                {/* Arrival Time */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Arrival Date & Time
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={patientForm.arrival_datetime}
                                        onChange={e => setPatientForm({ ...patientForm, arrival_datetime: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500"
                                    />
                                    {formErrors.arrival_datetime && <p className="text-xs text-rose-600 mt-1 font-medium">{formErrors.arrival_datetime}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Disposition */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Patient Disposition
                                    </label>
                                    <select
                                        value={patientForm.disposition}
                                        onChange={e => setPatientForm({ ...patientForm, disposition: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500"
                                    >
                                        <option value="">Select status...</option>
                                        <option value="Improved">Improved</option>
                                        <option value="HAMA">HAMA</option>
                                        <option value="Transferred">Transferred</option>
                                        <option value="Absconded">Absconded</option>
                                        <option value="Died">Died</option>
                                    </select>
                                </div>

                                {/* Overall Status */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Overall Clearance Status
                                    </label>
                                    <select
                                        value={patientForm.overall_status}
                                        onChange={e => setPatientForm({ ...patientForm, overall_status: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:ring-teal-500 focus:border-teal-500"
                                        required
                                    >
                                        <option value="Routing in Progress">Routing in Progress</option>
                                        <option value="Cleared">Cleared (Override)</option>
                                        <option value="Cancelled">Cancelled</option>
                                        <option value="Archived">Archived</option>
                                    </select>
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        Setting to Cancelled removes patient from cost center queues.
                                    </p>
                                </div>
                            </div>

                            {/* OECB and Oxygen Flags */}
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
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                                                Oxygen Remarks (Notes for Cardio Pulmo)
                                            </label>
                                            <textarea
                                                rows="2"
                                                value={patientForm.oxygen_remarks}
                                                onChange={e => setPatientForm({ ...patientForm, oxygen_remarks: e.target.value })}
                                                placeholder="e.g. Used 1 tank for 4 hours..."
                                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
                                            ></textarea>
                                        </div>
                                    )}
                                </div>
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
                    </div>
                </div>
            )}

            {/* TOAST NOTIFICATION */}
            {toastMessage && (
                <div className="fixed top-6 right-6 z-[300] flex items-center bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-2xl border border-slate-700 animate-in slide-in-from-top-5 fade-in duration-300">
                    <div className="bg-teal-500 rounded-full p-1 mr-3">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <span className="font-bold text-sm tracking-wide">{toastMessage}</span>
                    <button onClick={() => setToastMessage(null)} className="ml-4 text-slate-400 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            )}
        </PortalLayout>
    );
}
