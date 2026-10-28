import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export default function PromissoryMasterlist({ onSelectPatient = null, initialPatientName = '' }) {
    const [notes, setNotes] = useState([]);
    const [stats, setStats] = useState({
        total_count: 0,
        with_balance_count: 0,
        total_balance_amount: 0,
        total_pn_count: 0,
        total_absconded_count: 0
    });
    const [categories, setCategories] = useState([]);
    
    // Filters
    const [search, setSearch] = useState(initialPatientName || '');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [hasBalanceOnly, setHasBalanceOnly] = useState(false);
    const [isPnOnly, setIsPnOnly] = useState(false);
    const [isAbscondedOnly, setIsAbscondedOnly] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0, from: 0, to: 0 });
    const [loading, setLoading] = useState(false);

    // Modals
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingNote, setEditingNote] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState(null);

    const emptyForm = {
        sheet_category: 'daily trans  2026',
        entry_date: new Date().toISOString().split('T')[0],
        patient_name: '',
        address: '',
        age: '',
        sex: 'M',
        hospital_bill_balance: '',
        is_pn: true,
        pn_amount: '',
        remaining_balance: '',
        is_absconded: false,
        is_nbb: false,
        is_vawc_er: false,
        is_non_nbb: false,
        fa_amount: '',
        fa_grantor: '',
        fa_date: '',
        cash_paid: '',
        or_number: '',
        or_date: '',
        discount: '',
        dialysis_fee: '',
        guarantor_name: '',
        remarks: ''
    };

    const [form, setForm] = useState(emptyForm);

    const showToast = (msg, type = 'success') => {
        setFeedback({ msg, type });
        setTimeout(() => setFeedback(null), 3500);
    };

    const fetchNotes = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                page: currentPage,
                search: search,
                category: selectedCategory,
                has_balance: hasBalanceOnly ? 1 : 0,
                is_pn: isPnOnly ? 1 : 0,
                is_absconded: isAbscondedOnly ? 1 : 0,
            };
            const response = await axios.get('/credit-promissory/notes', { params });
            const data = response.data;
            setNotes(data.notes.data || []);
            setPagination({
                current_page: data.notes.current_page,
                last_page: data.notes.last_page,
                total: data.notes.total,
                from: data.notes.from || 0,
                to: data.notes.to || 0,
            });
            if (data.stats) setStats(data.stats);
            if (data.categories) setCategories(data.categories);
        } catch (err) {
            console.error('Failed to fetch promissory notes', err);
            showToast('Failed to load promissory records.', 'error');
        } finally {
            setLoading(false);
        }
    }, [currentPage, search, selectedCategory, hasBalanceOnly, isPnOnly, isAbscondedOnly]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchNotes();
        }, 300);
        return () => clearTimeout(timer);
    }, [fetchNotes]);

    const handleOpenAdd = () => {
        setForm({
            ...emptyForm,
            patient_name: initialPatientName || '',
            entry_date: new Date().toISOString().split('T')[0],
        });
        setIsAddModalOpen(true);
    };

    const handleOpenEdit = (note) => {
        setEditingNote(note);
        setForm({
            sheet_category: note.sheet_category || 'daily trans  2026',
            entry_date: note.entry_date ? note.entry_date.split('T')[0] : '',
            patient_name: note.patient_name || '',
            address: note.address || '',
            age: note.age || '',
            sex: note.sex || 'M',
            hospital_bill_balance: note.hospital_bill_balance || '',
            is_pn: Boolean(note.is_pn),
            pn_amount: note.pn_amount || '',
            remaining_balance: note.remaining_balance || '',
            is_absconded: Boolean(note.is_absconded),
            is_nbb: Boolean(note.is_nbb),
            is_vawc_er: Boolean(note.is_vawc_er),
            is_non_nbb: Boolean(note.is_non_nbb),
            fa_amount: note.fa_amount || '',
            fa_grantor: note.fa_grantor || '',
            fa_date: note.fa_date ? note.fa_date.split('T')[0] : '',
            cash_paid: note.cash_paid || '',
            or_number: note.or_number || '',
            or_date: note.or_date ? note.or_date.split('T')[0] : '',
            discount: note.discount || '',
            dialysis_fee: note.dialysis_fee || '',
            guarantor_name: note.guarantor_name || '',
            remarks: note.remarks || ''
        });
        setIsEditModalOpen(true);
    };

    const handleSaveNew = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await axios.post('/credit-promissory/notes', form);
            showToast('Promissory record created successfully!');
            setIsAddModalOpen(false);
            fetchNotes();
        } catch (err) {
            console.error('Failed to create note', err);
            showToast(err.response?.data?.message || 'Failed to save record.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        if (!editingNote) return;
        setSubmitting(true);
        try {
            await axios.put(`/credit-promissory/notes/${editingNote.id}`, form);
            showToast('Promissory record updated successfully!');
            setIsEditModalOpen(false);
            setEditingNote(null);
            fetchNotes();
        } catch (err) {
            console.error('Failed to update note', err);
            showToast(err.response?.data?.message || 'Failed to update record.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleMarkSettled = async () => {
        if (!editingNote) return;
        if (!confirm(`Mark promissory note for ${editingNote.patient_name} as FULLY SETTLED?\n\nThis will set the remaining balance to ₱0.00.`)) return;
        setSubmitting(true);
        try {
            await axios.put(`/credit-promissory/notes/${editingNote.id}`, {
                ...form,
                remaining_balance: 0,
                status: 'Settled',
                remarks: (form.remarks ? form.remarks + ' | ' : '') + 'SETTLED on ' + new Date().toLocaleDateString()
            });
            showToast('Patient record marked as Settled!');
            setIsEditModalOpen(false);
            setEditingNote(null);
            fetchNotes();
        } catch (err) {
            console.error('Failed to settle note', err);
            showToast('Failed to settle note.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const formatCurrency = (val) => {
        const num = parseFloat(val) || 0;
        return '₱' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const categoryLabels = {
        'daily trans  2026': '2026 Daily Trans',
        'daily trans  2025': '2025 Daily Trans',
        'daily trans  2024': '2024 Daily Trans',
        'daily trans  BUCAS CENTER': 'BUCAS Center',
        'daily transac  CT SCAN': 'CT Scan',
        'daily transaction  DIALYSIS': 'Dialysis',
        'PN GAURANTOR RMPH EMPLOYEE': 'RMPH Guarantor'
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            
            {/* TOAST ALERT */}
            {feedback && (
                <div className={`fixed top-5 right-5 z-[500] px-4 py-3 rounded-xl shadow-xl text-white font-bold text-sm flex items-center space-x-2 animate-in slide-in-from-top-4 ${feedback.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                    <span>{feedback.msg}</span>
                </div>
            )}

            {/* TOP STATS CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Records</span>
                    <div className="text-xl font-black text-slate-800 mt-0.5">{stats.total_count.toLocaleString()}</div>
                    <span className="text-[11px] text-slate-500 font-semibold">Across all departments</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">With Remaining Balance</span>
                    <div className="text-xl font-black text-amber-800 mt-0.5">{stats.with_balance_count.toLocaleString()}</div>
                    <span className="text-[11px] text-amber-700 font-bold">{formatCurrency(stats.total_balance_amount)}</span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-600">Promissory Notes</span>
                    <div className="text-xl font-black text-blue-800 mt-0.5">{stats.total_pn_count.toLocaleString()}</div>
                    <span className="text-[11px] text-blue-600 font-semibold">PN Signed records</span>
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">Absconded</span>
                    <div className="text-xl font-black text-rose-800 mt-0.5">{stats.total_absconded_count.toLocaleString()}</div>
                    <span className="text-[11px] text-rose-500 font-semibold">Left without settle</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 shadow-sm col-span-2 md:col-span-1 flex flex-col justify-between">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Fast Action</span>
                        <div className="text-xs font-bold text-emerald-800 mt-0.5">Add New Patient Entry</div>
                    </div>
                    <button 
                        onClick={handleOpenAdd}
                        className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-colors shadow-sm flex items-center justify-center space-x-1"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                        <span>New Promissory Note</span>
                    </button>
                </div>
            </div>

            {/* FILTER CONTROLS & SEARCH BAR */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                    
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <svg className="w-4 h-4 absolute left-3 top-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        <input 
                            type="text"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                            placeholder="Search patient name, guarantor, address, remarks, OR #..."
                            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all"
                        />
                        {search && (
                            <button onClick={() => { setSearch(''); setCurrentPage(1); }} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        )}
                    </div>

                    {/* Filter Checkbox Toggles */}
                    <div className="flex flex-wrap gap-2 items-center text-xs">
                        <label className={`cursor-pointer px-3 py-2 rounded-lg border font-bold flex items-center space-x-1.5 transition-all ${hasBalanceOnly ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                            <input 
                                type="checkbox" 
                                checked={hasBalanceOnly} 
                                onChange={(e) => { setHasBalanceOnly(e.target.checked); setCurrentPage(1); }}
                                className="hidden"
                            />
                            <span className={`w-2 h-2 rounded-full ${hasBalanceOnly ? 'bg-amber-600' : 'bg-slate-300'}`}></span>
                            <span>With Balance Only</span>
                        </label>

                        <label className={`cursor-pointer px-3 py-2 rounded-lg border font-bold flex items-center space-x-1.5 transition-all ${isPnOnly ? 'bg-blue-100 text-blue-900 border-blue-300 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                            <input 
                                type="checkbox" 
                                checked={isPnOnly} 
                                onChange={(e) => { setIsPnOnly(e.target.checked); setCurrentPage(1); }}
                                className="hidden"
                            />
                            <span className={`w-2 h-2 rounded-full ${isPnOnly ? 'bg-blue-600' : 'bg-slate-300'}`}></span>
                            <span>PN Flagged</span>
                        </label>

                        <label className={`cursor-pointer px-3 py-2 rounded-lg border font-bold flex items-center space-x-1.5 transition-all ${isAbscondedOnly ? 'bg-rose-100 text-rose-900 border-rose-300 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                            <input 
                                type="checkbox" 
                                checked={isAbscondedOnly} 
                                onChange={(e) => { setIsAbscondedOnly(e.target.checked); setCurrentPage(1); }}
                                className="hidden"
                            />
                            <span className={`w-2 h-2 rounded-full ${isAbscondedOnly ? 'bg-rose-600' : 'bg-slate-300'}`}></span>
                            <span>Absconded</span>
                        </label>
                    </div>
                </div>

                {/* Category Tabs */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                    <button
                        onClick={() => { setSelectedCategory('All'); setCurrentPage(1); }}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${selectedCategory === 'All' ? 'bg-[#0f172a] text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        All Categories
                    </button>
                    {categories.map((cat, idx) => (
                        <button
                            key={idx}
                            onClick={() => { setSelectedCategory(cat); setCurrentPage(1); }}
                            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${selectedCategory === cat ? 'bg-teal-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                            {categoryLabels[cat] || cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* TABLE SECTION */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold sticky top-0 z-10">
                            <tr>
                                <th className="p-3 w-28">Date</th>
                                <th className="p-3 w-48">Patient Details</th>
                                <th className="p-3 w-32">Section</th>
                                <th className="p-3 w-28 text-right">Bill / PN Amt</th>
                                <th className="p-3 w-32 text-right">Remaining Bal</th>
                                <th className="p-3 w-36">Assistance / Payment</th>
                                <th className="p-3 w-36">Guarantor / Remarks</th>
                                <th className="p-3 w-24 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                            {loading ? (
                                <tr>
                                    <td colSpan="8" className="p-12 text-center text-slate-400">
                                        <svg className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        <span>Searching masterlist...</span>
                                    </td>
                                </tr>
                            ) : notes.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-16 text-center text-slate-400">
                                        <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                        <div className="font-bold text-slate-600 text-sm">No Promissory Records Found</div>
                                        <p className="text-xs text-slate-400 mt-1">Try adjusting your search terms or filters.</p>
                                    </td>
                                </tr>
                            ) : (
                                notes.map((note) => {
                                    const hasBal = (note.remaining_balance || 0) > 0;
                                    return (
                                        <tr key={note.id} className={`hover:bg-slate-50/80 transition-colors ${hasBal ? 'bg-amber-50/20' : ''}`}>
                                            
                                            {/* Date */}
                                            <td className="p-3 text-slate-600 whitespace-nowrap">
                                                <div className="font-bold text-slate-800">
                                                    {note.entry_date ? new Date(note.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                                </div>
                                                {note.is_absconded && (
                                                    <span className="mt-0.5 inline-block bg-rose-100 text-rose-800 text-[9px] font-black px-1.5 py-0.5 rounded border border-rose-300">
                                                        ABSCONDED
                                                    </span>
                                                )}
                                            </td>

                                            {/* Patient Name */}
                                            <td className="p-3">
                                                <div className="font-black text-slate-900 text-sm hover:text-teal-700 cursor-pointer" onClick={() => handleOpenEdit(note)}>
                                                    {note.patient_name}
                                                </div>
                                                <div className="text-[11px] text-slate-500 truncate max-w-xs" title={note.address}>
                                                    {note.address || 'No address provided'}
                                                </div>
                                                {(note.age || note.sex) && (
                                                    <div className="text-[10px] text-slate-400 font-semibold">
                                                        {note.age ? `${note.age} y/o` : ''} {note.sex ? `• ${note.sex}` : ''}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Section / Sheet */}
                                            <td className="p-3">
                                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                                    {categoryLabels[note.sheet_category] || note.sheet_category}
                                                </span>
                                                <div className="flex gap-1 mt-1">
                                                    {note.is_pn && <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1 py-0.2 rounded border border-blue-200">PN</span>}
                                                    {note.is_nbb && <span className="text-[9px] font-bold text-teal-700 bg-teal-50 px-1 py-0.2 rounded border border-teal-200">NBB</span>}
                                                    {note.is_non_nbb && <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1 py-0.2 rounded border border-purple-200">NON-NBB</span>}
                                                </div>
                                            </td>

                                            {/* Bill & PN Amount */}
                                            <td className="p-3 text-right">
                                                <div className="font-bold text-slate-800">
                                                    {note.pn_amount > 0 ? formatCurrency(note.pn_amount) : formatCurrency(note.hospital_bill_balance)}
                                                </div>
                                                {note.pn_amount > 0 && note.hospital_bill_balance > 0 && note.pn_amount !== note.hospital_bill_balance && (
                                                    <div className="text-[10px] text-slate-400">
                                                        Bill: {formatCurrency(note.hospital_bill_balance)}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Remaining Balance */}
                                            <td className="p-3 text-right">
                                                {hasBal ? (
                                                    <div>
                                                        <span className="inline-block px-2 py-1 rounded-md text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">
                                                            {formatCurrency(note.remaining_balance)}
                                                        </span>
                                                        <div className="text-[9px] font-bold text-rose-600 mt-0.5 uppercase tracking-wide">Unpaid Balance</div>
                                                    </div>
                                                ) : (
                                                    <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                        ₱0.00 (Settled)
                                                    </span>
                                                )}
                                            </td>

                                            {/* Assistance / Payments */}
                                            <td className="p-3">
                                                {note.fa_amount > 0 ? (
                                                    <div className="text-slate-700">
                                                        <span className="font-bold text-emerald-700">{formatCurrency(note.fa_amount)}</span>
                                                        <span className="text-[10px] block text-slate-500 font-semibold">{note.fa_grantor || 'Assistance'}</span>
                                                    </div>
                                                ) : note.cash_paid > 0 ? (
                                                    <div className="text-slate-700">
                                                        <span className="font-bold text-teal-700">{formatCurrency(note.cash_paid)} (Cash)</span>
                                                        {note.or_number && <span className="text-[10px] block text-slate-400 font-mono">OR: {note.or_number}</span>}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 italic">None</span>
                                                )}
                                            </td>

                                            {/* Guarantor / Remarks */}
                                            <td className="p-3">
                                                {note.guarantor_name && (
                                                    <div className="font-bold text-indigo-700 text-[11px]">
                                                        👤 {note.guarantor_name}
                                                    </div>
                                                )}
                                                <div className="text-[11px] text-slate-600 truncate max-w-xs" title={note.remarks}>
                                                    {note.remarks || '—'}
                                                </div>
                                            </td>

                                            {/* Action Button */}
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => handleOpenEdit(note)}
                                                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm"
                                                >
                                                    Edit / Settle
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* PAGINATION CONTROLS */}
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-medium">
                    <div>
                        Showing <span className="font-bold">{pagination.from}</span> to <span className="font-bold">{pagination.to}</span> of <span className="font-bold">{pagination.total.toLocaleString()}</span> records
                    </div>
                    <div className="flex items-center space-x-1.5">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={pagination.current_page <= 1 || loading}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors shadow-sm"
                        >
                            Previous
                        </button>
                        <span className="px-3 py-1 font-bold text-slate-800">
                            Page {pagination.current_page} of {pagination.last_page || 1}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(pagination.last_page, p + 1))}
                            disabled={pagination.current_page >= pagination.last_page || loading}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors shadow-sm"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {/* --- ADD NEW PROMISSORY NOTE MODAL --- */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 animate-in zoom-in duration-200 my-8">
                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div>
                                <h3 className="text-base font-black text-slate-800 uppercase tracking-wide">
                                    New Promissory Note / Transaction
                                </h3>
                                <p className="text-xs text-slate-500 font-medium">Direct Entry (Replaces Excel)</p>
                            </div>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <form onSubmit={handleSaveNew} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs font-semibold">
                            
                            {/* Patient & Date */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="sm:col-span-2">
                                    <label className="block text-slate-600 uppercase mb-1">Patient Name *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        value={form.patient_name} 
                                        onChange={e => setForm({...form, patient_name: e.target.value})} 
                                        placeholder="e.g. DELA CRUZ, JUAN M." 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">Date</label>
                                    <input 
                                        type="date" 
                                        value={form.entry_date} 
                                        onChange={e => setForm({...form, entry_date: e.target.value})} 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                    />
                                </div>
                            </div>

                            {/* Section Category */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">Sheet / Category</label>
                                    <select 
                                        value={form.sheet_category} 
                                        onChange={e => setForm({...form, sheet_category: e.target.value})} 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                    >
                                        <option value="daily trans  2026">2026 Daily Trans</option>
                                        <option value="daily trans  BUCAS CENTER">BUCAS Center</option>
                                        <option value="daily transac  CT SCAN">CT Scan</option>
                                        <option value="daily transaction  DIALYSIS">Dialysis</option>
                                        <option value="PN GAURANTOR RMPH EMPLOYEE">RMPH Guarantor</option>
                                        <option value="daily trans  2025">2025 Daily Trans</option>
                                        <option value="daily trans  2024">2024 Daily Trans</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">Age</label>
                                    <input 
                                        type="text" 
                                        value={form.age} 
                                        onChange={e => setForm({...form, age: e.target.value})} 
                                        placeholder="e.g. 45 or NB" 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">Sex</label>
                                    <select 
                                        value={form.sex} 
                                        onChange={e => setForm({...form, sex: e.target.value})} 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                    >
                                        <option value="M">Male (M)</option>
                                        <option value="F">Female (F)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Address */}
                            <div>
                                <label className="block text-slate-600 uppercase mb-1">Address</label>
                                <input 
                                    type="text" 
                                    value={form.address} 
                                    onChange={e => setForm({...form, address: e.target.value})} 
                                    placeholder="e.g. Poblacion, Roxas City, Capiz" 
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                />
                            </div>

                            {/* Financial Amounts */}
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Financial Amounts</span>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-slate-600 uppercase mb-1">Hospital Bill Total</label>
                                        <input 
                                            type="number" 
                                            step="0.01" 
                                            value={form.hospital_bill_balance} 
                                            onChange={e => setForm({...form, hospital_bill_balance: e.target.value})} 
                                            placeholder="0.00" 
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-slate-600 uppercase mb-1">PN Amount</label>
                                        <input 
                                            type="number" 
                                            step="0.01" 
                                            value={form.pn_amount} 
                                            onChange={e => setForm({...form, pn_amount: e.target.value, remaining_balance: e.target.value})} 
                                            placeholder="0.00" 
                                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-rose-700 uppercase mb-1 font-bold">Remaining Balance</label>
                                        <input 
                                            type="number" 
                                            step="0.01" 
                                            value={form.remaining_balance} 
                                            onChange={e => setForm({...form, remaining_balance: e.target.value})} 
                                            placeholder="0.00" 
                                            className="w-full px-3 py-2 border border-rose-300 bg-rose-50/50 rounded-lg text-xs font-mono font-bold text-rose-900"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Flags (Checkboxes) */}
                            <div className="flex flex-wrap gap-4 pt-1 pb-1">
                                <label className="flex items-center space-x-1.5 cursor-pointer">
                                    <input type="checkbox" checked={form.is_pn} onChange={e => setForm({...form, is_pn: e.target.checked})} className="rounded text-teal-600 focus:ring-teal-500" />
                                    <span>Promissory Note (PN)</span>
                                </label>
                                <label className="flex items-center space-x-1.5 cursor-pointer">
                                    <input type="checkbox" checked={form.is_absconded} onChange={e => setForm({...form, is_absconded: e.target.checked})} className="rounded text-rose-600 focus:ring-rose-500" />
                                    <span className="text-rose-700">Absconded</span>
                                </label>
                                <label className="flex items-center space-x-1.5 cursor-pointer">
                                    <input type="checkbox" checked={form.is_nbb} onChange={e => setForm({...form, is_nbb: e.target.checked})} className="rounded text-teal-600 focus:ring-teal-500" />
                                    <span>NBB</span>
                                </label>
                                <label className="flex items-center space-x-1.5 cursor-pointer">
                                    <input type="checkbox" checked={form.is_non_nbb} onChange={e => setForm({...form, is_non_nbb: e.target.checked})} className="rounded text-purple-600 focus:ring-purple-500" />
                                    <span>Non-NBB</span>
                                </label>
                                <label className="flex items-center space-x-1.5 cursor-pointer">
                                    <input type="checkbox" checked={form.is_vawc_er} onChange={e => setForm({...form, is_vawc_er: e.target.checked})} className="rounded text-indigo-600 focus:ring-indigo-500" />
                                    <span>VAWC/ER</span>
                                </label>
                            </div>

                            {/* Assistance & Payment Details */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">F/A Grantor (e.g. MAIP, PCSO)</label>
                                    <input 
                                        type="text" 
                                        value={form.fa_grantor} 
                                        onChange={e => setForm({...form, fa_grantor: e.target.value})} 
                                        placeholder="e.g. SEN. BONG GO / MAIP" 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">F/A Amount</label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        value={form.fa_amount} 
                                        onChange={e => setForm({...form, fa_amount: e.target.value})} 
                                        placeholder="0.00" 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">Cash Payment</label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        value={form.cash_paid} 
                                        onChange={e => setForm({...form, cash_paid: e.target.value})} 
                                        placeholder="0.00" 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">OR #</label>
                                    <input 
                                        type="text" 
                                        value={form.or_number} 
                                        onChange={e => setForm({...form, or_number: e.target.value})} 
                                        placeholder="Receipt #" 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">Guarantor Name</label>
                                    <input 
                                        type="text" 
                                        value={form.guarantor_name} 
                                        onChange={e => setForm({...form, guarantor_name: e.target.value})} 
                                        placeholder="RMPH Employee / Co-maker" 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-600 uppercase mb-1">Remarks</label>
                                <textarea 
                                    rows="2"
                                    value={form.remarks} 
                                    onChange={e => setForm({...form, remarks: e.target.value})} 
                                    placeholder="Enter promissory note conditions, blood donors, promissory due date, etc."
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                ></textarea>
                            </div>

                            <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50"
                                >
                                    {submitting ? 'Saving...' : 'Save Promissory Record'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- EDIT / SETTLE PROMISSORY NOTE MODAL --- */}
            {isEditModalOpen && editingNote && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 animate-in zoom-in duration-200 my-8">
                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <div>
                                <h3 className="text-base font-black text-slate-800 uppercase tracking-wide">
                                    Update / Settle Promissory Note
                                </h3>
                                <p className="text-xs text-slate-500 font-medium">Record ID #{editingNote.id} • {editingNote.patient_name}</p>
                            </div>
                            <button onClick={() => { setIsEditModalOpen(false); setEditingNote(null); }} className="text-slate-400 hover:text-slate-600 p-1">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <form onSubmit={handleUpdate} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs font-semibold">
                            
                            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 flex justify-between items-center">
                                <div>
                                    <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider">Current Remaining Balance</span>
                                    <div className="text-lg font-black text-amber-900">{formatCurrency(form.remaining_balance)}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleMarkSettled}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-colors text-xs flex items-center space-x-1"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                    <span>Mark as Fully Settled (₱0.00)</span>
                                </button>
                            </div>

                            {/* Patient & Date */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="sm:col-span-2">
                                    <label className="block text-slate-600 uppercase mb-1">Patient Name *</label>
                                    <input 
                                        type="text" 
                                        required 
                                        value={form.patient_name} 
                                        onChange={e => setForm({...form, patient_name: e.target.value})} 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">Date</label>
                                    <input 
                                        type="date" 
                                        value={form.entry_date} 
                                        onChange={e => setForm({...form, entry_date: e.target.value})} 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                    />
                                </div>
                            </div>

                            {/* Section Category */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">Sheet / Category</label>
                                    <select 
                                        value={form.sheet_category} 
                                        onChange={e => setForm({...form, sheet_category: e.target.value})} 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                    >
                                        <option value="daily trans  2026">2026 Daily Trans</option>
                                        <option value="daily trans  BUCAS CENTER">BUCAS Center</option>
                                        <option value="daily transac  CT SCAN">CT Scan</option>
                                        <option value="daily transaction  DIALYSIS">Dialysis</option>
                                        <option value="PN GAURANTOR RMPH EMPLOYEE">RMPH Guarantor</option>
                                        <option value="daily trans  2025">2025 Daily Trans</option>
                                        <option value="daily trans  2024">2024 Daily Trans</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">PN Amount</label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        value={form.pn_amount} 
                                        onChange={e => setForm({...form, pn_amount: e.target.value})} 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-rose-700 uppercase mb-1 font-bold">Remaining Balance</label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        value={form.remaining_balance} 
                                        onChange={e => setForm({...form, remaining_balance: e.target.value})} 
                                        className="w-full px-3 py-2 border border-rose-300 bg-rose-50/50 rounded-lg text-xs font-mono font-bold text-rose-900"
                                    />
                                </div>
                            </div>

                            {/* Address */}
                            <div>
                                <label className="block text-slate-600 uppercase mb-1">Address</label>
                                <input 
                                    type="text" 
                                    value={form.address} 
                                    onChange={e => setForm({...form, address: e.target.value})} 
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                />
                            </div>

                            {/* Payments / Assistance updates */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">Cash Paid (₱)</label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        value={form.cash_paid} 
                                        onChange={e => setForm({...form, cash_paid: e.target.value})} 
                                        placeholder="0.00" 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">Official Receipt (OR #)</label>
                                    <input 
                                        type="text" 
                                        value={form.or_number} 
                                        onChange={e => setForm({...form, or_number: e.target.value})} 
                                        placeholder="OR #" 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">OR Date</label>
                                    <input 
                                        type="date" 
                                        value={form.or_date} 
                                        onChange={e => setForm({...form, or_date: e.target.value})} 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">Guarantor Name</label>
                                    <input 
                                        type="text" 
                                        value={form.guarantor_name} 
                                        onChange={e => setForm({...form, guarantor_name: e.target.value})} 
                                        placeholder="e.g. Employee Name" 
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-600 uppercase mb-1">Status</label>
                                    <select
                                        value={form.remaining_balance <= 0 ? 'Settled' : 'Active'}
                                        onChange={e => setForm({...form, status: e.target.value})}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                    >
                                        <option value="Active">Active (Unsettled)</option>
                                        <option value="Settled">Settled</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-600 uppercase mb-1">Remarks</label>
                                <textarea 
                                    rows="2"
                                    value={form.remarks} 
                                    onChange={e => setForm({...form, remarks: e.target.value})} 
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                                ></textarea>
                            </div>

                            <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                                <button
                                    type="button"
                                    onClick={() => { setIsEditModalOpen(false); setEditingNote(null); }}
                                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50"
                                >
                                    {submitting ? 'Updating...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
