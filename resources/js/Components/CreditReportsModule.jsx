import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';

export default function CreditReportsModule({ onBackToMasterlist }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [activeTab, setActiveTab] = useState('saa_budget'); // 'saa_budget', 'grantor_ledger', 'dept_summary', 'nbb_summary', 'delinquents'
    
    // Global & Top Filters
    const [filterYear, setFilterYear] = useState('All');
    const [filterCategory, setFilterCategory] = useState('All');
    const [filterGrantorCategory, setFilterGrantorCategory] = useState('All');
    const [searchGrantor, setSearchGrantor] = useState('');

    // Available Years
    const yearsList = ['All', '2026', '2025', '2024', '2023'];

    // Months Definition
    const monthsList = [
        { num: 'All', name: 'All Months', short: 'All' },
        { num: '1', name: 'January', short: 'Jan' },
        { num: '2', name: 'February', short: 'Feb' },
        { num: '3', name: 'March', short: 'Mar' },
        { num: '4', name: 'April', short: 'Apr' },
        { num: '5', name: 'May', short: 'May' },
        { num: '6', name: 'June', short: 'Jun' },
        { num: '7', name: 'July', short: 'Jul' },
        { num: '8', name: 'August', short: 'Aug' },
        { num: '9', name: 'September', short: 'Sep' },
        { num: '10', name: 'October', short: 'Oct' },
        { num: '11', name: 'November', short: 'Nov' },
        { num: '12', name: 'December', short: 'Dec' },
    ];

    // Individual Sponsor Patient Ledger State
    const [selectedGrantorId, setSelectedGrantorId] = useState('');
    const [selectedMonth, setSelectedMonth] = useState('All');
    const [searchPatient, setSearchPatient] = useState('');
    const [ledgerPage, setLedgerPage] = useState(1);
    const [ledgerPerPage, setLedgerPerPage] = useState(50);
    const [ledgerLoading, setLedgerLoading] = useState(false);
    const [ledgerData, setLedgerData] = useState(null);

    // NBB vs Non-NBB Patient Ledger State
    const [nbbProgram, setNbbProgram] = useState('all'); // 'all', 'nbb', 'non_nbb', 'vawc'
    const [nbbYear, setNbbYear] = useState('All');
    const [nbbMonth, setNbbMonth] = useState('All');
    const [nbbSearch, setNbbSearch] = useState('');
    const [nbbPage, setNbbPage] = useState(1);
    const [nbbPerPage, setNbbPerPage] = useState(50);
    const [nbbLoading, setNbbLoading] = useState(false);
    const [nbbData, setNbbData] = useState(null);

    // SAA Fund Encoding State
    const [isSaaModalOpen, setIsSaaModalOpen] = useState(false);
    const [editingGrantor, setEditingGrantor] = useState(null);
    const [savingSaa, setSavingSaa] = useState(false);
    const [toast, setToast] = useState(null);

    const emptySaaForm = {
        code: '',
        proponent: '',
        saa_number: '',
        allocated_budget: '',
        category: 'Congressional',
        remarks: ''
    };
    const [saaForm, setSaaForm] = useState(emptySaaForm);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchReports = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/credit-promissory/reports', {
                params: {
                    year: filterYear,
                    category: filterCategory,
                    grantor_category: filterGrantorCategory,
                    search: searchGrantor,
                }
            });
            setData(res.data);
            if (!selectedGrantorId && res.data.saa_grantors && res.data.saa_grantors.length > 0) {
                setSelectedGrantorId(res.data.saa_grantors[0].id);
            }
        } catch (err) {
            console.error('Failed to load credit reports:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchLedger = useCallback(async () => {
        setLedgerLoading(true);
        try {
            const res = await axios.get('/credit-promissory/grantor-patients', {
                params: {
                    grantor_id: selectedGrantorId || undefined,
                    year: filterYear,
                    month: selectedMonth,
                    search: searchPatient,
                    page: ledgerPage,
                    per_page: ledgerPerPage
                }
            });
            setLedgerData(res.data);
            if (!selectedGrantorId && res.data.grantor) {
                setSelectedGrantorId(res.data.grantor.id);
            }
        } catch (err) {
            console.error('Failed to load grantor patient ledger:', err);
        } finally {
            setLedgerLoading(false);
        }
    }, [selectedGrantorId, filterYear, selectedMonth, searchPatient, ledgerPage, ledgerPerPage]);

    const fetchNbbData = useCallback(async () => {
        setNbbLoading(true);
        try {
            const res = await axios.get('/credit-promissory/nbb-patients', {
                params: {
                    program: nbbProgram,
                    year: nbbYear,
                    month: nbbMonth,
                    search: nbbSearch,
                    page: nbbPage,
                    per_page: nbbPerPage,
                }
            });
            setNbbData(res.data);
        } catch (err) {
            console.error('Failed to load NBB patient ledger:', err);
        } finally {
            setNbbLoading(false);
        }
    }, [nbbProgram, nbbYear, nbbMonth, nbbSearch, nbbPage, nbbPerPage]);

    useEffect(() => {
        fetchReports();
    }, [filterYear, filterCategory, filterGrantorCategory]);

    useEffect(() => {
        if (activeTab === 'grantor_ledger') {
            fetchLedger();
        }
    }, [activeTab, fetchLedger]);

    useEffect(() => {
        if (activeTab === 'nbb_summary') {
            fetchNbbData();
        }
    }, [activeTab, fetchNbbData]);

    const handleViewGrantorLedger = (grantor) => {
        setSelectedGrantorId(grantor.id);
        setSelectedMonth('All');
        setSearchPatient('');
        setLedgerPage(1);
        setActiveTab('grantor_ledger');
    };

    const handleOpenAddSaa = () => {
        setEditingGrantor(null);
        setSaaForm(emptySaaForm);
        setIsSaaModalOpen(true);
    };

    const handleOpenEditSaa = (grantor) => {
        setEditingGrantor(grantor);
        setSaaForm({
            code: grantor.code,
            proponent: grantor.proponent,
            saa_number: grantor.saa_number || '',
            allocated_budget: grantor.allocated_budget || '',
            category: grantor.category || 'Congressional',
            remarks: grantor.remarks || ''
        });
        setIsSaaModalOpen(true);
    };

    const handleSaveSaa = async (e) => {
        e.preventDefault();
        setSavingSaa(true);
        try {
            if (editingGrantor) {
                await axios.put(`/credit-promissory/grantors/${editingGrantor.id}`, saaForm);
                showToast(`SAA Budget for ${saaForm.proponent} updated successfully!`);
            } else {
                await axios.post('/credit-promissory/grantors', saaForm);
                showToast(`New SAA Fund for ${saaForm.proponent} encoded successfully!`);
            }
            setIsSaaModalOpen(false);
            fetchReports();
            if (activeTab === 'grantor_ledger') fetchLedger();
        } catch (err) {
            console.error('Failed to save SAA fund:', err);
            showToast(err.response?.data?.message || 'Failed to save SAA fund. Please check inputs.', 'error');
        } finally {
            setSavingSaa(false);
        }
    };

    const handleDeleteSaa = async (grantor) => {
        if (!confirm(`Are you sure you want to delete SAA fund record for "${grantor.proponent}"?`)) return;
        try {
            await axios.delete(`/credit-promissory/grantors/${grantor.id}`);
            showToast(`SAA allotment for ${grantor.proponent} removed.`);
            fetchReports();
        } catch (err) {
            console.error('Failed to delete SAA fund:', err);
            showToast('Failed to delete SAA fund record.', 'error');
        }
    };

    const fmt = (num) => {
        const val = Number(num) || 0;
        return '₱' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const fmtNum = (num) => {
        return (Number(num) || 0).toLocaleString('en-US');
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    // Filtered SAA Grantors list for Tab 1
    const filteredGrantors = useMemo(() => {
        if (!data || !data.saa_grantors) return [];
        return data.saa_grantors.filter(g => {
            if (searchGrantor) {
                const q = searchGrantor.toLowerCase();
                const matchCode = (g.code || '').toLowerCase().includes(q);
                const matchProp = (g.proponent || '').toLowerCase().includes(q);
                const matchSaa = (g.saa_number || '').toLowerCase().includes(q);
                if (!matchCode && !matchProp && !matchSaa) return false;
            }
            if (filterGrantorCategory !== 'All' && g.category !== filterGrantorCategory) {
                return false;
            }
            return true;
        });
    }, [data, searchGrantor, filterGrantorCategory]);

    const handleExportCsv = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        let filename = `Credit_Report_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`;

        if (activeTab === 'saa_budget') {
            if (!data) return;
            csvContent += "Code,Proponent,Category,SAA Number,Allocated Budget,Utilized to Date,Remaining Balance,Utilization Rate,Patients Assisted\n";
            filteredGrantors.forEach(g => {
                const row = [
                    `"${g.code || ''}"`,
                    `"${g.proponent || ''}"`,
                    `"${g.category || ''}"`,
                    `"${g.saa_number || 'N/A'}"`,
                    (g.allocated_budget || 0).toFixed(2),
                    (g.utilized_budget || 0).toFixed(2),
                    (g.remaining_balance || 0).toFixed(2),
                    `${g.utilization_rate}%`,
                    g.patients_assisted || 0
                ];
                csvContent += row.join(",") + "\n";
            });
        } else if (activeTab === 'grantor_ledger') {
            const proponentName = (ledgerData?.grantor?.proponent || 'Sponsor').replace(/[^a-zA-Z0-9_-]/g, '_');
            const monthText = selectedMonth !== 'All' ? (monthsList.find(m => m.num === selectedMonth)?.name || selectedMonth) : 'All_Months';
            filename = `Patient_Ledger_${proponentName}_${monthText}_Year_${filterYear}.csv`;
            csvContent += "Index,Patient Name,Date of Assistance,Hospital Bill,Financial Assistance,Cash Paid,Remaining Balance,Address,Department,Remarks\n";
            const patientList = ledgerData?.patients?.data || ledgerData?.patients || [];
            patientList.forEach((p, idx) => {
                const row = [
                    idx + 1,
                    `"${p.patient_name || ''}"`,
                    `"${p.entry_date || ''}"`,
                    (p.hospital_bill_balance || 0).toFixed(2),
                    (p.fa_amount || 0).toFixed(2),
                    (p.cash_paid || 0).toFixed(2),
                    (p.remaining_balance || 0).toFixed(2),
                    `"${p.address || ''}"`,
                    `"${p.sheet_category || ''}"`,
                    `"${p.remarks || ''}"`
                ];
                csvContent += row.join(",") + "\n";
            });
        } else if (activeTab === 'nbb_summary') {
            const progName = nbbProgram.toUpperCase();
            const monthText = nbbMonth !== 'All' ? (monthsList.find(m => m.num === nbbMonth)?.name || nbbMonth) : 'All_Months';
            filename = `NBB_NonNBB_Patients_${progName}_${monthText}_Year_${nbbYear}.csv`;
            csvContent += "Index,Patient Name,Case Number,Entry Date,Classification,Hospital Bill,Financial Assistance,Grantor,Cash Paid,OR Number,Remaining Balance,Department,Address,Remarks\n";
            const pts = nbbData?.patients?.data || nbbData?.patients || [];
            pts.forEach((p, idx) => {
                const classification = p.is_nbb ? 'No Balance Billing (NBB)' : p.is_non_nbb ? 'Non-NBB' : p.is_vawc_er ? 'VAWC/ER' : 'Standard';
                const row = [
                    idx + 1,
                    `"${(p.patient_name || '').replace(/"/g, '""')}"`,
                    `"${(p.case_number || '').replace(/"/g, '""')}"`,
                    p.entry_date ? p.entry_date.substring(0, 10) : '',
                    `"${classification}"`,
                    Number(p.hospital_bill_balance || 0).toFixed(2),
                    Number(p.fa_amount || 0).toFixed(2),
                    `"${(p.fa_grantor || '').replace(/"/g, '""')}"`,
                    Number(p.cash_paid || 0).toFixed(2),
                    `"${(p.or_number || '').replace(/"/g, '""')}"`,
                    Number(p.remaining_balance || 0).toFixed(2),
                    `"${(p.sheet_category || '').replace(/"/g, '""')}"`,
                    `"${(p.address || '').replace(/"/g, '""')}"`,
                    `"${(p.remarks || '').replace(/"/g, '""')}"`
                ];
                csvContent += row.join(",") + "\n";
            });
        } else if (activeTab === 'dept_summary') {
            if (!data) return;
            csvContent += "Category / Department,Patient Count,Hospital Bills,Promissory Notes,Financial Assistance,Cash Collected,Discount,Remaining Balance\n";
            (data.categories || []).forEach(c => {
                const row = [
                    `"${c.sheet_category}"`,
                    c.count,
                    (c.total_bill || 0).toFixed(2),
                    (c.total_pn || 0).toFixed(2),
                    (c.total_fa || 0).toFixed(2),
                    (c.total_cash || 0).toFixed(2),
                    (c.total_discount || 0).toFixed(2),
                    (c.total_balance || 0).toFixed(2)
                ];
                csvContent += row.join(",") + "\n";
            });
        } else if (activeTab === 'delinquents') {
            if (!data) return;
            csvContent += "Patient Name,Department,Entry Date,PN Amount,Remaining Balance,Guarantor,Remarks\n";
            (data.delinquents || []).forEach(d => {
                const row = [
                    `"${d.patient_name || ''}"`,
                    `"${d.sheet_category || ''}"`,
                    `"${d.entry_date || ''}"`,
                    (d.pn_amount || 0).toFixed(2),
                    (d.remaining_balance || 0).toFixed(2),
                    `"${d.guarantor_name || ''}"`,
                    `"${d.remarks || ''}"`
                ];
                csvContent += row.join(",") + "\n";
            });
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 print:space-y-4 print:p-0">
            {/* TOP BAR / NAVIGATION (Hidden on Print) */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b border-slate-200 print:hidden">
                <div>
                    <div className="flex items-center space-x-2">
                        {onBackToMasterlist && (
                            <button
                                onClick={onBackToMasterlist}
                                className="mr-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors border border-slate-200"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                                <span>Masterlist</span>
                            </button>
                        )}
                        <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center space-x-2">
                            <span>Credit & Collection Reports & Analytics</span>
                        </h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Financial Assistance, SAA Allotments, NBB/Non-NBB Registry, and Cost Center Ledgers
                    </p>
                </div>

                {/* Global Controls */}
                <div className="flex flex-wrap items-center gap-2 self-stretch lg:self-auto justify-end">
                    <button
                        onClick={handleOpenAddSaa}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center space-x-1.5 shadow-sm"
                        title="Encode a new SAA Budget Allotment"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
                        <span>Encode New SAA Fund</span>
                    </button>

                    <button
                        onClick={() => { fetchReports(); if (activeTab === 'grantor_ledger') fetchLedger(); if (activeTab === 'nbb_summary') fetchNbbData(); }}
                        disabled={loading || ledgerLoading || nbbLoading}
                        className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center space-x-1 shadow-sm"
                        title="Refresh Data"
                    >
                        <svg className={`w-3.5 h-3.5 ${(loading || ledgerLoading || nbbLoading) ? 'animate-spin text-teal-600' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        <span>Refresh</span>
                    </button>

                    <button
                        onClick={handleExportCsv}
                        className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors flex items-center space-x-1 shadow-sm"
                        title="Export current view to CSV"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        <span>Export CSV</span>
                    </button>

                    <button
                        onClick={handlePrint}
                        className="px-4 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors flex items-center space-x-1.5 shadow-sm"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                        <span>Print Official Report</span>
                    </button>
                </div>
            </div>

            {/* PRINT-ONLY OFFICIAL HEADER */}
            <div className="hidden print:block text-center border-b-2 border-slate-800 pb-3 mb-4">
                <div className="text-[11px] font-serif uppercase tracking-wider text-slate-600 leading-tight">Republic of the Philippines</div>
                <div className="text-[11px] font-serif uppercase tracking-wider text-slate-600 leading-tight">Province of Capiz</div>
                <div className="text-base font-serif font-black uppercase text-slate-900 tracking-wide mt-1">ROXAS MEMORIAL PROVINCIAL HOSPITAL</div>
                <div className="text-xs font-semibold text-teal-800">CREDIT AND COLLECTION SECTION — FINANCIAL ASSISTANCE UNIT</div>
                <div className="text-[10px] text-slate-500">Arnaldo Boulevard, Roxas City, Capiz • Tel. (036) 621-0035</div>
                
                <div className="mt-3 pt-2 border-t border-slate-300 flex justify-between items-center text-xs">
                    <span className="font-bold uppercase text-slate-800">
                        {activeTab === 'saa_budget' && 'STATEMENT OF SAA GRANTOR BUDGET ALLOCATION & UTILIZATION'}
                        {activeTab === 'grantor_ledger' && `FINANCIAL ASSISTANCE DISBURSEMENT LEDGER & PATIENT SCHEDULE - [${ledgerData?.grantor?.code || ''}] ${ledgerData?.grantor?.proponent || ''} (PERIOD: ${selectedMonth !== 'All' ? (monthsList.find(m => m.num === selectedMonth)?.name || selectedMonth) : 'ALL MONTHS'} • YEAR: ${filterYear !== 'All' ? filterYear : 'ALL RECORDED YEARS'})`}
                        {activeTab === 'dept_summary' && 'DEPARTMENTAL DAILY TRANSACTIONS & NOTES RECEIVABLE SUMMARY'}
                        {activeTab === 'nbb_summary' && `PATIENT REGISTRY & DISBURSEMENT LEDGER: NO BALANCE BILLING (NBB) & NON-NBB (PERIOD: ${nbbMonth !== 'All' ? (monthsList.find(m => m.num === nbbMonth)?.name || nbbMonth) : 'ALL MONTHS'} • YEAR: ${nbbYear !== 'All' ? nbbYear : 'ALL RECORDED YEARS'} | PROGRAM: ${nbbProgram.toUpperCase()})`}
                        {activeTab === 'delinquents' && 'SCHEDULE OF OUTSTANDING DELINQUENT PROMISSORY NOTES'}
                    </span>
                    <span className="text-[10px] text-slate-600 font-mono">
                        Date Generated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
            </div>

            {/* KPI STAT CARDS (Hidden on Print) */}
            {data && data.kpis && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:grid-cols-5 print:gap-2">
                    <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 p-3.5 rounded-xl border border-teal-200">
                        <span className="text-[10px] uppercase font-bold text-teal-700 tracking-wider block">SAA Approved Budget</span>
                        <div className="text-base sm:text-lg font-black text-teal-900 mt-0.5 font-mono">
                            {fmt(data.kpis.total_grantor_budget)}
                        </div>
                        <span className="text-[10px] text-teal-600 mt-1 block">80 Verified Proponents</span>
                    </div>

                    <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 p-3.5 rounded-xl border border-blue-200">
                        <span className="text-[10px] uppercase font-bold text-blue-700 tracking-wider block">F/A Disbursed to Date</span>
                        <div className="text-base sm:text-lg font-black text-blue-900 mt-0.5 font-mono">
                            {fmt(data.kpis.total_fa_disbursed)}
                        </div>
                        <span className="text-[10px] text-blue-600 mt-1 block">{fmtNum(data.kpis.total_notes)} Total Records</span>
                    </div>

                    <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 p-3.5 rounded-xl border border-amber-200">
                        <span className="text-[10px] uppercase font-bold text-amber-700 tracking-wider block">Promissory Notes (PN)</span>
                        <div className="text-base sm:text-lg font-black text-amber-900 mt-0.5 font-mono">
                            {fmt(data.kpis.total_pn_amount)}
                        </div>
                        <span className="text-[10px] text-amber-600 mt-1 block">{fmtNum(data.kpis.pn_count)} Active PNs</span>
                    </div>

                    <div className="bg-gradient-to-br from-rose-50 to-rose-100/50 p-3.5 rounded-xl border border-rose-200">
                        <span className="text-[10px] uppercase font-bold text-rose-700 tracking-wider block">Remaining Receivables</span>
                        <div className="text-base sm:text-lg font-black text-rose-900 mt-0.5 font-mono">
                            {fmt(data.kpis.total_receivable_balance)}
                        </div>
                        <span className="text-[10px] text-rose-600 mt-1 block">Credit & Collection AR</span>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-3.5 rounded-xl border border-emerald-200">
                        <span className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider block">Total Cash Collected</span>
                        <div className="text-base sm:text-lg font-black text-emerald-900 mt-0.5 font-mono">
                            {fmt(data.kpis.total_cash_collected)}
                        </div>
                        <span className="text-[10px] text-emerald-600 mt-1 block">Direct Cash Receipts</span>
                    </div>
                </div>
            )}

            {/* TAB SELECTION PILLS (Hidden on Print) */}
            <div className="flex border-b border-slate-200 overflow-x-auto print:hidden">
                <button
                    onClick={() => setActiveTab('saa_budget')}
                    className={`px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center space-x-2 ${
                        activeTab === 'saa_budget'
                            ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                    <span>SAA Proponents & Budgets ({filteredGrantors.length})</span>
                </button>

                <button
                    onClick={() => setActiveTab('grantor_ledger')}
                    className={`px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center space-x-2 ${
                        activeTab === 'grantor_ledger'
                            ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    <span className="flex items-center space-x-1.5">
                        <span>Individual Sponsor Patient Ledgers (74+ Proponents)</span>
                        <span className="px-1.5 py-0.2 text-[9px] font-black uppercase rounded bg-teal-200 text-teal-900">
                            By Month & Year
                        </span>
                    </span>
                </button>

                <button
                    onClick={() => setActiveTab('dept_summary')}
                    className={`px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center space-x-2 ${
                        activeTab === 'dept_summary'
                            ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                    <span>Department & Daily Trans Summary</span>
                </button>

                <button
                    onClick={() => setActiveTab('nbb_summary')}
                    className={`px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center space-x-2 ${
                        activeTab === 'nbb_summary'
                            ? 'border-purple-600 text-purple-700 bg-purple-50/50'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span className="flex items-center space-x-1.5">
                        <span>NBB vs Non-NBB Programs</span>
                        <span className="px-1.5 py-0.2 text-[9px] font-black uppercase rounded bg-purple-200 text-purple-900">
                            By Patient & Month
                        </span>
                    </span>
                </button>

                <button
                    onClick={() => setActiveTab('delinquents')}
                    className={`px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-colors flex items-center space-x-2 ${
                        activeTab === 'delinquents'
                            ? 'border-teal-600 text-teal-700 bg-teal-50/50'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    <span>Delinquent / Absconded Accounts</span>
                </button>
            </div>

            {/* TOAST NOTIFICATION */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-white font-bold text-xs flex items-center space-x-2 transition-all ${
                    toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
                }`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                    <span>{toast.msg}</span>
                </div>
            )}

            {/* TAB 1: SAA PROPONENTS & BUDGETS OVERVIEW */}
            {activeTab === 'saa_budget' && (
                <div className="space-y-4">
                    {/* Filter and Action Bar */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap justify-between items-center gap-3 print:hidden">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold uppercase text-slate-500">Category:</span>
                            {['All', 'Senate', 'Congressional', 'Party List', 'LGU / Mayor', 'Provincial Official', 'Agency / Program'].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setFilterGrantorCategory(cat)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                                        filterGrantorCategory === cat
                                            ? 'bg-teal-700 text-white shadow-sm'
                                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center space-x-2">
                            <div className="relative">
                                <input
                                    type="text"
                                    value={searchGrantor}
                                    onChange={e => setSearchGrantor(e.target.value)}
                                    placeholder="Search proponent or SAA #..."
                                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-56 focus:ring-2 focus:ring-teal-500"
                                />
                                <svg className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            </div>

                            <button
                                onClick={handleOpenAddSaa}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1 shadow-sm"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
                                <span>+ Encode SAA</span>
                            </button>
                        </div>
                    </div>

                    {/* Proponents & Budget Allotments Table */}
                    <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm print:border-slate-400 print:shadow-none">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700 text-[10px] uppercase font-black tracking-wider border-b border-slate-200 print:bg-slate-200 print:text-black">
                                    <th className="py-2.5 px-3">Code</th>
                                    <th className="py-2.5 px-3">Sponsor / Proponent Name</th>
                                    <th className="py-2.5 px-3">Category</th>
                                    <th className="py-2.5 px-3">SAA Number</th>
                                    <th className="py-2.5 px-3 text-right">Approved Budget</th>
                                    <th className="py-2.5 px-3 text-right">Utilized (F/A)</th>
                                    <th className="py-2.5 px-3 text-right">Remaining Balance</th>
                                    <th className="py-2.5 px-3 text-center">Utilization</th>
                                    <th className="py-2.5 px-3 text-center">Patients</th>
                                    <th className="py-2.5 px-3 text-center print:hidden">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                                {loading ? (
                                    <tr>
                                        <td colSpan="10" className="py-8 text-center text-slate-400">
                                            Loading SAA Grantor records...
                                        </td>
                                    </tr>
                                ) : filteredGrantors.length === 0 ? (
                                    <tr>
                                        <td colSpan="10" className="py-8 text-center text-slate-400">
                                            No SAA budget records match your filter.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredGrantors.map((g, idx) => (
                                        <tr key={g.id || idx} className="hover:bg-teal-50/40 transition-colors">
                                            <td className="py-2 px-3 font-mono font-bold text-teal-800">
                                                {g.code}
                                            </td>
                                            <td className="py-2 px-3 font-bold text-slate-900">
                                                <button
                                                    onClick={() => handleViewGrantorLedger(g)}
                                                    className="hover:text-teal-700 hover:underline text-left"
                                                    title="View individual patient ledger for this sponsor"
                                                >
                                                    {g.proponent}
                                                </button>
                                                {g.remarks && (
                                                    <span className="block text-[10px] text-slate-400 font-normal">{g.remarks}</span>
                                                )}
                                            </td>
                                            <td className="py-2 px-3">
                                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                                                    {g.category}
                                                </span>
                                            </td>
                                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600 font-semibold">
                                                {g.saa_number ? (
                                                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                                                        {g.saa_number}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">—</span>
                                                )}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                                                {g.allocated_budget > 0 ? fmt(g.allocated_budget) : <span className="text-slate-400 font-normal">Revolving / N/A</span>}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-teal-700">
                                                {fmt(g.utilized_budget)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold">
                                                {g.allocated_budget > 0 ? (
                                                    <span className={g.remaining_balance > 0 ? 'text-emerald-700' : 'text-rose-700'}>
                                                        {fmt(g.remaining_balance)}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 font-normal">—</span>
                                                )}
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                                {g.allocated_budget > 0 ? (
                                                    <div className="w-20 mx-auto">
                                                        <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-0.5">
                                                            <span>{g.utilization_rate}%</span>
                                                        </div>
                                                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                            <div
                                                                className={`h-1.5 rounded-full ${
                                                                    g.utilization_rate >= 100
                                                                        ? 'bg-rose-500'
                                                                        : g.utilization_rate >= 80
                                                                        ? 'bg-amber-500'
                                                                        : 'bg-emerald-500'
                                                                }`}
                                                                style={{ width: `${Math.min(100, g.utilization_rate)}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-slate-400 font-mono">100% Active</span>
                                                )}
                                            </td>
                                            <td className="py-2 px-3 text-center font-bold text-slate-800">
                                                {fmtNum(g.patients_assisted)}
                                            </td>
                                            <td className="py-2 px-3 text-center print:hidden">
                                                <div className="flex items-center justify-center space-x-1">
                                                    <button
                                                        onClick={() => handleViewGrantorLedger(g)}
                                                        className="px-2 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded text-[11px] font-bold transition-colors"
                                                        title="View Patient Ledger"
                                                    >
                                                        Patients
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenEditSaa(g)}
                                                        className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition-colors"
                                                        title="Edit SAA Budget Allotment"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSaa(g)}
                                                        className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                                        title="Delete SAA Allotment"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 2: INDIVIDUAL SPONSOR PATIENT LEDGERS (74+ PROPONENTS) WITH MONTH & YEAR FILTER */}
            {activeTab === 'grantor_ledger' && (
                <div className="space-y-4">
                    {/* Filter Controls Row (Includes Explicit Year & Month Dropdowns) */}
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-wrap gap-3 items-end print:hidden">
                        {/* Grantor Dropdown Selector */}
                        <div className="flex-1 min-w-[280px]">
                            <label className="block text-[10px] font-black uppercase text-teal-800 tracking-wider mb-1">
                                Select Individual Sponsor / Grantor ({data?.saa_grantors?.length || 80} Proponents):
                            </label>
                            <select
                                value={selectedGrantorId}
                                onChange={e => {
                                    setSelectedGrantorId(e.target.value);
                                    setLedgerPage(1);
                                }}
                                className="w-full px-3 py-2 border border-teal-300 rounded-xl text-xs bg-white text-slate-900 font-bold focus:ring-2 focus:ring-teal-500 shadow-sm"
                            >
                                {(data?.saa_grantors || []).map(g => (
                                    <option key={g.id} value={g.id}>
                                        [{g.code}] {g.proponent} {g.saa_number ? `• SAA #${g.saa_number}` : ''} {g.allocated_budget > 0 ? `(Budget: ${fmt(g.allocated_budget)})` : ''} — {fmtNum(g.patients_assisted)} Patients
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Year Selector */}
                        <div className="w-full sm:w-36">
                            <label className="block text-[10px] font-black uppercase text-teal-800 tracking-wider mb-1 flex items-center space-x-1">
                                <svg className="w-3 h-3 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                <span>Filter by Year:</span>
                            </label>
                            <select
                                value={filterYear}
                                onChange={e => {
                                    setFilterYear(e.target.value);
                                    setLedgerPage(1);
                                }}
                                className="w-full px-3 py-2 border border-teal-300 rounded-xl text-xs bg-white text-slate-900 font-bold focus:ring-2 focus:ring-teal-500 shadow-sm"
                            >
                                {yearsList.map(y => (
                                    <option key={y} value={y}>
                                        {y === 'All' ? 'All Years' : `Year ${y}`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Month Selector */}
                        <div className="w-full sm:w-44">
                            <label className="block text-[10px] font-black uppercase text-teal-800 tracking-wider mb-1">
                                Option: Filter by Month:
                            </label>
                            <select
                                value={selectedMonth}
                                onChange={e => {
                                    setSelectedMonth(e.target.value);
                                    setLedgerPage(1);
                                }}
                                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-800 font-bold focus:ring-2 focus:ring-teal-500 shadow-sm"
                            >
                                {monthsList.map(m => (
                                    <option key={m.num} value={m.num}>
                                        {m.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Search Patient */}
                        <div className="w-full sm:w-56">
                            <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                                Search Patient / Address:
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={searchPatient}
                                    onChange={e => {
                                        setSearchPatient(e.target.value);
                                        setLedgerPage(1);
                                    }}
                                    placeholder="Patient name or address..."
                                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-xl text-xs"
                                />
                                <svg className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            </div>
                        </div>
                    </div>

                    {/* Selected Grantor Hero Banner */}
                    {ledgerData?.grantor && (
                        <div className="bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 text-white p-5 rounded-2xl shadow-sm border border-teal-700/50 print:bg-white print:text-black print:border-slate-800">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="px-2.5 py-0.5 bg-teal-500/30 text-teal-200 border border-teal-400/40 rounded-lg text-xs font-mono font-bold print:text-black">
                                            {ledgerData.grantor.code}
                                        </span>
                                        <span className="px-2.5 py-0.5 bg-white/10 text-slate-200 rounded-lg text-xs font-semibold print:text-black">
                                            {ledgerData.grantor.category}
                                        </span>
                                        {ledgerData.grantor.saa_number && (
                                            <span className="px-2.5 py-0.5 bg-blue-500/30 text-blue-200 border border-blue-400/40 rounded-lg text-xs font-mono font-bold print:text-black">
                                                🏷️ SAA NO: {ledgerData.grantor.saa_number}
                                            </span>
                                        )}
                                        <span className="px-2.5 py-0.5 bg-amber-400/20 text-amber-200 border border-amber-300/30 rounded-lg text-xs font-mono font-bold print:text-black">
                                            📅 Active Year: {filterYear !== 'All' ? filterYear : 'All Recorded Years'}
                                        </span>
                                    </div>
                                    <h3 className="text-xl font-black mt-1 text-white print:text-black">
                                        {ledgerData.grantor.proponent}
                                    </h3>
                                    {ledgerData.grantor.remarks && (
                                        <p className="text-xs text-teal-200/80 mt-0.5">{ledgerData.grantor.remarks}</p>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-3 text-right">
                                    {ledgerData.grantor.allocated_budget > 0 && (
                                        <div className="bg-white/10 px-3 py-2 rounded-xl backdrop-blur-sm print:border">
                                            <span className="text-[10px] text-teal-200 uppercase font-bold block print:text-black">SAA Budget</span>
                                            <span className="text-sm font-bold text-white print:text-black">{fmt(ledgerData.grantor.allocated_budget)}</span>
                                        </div>
                                    )}
                                    <div className="bg-white/10 px-3 py-2 rounded-xl backdrop-blur-sm print:border">
                                        <span className="text-[10px] text-teal-200 uppercase font-bold block print:text-black">Total Disbursed</span>
                                        <span className="text-sm font-bold text-teal-300 print:text-black">{fmt(ledgerData.grantor.utilized_budget)}</span>
                                    </div>
                                    {ledgerData.grantor.allocated_budget > 0 && (
                                        <div className="bg-white/10 px-3 py-2 rounded-xl backdrop-blur-sm print:border">
                                            <span className="text-[10px] text-teal-200 uppercase font-bold block print:text-black">Remaining Fund</span>
                                            <span className="text-sm font-bold text-emerald-300 print:text-black">{fmt(ledgerData.grantor.remaining_balance)}</span>
                                        </div>
                                    )}
                                    <div className="bg-white/10 px-3 py-2 rounded-xl backdrop-blur-sm print:border">
                                        <span className="text-[10px] text-teal-200 uppercase font-bold block print:text-black">All-Time Patients</span>
                                        <span className="text-sm font-bold text-white print:text-black">{fmtNum(ledgerData.grantor.total_patients)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Interactive 12-Month Filter Strip (Hidden on Print) */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm print:hidden">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider flex items-center space-x-1.5">
                                <span>📅 Monthly Assistance Breakdown — Year: {filterYear !== 'All' ? filterYear : 'All Recorded Years'}</span>
                            </span>
                            <span className="text-[10px] text-slate-500">
                                {filterYear !== 'All' ? `Displaying data for Year ${filterYear}` : 'Displaying aggregated data across all years'} • Click any month to filter
                            </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-13 gap-1.5">
                            {monthsList.map(m => {
                                const summary = (ledgerData?.monthly_summary || []).find(s => s.month_num == m.num);
                                const count = m.num === 'All' ? (ledgerData?.totals?.total_patients || 0) : (summary?.count || 0);
                                const fa = m.num === 'All' ? (ledgerData?.totals?.total_fa || 0) : (summary?.total_fa || 0);
                                const isSelected = selectedMonth == m.num;

                                return (
                                    <button
                                        key={m.num}
                                        type="button"
                                        onClick={() => {
                                            setSelectedMonth(m.num);
                                            setLedgerPage(1);
                                        }}
                                        className={`p-2 rounded-lg text-left transition-all border ${
                                            isSelected
                                                ? 'bg-teal-600 text-white border-teal-600 shadow-md ring-2 ring-teal-400/50'
                                                : count > 0
                                                ? 'bg-slate-50 hover:bg-teal-50 border-slate-200 text-slate-800'
                                                : 'bg-slate-50/50 border-slate-100 text-slate-400 hover:bg-slate-100'
                                        }`}
                                    >
                                        <div className="text-[11px] font-black truncate">{m.short || m.name}</div>
                                        <div className={`text-[10px] font-mono font-bold mt-0.5 ${isSelected ? 'text-teal-100' : count > 0 ? 'text-teal-700' : 'text-slate-400'}`}>
                                            {fmtNum(count)} pts
                                        </div>
                                        {count > 0 && (
                                            <div className={`text-[9px] font-mono truncate ${isSelected ? 'text-teal-200' : 'text-slate-500'}`}>
                                                {fmt(fa)}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Filter Period Indicator Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-teal-50/70 border border-teal-200 rounded-xl text-xs">
                        <div className="flex items-center space-x-2">
                            <span className="font-bold text-teal-900">Active Filter:</span>
                            <span className="px-2.5 py-1 bg-teal-600 text-white rounded-lg font-bold">
                                {selectedMonth !== 'All' ? monthsList.find(m => m.num === selectedMonth)?.name : 'All 12 Months'} ({filterYear !== 'All' ? `Year ${filterYear}` : 'All Recorded Years'})
                            </span>
                            {searchPatient && (
                                <span className="px-2 py-0.5 bg-white border border-teal-300 text-teal-800 rounded text-[11px]">
                                    Search: "{searchPatient}"
                                </span>
                            )}
                        </div>

                        {ledgerData?.totals && (
                            <div className="flex items-center space-x-4 font-mono text-xs">
                                <div>
                                    <span className="text-slate-500">Patients: </span>
                                    <span className="font-bold text-slate-900">{fmtNum(ledgerData.totals.total_patients)}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Total F/A: </span>
                                    <span className="font-bold text-indigo-700">{fmt(ledgerData.totals.total_fa)}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Remaining Bal: </span>
                                    <span className="font-bold text-rose-700">{fmt(ledgerData.totals.total_balance)}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Patient Ledger Table */}
                    <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm print:border-slate-400 print:shadow-none">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700 text-[10px] uppercase font-black tracking-wider border-b border-slate-200 print:bg-slate-200 print:text-black">
                                    <th className="py-2.5 px-3">#</th>
                                    <th className="py-2.5 px-3">Patient Full Name</th>
                                    <th className="py-2.5 px-3">Date</th>
                                    <th className="py-2.5 px-3 text-right">Hospital Bill</th>
                                    <th className="py-2.5 px-3 text-right">F/A Disbursed</th>
                                    <th className="py-2.5 px-3 text-right">Cash Paid</th>
                                    <th className="py-2.5 px-3 text-right">Remaining Bal</th>
                                    <th className="py-2.5 px-3">Barangay / Address</th>
                                    <th className="py-2.5 px-3">Dept / Sheet</th>
                                    <th className="py-2.5 px-3">Remarks</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                                {ledgerLoading ? (
                                    <tr>
                                        <td colSpan="10" className="py-12 text-center text-slate-400">
                                            <div className="flex items-center justify-center space-x-2">
                                                <svg className="w-5 h-5 animate-spin text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                                <span>Loading sponsor patient ledger...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : !ledgerData || (!ledgerData.patients?.data?.length && !ledgerData.patients?.length) ? (
                                    <tr>
                                        <td colSpan="10" className="py-12 text-center text-slate-400 font-medium">
                                            No patients found for this sponsor in {selectedMonth !== 'All' ? monthsList.find(m => m.num === selectedMonth)?.name : 'the selected period'} ({filterYear !== 'All' ? `Year ${filterYear}` : 'All Years'}).
                                        </td>
                                    </tr>
                                ) : (
                                    (ledgerData.patients.data || ledgerData.patients).map((p, idx) => (
                                        <tr key={p.id || idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                                                {((ledgerData.patients.from || 1) + idx)}
                                            </td>
                                            <td className="py-2 px-3 font-bold text-slate-900">
                                                {p.patient_name}
                                                {p.case_number && (
                                                    <span className="block text-[10px] text-slate-400 font-mono">{p.case_number}</span>
                                                )}
                                            </td>
                                            <td className="py-2 px-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                                                {formatDate(p.entry_date || p.fa_date)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                                                {fmt(p.hospital_bill_balance)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-indigo-700 bg-indigo-50/30">
                                                {fmt(p.fa_amount)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-emerald-700">
                                                {p.cash_paid > 0 ? fmt(p.cash_paid) : '—'}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold">
                                                {p.remaining_balance > 0 ? (
                                                    <span className="text-rose-700">{fmt(p.remaining_balance)}</span>
                                                ) : (
                                                    <span className="text-emerald-600 text-[11px]">Settled</span>
                                                )}
                                            </td>
                                            <td className="py-2 px-3 text-slate-600 text-[11px] max-w-xs truncate" title={p.address}>
                                                {p.address || '—'}
                                            </td>
                                            <td className="py-2 px-3 text-slate-500 text-[10px]">
                                                <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                                                    {p.sheet_category || 'General'}
                                                </span>
                                            </td>
                                            <td className="py-2 px-3 text-slate-500 text-[11px] max-w-xs truncate" title={p.remarks}>
                                                {p.remarks || '—'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>

                            {/* Table Summary Footer */}
                            {ledgerData?.totals && (
                                <tfoot>
                                    <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300 text-xs">
                                        <td colSpan="3" className="py-2.5 px-3 uppercase tracking-wider text-[11px]">
                                            Period Sub-Total:
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                                            {fmt(ledgerData.totals.total_bill)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-indigo-900">
                                            {fmt(ledgerData.totals.total_fa)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-emerald-900">
                                            {fmt(ledgerData.totals.total_cash)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-rose-800">
                                            {fmt(ledgerData.totals.total_balance)}
                                        </td>
                                        <td colSpan="3" className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                                            Total: {fmtNum(ledgerData.totals.total_patients)} patients assisted
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {ledgerData?.patients?.last_page > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs print:hidden">
                            <span className="text-slate-600 font-medium">
                                Showing {ledgerData.patients.from || 0} to {ledgerData.patients.to || 0} of {ledgerData.patients.total} patients
                            </span>
                            <div className="flex items-center space-x-1.5">
                                <button
                                    onClick={() => setLedgerPage(1)}
                                    disabled={ledgerPage === 1}
                                    className="px-2.5 py-1 border rounded-lg font-bold disabled:opacity-40"
                                >
                                    First
                                </button>
                                <button
                                    onClick={() => setLedgerPage(p => Math.max(1, p - 1))}
                                    disabled={ledgerPage === 1}
                                    className="px-2.5 py-1 border rounded-lg font-bold disabled:opacity-40"
                                >
                                    Prev
                                </button>
                                <span className="px-3 py-1 font-mono font-bold bg-slate-100 rounded-lg">
                                    Page {ledgerPage} of {ledgerData.patients.last_page}
                                </span>
                                <button
                                    onClick={() => setLedgerPage(p => Math.min(ledgerData.patients.last_page, p + 1))}
                                    disabled={ledgerPage === ledgerData.patients.last_page}
                                    className="px-2.5 py-1 border rounded-lg font-bold disabled:opacity-40"
                                >
                                    Next
                                </button>
                                <button
                                    onClick={() => setLedgerPage(ledgerData.patients.last_page)}
                                    disabled={ledgerPage === ledgerData.patients.last_page}
                                    className="px-2.5 py-1 border rounded-lg font-bold disabled:opacity-40"
                                >
                                    Last
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: DEPARTMENT & DAILY TRANS SUMMARY */}
            {activeTab === 'dept_summary' && data && (
                <div className="space-y-4">
                    <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm print:border-slate-400 print:shadow-none">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700 text-[10px] uppercase font-black tracking-wider border-b border-slate-200 print:bg-slate-200 print:text-black">
                                    <th className="py-2.5 px-3">Department / Sheet Category</th>
                                    <th className="py-2.5 px-3 text-center">Patient Count</th>
                                    <th className="py-2.5 px-3 text-right">Hospital Bills</th>
                                    <th className="py-2.5 px-3 text-right">Promissory Notes</th>
                                    <th className="py-2.5 px-3 text-right">Financial Assistance</th>
                                    <th className="py-2.5 px-3 text-right">Cash Collected</th>
                                    <th className="py-2.5 px-3 text-right">Discount</th>
                                    <th className="py-2.5 px-3 text-right">Remaining Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                                {(data.categories || []).map((cat, idx) => (
                                    <tr key={idx} className="hover:bg-teal-50/30 transition-colors">
                                        <td className="py-2.5 px-3 font-bold text-slate-900">
                                            {cat.sheet_category}
                                        </td>
                                        <td className="py-2.5 px-3 text-center font-bold">
                                            {fmtNum(cat.count)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                                            {fmt(cat.total_bill)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-700">
                                            {fmt(cat.total_pn)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">
                                            {fmt(cat.total_fa)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                                            {fmt(cat.total_cash)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                                            {fmt(cat.total_discount)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">
                                            {fmt(cat.total_balance)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 4: NBB VS NON-NBB PROGRAMS (BY PATIENT, MONTH & YEAR) */}
            {activeTab === 'nbb_summary' && (
                <div className="space-y-4">
                    {/* Filter Controls Row */}
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-wrap gap-3 items-end print:hidden">
                        {/* Program Classification Filter */}
                        <div className="w-full sm:w-60">
                            <label className="block text-[10px] font-black uppercase text-purple-800 tracking-wider mb-1">
                                Program / Classification:
                            </label>
                            <select
                                value={nbbProgram}
                                onChange={e => {
                                    setNbbProgram(e.target.value);
                                    setNbbPage(1);
                                }}
                                className="w-full px-3 py-2 border border-purple-300 rounded-xl text-xs bg-white text-slate-900 font-bold focus:ring-2 focus:ring-purple-500 shadow-sm"
                            >
                                <option value="all">All Programs (NBB & Non-NBB)</option>
                                <option value="nbb">No Balance Billing (NBB)</option>
                                <option value="non_nbb">Non-NBB Accounts</option>
                                <option value="vawc">VAWC / Special ER</option>
                            </select>
                        </div>

                        {/* Year Selector */}
                        <div className="w-full sm:w-36">
                            <label className="block text-[10px] font-black uppercase text-purple-800 tracking-wider mb-1 flex items-center space-x-1">
                                <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                <span>Filter by Year:</span>
                            </label>
                            <select
                                value={nbbYear}
                                onChange={e => {
                                    setNbbYear(e.target.value);
                                    setNbbPage(1);
                                }}
                                className="w-full px-3 py-2 border border-purple-300 rounded-xl text-xs bg-white text-slate-900 font-bold focus:ring-2 focus:ring-purple-500 shadow-sm"
                            >
                                {yearsList.map(y => (
                                    <option key={y} value={y}>
                                        {y === 'All' ? 'All Years' : `Year ${y}`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Month Selector */}
                        <div className="w-full sm:w-44">
                            <label className="block text-[10px] font-black uppercase text-purple-800 tracking-wider mb-1">
                                Option: Filter by Month:
                            </label>
                            <select
                                value={nbbMonth}
                                onChange={e => {
                                    setNbbMonth(e.target.value);
                                    setNbbPage(1);
                                }}
                                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white text-slate-800 font-bold focus:ring-2 focus:ring-purple-500 shadow-sm"
                            >
                                {monthsList.map(m => (
                                    <option key={m.num} value={m.num}>
                                        {m.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Search Patient */}
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                                Search Patient / Case # / Address:
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={nbbSearch}
                                    onChange={e => {
                                        setNbbSearch(e.target.value);
                                        setNbbPage(1);
                                    }}
                                    placeholder="Search patient name, case no, address..."
                                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-xl text-xs"
                                />
                                <svg className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            </div>
                        </div>
                    </div>

                    {/* Interactive Program Metric Cards (Clickable to switch view) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* NBB Card */}
                        <div
                            onClick={() => { setNbbProgram('nbb'); setNbbPage(1); }}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                nbbProgram === 'nbb'
                                    ? 'bg-teal-50 border-teal-500 shadow-md ring-2 ring-teal-400/50'
                                    : 'bg-teal-50/50 hover:bg-teal-50 border-teal-200'
                            }`}
                        >
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-black uppercase text-teal-800 flex items-center space-x-1.5">
                                    <span>No Balance Billing (NBB)</span>
                                    {nbbProgram === 'nbb' && <span className="text-[10px] bg-teal-600 text-white px-1.5 py-0.2 rounded font-bold">ACTIVE</span>}
                                </span>
                                <span className="px-2 py-0.5 bg-teal-200 text-teal-900 rounded text-[11px] font-bold">
                                    {fmtNum(nbbData?.program_stats?.nbb_count ?? data?.nbb_stats?.nbb_count ?? 0)} Patients
                                </span>
                            </div>
                            <div className="space-y-1 text-xs mt-2">
                                <div className="flex justify-between text-slate-600">
                                    <span>Hospital Bills:</span>
                                    <span className="font-mono font-bold text-slate-800">
                                        {fmt(nbbData?.program_stats?.nbb_bill ?? data?.nbb_stats?.nbb_bill ?? 0)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-slate-600">
                                    <span>F/A Disbursed:</span>
                                    <span className="font-mono font-bold text-indigo-700">
                                        {fmt(nbbData?.program_stats?.nbb_fa ?? data?.nbb_stats?.nbb_fa ?? 0)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-slate-600 border-t border-teal-200 pt-1 font-bold">
                                    <span>Remaining Balance:</span>
                                    <span className="font-mono text-rose-700">
                                        {fmt(nbbData?.program_stats?.nbb_balance ?? data?.nbb_stats?.nbb_balance ?? 0)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Non-NBB Card */}
                        <div
                            onClick={() => { setNbbProgram('non_nbb'); setNbbPage(1); }}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                nbbProgram === 'non_nbb'
                                    ? 'bg-purple-50 border-purple-500 shadow-md ring-2 ring-purple-400/50'
                                    : 'bg-purple-50/50 hover:bg-purple-50 border-purple-200'
                            }`}
                        >
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-black uppercase text-purple-800 flex items-center space-x-1.5">
                                    <span>Non-NBB Accounts</span>
                                    {nbbProgram === 'non_nbb' && <span className="text-[10px] bg-purple-600 text-white px-1.5 py-0.2 rounded font-bold">ACTIVE</span>}
                                </span>
                                <span className="px-2 py-0.5 bg-purple-200 text-purple-900 rounded text-[11px] font-bold">
                                    {fmtNum(nbbData?.program_stats?.non_nbb_count ?? data?.nbb_stats?.non_nbb_count ?? 0)} Patients
                                </span>
                            </div>
                            <div className="space-y-1 text-xs mt-2">
                                <div className="flex justify-between text-slate-600">
                                    <span>Hospital Bills:</span>
                                    <span className="font-mono font-bold text-slate-800">
                                        {fmt(nbbData?.program_stats?.non_nbb_bill ?? data?.nbb_stats?.non_nbb_bill ?? 0)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-slate-600">
                                    <span>F/A Disbursed:</span>
                                    <span className="font-mono font-bold text-indigo-700">
                                        {fmt(nbbData?.program_stats?.non_nbb_fa ?? data?.nbb_stats?.non_nbb_fa ?? 0)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-slate-600 border-t border-purple-200 pt-1 font-bold">
                                    <span>Remaining Balance:</span>
                                    <span className="font-mono text-rose-700">
                                        {fmt(nbbData?.program_stats?.non_nbb_balance ?? data?.nbb_stats?.non_nbb_balance ?? 0)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* VAWC / Special ER Card */}
                        <div
                            onClick={() => { setNbbProgram('vawc'); setNbbPage(1); }}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                nbbProgram === 'vawc'
                                    ? 'bg-indigo-50 border-indigo-500 shadow-md ring-2 ring-indigo-400/50'
                                    : 'bg-indigo-50/50 hover:bg-indigo-50 border-indigo-200'
                            }`}
                        >
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-black uppercase text-indigo-800 flex items-center space-x-1.5">
                                    <span>VAWC / Special ER</span>
                                    {nbbProgram === 'vawc' && <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.2 rounded font-bold">ACTIVE</span>}
                                </span>
                                <span className="px-2 py-0.5 bg-indigo-200 text-indigo-900 rounded text-[11px] font-bold">
                                    {fmtNum(nbbData?.program_stats?.vawc_count ?? data?.nbb_stats?.vawc_count ?? 0)} Patients
                                </span>
                            </div>
                            <div className="space-y-1 text-xs mt-2">
                                <div className="flex justify-between text-slate-600">
                                    <span>Hospital Bills:</span>
                                    <span className="font-mono font-bold text-slate-800">
                                        {fmt(nbbData?.program_stats?.vawc_bill ?? data?.nbb_stats?.vawc_bill ?? 0)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-slate-600">
                                    <span>F/A Disbursed:</span>
                                    <span className="font-mono font-bold text-indigo-700">
                                        {fmt(nbbData?.program_stats?.vawc_fa ?? data?.nbb_stats?.vawc_fa ?? 0)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-slate-600 border-t border-indigo-200 pt-1 font-bold">
                                    <span>Remaining Balance:</span>
                                    <span className="font-mono text-rose-700">
                                        {fmt(nbbData?.program_stats?.vawc_balance ?? data?.nbb_stats?.vawc_balance ?? 0)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Interactive 12-Month Distribution Strip */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm print:hidden">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider flex items-center space-x-1.5">
                                <span>📅 Monthly Assistance Breakdown — Year: {nbbYear !== 'All' ? nbbYear : 'All Recorded Years'} ({nbbProgram === 'all' ? 'All Programs' : nbbProgram === 'nbb' ? 'NBB Accounts' : nbbProgram === 'non_nbb' ? 'Non-NBB Accounts' : 'VAWC/ER'})</span>
                            </span>
                            <span className="text-[10px] text-slate-500">
                                {nbbYear !== 'All' ? `Showing data for Year ${nbbYear}` : 'Showing all years'} • Click month to filter
                            </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-13 gap-1.5">
                            {monthsList.map(m => {
                                const summary = (nbbData?.monthly_summary || []).find(s => s.month_num == m.num);
                                const count = m.num === 'All' ? (nbbData?.totals?.total_patients || 0) : (summary?.count || 0);
                                const fa = m.num === 'All' ? (nbbData?.totals?.total_fa || 0) : (summary?.total_fa || 0);
                                const isSelected = nbbMonth == m.num;

                                return (
                                    <button
                                        key={m.num}
                                        type="button"
                                        onClick={() => {
                                            setNbbMonth(m.num);
                                            setNbbPage(1);
                                        }}
                                        className={`p-2 rounded-lg text-left transition-all border ${
                                            isSelected
                                                ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-400/50'
                                                : count > 0
                                                ? 'bg-slate-50 hover:bg-purple-50 border-slate-200 text-slate-800'
                                                : 'bg-slate-50/50 border-slate-100 text-slate-400 hover:bg-slate-100'
                                        }`}
                                    >
                                        <div className="text-[11px] font-black truncate">{m.short || m.name}</div>
                                        <div className={`text-[10px] font-mono font-bold mt-0.5 ${isSelected ? 'text-purple-100' : count > 0 ? 'text-purple-700' : 'text-slate-400'}`}>
                                            {fmtNum(count)} pts
                                        </div>
                                        {count > 0 && (
                                            <div className={`text-[9px] font-mono truncate ${isSelected ? 'text-purple-200' : 'text-slate-500'}`}>
                                                {fmt(fa)}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Filter Period Indicator Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-purple-50/70 border border-purple-200 rounded-xl text-xs">
                        <div className="flex items-center space-x-2">
                            <span className="font-bold text-purple-900">Active Filter:</span>
                            <span className="px-2.5 py-1 bg-purple-600 text-white rounded-lg font-bold">
                                {nbbProgram === 'all' ? 'All Programs' : nbbProgram === 'nbb' ? 'No Balance Billing (NBB)' : nbbProgram === 'non_nbb' ? 'Non-NBB Accounts' : 'VAWC/ER'}
                            </span>
                            <span className="px-2.5 py-1 bg-white border border-purple-300 text-purple-900 rounded-lg font-bold">
                                {nbbMonth !== 'All' ? monthsList.find(m => m.num === nbbMonth)?.name : 'All 12 Months'} ({nbbYear !== 'All' ? `Year ${nbbYear}` : 'All Recorded Years'})
                            </span>
                            {nbbSearch && (
                                <span className="px-2 py-0.5 bg-white border border-purple-300 text-purple-800 rounded text-[11px]">
                                    Search: "{nbbSearch}"
                                </span>
                            )}
                        </div>

                        {nbbData?.totals && (
                            <div className="flex items-center space-x-4 font-mono text-xs">
                                <div>
                                    <span className="text-slate-500">Patients: </span>
                                    <span className="font-bold text-slate-900">{fmtNum(nbbData.totals.total_patients)}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Hospital Bills: </span>
                                    <span className="font-bold text-slate-900">{fmt(nbbData.totals.total_bill)}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Total F/A: </span>
                                    <span className="font-bold text-indigo-700">{fmt(nbbData.totals.total_fa)}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">Remaining Bal: </span>
                                    <span className="font-bold text-rose-700">{fmt(nbbData.totals.total_balance)}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Full Patient Table */}
                    <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm print:border-slate-400 print:shadow-none">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700 text-[10px] uppercase font-black tracking-wider border-b border-slate-200 print:bg-slate-200 print:text-black">
                                    <th className="py-2.5 px-3">#</th>
                                    <th className="py-2.5 px-3">Patient Full Name</th>
                                    <th className="py-2.5 px-3">Entry Date</th>
                                    <th className="py-2.5 px-3 text-center">Classification</th>
                                    <th className="py-2.5 px-3 text-right">Hospital Bill</th>
                                    <th className="py-2.5 px-3 text-right">F/A Disbursed</th>
                                    <th className="py-2.5 px-3">Grantor / Sponsor</th>
                                    <th className="py-2.5 px-3 text-right">Cash Paid</th>
                                    <th className="py-2.5 px-3 text-right">Remaining Bal</th>
                                    <th className="py-2.5 px-3">Barangay / Address</th>
                                    <th className="py-2.5 px-3">Department</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                                {nbbLoading ? (
                                    <tr>
                                        <td colSpan="11" className="py-12 text-center text-slate-400">
                                            <div className="flex items-center justify-center space-x-2">
                                                <svg className="w-5 h-5 animate-spin text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                                <span>Loading NBB / Non-NBB patient records...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : !nbbData || (!nbbData.patients?.data?.length && !nbbData.patients?.length) ? (
                                    <tr>
                                        <td colSpan="11" className="py-12 text-center text-slate-400 font-medium">
                                            No patients found for this classification in {nbbMonth !== 'All' ? monthsList.find(m => m.num === nbbMonth)?.name : 'the selected period'} ({nbbYear !== 'All' ? `Year ${nbbYear}` : 'All Years'}).
                                        </td>
                                    </tr>
                                ) : (
                                    (nbbData.patients.data || nbbData.patients).map((p, idx) => (
                                        <tr key={p.id || idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                                                {((nbbData.patients.from || 1) + idx)}
                                            </td>
                                            <td className="py-2 px-3 font-bold text-slate-900">
                                                {p.patient_name}
                                                {p.case_number && (
                                                    <span className="block text-[10px] text-slate-400 font-mono">{p.case_number}</span>
                                                )}
                                            </td>
                                            <td className="py-2 px-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                                                {formatDate(p.entry_date || p.fa_date)}
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                                {p.is_nbb ? (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                                                        NBB
                                                    </span>
                                                ) : p.is_non_nbb ? (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                                        Non-NBB
                                                    </span>
                                                ) : p.is_vawc_er ? (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                                        VAWC/ER
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                                                        Standard
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                                                {fmt(p.hospital_bill_balance)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-indigo-700 bg-indigo-50/20">
                                                {fmt(p.fa_amount)}
                                            </td>
                                            <td className="py-2 px-3 text-xs text-slate-700 max-w-[140px] truncate" title={p.fa_grantor}>
                                                {p.fa_grantor ? (
                                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-semibold text-[10px]">
                                                        {p.fa_grantor}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-emerald-700">
                                                {p.cash_paid > 0 ? (
                                                    <div>
                                                        <span>{fmt(p.cash_paid)}</span>
                                                        {p.or_number && <span className="block text-[9px] text-slate-400 font-mono">OR:{p.or_number}</span>}
                                                    </div>
                                                ) : '—'}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold">
                                                {p.remaining_balance > 0 ? (
                                                    <span className="text-rose-700">{fmt(p.remaining_balance)}</span>
                                                ) : (
                                                    <span className="text-emerald-600 text-[11px]">Settled</span>
                                                )}
                                            </td>
                                            <td className="py-2 px-3 text-slate-600 text-[11px] max-w-xs truncate" title={p.address}>
                                                {p.address || '—'}
                                            </td>
                                            <td className="py-2 px-3 text-slate-500 text-[10px]">
                                                <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                                                    {p.sheet_category || 'General'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>

                            {/* Table Summary Footer */}
                            {nbbData?.totals && (
                                <tfoot>
                                    <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300 text-xs">
                                        <td colSpan="4" className="py-2.5 px-3 uppercase tracking-wider text-[11px]">
                                            Filtered Total:
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                                            {fmt(nbbData.totals.total_bill)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-indigo-900">
                                            {fmt(nbbData.totals.total_fa)}
                                        </td>
                                        <td></td>
                                        <td className="py-2.5 px-3 text-right font-mono text-emerald-900">
                                            {fmt(nbbData.totals.total_cash)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-rose-800">
                                            {fmt(nbbData.totals.total_balance)}
                                        </td>
                                        <td colSpan="2" className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                                            Total: {fmtNum(nbbData.totals.total_patients)} patients
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {nbbData?.patients?.last_page > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs print:hidden">
                            <span className="text-slate-600 font-medium">
                                Showing {nbbData.patients.from || 0} to {nbbData.patients.to || 0} of {nbbData.patients.total} patients
                            </span>
                            <div className="flex items-center space-x-1.5">
                                <button
                                    onClick={() => setNbbPage(1)}
                                    disabled={nbbPage === 1}
                                    className="px-2.5 py-1 border rounded-lg font-bold disabled:opacity-40"
                                >
                                    First
                                </button>
                                <button
                                    onClick={() => setNbbPage(p => Math.max(1, p - 1))}
                                    disabled={nbbPage === 1}
                                    className="px-2.5 py-1 border rounded-lg font-bold disabled:opacity-40"
                                >
                                    Prev
                                </button>
                                <span className="px-3 py-1 font-mono font-bold bg-slate-100 rounded-lg">
                                    Page {nbbPage} of {nbbData.patients.last_page}
                                </span>
                                <button
                                    onClick={() => setNbbPage(p => Math.min(nbbData.patients.last_page, p + 1))}
                                    disabled={nbbPage === nbbData.patients.last_page}
                                    className="px-2.5 py-1 border rounded-lg font-bold disabled:opacity-40"
                                >
                                    Next
                                </button>
                                <button
                                    onClick={() => setNbbPage(nbbData.patients.last_page)}
                                    disabled={nbbPage === nbbData.patients.last_page}
                                    className="px-2.5 py-1 border rounded-lg font-bold disabled:opacity-40"
                                >
                                    Last
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 5: DELINQUENT / ABSCONDED ACCOUNTS */}
            {activeTab === 'delinquents' && (
                <div className="space-y-4">
                    <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm print:border-slate-400 print:shadow-none">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700 text-[10px] uppercase font-black tracking-wider border-b border-slate-200 print:bg-slate-200 print:text-black">
                                    <th className="py-2.5 px-3">Patient Name</th>
                                    <th className="py-2.5 px-3">Department</th>
                                    <th className="py-2.5 px-3">Date</th>
                                    <th className="py-2.5 px-3 text-right">PN Amount</th>
                                    <th className="py-2.5 px-3 text-right">Remaining Balance</th>
                                    <th className="py-2.5 px-3">Guarantor</th>
                                    <th className="py-2.5 px-3">Remarks / Absconded Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                                {loading ? (
                                    <tr>
                                        <td colSpan="7" className="py-8 text-center text-slate-400">
                                            Loading delinquent records...
                                        </td>
                                    </tr>
                                ) : !data || !data.delinquents || data.delinquents.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="py-8 text-center text-slate-400">
                                            No delinquent or absconded accounts found.
                                        </td>
                                    </tr>
                                ) : (
                                    data.delinquents.map((d, idx) => (
                                        <tr key={d.id || idx} className="hover:bg-rose-50/30 transition-colors">
                                            <td className="py-2 px-3 font-bold text-slate-900">
                                                {d.patient_name}
                                            </td>
                                            <td className="py-2 px-3 text-slate-500 text-[10px]">
                                                <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                                                    {d.sheet_category}
                                                </span>
                                            </td>
                                            <td className="py-2 px-3 font-mono text-slate-600">
                                                {formatDate(d.entry_date)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                                                {fmt(d.pn_amount)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-bold text-rose-700">
                                                {fmt(d.remaining_balance)}
                                            </td>
                                            <td className="py-2 px-3 text-slate-600 font-semibold">
                                                {d.guarantor_name || '—'}
                                            </td>
                                            <td className="py-2 px-3 text-slate-500 italic">
                                                {d.remarks || 'Outstanding balance beyond promissory due date'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* OFFICIAL HOSPITAL SIGNATORIES (Shown on Print) */}
            <div className="hidden print:block mt-8 pt-6 border-t-2 border-slate-800">
                <div className="grid grid-cols-2 gap-8 text-center">
                    <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Prepared By:</span>
                        <div className="mt-8 border-b border-slate-800 pb-1">
                            <span className="text-sm font-black text-slate-900 uppercase">CLYNT MARK S. ALIS</span>
                        </div>
                        <span className="text-[10px] text-slate-600 mt-1 block">
                            Admin Assistant / Credit & Collection Staff
                        </span>
                        <span className="text-[9px] text-slate-500 block">
                            Financial Assistance In-Charge
                        </span>
                    </div>

                    <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Noted & Verified By:</span>
                        <div className="mt-8 border-b border-slate-800 pb-1">
                            <span className="text-sm font-black text-slate-900 uppercase">MEMIA R. BUGTONG, CPA, MBA</span>
                        </div>
                        <span className="text-[10px] text-slate-600 mt-1 block">
                            Accountant IV / Chief Accountant
                        </span>
                        <span className="text-[9px] text-slate-500 block">
                            Accounting & Financial Management Office
                        </span>
                    </div>
                </div>
            </div>

            {/* MODAL: ENCODE / EDIT SAA BUDGET ALLOTMENT */}
            {isSaaModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-150">
                        <div className="bg-gradient-to-r from-teal-800 to-teal-900 text-white p-4 flex justify-between items-center">
                            <div className="flex items-center space-x-2">
                                <span className="p-2 bg-white/10 rounded-xl">
                                    <svg className="w-5 h-5 text-teal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                </span>
                                <div>
                                    <h3 className="text-base font-bold text-white">
                                        {editingGrantor ? 'Edit SAA Fund Allotment' : 'Encode New SAA Fund Allotment'}
                                    </h3>
                                    <p className="text-[11px] text-teal-200">
                                        Sub-Allotment Advice (SAA) for Hospital Financial Assistance
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsSaaModalOpen(false)}
                                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <form onSubmit={handleSaveSaa} className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                        Sponsor Code *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={saaForm.code}
                                        onChange={e => setSaaForm({ ...saaForm, code: e.target.value })}
                                        placeholder="e.g. DOH (BG), DOH (CONG)"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-teal-500 uppercase"
                                    />
                                    <span className="text-[10px] text-slate-400 mt-0.5 block">Short identifier code</span>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                        Category *
                                    </label>
                                    <select
                                        value={saaForm.category}
                                        onChange={e => setSaaForm({ ...saaForm, category: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-teal-500"
                                    >
                                        <option value="Congressional">Congressional</option>
                                        <option value="Senate">Senate</option>
                                        <option value="Party List">Party List</option>
                                        <option value="LGU / Mayor">LGU / Mayor</option>
                                        <option value="Provincial Official">Provincial Official</option>
                                        <option value="Agency / Program">Agency / Program (MAIP / PCSO)</option>
                                        <option value="Other Grantor">Other Grantor</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Proponent / Sponsor Full Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={saaForm.proponent}
                                    onChange={e => setSaaForm({ ...saaForm, proponent: e.target.value })}
                                    placeholder="e.g. SEN. BONG GO, CONG. BILLONES, CONG. GUINTO"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-teal-500 uppercase"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                        SAA Number (SAA NO.)
                                    </label>
                                    <input
                                        type="text"
                                        value={saaForm.saa_number}
                                        onChange={e => setSaaForm({ ...saaForm, saa_number: e.target.value })}
                                        placeholder="e.g. 2026-03-001234"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-teal-500 uppercase"
                                    />
                                    <span className="text-[10px] text-slate-400 mt-0.5 block">Official Sub-Allotment Advice No.</span>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                        Approved Budget Allotment (₱) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        required
                                        value={saaForm.allocated_budget}
                                        onChange={e => setSaaForm({ ...saaForm, allocated_budget: e.target.value })}
                                        placeholder="0.00"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold text-emerald-800 focus:ring-2 focus:ring-teal-500"
                                    />
                                    <span className="text-[10px] text-slate-400 mt-0.5 block">Total budget ceiling</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Remarks / Purpose
                                </label>
                                <textarea
                                    rows="2"
                                    value={saaForm.remarks}
                                    onChange={e => setSaaForm({ ...saaForm, remarks: e.target.value })}
                                    placeholder="e.g. Special Allotment for 1st District Capiz Inpatients and Outpatients"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-teal-500"
                                ></textarea>
                            </div>

                            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setIsSaaModalOpen(false)}
                                    className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingSaa}
                                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center space-x-1.5"
                                >
                                    {savingSaa ? (
                                        <>
                                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                            <span>Saving...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                            <span>{editingGrantor ? 'Update SAA Budget' : 'Save SAA Allotment'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
