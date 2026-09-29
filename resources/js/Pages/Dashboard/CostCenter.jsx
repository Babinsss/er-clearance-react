import React, { useState, useEffect, useRef } from 'react';
import { Head, router } from '@inertiajs/react';
import PortalLayout from '@/Layouts/PortalLayout';
import axios from 'axios';

export default function CostCenter({ department, pendingPatients = [], historyPatients = [] }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeModule, setActiveModule] = useState('pending'); 
    const [soundEnabled, setSoundEnabled] = useState(true);
    
    // --- MODAL & NOTIFICATION STATE VARIABLES ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [modalData, setModalData] = useState(null);
    const [activeEnccode, setActiveEnccode] = useState(null);
    const [toastMessage, setToastMessage] = useState(null); // UI-friendly notification state

    const previousQueueCount = useRef(pendingPatients.length);
    const warnedPatients = useRef([]); 

    const activeData = activeModule === 'pending' ? pendingPatients : historyPatients;
    const filteredPatients = activeData.filter(patient => 
        patient.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        patient.enccode.includes(searchTerm)
    );

    useEffect(() => {
        const pollInterval = setInterval(() => {
            router.reload({ 
                only: ['pendingPatients', 'historyPatients'], 
                preserveScroll: true, 
                preserveState: true 
            });

            let triggeredWarning = false;
            pendingPatients.forEach(patient => {
                const routedTime = new Date(patient.date).getTime();
                const elapsedMinutes = (Date.now() - routedTime) / (1000 * 60);

                if (elapsedMinutes >= 15 && !warnedPatients.current.includes(patient.enccode)) {
                    triggeredWarning = true;
                    warnedPatients.current.push(patient.enccode); 
                }
            });

            if (triggeredWarning && soundEnabled) {
                new Audio('/sounds/epic_26.mp3').play().catch(() => {});
            }
        }, 5000); 

        if (pendingPatients.length > previousQueueCount.current && soundEnabled) {
            new Audio('/sounds/epic_26.mp3').play().catch(() => {});
        }
        
        previousQueueCount.current = pendingPatients.length;
        return () => clearInterval(pollInterval);
    }, [pendingPatients, department, soundEnabled]);

    const getWaitMinutes = (dateString) => Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60));

    // --- FETCH JSON DATA AND OPEN MODAL ---
    const openInspectModal = async (enccode) => {
        setIsModalOpen(true);
        setIsLoadingData(true);
        setActiveEnccode(enccode);
        setModalData(null);
        
        try {
            const response = await axios.get(`/clearance/${enccode}`, {
                headers: { 
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            setModalData(response.data);
        } catch (error) {
            console.error("Failed to load clearance data", error);
            setToastMessage("Failed to load records from iHomis. Please try again.");
            setTimeout(() => setToastMessage(null), 3000);
            setIsModalOpen(false);
        } finally {
            setIsLoadingData(false);
        }
    };

    // --- BULLETPROOF DATA EXTRACTOR ---
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
        
        return Array.isArray(orders) ? orders : [];
    };

    const hasUnservedItems = () => {
        const orders = getActiveOrders();
        return orders.some(item => item.status !== 'S');
    };

    // --- UI-FRIENDLY CLEAR FUNCTION ---
    const handleClearDepartment = () => {
        router.post('/clearance', {
            enccode: activeEnccode,
            department: department
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setToastMessage(`${department} successfully cleared!`);
                setIsModalOpen(false);
                
                // Hide toast automatically after 3 seconds
                setTimeout(() => {
                    setToastMessage(null);
                }, 3000);
            },
            onError: (errors) => {
                setToastMessage('Failed to clear department. Check console.');
                setTimeout(() => setToastMessage(null), 3000);
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
                            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Verification Portal</h2>
                            <div className="text-xl font-bold text-slate-800">{department}</div>
                        </div>
                        
                        <button onClick={() => setSoundEnabled(!soundEnabled)} className="text-slate-400 hover:text-teal-500 transition-colors p-1 bg-slate-50 rounded-md border border-slate-200 shadow-sm">
                            {soundEnabled ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5 10c0-1.1.9-2 2-2h2l4-4v16l-4-4H7a2 2 0 01-2-2v-4z"></path></svg>
                            ) : (
                                <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h2.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg>
                            )}
                        </button>
                    </div>

                    <nav className="flex-1 space-y-2">
                        <button onClick={() => setActiveModule('pending')} className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeModule === 'pending' ? 'bg-teal-50 text-teal-700 border-l-4 border-teal-500 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 border-l-4 border-transparent'}`}>
                            <div className="flex items-center space-x-3">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span>Pending Requests</span>
                            </div>
                            {pendingPatients.length > 0 && <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full">{pendingPatients.length}</span>}
                        </button>

                        <button onClick={() => setActiveModule('completed')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeModule === 'completed' ? 'bg-teal-50 text-teal-700 border-l-4 border-teal-500 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700 border-l-4 border-transparent'}`}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <span>Completed History</span>
                        </button>
                    </nav>
                </div>

                {/* MAIN CONTENT AREA */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative">
                    <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
                        <h3 className="text-lg font-bold text-slate-800">
                            {activeModule === 'pending' ? 'Needs Your Approval' : 'Recently Processed'}
                        </h3>
                        
                        <div className="w-full md:w-72 relative">
                            <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            <input 
                                type="text" 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 rounded-lg border-slate-300 shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm transition-all" 
                                placeholder="Search patient name..."
                            />
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
                                            const waitMinutes = activeModule === 'pending' ? getWaitMinutes(patient.date) : 0;
                                            const breached = waitMinutes >= 15;

                                            return (
                                                <tr key={index} className={`hover:bg-slate-50 transition-all cursor-default ${breached && activeModule === 'pending' ? 'bg-rose-50/30' : ''}`}>
                                                    <td className={`p-4 border-l-4 ${activeModule === 'completed' ? 'border-emerald-400' : (breached ? 'border-rose-400' : 'border-amber-400')}`}>
                                                        <div className={`font-bold text-base ${breached && activeModule === 'pending' ? 'text-rose-900' : 'text-slate-800'}`}>{patient.name}</div>
                                                        <div className="text-xs text-slate-500 mt-1 uppercase tracking-wide font-semibold break-all">
                                                            {patient.enccode}
                                                        </div>
                                                    </td>

                                                    <td className="p-4 text-slate-600 text-xs">
                                                        {activeModule === 'pending' ? (
                                                            <>Requested: <span className="font-bold">{new Date(patient.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></>
                                                        ) : (
                                                            <>Cleared: <span className="font-bold">{new Date(patient.cleared_date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></>
                                                        )}
                                                    </td>

                                                    <td className="p-4 text-center">
                                                        {activeModule === 'pending' ? (
                                                            <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-bold ${breached ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-slate-100 text-slate-600'}`}>
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                                <span>{waitMinutes} min</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-emerald-600 font-bold uppercase">Processed</span>
                                                        )}
                                                    </td>

                                                    <td className="p-4 text-center">
                                                        {activeModule === 'pending' ? (
                                                            <div className="flex justify-center">
                                                                <button 
                                                                    onClick={() => openInspectModal(patient.enccode)}
                                                                    className={`px-4 py-2 text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center space-x-1 ${breached ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-[#0f172a] hover:bg-slate-800 text-white'}`}
                                                                >
                                                                    <span>Inspect</span>
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">Overall: {patient.overall_status}</span>
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
            </div>

            {/* --- THE POP-UP MODAL --- */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6 transition-opacity">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200" style={{ maxHeight: '90vh' }}>
                        
                        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">{department} Review Items</h3>
                                <p className="text-xs text-slate-500 font-medium mt-1">Patient Encounter: <span className="font-mono bg-slate-200 px-1 rounded">{activeEnccode}</span></p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-rose-500 bg-white border border-slate-200 rounded-md p-1.5 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
                            {isLoadingData ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <svg className="w-10 h-10 text-teal-600 animate-spin mb-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    <span className="text-slate-500 font-bold tracking-wide">Loading Database Records...</span>
                                </div>
                            ) : modalData ? (
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
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
                                            onClick={handleClearDepartment}
                                            disabled={hasUnservedItems()}
                                            className={`px-4 py-2 text-sm font-bold rounded-lg shadow-sm transition-all focus:outline-none flex items-center space-x-2 
                                                ${hasUnservedItems() 
                                                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                                                    : 'bg-teal-600 text-white hover:bg-teal-700 hover:shadow-md border border-transparent'}`}
                                        >
                                            {hasUnservedItems() ? (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                                    <span>Pending Results</span>
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                                    <span>Clear Department</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    
                                    <div className="divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
                                        {getActiveOrders().length === 0 ? (
                                            <div className="p-8 text-center text-slate-400 italic">
                                                No active orders found for this encounter.
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
                    </div>
                </div>
            )}

            {/* --- SLIDING TOAST NOTIFICATION --- */}
            {toastMessage && (
                <div className="fixed top-6 right-6 z-[200] flex items-center bg-teal-600 text-white px-5 py-3.5 rounded-xl shadow-2xl animate-in slide-in-from-top-5 fade-in duration-300">
                    <div className="bg-teal-500 rounded-full p-1 mr-3">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <span className="font-bold text-sm tracking-wide">{toastMessage}</span>
                    <button onClick={() => setToastMessage(null)} className="ml-4 text-teal-200 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            )}
        </PortalLayout>
    );
}