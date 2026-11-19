import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

const PAGE_SIZE = 100;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const DISPOSITION_THEME = {
    improved: {
        bar: 'bg-teal-600',
        dot: 'bg-teal-600',
        badge: 'bg-teal-50 text-teal-800 border-teal-200',
    },
    hama: {
        bar: 'bg-amber-500',
        dot: 'bg-amber-500',
        badge: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    transferred: {
        bar: 'bg-sky-600',
        dot: 'bg-sky-600',
        badge: 'bg-sky-50 text-sky-800 border-sky-200',
    },
    died: {
        bar: 'bg-slate-600',
        dot: 'bg-slate-600',
        badge: 'bg-slate-100 text-slate-800 border-slate-300',
    },
    absconded: {
        bar: 'bg-rose-600',
        dot: 'bg-rose-600',
        badge: 'bg-rose-50 text-rose-800 border-rose-200',
    },
};

function getDispositionTheme(label) {
    const key = (label || '').trim().toLowerCase();
    return DISPOSITION_THEME[key] || {
        bar: 'bg-slate-400',
        dot: 'bg-slate-400',
        badge: 'bg-slate-100 text-slate-700 border-slate-200',
    };
}

function formatLocalDate(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function BillingReportsPanel() {
    const [filters, setFilters] = useState({
        date_from: '',
        date_to: '',
        disposition: 'all',
        ward: 'all',
        status: 'all_routed',
        search: '',
        starts_with: '',
        layout: 'alphabetical',
        sort_dir: 'asc',
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reportData, setReportData] = useState({
        records: [],
        total: 0,
        dispositionSummary: [],
        availableDispositions: [],
        availableWards: [],
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [printJob, setPrintJob] = useState(null);
    const [printSeq, setPrintSeq] = useState(0);
    const [isPreparingPrint, setIsPreparingPrint] = useState(false);

    const buildQueryString = useCallback((f) => {
        const params = new URLSearchParams();
        if (f.date_from) params.set('date_from', f.date_from);
        if (f.date_to) params.set('date_to', f.date_to);
        if (f.disposition && f.disposition !== 'all') params.set('disposition', f.disposition);
        if (f.ward && f.ward !== 'all') params.set('ward', f.ward);
        if (f.status) params.set('status', f.status);
        if (f.search.trim()) params.set('search', f.search.trim());
        if (f.starts_with) params.set('starts_with', f.starts_with);
        params.set('layout', f.layout);
        params.set('sort_dir', f.sort_dir);
        return params.toString();
    }, []);

    const fetchReports = useCallback(async (activeFilters) => {
        setLoading(true);
        setError('');
        try {
            const qs = buildQueryString(activeFilters);
            const res = await axios.get(`/billing/reports?${qs}`);
            setReportData({
                records: res.data.records || [],
                total: res.data.total || 0,
                dispositionSummary: res.data.dispositionSummary || [],
                availableDispositions: res.data.availableDispositions || [],
                availableWards: res.data.availableWards || [],
            });
            setCurrentPage(1);
        } catch (err) {
            console.error('Failed to load routed reports:', err);
            const msg = err.response?.data?.message || 'Unable to load routed patient reports. Please try again.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [buildQueryString]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchReports(filters);
        }, filters.search ? 250 : 0);
        return () => clearTimeout(timer);
    }, [filters, fetchReports]);

    const activeDatePreset = useMemo(() => {
        const today = new Date();
        const todayIso = formatLocalDate(today);
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 6);
        const weekStartIso = formatLocalDate(weekStart);
        const monthStartIso = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1));

        if (!filters.date_from && !filters.date_to) return 'all';
        if (filters.date_from === todayIso && filters.date_to === todayIso) return 'today';
        if (filters.date_from === weekStartIso && filters.date_to === todayIso) return 'week';
        if (filters.date_from === monthStartIso && filters.date_to === todayIso) return 'month';
        return 'custom';
    }, [filters.date_from, filters.date_to]);

    const applyDatePreset = (preset) => {
        const today = new Date();
        if (preset === 'all') {
            setFilters((prev) => ({ ...prev, date_from: '', date_to: '' }));
            return;
        }
        if (preset === 'today') {
            const iso = formatLocalDate(today);
            setFilters((prev) => ({ ...prev, date_from: iso, date_to: iso }));
            return;
        }
        if (preset === 'week') {
            const start = new Date(today);
            start.setDate(today.getDate() - 6);
            setFilters((prev) => ({ ...prev, date_from: formatLocalDate(start), date_to: formatLocalDate(today) }));
            return;
        }
        if (preset === 'month') {
            const start = new Date(today.getFullYear(), today.getMonth(), 1);
            setFilters((prev) => ({ ...prev, date_from: formatLocalDate(start), date_to: formatLocalDate(today) }));
        }
    };

    const resetAllFilters = () => {
        setFilters({
            date_from: '',
            date_to: '',
            disposition: 'all',
            ward: 'all',
            status: 'all_routed',
            search: '',
            starts_with: '',
            layout: 'alphabetical',
            sort_dir: 'asc',
        });
    };

    const hasNonDefaultFilters = Boolean(
        filters.date_from ||
        filters.date_to ||
        filters.disposition !== 'all' ||
        filters.ward !== 'all' ||
        filters.status !== 'all_routed' ||
        filters.search.trim() ||
        filters.starts_with
    );

    const queryStr = useMemo(() => buildQueryString(filters), [filters, buildQueryString]);
    const printUrl = `/billing/reports/print?${queryStr}`;
    const csvUrl = `/billing/reports/csv?${queryStr}`;

    const handlePrintReport = () => {
        const nextSeq = printSeq + 1;
        setPrintSeq(nextSeq);
        setIsPreparingPrint(true);
        setPrintJob({ url: printUrl, key: nextSeq });
    };

    useEffect(() => {
        if (!isPreparingPrint) return;
        const fallback = setTimeout(() => setIsPreparingPrint(false), 1800);
        return () => clearTimeout(fallback);
    }, [isPreparingPrint, printSeq]);

    const dispositionTotalsLookup = useMemo(() => {
        const map = {};
        reportData.dispositionSummary.forEach((item) => {
            map[item.disposition] = item;
        });
        return map;
    }, [reportData.dispositionSummary]);

    const totalPages = Math.max(1, Math.ceil(reportData.records.length / PAGE_SIZE));
    const pagedRecords = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return reportData.records.slice(start, start + PAGE_SIZE);
    }, [reportData.records, currentPage]);

    const groupedPageSections = useMemo(() => {
        if (filters.layout !== 'by_disposition') return [];
        const groups = [];
        const map = new Map();
        pagedRecords.forEach((row) => {
            const key = row.disposition || 'Unspecified';
            if (!map.has(key)) {
                const section = { disposition: key, items: [] };
                map.set(key, section);
                groups.push(section);
            }
            map.get(key).items.push(row);
        });
        return groups;
    }, [pagedRecords, filters.layout]);

    const statusBadgeClass = (st) => {
        if (st === 'Archived') return 'bg-slate-100 text-slate-700 border-slate-300';
        if (st === 'Cleared') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
        if (st === 'Cancelled') return 'bg-rose-50 text-rose-700 border-rose-200';
        return 'bg-amber-50 text-amber-800 border-amber-200';
    };

    const renderPatientRows = (rows, startOffset = 0) =>
        rows.map((row, idx) => {
            const dispTheme = getDispositionTheme(row.disposition);
            return (
                <tr key={row.id || row.enccode} className="hover:bg-slate-50/90 transition-colors">
                    <td className="px-4 py-2.5 text-xs font-mono tabular-nums text-slate-500">
                        {startOffset + idx + 1}
                    </td>
                    <td className="px-4 py-2.5">
                        <div className="font-bold text-sm text-slate-900 leading-snug">{row.patient_name}</div>
                        <div className="text-[11px] font-mono text-slate-500 truncate max-w-[230px]" title={row.enccode}>
                            {row.enccode}
                        </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono tabular-nums font-semibold text-slate-700 whitespace-nowrap">
                        {row.hospital_number}
                    </td>
                    <td className="px-4 py-2.5">
                        <div className="text-xs font-semibold text-teal-800">{row.room_ward}</div>
                        {(row.is_oecb || row.has_oxygen) && (
                            <div className="flex items-center gap-1 mt-0.5">
                                {row.is_oecb && (
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold leading-none">
                                        OECB
                                    </span>
                                )}
                                {row.has_oxygen && (
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200 text-[11px] font-bold leading-none">
                                        O2
                                    </span>
                                )}
                            </div>
                        )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold border ${dispTheme.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${dispTheme.dot}`} aria-hidden="true"></span>
                            <span>{row.disposition}</span>
                        </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${statusBadgeClass(row.overall_status)}`}>
                            {row.overall_status}
                        </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-slate-600 whitespace-nowrap">
                        {row.created_at_formatted}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">
                        {row.encoded_by}
                    </td>
                </tr>
            );
        });

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Report Header & Primary Actions */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 shrink-0">
                <div>
                    <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                        Routed Patients Masterlist &amp; Disposition Reports
                    </h3>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                        Alphabetical and disposition-grouped masterlist across all routed clearances.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <a
                        href={printUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors"
                        title="Open printable sheet in a new browser tab"
                    >
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <span>Open Sheet</span>
                    </a>

                    <a
                        href={csvUrl}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors"
                    >
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>Export CSV</span>
                    </a>

                    <button
                        type="button"
                        onClick={handlePrintReport}
                        disabled={loading || reportData.total === 0}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold shadow-sm transition-colors tabular-nums"
                    >
                        {isPreparingPrint ? (
                            <>
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                </svg>
                                <span>Preparing Print...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                <span>Print Report ({reportData.total.toLocaleString()})</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Organization + Filter Controls */}
            <div className="px-6 py-4 bg-white border-b border-slate-200 space-y-3.5 shrink-0">
                {/* Primary Dimension Strip: Layout & Alphabetical Direction + Search */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200" role="group" aria-label="Report organization layout">
                            <button
                                type="button"
                                onClick={() => setFilters((prev) => ({ ...prev, layout: 'alphabetical' }))}
                                aria-pressed={filters.layout === 'alphabetical'}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                                    filters.layout === 'alphabetical'
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                Alphabetical List
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilters((prev) => ({ ...prev, layout: 'by_disposition' }))}
                                aria-pressed={filters.layout === 'by_disposition'}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                                    filters.layout === 'by_disposition'
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                Grouped by Disposition
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setFilters((prev) => ({ ...prev, sort_dir: prev.sort_dir === 'asc' ? 'desc' : 'asc' }))}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-colors"
                            title="Toggle alphabetical order"
                        >
                            <svg className="w-3.5 h-3.5 text-teal-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                            </svg>
                            <span>Order: {filters.sort_dir === 'asc' ? 'A → Z' : 'Z → A'}</span>
                        </button>
                    </div>

                    {/* Search Field */}
                    <div className="relative w-full xl:w-80">
                        <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            id="report-search"
                            type="text"
                            aria-label="Search patient, hospital number, encounter, or encoder"
                            value={filters.search}
                            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                            placeholder="Search name, hospital #, encounter..."
                            className="w-full pl-9 pr-8 py-2 rounded-lg border-slate-300 text-xs focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        />
                        {filters.search && (
                            <button
                                type="button"
                                onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}
                                aria-label="Clear search query"
                                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 text-xs font-bold"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>

                {/* Dropdown Filters + Date Range */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                    <div className="lg:col-span-3">
                        <label htmlFor="report-disposition" className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                            Type of Disposition
                        </label>
                        <select
                            id="report-disposition"
                            value={filters.disposition}
                            onChange={(e) => setFilters((prev) => ({ ...prev, disposition: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                            <option value="all">All Dispositions</option>
                            {reportData.availableDispositions.map((disp) => (
                                <option key={disp} value={disp}>{disp}</option>
                            ))}
                        </select>
                    </div>

                    <div className="lg:col-span-2">
                        <label htmlFor="report-ward" className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                            Originating Ward
                        </label>
                        <select
                            id="report-ward"
                            value={filters.ward}
                            onChange={(e) => setFilters((prev) => ({ ...prev, ward: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                            <option value="all">All Wards</option>
                            {reportData.availableWards.map((w) => (
                                <option key={w} value={w}>{w}</option>
                            ))}
                        </select>
                    </div>

                    <div className="lg:col-span-3">
                        <label htmlFor="report-status" className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                            Routing Status
                        </label>
                        <select
                            id="report-status"
                            value={filters.status}
                            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                            <option value="all_routed">All Routed (Excl. Cancelled)</option>
                            <option value="all">All Records (Incl. Cancelled)</option>
                            <option value="Routing in Progress">Routing in Progress</option>
                            <option value="Cleared">Cleared (Ready for Print)</option>
                            <option value="Archived">Archived</option>
                            <option value="Cancelled">Cancelled Only</option>
                        </select>
                    </div>

                    <div className="sm:col-span-2 lg:col-span-4">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-bold uppercase text-slate-500">Routed Date Range</span>
                            <div className="flex items-center gap-1">
                                {[
                                    { id: 'all', label: 'All' },
                                    { id: 'today', label: 'Today' },
                                    { id: 'week', label: '7D' },
                                    { id: 'month', label: 'Month' },
                                ].map((preset) => (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => applyDatePreset(preset.id)}
                                        aria-pressed={activeDatePreset === preset.id}
                                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                                            activeDatePreset === preset.id
                                                ? 'bg-teal-600 text-white'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <input
                                type="date"
                                aria-label="Routed date from"
                                value={filters.date_from}
                                onChange={(e) => setFilters((prev) => ({ ...prev, date_from: e.target.value }))}
                                className="w-full px-2.5 py-1.5 rounded-lg border-slate-300 text-xs focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            />
                            <span className="text-slate-400 text-xs">–</span>
                            <input
                                type="date"
                                aria-label="Routed date to"
                                value={filters.date_to}
                                onChange={(e) => setFilters((prev) => ({ ...prev, date_to: e.target.value }))}
                                className="w-full px-2.5 py-1.5 rounded-lg border-slate-300 text-xs focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Quick A-Z Letter Index + Reset */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter alphabetically by starting letter">
                        <span className="text-[11px] font-bold uppercase text-slate-500 mr-1">Index:</span>
                        <button
                            type="button"
                            onClick={() => setFilters((prev) => ({ ...prev, starts_with: '' }))}
                            aria-pressed={!filters.starts_with}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                                !filters.starts_with
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            All
                        </button>
                        {ALPHABET.map((letter) => {
                            const isSelected = filters.starts_with === letter;
                            return (
                                <button
                                    key={letter}
                                    type="button"
                                    onClick={() => setFilters((prev) => ({
                                        ...prev,
                                        starts_with: isSelected ? '' : letter,
                                    }))}
                                    aria-pressed={isSelected}
                                    className={`w-6 h-6 rounded text-[11px] font-bold font-mono transition-colors flex items-center justify-center ${
                                        isSelected
                                            ? 'bg-teal-600 text-white shadow-sm'
                                            : 'text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    {letter}
                                </button>
                            );
                        })}
                    </div>

                    {hasNonDefaultFilters && (
                        <button
                            type="button"
                            onClick={resetAllFilters}
                            className="text-xs font-bold text-teal-700 hover:text-teal-900 underline shrink-0"
                        >
                            Reset All Filters
                        </button>
                    )}
                </div>

                {/* Disposition Distribution Bar & Clickable Breakdown */}
                {reportData.dispositionSummary.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex gap-px" aria-hidden="true">
                            {reportData.dispositionSummary.map((item) => {
                                const theme = getDispositionTheme(item.disposition);
                                return (
                                    <div
                                        key={item.disposition}
                                        className={`${theme.bar} h-full transition-all duration-300`}
                                        style={{ width: `${Math.max(item.percentage, 0.5)}%` }}
                                        title={`${item.disposition}: ${item.count.toLocaleString()} (${item.percentage}%)`}
                                    />
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setFilters((prev) => ({ ...prev, disposition: 'all' }))}
                                aria-pressed={filters.disposition === 'all'}
                                className={`px-2.5 py-1 rounded-lg border text-xs font-bold tabular-nums transition-colors ${
                                    filters.disposition === 'all'
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                All ({reportData.total.toLocaleString()})
                            </button>
                            {reportData.dispositionSummary.map((item) => {
                                const isActive = filters.disposition.toLowerCase() === item.disposition.toLowerCase();
                                const theme = getDispositionTheme(item.disposition);
                                return (
                                    <button
                                        key={item.disposition}
                                        type="button"
                                        onClick={() => setFilters((prev) => ({
                                            ...prev,
                                            disposition: isActive ? 'all' : item.disposition,
                                        }))}
                                        aria-pressed={isActive}
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold tabular-nums transition-colors ${
                                            isActive
                                                ? 'bg-teal-600 text-white border-teal-700'
                                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : theme.dot}`} aria-hidden="true"></span>
                                        <span>{item.disposition}</span>
                                        <span className={isActive ? 'text-teal-100' : 'text-slate-500'}>
                                            {item.count.toLocaleString()} ({item.percentage}%)
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div role="alert" className="mx-6 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 flex items-center justify-between gap-3">
                    <span>{error}</span>
                    <button
                        type="button"
                        onClick={() => fetchReports(filters)}
                        className="text-rose-800 underline font-bold shrink-0"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Table Preview */}
            <div className="flex-1 overflow-y-auto bg-white">
                {loading ? (
                    <div className="divide-y divide-slate-100" aria-busy="true" aria-label="Loading routed patient records">
                        {Array.from({ length: 8 }).map((_, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center animate-pulse motion-reduce:animate-none">
                                <div className="col-span-1 h-3 bg-slate-200 rounded w-6" />
                                <div className="col-span-3 space-y-1.5">
                                    <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                                    <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                                </div>
                                <div className="col-span-2 h-3 bg-slate-200 rounded w-24" />
                                <div className="col-span-2 h-3 bg-slate-200 rounded w-24" />
                                <div className="col-span-2 h-5 bg-slate-100 rounded w-20" />
                                <div className="col-span-2 h-3 bg-slate-100 rounded w-28" />
                            </div>
                        ))}
                    </div>
                ) : reportData.records.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-16 text-center text-slate-500">
                        <p className="text-sm font-bold text-slate-800">No routed patients match the active filters.</p>
                        <p className="text-xs text-slate-500 mt-1">
                            Adjust the date range, starting letter, disposition type, or ward to broaden results.
                        </p>
                        {hasNonDefaultFilters && (
                            <button
                                type="button"
                                onClick={resetAllFilters}
                                className="mt-3 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700"
                            >
                                Reset All Filters
                            </button>
                        )}
                    </div>
                ) : filters.layout === 'by_disposition' ? (
                    <div className="divide-y divide-slate-200">
                        {groupedPageSections.map((group) => {
                            const totalInfo = dispositionTotalsLookup[group.disposition];
                            const dispTheme = getDispositionTheme(group.disposition);
                            return (
                                <div key={group.disposition}>
                                    <div className="px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-10">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2.5 h-2.5 rounded-full ${dispTheme.dot}`} aria-hidden="true"></span>
                                            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                                                Disposition: {group.disposition}
                                            </span>
                                        </div>
                                        <span className="text-xs font-mono tabular-nums font-bold text-slate-700">
                                            {totalInfo
                                                ? `${totalInfo.count.toLocaleString()} total (${totalInfo.percentage}%) • ${group.items.length} on page`
                                                : `${group.items.length} on page`}
                                        </span>
                                    </div>
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                                                <th className="px-4 py-2.5 w-14">#</th>
                                                <th className="px-4 py-2.5">Patient Name ({filters.sort_dir === 'desc' ? 'Z–A' : 'A–Z'})</th>
                                                <th className="px-4 py-2.5">Hospital #</th>
                                                <th className="px-4 py-2.5">Ward</th>
                                                <th className="px-4 py-2.5">Disposition</th>
                                                <th className="px-4 py-2.5">Status</th>
                                                <th className="px-4 py-2.5">Routed Date</th>
                                                <th className="px-4 py-2.5">Encoded By</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {renderPatientRows(group.items, 0)}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm shadow-sm z-10">
                            <tr className="border-b border-slate-200 text-[11px] font-bold uppercase text-slate-600">
                                <th className="px-4 py-3 w-14">#</th>
                                <th className="px-4 py-3">Patient Name ({filters.sort_dir === 'desc' ? 'Z–A' : 'A–Z'})</th>
                                <th className="px-4 py-3">Hospital #</th>
                                <th className="px-4 py-3">Originating Ward</th>
                                <th className="px-4 py-3">Disposition</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Routed Date</th>
                                <th className="px-4 py-3">Encoded By</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {renderPatientRows(pagedRecords, (currentPage - 1) * PAGE_SIZE)}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination Footer */}
            {reportData.records.length > 0 && (
                <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600 font-medium tabular-nums shrink-0">
                    <span>
                        Previewing <strong>{((currentPage - 1) * PAGE_SIZE + 1).toLocaleString()}</strong> to{' '}
                        <strong>{Math.min(currentPage * PAGE_SIZE, reportData.total).toLocaleString()}</strong> of{' '}
                        <strong>{reportData.total.toLocaleString()}</strong> records (Print &amp; CSV include all {reportData.total.toLocaleString()} records)
                    </span>
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
                </div>
            )}

            {/* Hidden iframe triggers native browser print dialog directly over the dashboard */}
            {printJob && (
                <iframe
                    key={printJob.key}
                    src={printJob.url}
                    onLoad={() => {
                        setTimeout(() => setIsPreparingPrint(false), 700);
                    }}
                    style={{
                        position: 'fixed',
                        top: '-10000px',
                        left: '-10000px',
                        width: '210mm',
                        height: '297mm',
                        border: 'none',
                    }}
                    title="Routed Patients Report Print Frame"
                />
            )}
        </div>
    );
}
