import React, { useState, useEffect } from 'react';
import { Head, router, Link, usePage } from '@inertiajs/react';
import PortalLayout from '@/Layouts/PortalLayout';

export default function Index({ enccode, labOrders = [], cardioOrders = [], radioOrders = [], pharmacyOrders = [], clearedDepartments = [] }) {
    const { auth } = usePage().props;
    const userDept = auth.user.department;
    
    const costCenters = ['Laboratory', 'Radiology', 'Pharmacy', 'Cardiopulmonary', 'CSR'];
    const isCostCenter = costCenters.includes(userDept);

    const [isLabReady, setIsLabReady] = useState(false);
    const [isCardioReady, setIsCardioReady] = useState(false);
    const [isRadioReady, setIsRadioReady] = useState(false);
    const [isPharmacyReady, setIsPharmacyReady] = useState(false);

    // --- NEW: Custom Modal States ---
    const [confirmModal, setConfirmModal] = useState({ show: false, department: null });
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        setIsLabReady(labOrders.length === 0 || labOrders.every(order => order.status === 'S'));
        setIsCardioReady(cardioOrders.length === 0 || cardioOrders.every(order => order.status === 'S'));
        setIsRadioReady(radioOrders.length === 0 || radioOrders.every(order => order.status === 'S'));
        setIsPharmacyReady(pharmacyOrders.length === 0 || pharmacyOrders.every(order => order.status === 'S'));
    }, [labOrders, cardioOrders, radioOrders, pharmacyOrders]);

    // Triggers the beautiful UI modal instead of the browser alert
    const openConfirm = (department) => {
        setConfirmModal({ show: true, department });
    };

    const closeConfirm = () => {
        if (!isProcessing) {
            setConfirmModal({ show: false, department: null });
        }
    };

    // Executes the backend clearance once confirmed
    const executeClearance = () => {
        if (!confirmModal.department) return;
        
        setIsProcessing(true); // Locks the buttons to prevent double-submits

        router.post('/clearance', {
            enccode: enccode,
            department: confirmModal.department
        }, { 
            preserveScroll: true,
            onSuccess: () => {
                setIsProcessing(false);
                setConfirmModal({ show: false, department: null });
            },
            onError: () => {
                setIsProcessing(false);
                alert("An error occurred while communicating with the server.");
            }
        });
    };

    const StatusBadge = ({ status }) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
            status === 'S' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
        }`}>
            {status === 'S' ? 'SERVED' : 'UNSERVED'}
        </span>
    );

    const DepartmentCard = ({ title, icon, colorTheme, isReady, orders, onClear }) => {
        const isAlreadyCleared = clearedDepartments.includes(title);
        
        const themes = {
            blue: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-600 focus:ring-blue-500',
            purple: 'text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-600 focus:ring-purple-500',
            red: 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-600 focus:ring-rose-500',
            teal: 'text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-600 focus:ring-teal-500',
            orange: 'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-600 focus:ring-orange-500',
        };
        const activeTheme = themes[colorTheme];
        const textColor = activeTheme.split(' ')[0];

        return (
            <div className={`relative bg-white rounded-xl shadow-sm border transition-all duration-200 ${
                isAlreadyCleared ? 'border-gray-200 opacity-75' : `border-gray-200 hover:shadow-md`
            }`}>
                <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 border-b ${isAlreadyCleared ? 'bg-gray-50 rounded-t-xl' : ''}`}>
                    <div className="flex items-center space-x-3 mb-3 sm:mb-0">
                        <div className={`p-2 rounded-lg ${isAlreadyCleared ? 'bg-gray-200 text-gray-500' : activeTheme.split(' ')[1] + ' ' + textColor}`}>
                            {icon}
                        </div>
                        <div>
                            <h2 className={`text-lg font-bold tracking-tight ${isAlreadyCleared ? 'text-gray-600' : 'text-gray-900'}`}>
                                {title}
                            </h2>
                            <p className="text-sm text-gray-500 font-medium">
                                {orders.length > 0 ? `${orders.length} Record(s)` : (title === 'CSR' ? 'Manual Verification' : 'No Records')}
                            </p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => onClear(title)}
                        disabled={!isReady || isAlreadyCleared}
                        className={`px-5 py-2.5 text-sm font-bold rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                            isAlreadyCleared 
                                ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                                : isReady 
                                    ? `bg-[#0f172a] text-white hover:bg-slate-800 hover:shadow border border-transparent focus:ring-slate-900` 
                                    : 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed'
                        }`}
                    >
                        {isAlreadyCleared 
                            ? (
                                <span className="flex items-center">
                                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                    CLEARED
                                </span>
                            ) 
                            : isReady 
                                ? `Clear ${title}` 
                                : 'Pending Results'
                        }
                    </button>
                </div>

                <div className="p-0">
                    {orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                            <svg className="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                            <span className="text-sm font-medium">No active orders</span>
                        </div>
                    ) : (
                        <ul className=" divide-y divide-gray-100">
                            {orders.map((order, index) => (
                                <li key={index} className="flex justify-between items-center py-3 px-5 hover:bg-gray-50 transition-colors">
                                    <span className={`text-sm font-medium ${isAlreadyCleared ? 'text-gray-500' : 'text-gray-800'}`}>
                                        {order.item_description}
                                    </span>
                                    <StatusBadge status={order.status} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        );
    };

    const icons = {
        lab: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>,
        rad: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
        cardio: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>,
        pharmacy: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>, 
        csr: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
    };

    return (
        <PortalLayout>
            <div className="bg-slate-50 w-full min-h-[calc(100vh-64px)] pb-12 font-sans relative">
                <Head title={`Clearance - ${enccode}`} />
                
                {/* --- CUSTOM CONFIRMATION MODAL --- */}
                {confirmModal.show && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-opacity">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col transform transition-all animate-fade-in-up">
                            
                            {/* Modal Header */}
                            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
                                <div>
                                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-wide">
                                        Confirm Clearance
                                    </h3>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">Final Verification Step</p>
                                </div>
                                <button onClick={closeConfirm} disabled={isProcessing} className="text-slate-400 hover:text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-full p-1.5 transition-colors disabled:opacity-50">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="p-8 bg-white text-center">
                                <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
                                    <svg className="w-8 h-8 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                </div>
                                <p className="text-slate-700 font-medium text-base leading-relaxed">
                                    Are you sure you want to verify and clear <span className="font-extrabold text-slate-900">{confirmModal.department}</span>?
                                    <br/>
                                    <span className="text-sm text-slate-500 mt-3 inline-block bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                        This action will be permanently logged under your name.
                                    </span>
                                </p>
                            </div>

                            {/* Modal Footer */}
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-3 shrink-0">
                                <button 
                                    onClick={closeConfirm} 
                                    disabled={isProcessing} 
                                    className="px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                
                                <button 
                                    onClick={executeClearance} 
                                    disabled={isProcessing} 
                                    className="px-5 py-2.5 font-bold rounded-lg text-sm transition-all shadow-sm flex items-center justify-center min-w-[160px] bg-teal-600 hover:bg-teal-700 text-white border border-teal-700 hover:shadow-md disabled:opacity-75 disabled:cursor-wait"
                                >
                                    {isProcessing ? (
                                        <span className="flex items-center space-x-2">
                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            <span>Processing...</span>
                                        </span>
                                    ) : (
                                        'Yes, Clear Station'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* --- END CUSTOM MODAL --- */}

                <div className="bg-white border-b border-gray-200 shadow-sm mb-8 px-8 py-6">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-4">
                            <Link href="/" className="inline-flex items-center text-sm font-semibold text-slate-500 hover:text-teal-600 transition-colors">
                                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                Back to Dashboard
                            </Link>
                        </div>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-end">
                            <div>
                                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                                    {isCostCenter ? `${userDept} Review Items` : 'Patient Clearance Records'}
                                </h1>
                                <p className="text-slate-500 mt-1 text-sm font-medium">
                                    Patient Encounter: <span className="text-slate-800 font-bold px-2 py-0.5 bg-slate-100 rounded border border-slate-200 ml-1">{enccode}</span>
                                </p>
                            </div>
                            
                            {!isCostCenter && (
                                <div className="mt-4 md:mt-0 flex items-center space-x-2 bg-slate-100 px-4 py-2 rounded-lg border border-slate-200">
                                    <span className="text-sm font-bold text-slate-700">Overall Progress:</span>
                                    <span className="text-lg font-black text-teal-600">{clearedDepartments.length} / 5</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
                    {(!isCostCenter || userDept === 'Laboratory') && (
                        <DepartmentCard title="Laboratory" icon={icons.lab} colorTheme="blue" isReady={isLabReady} orders={labOrders} onClear={openConfirm} />
                    )}
                    
                    {(!isCostCenter || userDept === 'Radiology') && (
                        <DepartmentCard title="Radiology" icon={icons.rad} colorTheme="purple" isReady={isRadioReady} orders={radioOrders} onClear={openConfirm} />
                    )}

                    {(!isCostCenter || userDept === 'Cardiopulmonary') && (
                        <DepartmentCard title="Cardiopulmonary" icon={icons.cardio} colorTheme="red" isReady={isCardioReady} orders={cardioOrders} onClear={openConfirm} />
                    )}

                    {(!isCostCenter || userDept === 'Pharmacy') && (
                        <DepartmentCard title="Pharmacy" icon={icons.pharmacy} colorTheme="teal" isReady={isPharmacyReady} orders={pharmacyOrders} onClear={openConfirm} />
                    )}

                    {(!isCostCenter || userDept === 'CSR') && (
                        <DepartmentCard title="CSR" icon={icons.csr} colorTheme="orange" isReady={true} orders={[]} onClear={openConfirm} />
                    )}
                </div>
            </div>
        </PortalLayout>
    );
}