import React, { useState, useEffect, useRef } from 'react';
import { Head, router } from '@inertiajs/react';
import PortalLayout from '@/Layouts/PortalLayout';
import Modal from '@/Components/Modal';
import axios from 'axios';
import PromissoryMasterlist from '@/Components/PromissoryMasterlist';
import CreditReportsModule from '@/Components/CreditReportsModule';

const QUICK_PENDING_REASONS = [
    'Unserved items / pending result',
    'Unreturned supplies or medication',
    'Unsettled balance / promissory note needed',
    'Missing or unposted charge slip',
    'For further verification',
];

export default function CostCenter({ department, departmentSchedule = null, todayDate = '', pendingPatients = [], historyPatients = [] }) {
    const fallbackToday = todayDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const [searchTerm, setSearchTerm] = useState('');
    const [activeModule, setActiveModule] = useState('pending'); 
    const [historyScope, setHistoryScope] = useState('today'); // 'today' | 'all'
    const [selectedHistoryDate, setSelectedHistoryDate] = useState(fallbackToday);
    const [soundEnabled, setSoundEnabled] = useState(true);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [modalData, setModalData] = useState(null);
    const [activeEnccode, setActiveEnccode] = useState(null);
    const [toastMessage, setToastMessage] = useState(null);
    const [toastIsError, setToastIsError] = useState(false);
    
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [patientCreditStatus, setPatientCreditStatus] = useState(null);
    const [isCheckingCredit, setIsCheckingCredit] = useState(false);

    // Pending Remark state (inline in Inspect Modal & quick row modal)
    const [remarkModalPatient, setRemarkModalPatient] = useState(null);
    const [remarkText, setRemarkText] = useState('');
    const [inlineRemarkText, setInlineRemarkText] = useState('');
    const [isSavingRemark, setIsSavingRemark] = useState(false);

    const isCreditDept = (department || '').toLowerCase().includes('credit') || (department || '').toLowerCase().includes('collect');
    // Hidden for CAC this year; set to true next year when Promissory & SAA modules go live.
    const ENABLE_CREDIT_PROMISSORY_MODULE = false;

    const previousQueueCount = useRef(pendingPatients.length);
    const warnedPatients = useRef([]); 

    const todayCompletedCount = historyPatients.filter(
        (p) => (p.cleared_day || '') === fallbackToday
    ).length;

    const scopedHistoryPatients = historyScope === 'today'
        ? historyPatients.filter((p) => (p.cleared_day || '') === selectedHistoryDate)
        : historyPatients;

    const activeData = activeModule === 'pending' ? pendingPatients : scopedHistoryPatients;
    const filteredPatients = activeData.filter(patient => 
        (patient.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
        (patient.enccode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (patient.hospital_number || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatWaitTime = (minutes) => {
        if (minutes < 60) return `${minutes} min`;
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}h ${m}m`;
    };

    useEffect(() => {
        if (window.Echo) {
            window.Echo.channel('clearance-updates')
                .listen('PatientRouted', (e) => {
                    if (soundEnabled) {
                        new Audio('/sounds/notif.wav').play().catch(() => {});
                    }
                    router.reload({ 
                        only: ['pendingPatients', 'historyPatients'], 
                        preserveScroll: true, 
                        preserveState: true 
                    });
                });
        }

        const pollInterval = setInterval(() => {
            router.reload({ 
                only: ['pendingPatients', 'historyPatients', 'departmentSchedule'], 
                preserveScroll: true, 
                preserveState: true 
            });

            if (departmentSchedule?.is_24_7 === false && departmentSchedule?.is_open_now === false) {
                return;
            }

            let triggeredWarning = false;
            pendingPatients.forEach(patient => {
                const effectiveMinutes = typeof patient.effective_waiting_minutes === 'number'
                    ? patient.effective_waiting_minutes
                    : getWaitMinutes(patient.date);

                if (effectiveMinutes >= 15 && !warnedPatients.current.includes(patient.enccode)) {
                    triggeredWarning = true;
                    warnedPatients.current.push(patient.enccode); 
                }
            });

            if (triggeredWarning && soundEnabled) {
                new Audio('/sounds/notif.wav').play().catch(() => {});
            }
        }, 5000); 

        if (pendingPatients.length > previousQueueCount.current && soundEnabled) {
            new Audio('/sounds/notif.wav').play().catch(() => {});
        }
        
        previousQueueCount.current = pendingPatients.length;

        return () => {
            clearInterval(pollInterval);
            if (window.Echo) window.Echo.leaveChannel('clearance-updates');
        };
    }, [pendingPatients, department, departmentSchedule, soundEnabled]);

    const getWaitMinutes = (dateString) => Math.max(0, Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60)));

    const openInspectModal = async (enccode) => {
        const matchedPending = pendingPatients.find((p) => p.enccode === enccode);
        setInlineRemarkText(matchedPending?.pending_remark?.remarks || '');
        setIsModalOpen(true);
        setIsLoadingData(true);
        setActiveEnccode(enccode);
        setModalData(null);
        
        try {
            const response = await axios.get(`/clearance-data/fetch?enccode=${encodeURIComponent(enccode)}`, {
                headers: { 
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            setModalData(response.data);
            setPatientCreditStatus(null);
            if (ENABLE_CREDIT_PROMISSORY_MODULE && isCreditDept) {
                const patName = response.data.transaction?.patient_name || response.data.patient_name || '';
                if (patName) {
                    setIsCheckingCredit(true);
                    try {
                        const creditRes = await axios.get(`/credit-promissory/check-patient?name=${encodeURIComponent(patName)}`);
                        setPatientCreditStatus(creditRes.data);
                    } catch (err) {
                        console.error('Failed to check patient credit records', err);
                    } finally {
                        setIsCheckingCredit(false);
                    }
                }
            }
        } catch (error) {
            console.error("Failed to load clearance data", error);
            setToastIsError(true);
            setToastMessage("Failed to load records from iHomis. Please try again.");
            setTimeout(() => setToastMessage(null), 4000);
            setIsModalOpen(false);
        } finally {
            setIsLoadingData(false);
        }
    };

    const getActiveOrders = () => {
        if (!modalData) return [];
        
        let data = modalData;
        if (modalData.props) data = modalData.props;
        if (data.data) data = data.data;

        const dept = (department || '').toLowerCase();
        let orders = [];

        if (dept.includes('pharmacy')) orders = data.pharmacyOrders;
        else if (dept.includes('csr') || dept.includes('supplies')) orders = data.csrOrders;
        else if (dept.includes('lab')) orders = data.labOrders;
        else if (dept.includes('radio') || dept.includes('xray')) orders = data.radioOrders;
        else if (dept.includes('cardio') || dept.includes('ecg')) orders = data.cardioOrders;
        else if (dept === 'or' || dept.includes('operating')) orders = data.orOrders || [];
        else if (dept.includes('lr') || dept.includes('dr') || dept.includes('delivery')) orders = data.lrDrOrders || [];
        else if (dept.includes('hdu') || dept.includes('ckd') || dept.includes('dialysis')) orders = data.hduOrders || data.ckdOrders || [];
        else if (dept.includes('nicu') || dept.includes('neonatal')) orders = data.nicuOrders || [];
        else if (dept.includes('credit') || dept.includes('collect')) orders = data.creditOrders || [];
        
        return Array.isArray(orders) ? orders : [];
    };

    const hasUnservedItems = () => {
        const orders = getActiveOrders();
        return orders.some(item => item.status !== 'S' && item.status !== 'P');
    };

    const handleClearClick = () => {
        setIsConfirmOpen(true);
    };

    const submitPendingRemark = (enccode, nextRemarks, { closeModal = false } = {}) => {
        setIsSavingRemark(true);
        router.post('/clearance/pending-remarks', {
            enccode,
            department,
            remarks: nextRemarks,
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setIsSavingRemark(false);
                if (closeModal) {
                    setRemarkModalPatient(null);
                }
                setToastIsError(false);
                setToastMessage(nextRemarks.trim() ? 'Pending remark saved.' : 'Pending remark cleared.');
                setTimeout(() => setToastMessage(null), 3000);
            },
            onError: (errors) => {
                const serverMessage = Object.values(errors || {}).flat().find(Boolean);
                setIsSavingRemark(false);
                setToastIsError(true);
                setToastMessage(serverMessage || 'Could not save pending remark. Please try again.');
                setTimeout(() => setToastMessage(null), 4000);
            },
        });
    };

    const executeClearDepartment = () => {
        setIsClearing(true);
        router.post('/clearance', {
            enccode: activeEnccode,
            department: department
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setToastIsError(false);
                setToastMessage(`${department} successfully cleared!`);
                setIsConfirmOpen(false);
                setIsModalOpen(false);
                setIsClearing(false);
                setTimeout(() => setToastMessage(null), 3000);
            },
            onError: (errors) => {
                const serverMessage = Object.values(errors || {}).flat().find(Boolean);
                setToastIsError(true);
                setToastMessage(
                    serverMessage
                        ? `Could not clear ${department}: ${serverMessage}`
                        : `Could not clear ${department}. Please try again or refresh the page.`
                );
                setIsConfirmOpen(false);
                setIsClearing(false);
                setTimeout(() => setToastMessage(null), 5000);
                console.error(errors);
            }
        });
    };

    return (
        <PortalLayout>
            <Head title={`${department} Verification Portal`} />
            
            <div className="flex flex-col md:flex-row gap-6 w-full p-6 bg-slate-100 min-h-[calc(100vh-64px)] font-sans">
                
                {/* LEFT SIDEBAR */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col shrink-0 w-full md:w-[260px]">
                    <div className="mb-8 px-2 pt-2 flex justify-between items-start border-b border-slate-100 pb-4">
                        <div>
                            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Verification Portal</h2>
                            <div className="text-xl font-bold text-slate-800">{department}</div>
                            {departmentSchedule && departmentSchedule.is_24_7 === false && (
                                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                    <span>{departmentSchedule.hours_label}</span>
                                    <span className={departmentSchedule.is_open_now ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                                        • {departmentSchedule.is_open_now ? 'Open' : 'Closed'}
                                    </span>
                                </div>
                            )}
                        </div>
                        
                        <button type="button" onClick={() => setSoundEnabled(!soundEnabled)} className="text-slate-400 hover:text-teal-500 transition-colors p-1 bg-slate-50 rounded-md border border-slate-200 shadow-sm" title={soundEnabled ? "Mute Alerts" : "Enable Alerts"} aria-label={soundEnabled ? "Mute alerts" : "Enable alerts"}>
                            {soundEnabled ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10c0-1.1.9-2 2-2h2l4-4v16l-4-4H7a2 2 0 01-2-2v-4z"></path></svg>
                            ) : (
                                <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h2.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg>
                            )}
                        </button>
                    </div>

                    <nav className="flex-1 space-y-1.5">
                        <button onClick={() => setActiveModule('pending')} className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeModule === 'pending' ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}>
                            <div className="flex items-center space-x-3">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span>Pending Requests</span>
                            </div>
                            {pendingPatients.length > 0 && <span className="bg-rose-500 text-white text-[11px] px-2 py-0.5 rounded-full tabular-nums">{pendingPatients.length}</span>}
                        </button>

                        <button onClick={() => setActiveModule('completed')} className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeModule === 'completed' ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}>
                            <div className="flex items-center space-x-3">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span>Completed History</span>
                            </div>
                            {todayCompletedCount > 0 && (
                                <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums">{todayCompletedCount}</span>
                            )}
                        </button>

                        {ENABLE_CREDIT_PROMISSORY_MODULE && isCreditDept && (
                            <>
                                <button onClick={() => setActiveModule('promissory')} className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeModule === 'promissory' ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}>
                                    <div className="flex items-center space-x-3">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                        <span>Promissory & Balances</span>
                                    </div>
                                    <span className="bg-slate-200 text-slate-700 text-[11px] px-2 py-0.5 rounded-full font-bold">57k+</span>
                                </button>

                                <button onClick={() => setActiveModule('reports')} className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeModule === 'reports' ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}>
                                    <div className="flex items-center space-x-3">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                                        <span>Reports & SAA Budgets</span>
                                    </div>
                                    <span className="bg-teal-100 text-teal-800 text-[11px] px-2 py-0.5 rounded-full font-bold">80 SAA</span>
                                </button>
                            </>
                        )}
                    </nav>
                </div>

                {/* MAIN CONTENT AREA */}
                {ENABLE_CREDIT_PROMISSORY_MODULE && activeModule === 'promissory' ? (
                    <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col overflow-y-auto">
                        <PromissoryMasterlist onOpenReports={() => setActiveModule('reports')} />
                    </div>
                ) : ENABLE_CREDIT_PROMISSORY_MODULE && activeModule === 'reports' ? (
                    <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col overflow-y-auto">
                        <CreditReportsModule onBackToMasterlist={() => setActiveModule('promissory')} />
                    </div>
                ) : (
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative">
                    <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 shrink-0">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">
                                {activeModule === 'pending' ? 'Needs Your Approval' : 'Completed History'}
                            </h3>
                            {activeModule === 'completed' && (
                                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                                    {historyScope === 'today'
                                        ? `${scopedHistoryPatients.length} cleared on ${selectedHistoryDate}`
                                        : `${historyPatients.length} total cleared records (${todayCompletedCount} today)`}
                                </p>
                            )}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-3">
                            {activeModule === 'completed' && (
                                <>
                                    <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 border border-slate-200">
                                        <button
                                            type="button"
                                            onClick={() => setHistoryScope('today')}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                                                historyScope === 'today'
                                                    ? 'bg-white text-teal-700 shadow-sm'
                                                    : 'text-slate-600 hover:text-slate-900'
                                            }`}
                                        >
                                            Within Day
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setHistoryScope('all')}
                                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                                                historyScope === 'all'
                                                    ? 'bg-white text-teal-700 shadow-sm'
                                                    : 'text-slate-600 hover:text-slate-900'
                                            }`}
                                        >
                                            All History
                                        </button>
                                    </div>

                                    {historyScope === 'today' && (
                                        <input
                                            type="date"
                                            aria-label="Filter completed history date"
                                            value={selectedHistoryDate}
                                            onChange={(e) => setSelectedHistoryDate(e.target.value || fallbackToday)}
                                            className="px-2.5 py-1.5 rounded-lg border-slate-300 shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-xs font-semibold text-slate-700 tabular-nums"
                                        />
                                    )}

                                    <a
                                        href={`/cost-center/reports/print?date=${encodeURIComponent(selectedHistoryDate)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                        </svg>
                                        <span>Print Daily Report</span>
                                    </a>
                                </>
                            )}

                            <div className="w-full sm:w-64 relative">
                                <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                <input 
                                    type="text" 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 rounded-lg border-slate-300 shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm transition-all" 
                                    placeholder="Search patient name or #..."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 bg-white">
                        <div className="overflow-x-auto w-full">
                            <table className="w-full min-w-[700px] text-left border-collapse">
                                <thead className="sticky top-0 bg-white shadow-sm z-10">
                                    <tr className="text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 bg-slate-50">
                                        <th className="p-4">Patient Details</th>
                                        <th className="p-4">Admission Info</th>
                                        <th className="p-4 text-center">Wait Time</th>
                                        <th className="p-4 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm divide-y divide-slate-100">
                                    {filteredPatients.length === 0 ? (
                                        <tr>
                                            <td colSpan="4" className="p-16 text-center">
                                                <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                                                <span className="text-slate-400 font-medium text-sm">No {activeModule} patients found.</span>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredPatients.map((patient, index) => {
                                            const wallWaitMinutes = activeModule === 'pending' ? getWaitMinutes(patient.date) : 0;
                                            const waitMinutes = activeModule === 'pending'
                                                ? (typeof patient.effective_waiting_minutes === 'number' ? patient.effective_waiting_minutes : wallWaitMinutes)
                                                : 0;
                                            const isClosedSchedule = activeModule === 'pending'
                                                && departmentSchedule?.is_24_7 === false
                                                && departmentSchedule?.is_open_now === false;
                                            const breached = !isClosedSchedule && waitMinutes >= 15;
                                            const pendingRemark = patient.pending_remark;

                                            return (
                                                <tr key={patient.enccode || index} className={`hover:bg-slate-50 transition-colors cursor-default ${breached && activeModule === 'pending' ? 'bg-rose-50/30' : ''}`}>
                                                    <td className="p-4">
                                                        <div className={`font-bold text-base flex flex-wrap items-center gap-2 ${breached && activeModule === 'pending' ? 'text-rose-900' : 'text-slate-800'}`}>
                                                            <span>{patient.name}</span>
                                                            {activeModule === 'pending' && Number(patient.reroute_count) > 0 && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                                                    Re-routed{Number(patient.reroute_count) > 1 ? ` ×${patient.reroute_count}` : ''}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-slate-500 mt-1 uppercase tracking-wide font-semibold break-all flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                            {patient.hospital_number && (
                                                                <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{patient.hospital_number}</span>
                                                            )}
                                                            <span>{patient.enccode}</span>
                                                        </div>
                                                        {activeModule === 'pending' && Number(patient.reroute_count) > 0 && patient.reroute_reason && (
                                                            <div className="mt-1.5 text-xs text-amber-900 font-medium">
                                                                Re-route reason: {patient.reroute_reason}
                                                            </div>
                                                        )}
                                                        {activeModule === 'pending' && pendingRemark?.remarks && (
                                                            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs text-amber-950 max-w-md">
                                                                <span className="font-bold text-amber-900">Pending reason: </span>
                                                                <span>{pendingRemark.remarks}</span>
                                                                {pendingRemark.updated_by && (
                                                                    <span className="text-[11px] text-amber-800/80 ml-1.5">
                                                                        — {pendingRemark.updated_by}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>

                                                    <td className="p-4 text-slate-600 text-xs">
                                                        {patient.ward && (
                                                            <div className="mb-1">
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                                                                    {patient.ward}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {activeModule === 'pending' ? (
                                                            <>Requested: <span className="font-bold tabular-nums">{new Date(patient.date).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}</span></>
                                                        ) : (
                                                            <div className="space-y-0.5">
                                                                <div>Cleared: <span className="font-bold tabular-nums">{new Date(patient.cleared_date).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
                                                                {patient.cleared_by && (
                                                                    <div className="text-[11px] text-slate-500">By: <span className="font-semibold text-slate-700">{patient.cleared_by}</span></div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>

                                                    <td className="p-4 text-center">
                                                        {activeModule === 'pending' ? (
                                                            isClosedSchedule ? (
                                                                <div className="inline-flex flex-col items-center">
                                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                                                        {departmentSchedule?.next_open_label || 'Closed (SLA Paused)'}
                                                                    </span>
                                                                    <span className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                                                                        Routed {formatWaitTime(wallWaitMinutes)} ago
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <div className="inline-flex flex-col items-center">
                                                                    <div className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-bold tabular-nums ${breached ? 'bg-rose-100 text-rose-700 animate-pulse motion-reduce:animate-none' : 'bg-slate-100 text-slate-600'}`}>
                                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                                        <span>{formatWaitTime(waitMinutes)}</span>
                                                                    </div>
                                                                    {wallWaitMinutes !== waitMinutes && (
                                                                        <span className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                                                                            Total: {formatWaitTime(wallWaitMinutes)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )
                                                        ) : (
                                                            <span className="text-xs text-emerald-600 font-bold uppercase tracking-wide flex justify-center items-center">
                                                                <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                                Processed
                                                            </span>
                                                        )}
                                                    </td>

                                                    <td className="p-4 text-center">
                                                        {activeModule === 'pending' ? (
                                                            <div className="flex flex-wrap justify-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setRemarkModalPatient(patient);
                                                                        setRemarkText(pendingRemark?.remarks || '');
                                                                    }}
                                                                    className={`px-3 py-2 text-xs font-bold rounded-lg border transition-colors ${
                                                                        pendingRemark?.remarks
                                                                            ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                                                                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                                                    }`}
                                                                >
                                                                    {pendingRemark?.remarks ? 'Edit Remark' : 'Remark'}
                                                                </button>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => openInspectModal(patient.enccode)}
                                                                    className={`px-4 py-2 text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center space-x-1 ${breached ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-[#0f172a] hover:bg-slate-800 text-white'}`}
                                                                >
                                                                    <span>Inspect</span>
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">Overall: {patient.overall_status}</span>
                                                        )}
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
                )}
            </div>

            {/* --- INSPECTION MODAL --- */}
            <Modal
                show={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                maxWidth="5xl"
                zIndexClass="z-[100]"
                panelClassName="flex flex-col max-h-[90vh]"
            >
                <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">{department} Review Items</h3>
                        <p className="text-xs text-slate-500 font-medium mt-1">Patient Encounter: <span className="font-mono bg-slate-200 px-1.5 py-0.5 rounded">{activeEnccode}</span></p>
                    </div>
                    <button type="button" aria-label="Close modal" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-rose-500 bg-white border border-slate-200 rounded-md p-1.5 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
                    {isLoadingData ? (
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm animate-pulse motion-reduce:animate-none">
                                    <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-10 h-10 bg-slate-200 rounded-lg"></div>
                                            <div className="space-y-2">
                                                <div className="h-4 w-32 bg-slate-200 rounded"></div>
                                                <div className="h-3 w-20 bg-slate-100 rounded"></div>
                                            </div>
                                        </div>
                                        <div className="h-9 w-32 bg-slate-200 rounded-lg"></div>
                                    </div>
                                    <div className="space-y-3">
                                        {[1, 2, 3, 4].map(i => (
                                            <div key={i} className="flex justify-between items-center p-3 border border-slate-50 rounded-lg">
                                                <div className="h-4 w-1/2 bg-slate-100 rounded"></div>
                                                <div className="h-6 w-20 bg-slate-100 rounded-full"></div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="text-center mt-6">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Querying iHomis Database...</span>
                                    </div>
                                </div>
                            ) : modalData ? (
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                    
                                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white sticky top-0 z-10 shadow-sm">
                                        <div className="flex items-center space-x-3">
                                            <div className="p-2 bg-teal-50 text-teal-600 rounded-lg">
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-lg">{department}</h4>
                                                <p className="text-xs text-slate-500 font-medium">{getActiveOrders().length} Record(s)</p>
                                            </div>
                                        </div>
                                        
                                        <button 
                                            onClick={handleClearClick}
                                            disabled={hasUnservedItems()}
                                            className={`px-4 py-2.5 text-sm font-bold rounded-lg transition-all focus:outline-none flex items-center space-x-2 
                                                ${hasUnservedItems() 
                                                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                                                    : 'bg-teal-600 text-white hover:bg-teal-700 hover:shadow-md border border-transparent shadow-sm'}`}
                                        >
                                            {hasUnservedItems() ? (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                                    <span>Pending Results</span>
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                    <span>Clear Department</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    
                                    {/* --- CREDIT & PROMISSORY STATUS CARD --- */}
                                    {ENABLE_CREDIT_PROMISSORY_MODULE && isCreditDept && (
                                        <div className="p-4 bg-white border-b border-slate-200">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Promissory Note & Financial Balance Check</span>
                                                {isCheckingCredit && (
                                                    <span className="text-xs text-teal-600 font-bold flex items-center gap-1">
                                                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                        Checking masterlist records...
                                                    </span>
                                                )}
                                            </div>

                                            {patientCreditStatus?.has_balance ? (
                                                <div className="bg-rose-50 border-2 border-rose-300 rounded-lg p-3 text-rose-900">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center space-x-2">
                                                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping motion-reduce:animate-none"></span>
                                                            <span className="font-black text-sm uppercase text-rose-800">
                                                                Outstanding Promissory Note / Balance: ₱{patientCreditStatus.total_balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                        <span className="bg-rose-600 text-white font-bold text-[11px] px-2 py-0.5 rounded-full uppercase">Action Required</span>
                                                    </div>
                                                    <div className="mt-1 text-xs text-rose-700 font-medium">
                                                        This patient has active promissory note(s) or an unsettled balance on record. Review the notes below before clearing.
                                                    </div>
                                                    <div className="mt-2.5 divide-y divide-rose-200 border-t border-rose-200 pt-2 text-xs">
                                                        {patientCreditStatus.records?.map((rec, i) => (
                                                            <div key={i} className="py-1.5 flex justify-between items-start">
                                                                <div>
                                                                    <span className="font-bold text-slate-800">{rec.sheet_category}</span>
                                                                    {rec.entry_date && <span className="text-slate-500 ml-2">({new Date(rec.entry_date).toLocaleDateString()})</span>}
                                                                    {rec.guarantor_name && <span className="text-indigo-700 ml-2 font-bold">• Guarantor: {rec.guarantor_name}</span>}
                                                                    {rec.remarks && <p className="text-slate-600 text-[11px] mt-0.5 italic">{rec.remarks}</p>}
                                                                    {rec.fa_grantor && (
                                                                        <div className="text-[11px] text-emerald-700 font-semibold mt-0.5 flex items-center">
                                                                            <span className="font-bold mr-1">F/A Grantor(s):</span> {rec.fa_grantor}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="text-right font-mono font-bold text-rose-700">
                                                                    ₱{rec.remaining_balance?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : patientCreditStatus?.has_records ? (
                                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-900 flex items-center space-x-2">
                                                    <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                    <div className="text-xs">
                                                        <span className="font-bold">Prior Records Found:</span> All past promissory notes and hospital balances for this patient have been <strong>Fully Settled (₱0.00 balance)</strong>.
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-600 flex items-center space-x-2">
                                                    <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                    <div className="text-xs font-medium">
                                                        No active promissory notes or remaining balances found in the masterlist database for this patient name.
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* --- ER ALERTS BANNER --- */}
                                    {(Boolean(modalData?.transaction?.is_oecb) || (!Boolean(modalData?.transaction?.is_oecb) && Boolean(modalData?.transaction?.is_for_procedure)) || (Boolean(modalData?.transaction?.has_oxygen) && department === 'Cardio Pulmo')) ? (
                                        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col gap-2">
                                            {Boolean(modalData?.transaction?.is_oecb) ? (
                                                <div className="bg-amber-100 border border-amber-300 text-amber-800 px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center w-fit tracking-wide shadow-sm">
                                                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                                    OECB PATIENT
                                                </div>
                                            ) : null}

                                            {!Boolean(modalData?.transaction?.is_oecb) && Boolean(modalData?.transaction?.is_for_procedure) ? (
                                                <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs text-indigo-950 shadow-sm w-fit">
                                                    <span className="font-bold uppercase tracking-wide text-indigo-800 mr-1.5">Non-OECB · For Procedure:</span>
                                                    <span className="font-semibold">{modalData.transaction.procedure_type || 'Unspecified'}</span>
                                                </div>
                                            ) : null}
                                            
                                            {Boolean(modalData?.transaction?.has_oxygen) && department === 'Cardio Pulmo' ? (
                                                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 shadow-sm">
                                                    <div className="text-[11px] font-black text-sky-700 uppercase tracking-widest mb-1 flex items-center">
                                                        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                        ER Oxygen Notes
                                                    </div>
                                                    <div className="text-sm font-semibold text-sky-900 italic bg-white p-2 border border-sky-100 rounded">
                                                        "{modalData.transaction.oxygen_remarks || 'No remarks provided.'}"
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}

                                    {/* --- PENDING REASON / REMARK INLINE EDITOR --- */}
                                    <div className="p-4 bg-amber-50/60 border-b border-slate-200 space-y-2.5">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <label htmlFor="inspect-pending-remark" className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                                Pending Reason / Remark for Ward
                                            </label>
                                            <span className="text-[11px] text-slate-500">
                                                Visible to the originating ward while this clearance remains pending
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {QUICK_PENDING_REASONS.map((preset) => (
                                                <button
                                                    key={preset}
                                                    type="button"
                                                    onClick={() => setInlineRemarkText(preset)}
                                                    className="px-2.5 py-1 rounded-md border border-amber-300 bg-white hover:bg-amber-100 text-[11px] font-semibold text-amber-950 transition-colors"
                                                >
                                                    {preset}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <input
                                                id="inspect-pending-remark"
                                                type="text"
                                                maxLength={500}
                                                value={inlineRemarkText}
                                                onChange={(e) => setInlineRemarkText(e.target.value)}
                                                placeholder="Explain why this patient cannot be cleared yet..."
                                                className="flex-1 px-3 py-2 rounded-lg border-slate-300 bg-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                                            />
                                            <div className="flex items-center gap-2 shrink-0">
                                                {inlineRemarkText.trim() !== '' && (
                                                    <button
                                                        type="button"
                                                        disabled={isSavingRemark}
                                                        onClick={() => {
                                                            setInlineRemarkText('');
                                                            submitPendingRemark(activeEnccode, '');
                                                        }}
                                                        className="px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg disabled:opacity-50"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    disabled={isSavingRemark}
                                                    onClick={() => submitPendingRemark(activeEnccode, inlineRemarkText)}
                                                    className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                                                >
                                                    {isSavingRemark ? 'Saving...' : 'Save Remark'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
                                        {getActiveOrders().length === 0 ? (
                                            <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-50/50">
                                                <div className="bg-white p-3 rounded-full shadow-sm border border-slate-100 mb-3">
                                                    <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                                </div>
                                                <span className="text-slate-600 font-bold text-sm">
                                                    {department?.toLowerCase().includes('credit') || department?.toLowerCase().includes('collect') 
                                                        ? 'Account Verification Required' 
                                                        : 'No Records Found'}
                                                </span>
                                                <p className="text-xs text-slate-400 mt-1 font-medium">
                                                    {department?.toLowerCase().includes('credit') || department?.toLowerCase().includes('collect')
                                                        ? 'Verify patient promissory notes, account balance, or PhilHealth before clearing.'
                                                        : `There are no active ${department} orders for this encounter.`}
                                                </p>
                                            </div>
                                        ) : (
                                            getActiveOrders().map((item, idx) => (
                                                <div key={idx} className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors">
                                                    <span className="text-sm font-semibold text-slate-700 tracking-tight">{item.item_description}</span>
                                                    <div>
                                                        {item.status === 'S' ? (
                                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 tracking-wider">
                                                                SERVED
                                                            </span>
                                                        ) : item.status === 'P' ? (
                                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 tracking-wider">
                                                                PARTIAL
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200 tracking-wider">
                                                                UNSERVED
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            ) : null}
                        </div>
            </Modal>

            {/* --- PENDING REMARK MODAL (QUICK ROW EDIT) --- */}
            <Modal
                show={Boolean(remarkModalPatient)}
                onClose={() => { if (!isSavingRemark) setRemarkModalPatient(null); }}
                closeable={!isSavingRemark}
                maxWidth="md"
                zIndexClass="z-[200]"
            >
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-bold text-slate-800">Pending Clearance Remark</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {remarkModalPatient?.name} {remarkModalPatient?.ward ? `· ${remarkModalPatient.ward}` : ''}
                        </p>
                    </div>
                    <button
                        type="button"
                        aria-label="Close modal"
                        onClick={() => { if (!isSavingRemark) setRemarkModalPatient(null); }}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!remarkModalPatient) return;
                        submitPendingRemark(remarkModalPatient.enccode, remarkText, { closeModal: true });
                    }}
                    className="p-6 space-y-4"
                >
                    <div>
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Quick Reasons</div>
                        <div className="flex flex-wrap gap-1.5">
                            {QUICK_PENDING_REASONS.map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setRemarkText(preset)}
                                    className="px-2.5 py-1 rounded-md border border-slate-300 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 text-[11px] font-semibold text-slate-700 transition-colors"
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="quick-pending-remark" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">
                            Reason why patient is still pending at {department}
                        </label>
                        <textarea
                            id="quick-pending-remark"
                            rows="3"
                            maxLength={500}
                            value={remarkText}
                            onChange={(e) => setRemarkText(e.target.value)}
                            placeholder="Enter reason (or leave empty to remove existing remark)..."
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 resize-y"
                            autoFocus
                        />
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <div>
                            {remarkModalPatient?.pending_remark?.remarks && (
                                <button
                                    type="button"
                                    disabled={isSavingRemark}
                                    onClick={() => submitPendingRemark(remarkModalPatient.enccode, '', { closeModal: true })}
                                    className="px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    Remove Remark
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={isSavingRemark}
                                onClick={() => setRemarkModalPatient(null)}
                                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSavingRemark}
                                className="px-4 py-2 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                            >
                                {isSavingRemark ? 'Saving...' : 'Save Remark'}
                            </button>
                        </div>
                    </div>
                </form>
            </Modal>

            {/* --- CUSTOM CONFIRMATION MODAL --- */}
            <Modal
                show={isConfirmOpen}
                onClose={() => { if (!isClearing) setIsConfirmOpen(false); }}
                closeable={!isClearing}
                maxWidth="sm"
                zIndexClass="z-[200]"
            >
                <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-teal-100 shadow-sm">
                        <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Confirm Clearance</h3>
                    <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                        Are you sure you want to clear <strong>{department}</strong>? This action will be officially logged under your account.
                    </p>
                    <div className="flex space-x-3">
                        <button 
                            type="button"
                            onClick={() => setIsConfirmOpen(false)}
                            disabled={isClearing}
                            className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200 transition-colors border border-slate-200 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button 
                            type="button"
                            onClick={executeClearDepartment}
                            disabled={isClearing}
                            className="flex-1 px-4 py-2.5 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 transition-colors shadow-sm flex justify-center items-center disabled:opacity-50"
                        >
                            {isClearing ? (
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : (
                                'Yes, Clear'
                            )}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* --- SLIDING TOAST NOTIFICATION --- */}
            {toastMessage && (
                <div
                    role={toastIsError ? 'alert' : 'status'}
                    className={`fixed top-6 right-6 z-[300] flex items-center text-white px-5 py-3.5 rounded-xl shadow-2xl animate-slide-in-top motion-reduce:animate-none ${
                        toastIsError ? 'bg-rose-600' : 'bg-teal-600'
                    }`}
                >
                    <div className={`rounded-full p-1 mr-3 ${toastIsError ? 'bg-rose-500' : 'bg-teal-500'}`}>
                        {toastIsError ? (
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01M10.29 3.86l-7.1 12.26A2 2 0 004.92 19h14.16a2 2 0 001.73-2.88l-7.1-12.26a2 2 0 00-3.42 0z"></path></svg>
                        ) : (
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                        )}
                    </div>
                    <span className="font-bold text-sm tracking-wide">{toastMessage}</span>
                    <button type="button" aria-label="Dismiss notification" onClick={() => setToastMessage(null)} className={`ml-4 transition-colors ${toastIsError ? 'text-rose-200 hover:text-white' : 'text-teal-200 hover:text-white'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            )}
        </PortalLayout>
    );
}