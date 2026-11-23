import React, { useEffect, useMemo } from 'react';
import { Head, Link, usePage } from '@inertiajs/react';

export default function PrintRoutedReport({
    records = [],
    total = 0,
    dispositionSummary = [],
    categorySummary = [],
    filters = {},
    generatedAt = '',
}) {
    const { auth } = usePage().props;

    useEffect(() => {
        const timer = setTimeout(() => {
            window.focus();
            window.print();
        }, 600);
        return () => clearTimeout(timer);
    }, []);

    const layout = ['by_disposition', 'by_category'].includes(filters.layout) ? filters.layout : 'alphabetical';
    const sortDir = filters.sort_dir === 'desc' ? 'desc' : 'asc';

    const groupedSections = useMemo(() => {
        if (layout !== 'by_disposition' && layout !== 'by_category') return [];
        const groups = [];
        const map = new Map();
        records.forEach((row) => {
            const key = layout === 'by_category'
                ? (row.classification || (row.is_oecb ? 'OECB' : row.is_for_procedure ? 'For Procedure' : 'Non-OECB'))
                : (row.disposition || 'Unspecified');
            if (!map.has(key)) {
                const section = { key, title: key, items: [] };
                map.set(key, section);
                groups.push(section);
            }
            map.get(key).items.push(row);
        });
        return groups;
    }, [records, layout]);

    const buildSwitchLayoutUrl = (nextLayout) => {
        const params = new URLSearchParams();
        if (filters.date_from) params.set('date_from', filters.date_from);
        if (filters.date_to) params.set('date_to', filters.date_to);
        if (filters.disposition && filters.disposition !== 'all') params.set('disposition', filters.disposition);
        if (filters.ward && filters.ward !== 'all') params.set('ward', filters.ward);
        if (filters.status) params.set('status', filters.status);
        if (filters.category && filters.category !== 'all') params.set('category', filters.category);
        if (filters.search) params.set('search', filters.search);
        if (filters.starts_with) params.set('starts_with', filters.starts_with);
        params.set('layout', nextLayout);
        params.set('sort_dir', sortDir);
        return `/billing/reports/print?${params.toString()}`;
    };

    const categoryFilterLabel = {
        all: 'All Categories (OECB, Non-OECB & Procedure)',
        oecb: 'OECB Only',
        non_oecb: 'Non-OECB Only',
        for_procedure: 'For Procedure Only',
    }[filters.category] || 'All Categories';

    const statusLabel = {
        all_routed: 'All Routed (Excl. Cancelled)',
        all: 'All Records (Incl. Cancelled)',
        'Routing in Progress': 'Routing in Progress',
        Cleared: 'Cleared',
        Archived: 'Archived',
        Cancelled: 'Cancelled',
    }[filters.status] || filters.status || 'All Routed';

    const dateRangeLabel = (filters.date_from || filters.date_to)
        ? `${filters.date_from || 'Start'} to ${filters.date_to || 'Present'}`
        : 'All Dates';

    const renderTable = (rows) => (
        <table className="w-full border-collapse text-left text-[11px]">
            <thead>
                <tr className="bg-slate-100 border border-slate-400 text-slate-800 uppercase font-bold">
                    <th className="border border-slate-300 px-2 py-1.5 w-10 text-center">#</th>
                    <th className="border border-slate-300 px-2 py-1.5">Patient Name ({sortDir === 'desc' ? 'Z–A' : 'A–Z'})</th>
                    <th className="border border-slate-300 px-2 py-1.5">Hospital #</th>
                    <th className="border border-slate-300 px-2 py-1.5">Ward</th>
                    <th className="border border-slate-300 px-2 py-1.5">Classification</th>
                    <th className="border border-slate-300 px-2 py-1.5">Disposition</th>
                    <th className="border border-slate-300 px-2 py-1.5">Status</th>
                    <th className="border border-slate-300 px-2 py-1.5">Routed Date &amp; Time</th>
                    <th className="border border-slate-300 px-2 py-1.5">Encoded By</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row, idx) => {
                    const classification = row.classification || (row.is_oecb ? 'OECB' : row.is_for_procedure ? 'For Procedure' : 'Non-OECB');
                    return (
                        <tr key={row.id || row.enccode} className="break-inside-avoid">
                            <td className="border border-slate-300 px-2 py-1 text-center font-mono tabular-nums">{idx + 1}</td>
                            <td className="border border-slate-300 px-2 py-1 font-bold text-slate-900">{row.patient_name}</td>
                            <td className="border border-slate-300 px-2 py-1 font-mono tabular-nums">{row.hospital_number}</td>
                            <td className="border border-slate-300 px-2 py-1">
                                {row.room_ward}
                                {row.has_oxygen && (
                                    <span className="ml-1 text-[11px] font-bold text-slate-700">(O2)</span>
                                )}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 font-semibold">
                                <span>{classification}</span>
                                {row.is_for_procedure && row.procedure_type && (
                                    <span className="block text-[10px] font-normal text-slate-700">{row.procedure_type}</span>
                                )}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 font-semibold">{row.disposition}</td>
                            <td className="border border-slate-300 px-2 py-1">{row.overall_status}</td>
                            <td className="border border-slate-300 px-2 py-1 tabular-nums whitespace-nowrap">{row.created_at_formatted}</td>
                            <td className="border border-slate-300 px-2 py-1">{row.encoded_by}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );

    return (
        <div className="min-h-screen bg-slate-200 print:bg-white py-6 print:py-0 px-4 print:px-0 text-slate-900 font-sans">
            <Head title="Routed Patients Masterlist Report" />

            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page { size: A4 portrait; margin: 12mm; }
                    html, body {
                        background: #ffffff !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    thead { display: table-header-group; }
                    tr { break-inside: avoid; page-break-inside: avoid; }
                }
            ` }} />

            {/* Screen Action Toolbar */}
            <div className="print:hidden max-w-5xl mx-auto mb-4 bg-white border border-slate-300 rounded-xl p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        href="/billing"
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                        Back to Portal
                    </Link>
                    <Link
                        href={buildSwitchLayoutUrl('alphabetical')}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${
                            layout === 'alphabetical'
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        Alphabetical Masterlist
                    </Link>
                    <Link
                        href={buildSwitchLayoutUrl('by_disposition')}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${
                            layout === 'by_disposition'
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        Grouped by Disposition
                    </Link>
                    <Link
                        href={buildSwitchLayoutUrl('by_category')}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${
                            layout === 'by_category'
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        Grouped by OECB / Procedure
                    </Link>
                </div>

                <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    <span>Print Report</span>
                </button>
            </div>

            {/* Printable Report Sheet */}
            <div className="max-w-5xl mx-auto bg-white border border-slate-300 print:border-0 shadow-md print:shadow-none p-8 print:p-0">
                {/* Official Hospital Header */}
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-14 h-14 flex items-center justify-center">
                            <img
                                src="/images/capiz.jpg"
                                alt="Province of Capiz Seal"
                                className="w-full h-full object-contain"
                                onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'inline-block'; }}
                            />
                            <span className="hidden text-[11px] font-bold text-slate-700 text-center">CAPIZ</span>
                        </div>
                        <div className="w-14 h-14 flex items-center justify-center">
                            <img
                                src="/images/rmph.jpg"
                                alt="RMPH Seal"
                                className="w-full h-full object-contain"
                                onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'inline-block'; }}
                            />
                            <span className="hidden text-[11px] font-bold text-rose-700 text-center">RMPH</span>
                        </div>
                    </div>

                    <div className="text-center flex-1 px-4">
                        <p className="text-[11px] uppercase tracking-wider text-slate-600 font-semibold">
                            Republic of the Philippines • Province of Capiz
                        </p>
                        <h1 className="text-base font-extrabold uppercase tracking-tight text-slate-900">
                            Roxas Memorial Provincial Hospital
                        </h1>
                        <p className="text-xs font-bold uppercase text-teal-800 mt-0.5">
                            Billing &amp; Claims Section — Routed Patients Masterlist Report
                        </p>
                    </div>

                    <div className="text-right text-[11px] text-slate-600 shrink-0">
                        <div className="font-bold text-slate-800">Total Records</div>
                        <div className="text-lg font-extrabold font-mono text-slate-900">{total.toLocaleString()}</div>
                    </div>
                </div>

                {/* Metadata & Applied Filters */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-50 border border-slate-300 p-2.5 mb-4">
                    <div>
                        <span className="font-bold text-slate-600 uppercase">Date Range: </span>
                        <span className="font-semibold text-slate-900">{dateRangeLabel}</span>
                    </div>
                    <div>
                        <span className="font-bold text-slate-600 uppercase">Disposition: </span>
                        <span className="font-semibold text-slate-900">
                            {filters.disposition && filters.disposition !== 'all' ? filters.disposition : 'All Dispositions'}
                        </span>
                    </div>
                    <div>
                        <span className="font-bold text-slate-600 uppercase">Ward: </span>
                        <span className="font-semibold text-slate-900">
                            {filters.ward && filters.ward !== 'all' ? filters.ward : 'All Wards'}
                        </span>
                    </div>
                    <div>
                        <span className="font-bold text-slate-600 uppercase">Status Scope: </span>
                        <span className="font-semibold text-slate-900">{statusLabel}</span>
                    </div>
                    <div>
                        <span className="font-bold text-slate-600 uppercase">Classification: </span>
                        <span className="font-semibold text-slate-900">{categoryFilterLabel}</span>
                    </div>
                    <div>
                        <span className="font-bold text-slate-600 uppercase">Report Layout: </span>
                        <span className="font-semibold text-slate-900">
                            {layout === 'by_disposition'
                                ? 'Grouped by Disposition (A–Z)'
                                : layout === 'by_category'
                                    ? 'Grouped by OECB / Non-OECB / For Procedure'
                                    : `Alphabetical (${sortDir === 'desc' ? 'Z–A' : 'A–Z'})`}
                            {filters.starts_with ? ` • Starts with "${filters.starts_with}"` : ''}
                        </span>
                    </div>
                    <div>
                        <span className="font-bold text-slate-600 uppercase">Generated: </span>
                        <span className="font-semibold text-slate-900">{generatedAt}</span>
                    </div>
                    <div>
                        <span className="font-bold text-slate-600 uppercase">Prepared By: </span>
                        <span className="font-semibold text-slate-900">{auth?.user?.name || 'Head of Billing & Claims'}</span>
                    </div>
                </div>

                {/* Classification & Disposition Breakdown Summaries */}
                {(categorySummary.length > 0 || dispositionSummary.length > 0) && (
                    <div className="mb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {categorySummary.length > 0 && (
                            <div>
                                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 mb-1.5">
                                    Summary by OECB / Non-OECB / Procedure
                                </h2>
                                <table className="w-full border-collapse text-left text-[11px]">
                                    <thead>
                                        <tr className="bg-slate-100 border border-slate-400 font-bold uppercase text-slate-800">
                                            <th className="border border-slate-300 px-3 py-1.5">Classification</th>
                                            <th className="border border-slate-300 px-3 py-1.5 text-right w-24">Count</th>
                                            <th className="border border-slate-300 px-3 py-1.5 text-right w-20">% Share</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {categorySummary.map((item) => (
                                            <tr key={item.key}>
                                                <td className="border border-slate-300 px-3 py-1 font-semibold">{item.label}</td>
                                                <td className="border border-slate-300 px-3 py-1 text-right font-mono font-bold tabular-nums">{item.count.toLocaleString()}</td>
                                                <td className="border border-slate-300 px-3 py-1 text-right font-mono tabular-nums">{item.percentage}%</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-slate-50 font-extrabold">
                                            <td className="border border-slate-300 px-3 py-1.5">Total Routed Patients</td>
                                            <td className="border border-slate-300 px-3 py-1.5 text-right font-mono tabular-nums">{total.toLocaleString()}</td>
                                            <td className="border border-slate-300 px-3 py-1.5 text-right font-mono tabular-nums">100%</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {dispositionSummary.length > 0 && (
                            <div>
                                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 mb-1.5">
                                    Summary by Type of Disposition
                                </h2>
                                <table className="w-full border-collapse text-left text-[11px]">
                                    <thead>
                                        <tr className="bg-slate-100 border border-slate-400 font-bold uppercase text-slate-800">
                                            <th className="border border-slate-300 px-3 py-1.5">Type of Disposition</th>
                                            <th className="border border-slate-300 px-3 py-1.5 text-right w-24">Count</th>
                                            <th className="border border-slate-300 px-3 py-1.5 text-right w-20">% Share</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dispositionSummary.map((item) => (
                                            <tr key={item.disposition}>
                                                <td className="border border-slate-300 px-3 py-1 font-semibold">{item.disposition}</td>
                                                <td className="border border-slate-300 px-3 py-1 text-right font-mono font-bold tabular-nums">{item.count.toLocaleString()}</td>
                                                <td className="border border-slate-300 px-3 py-1 text-right font-mono tabular-nums">{item.percentage}%</td>
                                            </tr>
                                        ))}
                                        <tr className="bg-slate-50 font-extrabold">
                                            <td className="border border-slate-300 px-3 py-1.5">Total Routed Patients</td>
                                            <td className="border border-slate-300 px-3 py-1.5 text-right font-mono tabular-nums">{total.toLocaleString()}</td>
                                            <td className="border border-slate-300 px-3 py-1.5 text-right font-mono tabular-nums">100%</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Patient Masterlist */}
                {records.length === 0 ? (
                    <div className="border border-slate-300 p-8 text-center text-xs text-slate-600">
                        No routed patient records match the selected filters.
                    </div>
                ) : (layout === 'by_disposition' || layout === 'by_category') ? (
                    <div className="space-y-5">
                        {groupedSections.map((group) => (
                            <section key={group.key}>
                                <div className="bg-slate-800 text-white px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider flex justify-between items-center">
                                    <span>
                                        {layout === 'by_category' ? `Classification: ${group.title}` : `Disposition: ${group.title}`}
                                    </span>
                                    <span className="font-mono tabular-nums">{group.items.length.toLocaleString()} patients</span>
                                </div>
                                {renderTable(group.items)}
                            </section>
                        ))}
                    </div>
                ) : (
                    <div>
                        <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 mb-1.5">
                            Alphabetical Patient Masterlist ({sortDir === 'desc' ? 'Z–A' : 'A–Z'})
                        </h2>
                        {renderTable(records)}
                    </div>
                )}

                {/* Official Signatory Block */}
                <div className="mt-8 pt-6 border-t border-slate-300 grid grid-cols-2 gap-10 text-xs break-inside-avoid">
                    <div>
                        <p className="text-[11px] text-slate-500 uppercase font-bold mb-6">Prepared / Generated By:</p>
                        <div className="border-b border-slate-800 w-64 pb-0.5 font-bold uppercase text-slate-900">
                            {auth?.user?.name || 'Head of Billing & Claims'}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">{auth?.user?.department || 'Head of Billing & Claims'}</p>
                    </div>
                    <div className="flex flex-col items-end">
                        <div className="w-64">
                            <p className="text-[11px] text-slate-500 uppercase font-bold mb-6">Noted / Verified By:</p>
                            <div className="border-b border-slate-800 w-64 pb-0.5 font-bold uppercase text-slate-900">
                                &nbsp;
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5">Head, Billing &amp; Claims Section</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
