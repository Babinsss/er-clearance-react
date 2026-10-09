import React, { useEffect } from 'react';
import { Head, usePage } from '@inertiajs/react';

export default function PrintF07({ transaction = {}, logs = [] }) {
    const { auth } = usePage().props;
    
    useEffect(() => {
        setTimeout(() => {
            window.focus(); 
            window.print();
        }, 800); 
    }, []);

    const getSignatory = (deptName) => {
        const searchDept = deptName.replace(' Unit', '').toLowerCase();
        const log = logs.find(l => (l.department || '').toLowerCase().includes(searchDept));
        
        return log ? { 
            name: log.name, 
            time: new Date(log.created_at).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }) 
        } : null;
    };

    const timeReceived = transaction?.created_at 
        ? new Date(transaction.created_at).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })
        : '';

    const getPrintDepartments = () => {
        const base = ['CSR', 'Radiology', 'Laboratory', 'Pharmacy', 'Cardio Pulmo'];
        const wardStr = transaction?.room_ward || '';
        
        if (['Ortho Ward', 'Ortho', 'Surgical Ward', 'Surgical', 'OB Ward', 'OB'].includes(wardStr)) {
            return [...base, 'OR/LR/DR'];
        }
        if (['Dialysis Unit', 'Dialysis'].includes(wardStr)) {
            return [...base, 'CKD'];
        }
        return base;
    };

    const printDepartments = getPrintDepartments();
    const dispositions = ['Improved', 'HAMA', 'Transferred', 'Died', 'Absconded'];
    const rowClass = printDepartments.length > 5 ? 'h-9 py-1' : 'h-11 py-2.5';

    // STAMP LOGIC
    const isOecb = Boolean(transaction?.is_oecb);
    const stampColor = isOecb ? '#e11d48' : '#64748b'; // Rose red for OECB, Slate gray for Non-OECB
    const stampText = isOecb ? 'OECB PATIENT' : 'NON-OECB';

    return (
        <div className="bg-slate-200 print:bg-white min-h-screen font-serif text-black flex flex-col items-center p-4 print:p-0">
            <Head title={`Clearance Slip - RMH-BCS-F07 - ${transaction?.patient_name}`} />

            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page { size: 8.5in 5.5in landscape; margin: 0.15in; }
                    html, body, #app, [data-page] { 
                        background-color: #ffffff !important; 
                        -webkit-print-color-adjust: exact !important; 
                        print-color-adjust: exact !important; 
                        margin: 0; 
                        padding: 0; 
                    }
                    * { box-shadow: none !important; }
                    .no-print { display: none !important; }
                }
            `}} />

            <div className="no-print fixed top-4 right-4 z-50 flex space-x-2">
                <button onClick={() => window.close()} className="bg-white hover:bg-slate-100 text-slate-800 font-sans font-bold py-2 px-4 rounded-lg shadow-sm border border-slate-300 transition-colors">
                    Close Tab
                </button>
                <button onClick={() => { window.focus(); window.print(); }} className="bg-teal-700 hover:bg-teal-800 text-white font-sans font-bold py-2 px-6 rounded-lg shadow-md flex items-center space-x-2 border border-teal-800 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                    <span>Print Form F07 (Landscape)</span>
                </button>
            </div>

            <div className="bg-white print:bg-white w-full max-w-[800px] border border-black p-1 shadow-xl print:shadow-none text-[12px] leading-tight relative mt-16 print:mt-0">
                <div className="border border-black flex flex-col">

                    <div className="flex border-b border-black h-16 shrink-0">
                        <div className="w-[15%] border-r border-black flex justify-center items-center p-1 relative">
                            <img src="/images/capiz.jpg" alt="Capiz Logo" className="h-14 w-14 object-contain" onError={(e) => { e.target.style.display='none'; e.target.nextElementSibling.style.display='flex'; }} />
                        </div>
                        <div className="w-[60%] flex flex-col">
                            <div className="h-2/3 border-b border-black relative flex items-center justify-center">
                                <span className="absolute top-1 left-2 text-[10px]">Document Title:</span>
                                <h1 className="text-xl font-bold tracking-widest mt-1">CLEARANCE SLIP</h1>
                            </div>
                            <div className="h-1/3 flex items-center px-2 text-[11px]">
                                Document No: RMH - BCS - F07
                            </div>
                        </div>
                        <div className="w-[25%] border-l border-black flex">
                            <div className="w-[45%] border-r border-black flex flex-col justify-center items-center text-[10px]">
                                <span>Rev No</span>
                                <span className="font-bold text-[14px]">01</span>
                            </div>
                            <div className="w-[55%] flex justify-center items-center p-1 relative">
                                <img src="/images/rmph.jpg" alt="RMPH Logo" className="h-12 w-12 object-contain" onError={(e) => { e.target.style.display='none'; e.target.nextElementSibling.style.display='flex'; }} />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end px-3 pt-2 mb-1 shrink-0">
                        <span className="mr-2">Date:</span>
                        <span className="border-b border-black w-40 text-center text-sm font-semibold">
                            {transaction?.updated_at ? new Date(transaction.updated_at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila' }) : ''}
                        </span>
                    </div>

                    <div className="px-3 pb-2 border-b border-black shrink-0 relative">
                        
                        {/* --- OECB STAMP OVERLAY --- */}
                        <div 
                            className="absolute z-10 font-black text-xl uppercase tracking-widest px-3 py-0.5 transform -rotate-12 rounded-sm shadow-sm"
                            style={{ 
                                top: '5px', 
                                right: '12%', 
                                border: `3px solid ${stampColor}`, 
                                color: stampColor,
                                backgroundColor: 'rgba(255, 255, 255, 0.85)',
                                WebkitPrintColorAdjust: 'exact',
                                printColorAdjust: 'exact'
                            }}
                        >
                            {stampText}
                        </div>

                        <div className="flex items-end mb-3 gap-4">
                            <div className="flex flex-1 items-end">
                                <span className="mr-2 whitespace-nowrap text-[12px]">Name of Patient:</span>
                                <span className="border-b border-black flex-grow font-bold uppercase text-[13px] px-2">{transaction?.patient_name}</span>
                            </div>
                            <div className="flex w-[35%] items-end">
                                <span className="mr-2 whitespace-nowrap text-[12px]">Hospital No:</span>
                                <span className="border-b border-black flex-grow font-bold text-center uppercase text-[13px]">{transaction?.hospital_number || 'N/A'}</span>
                            </div>
                        </div>
                        
                        <div className="flex items-end mb-3 gap-6">
                            <div className="flex flex-1 items-end">
                                <span className="mr-2 whitespace-nowrap">Date & Time of Arrival:</span>
                                <span className="border-b border-black flex-grow px-2 font-bold text-center text-[12px] tracking-wide">
                                    {transaction?.arrival_datetime ? new Date(transaction.arrival_datetime).toLocaleString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit' }) : ''}
                                </span>
                            </div>
                            <div className="flex w-1/3 items-end">
                                <span className="mr-2 whitespace-nowrap">Room/Ward:</span>
                                <span className="border-b border-black flex-grow text-center uppercase font-bold">{transaction?.room_ward || ''}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className="mr-2">Disposition:</span>
                            {dispositions.map((disp, idx) => (
                                <label key={idx} className="flex items-center gap-1">
                                    <div className="w-4 h-4 border border-black flex items-center justify-center bg-white relative">
                                        {(transaction?.disposition === disp) && (
                                            <svg className="w-5 h-5 absolute text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ top: '-2px', left: '-1px' }}>
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                                            </svg>
                                        )}
                                    </div>
                                    <span>{disp}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="shrink-0">
                        <div className="px-2 py-1 font-medium italic">
                            Hospital Charges billed to the patient as verified by:
                        </div>
                        
                        <table className="w-full border-t border-black text-center border-collapse">
                            <thead>
                                <tr className="border-b border-black text-[12px] bg-gray-50 print:bg-white">
                                    <th className="border-r border-black font-bold py-1.5 w-[36%] text-left pl-2">Department</th>
                                    <th className="border-r border-black font-bold py-1.5 w-[32%]">Printed Name</th>
                                    <th className="border-r border-black font-bold py-1.5 w-[16%]">Time Received</th>
                                    <th className="font-bold py-1.5 w-[16%]">Time Released</th>
                                </tr>
                            </thead>
                            <tbody className="text-[11px]">
                                {printDepartments.map((deptName, idx) => {
                                    const sig = getSignatory(deptName);
                                    return (
                                        <tr key={idx} className={`border-b border-black ${rowClass}`}>
                                            <td className="border-r border-black text-left px-2 font-bold leading-tight uppercase tracking-wider">{deptName}</td>
                                            
                                            {sig ? (
                                                <>
                                                    <td className="border-r border-black font-sans font-bold text-[10px] uppercase tracking-wide">{sig.name}</td>
                                                    <td className="border-r border-black font-sans font-semibold text-[10px]">{timeReceived}</td>
                                                    <td className="font-sans font-semibold text-[10px]">{sig.time}</td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="border-r border-black"></td>
                                                    <td className="border-r border-black"></td>
                                                    <td></td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="px-4 pb-3 mt-4">
                        <div className="flex justify-between mb-4">
                            {/* LEFT SIDE: ROUTED BY NURSE */}
                            <div className="w-[45%]">
                                <table className="w-full">
                                    <tbody>
                                        <tr>
                                            <td className="whitespace-nowrap text-[12px] pr-2 align-bottom pb-1 w-[1%]">Routed by:</td>
                                            <td className="border-b border-black align-bottom w-auto text-center font-bold uppercase tracking-wide text-[12px] px-2 text-slate-800">
                                                {transaction?.encoded_by || ''}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td></td>
                                            <td className="text-center italic text-[11px] pt-1 pb-4">Ward / ER Nurse</td>
                                        </tr>
                                        <tr>
                                            <td className="whitespace-nowrap text-[12px] pr-2 align-bottom pb-1">Time Routed:</td>
                                            <td className="border-b border-black align-bottom w-auto text-center font-bold tracking-wide text-[12px]">
                                                {timeReceived}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* RIGHT SIDE: RECEIVED BY BILLING */}
                            <div className="w-[45%]">
                                <table className="w-full">
                                    <tbody>
                                        <tr>
                                            <td className="whitespace-nowrap text-[12px] pr-2 align-bottom pb-1 w-[1%]">Received by:</td>
                                            <td className="border-b border-black align-bottom w-auto text-center font-bold uppercase tracking-wide text-[12px] px-2 text-slate-800">
                                                {auth?.user?.department === 'Billing & Claims' ? auth?.user?.name : ''}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td></td>
                                            <td className="text-center italic text-[11px] pt-1 pb-4">Billing and Claims Clerk</td>
                                        </tr>
                                        <tr>
                                            <td className="whitespace-nowrap text-[12px] pr-2 align-bottom pb-1">Time Received:</td>
                                            <td className="border-b border-black align-bottom w-auto text-center font-bold tracking-wide text-[12px]">
                                                {auth?.user?.department === 'Billing & Claims' ? new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }) : ''}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="text-[11px]">
                            <span className="italic">Note: &nbsp; Accomplish in two (2) copies. 1 copy for Billing and Claims Section. 1 copy as attachment to Patient's Chart.</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}