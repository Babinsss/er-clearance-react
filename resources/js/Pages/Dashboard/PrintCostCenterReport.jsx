import React, { useEffect, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';

export default function PrintCostCenterReport({
    department = '',
    departmentSchedule = null,
    reportDate = '',
    reportDateFormatted = '',
    generatedAt = '',
    total = 0,
    records = [],
}) {
    const { auth } = usePage().props;
    const [selectedDate, setSelectedDate] = useState(reportDate);

    useEffect(() => {
        const timer = setTimeout(() => {
            window.focus();
            window.print();
        }, 600);
        return () => clearTimeout(timer);
    }, []);

    const handleDateChange = (nextDate) => {
        setSelectedDate(nextDate);
        if (nextDate) {
            router.get('/cost-center/reports/print', { date: nextDate });
        }
    };

    return (
        <div className="min-h-screen bg-slate-200 print:bg-white py-6 print:py-0 px-4 print:px-0 text-slate-900 font-sans">
            <Head title={`${department} — Daily Completed Clearance Report`} />

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
                <div className="flex flex-wrap items-center gap-3">
                    <Link
                        href="/"
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                        Back to Portal
                    </Link>

                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <span>Report Date:</span>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => handleDateChange(e.target.value)}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        />
                    </label>
                </div>

                <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors"
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
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    if (e.currentTarget.nextElementSibling) {
                                        e.currentTarget.nextElementSibling.style.display = 'inline-block';
                                    }
                                }}
                            />
                            <span className="hidden text-[11px] font-bold text-slate-700 text-center">CAPIZ</span>
                        </div>
                        <div className="w-14 h-14 flex items-center justify-center">
                            <img
                                src="/images/rmph.jpg"
                                alt="RMPH Seal"
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    if (e.currentTarget.nextElementSibling) {
                                        e.currentTarget.nextElementSibling.style.display = 'inline-block';
                                    }
                                }}
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
                            {department} — Daily Completed Clearance History Report
                        </p>
                    </div>

                    <div className="text-right text-[11px] text-slate-600 shrink-0">
                        <div className="font-bold text-slate-800">Total Cleared</div>
                        <div className="text-lg font-extrabold font-mono tabular-nums text-slate-900">
                            {total.toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Metadata Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-50 border border-slate-300 p-2.5 mb-4">
                    <div>
                        <span className="font-bold text-slate-600 uppercase">Station: </span>
                        <span className="font-semibold text-slate-900">
                            {department}
                            {departmentSchedule && departmentSchedule.is_24_7 === false && (
                                <span className="ml-1 text-[10px] font-medium text-slate-600">
                                    ({departmentSchedule.hours_label})
                                </span>
                            )}
                        </span>
                    </div>
                    <div>
                        <span className="font-bold text-slate-600 uppercase">Date Covered: </span>
                        <span className="font-semibold text-slate-900 tabular-nums">{reportDateFormatted || reportDate}</span>
                    </div>
                    <div>
                        <span className="font-bold text-slate-600 uppercase">Generated: </span>
                        <span className="font-semibold text-slate-900 tabular-nums">{generatedAt}</span>
                    </div>
                    <div>
                        <span className="font-bold text-slate-600 uppercase">Prepared By: </span>
                        <span className="font-semibold text-slate-900">{auth?.user?.name || 'Cost Center Staff'}</span>
                    </div>
                </div>

                {/* Daily Cleared Patients Table */}
                {records.length === 0 ? (
                    <div className="border border-slate-300 rounded-lg p-10 text-center text-xs text-slate-600">
                        No clearances were completed by <strong className="text-slate-800">{department}</strong> on{' '}
                        <strong className="text-slate-800">{reportDateFormatted || reportDate}</strong>.
                    </div>
                ) : (
                    <table className="w-full border-collapse text-left text-[11px]">
                        <thead>
                            <tr className="bg-slate-100 border border-slate-400 text-slate-800 uppercase font-bold">
                                <th className="border border-slate-300 px-2 py-1.5 w-9 text-center">#</th>
                                <th className="border border-slate-300 px-2 py-1.5">Patient Name</th>
                                <th className="border border-slate-300 px-2 py-1.5">Hospital #</th>
                                <th className="border border-slate-300 px-2 py-1.5">Ward</th>
                                <th className="border border-slate-300 px-2 py-1.5">Disposition</th>
                                <th className="border border-slate-300 px-2 py-1.5">Routed</th>
                                <th className="border border-slate-300 px-2 py-1.5">Cleared</th>
                                <th className="border border-slate-300 px-2 py-1.5 text-center">Turnaround</th>
                                <th className="border border-slate-300 px-2 py-1.5">Cleared By</th>
                                <th className="border border-slate-300 px-2 py-1.5">Overall</th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.map((row, idx) => (
                                <tr key={row.enccode || idx} className="break-inside-avoid">
                                    <td className="border border-slate-300 px-2 py-1 text-center font-mono tabular-nums">{idx + 1}</td>
                                    <td className="border border-slate-300 px-2 py-1 font-bold text-slate-900">
                                        <div>{row.patient_name}</div>
                                        <div className="text-[10px] font-mono font-normal text-slate-500">{row.enccode}</div>
                                    </td>
                                    <td className="border border-slate-300 px-2 py-1 font-mono tabular-nums">{row.hospital_number}</td>
                                    <td className="border border-slate-300 px-2 py-1">{row.room_ward}</td>
                                    <td className="border border-slate-300 px-2 py-1">{row.disposition}</td>
                                    <td className="border border-slate-300 px-2 py-1 tabular-nums whitespace-nowrap">{row.routed_time}</td>
                                    <td className="border border-slate-300 px-2 py-1 tabular-nums whitespace-nowrap font-semibold">{row.cleared_time}</td>
                                    <td className="border border-slate-300 px-2 py-1 text-center font-mono tabular-nums whitespace-nowrap">
                                        <div>
                                            {row.off_hours_cleared && row.turnaround_formatted === '0s'
                                                ? 'Off-hours'
                                                : row.turnaround_formatted}
                                        </div>
                                        {row.wall_turnaround_formatted && row.wall_turnaround_formatted !== row.turnaround_formatted && (
                                            <div className="text-[9px] text-slate-500">
                                                Total: {row.wall_turnaround_formatted}
                                            </div>
                                        )}
                                    </td>
                                    <td className="border border-slate-300 px-2 py-1">{row.cleared_by}</td>
                                    <td className="border border-slate-300 px-2 py-1">{row.overall_status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Signatory Footer */}
                <div className="mt-10 pt-4 grid grid-cols-2 gap-12 text-xs text-slate-700 break-inside-avoid">
                    <div>
                        <div className="font-bold uppercase text-[11px] text-slate-500 mb-8">Prepared By:</div>
                        <div className="border-t border-slate-700 pt-1 font-bold text-slate-900 uppercase">
                            {auth?.user?.name || 'Cost Center Staff'}
                        </div>
                        <div className="text-[11px] text-slate-600">{department}</div>
                    </div>
                    <div>
                        <div className="font-bold uppercase text-[11px] text-slate-500 mb-8">Noted By:</div>
                        <div className="border-t border-slate-700 pt-1 font-bold text-slate-900 uppercase">
                            Department / Section Head
                        </div>
                        <div className="text-[11px] text-slate-600">Roxas Memorial Provincial Hospital</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
