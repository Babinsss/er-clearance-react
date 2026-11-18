import React, { useState, useEffect, useRef } from 'react';
import { Head, router } from '@inertiajs/react';
import PortalLayout from '@/Layouts/PortalLayout';
import TurnaroundChart from '@/Components/TurnaroundChart'; // <-- IMPORTED CHART
import Modal from '@/Components/Modal';
import ConfirmDialog from '@/Components/ConfirmDialog';

export default function AdminDashboard({ staff = [], departments = [], transactions = [] }) {
    // Default to analytics tab so the chart is the first thing the Admin sees
    const [activeTab, setActiveTab] = useState('analytics'); 
    const [searchTerms, setSearchTerms] = useState({
        patients: '',
        staff: '',
        departments: '',
    });
    const [toastMessage, setToastMessage] = useState(null);
    const [patientFilter, setPatientFilter] = useState('all');
    const [staffFilter, setStaffFilter] = useState('all'); // 'all', 'online', 'offline'
    const [confirmState, setConfirmState] = useState(null);
    const [isConfirmRunning, setIsConfirmRunning] = useState(false);
    const isFirstMount = useRef(true);

    const activeSearchTerm = searchTerms[activeTab] || '';
    const updateActiveSearchTerm = (value) => {
        setSearchTerms((prev) => ({
            ...prev,
            [activeTab]: value,
        }));
    };
    
    // Auto-refresh every 15s to keep active users and clearance queues updated
    useEffect(() => {
        const pollInterval = setInterval(() => {
            router.reload({
                only: ['staff', 'transactions'],
                preserveScroll: true,
                preserveState: true,
            });
        }, 15000);
        return () => clearInterval(pollInterval);
    }, []);

    // Database Search Debounce when on patients tab (finds archived records from whole database)
    useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return;
        }

        if (activeTab !== 'patients') return;

        const patientsTerm = (searchTerms.patients || '').trim();
        const timer = setTimeout(() => {
            router.get('/admin', 
                patientsTerm ? { search: patientsTerm } : {},
                { preserveState: true, preserveScroll: true, only: ['transactions'] }
            );
        }, 350);

        return () => clearTimeout(timer);
    }, [searchTerms.patients, activeTab]);

    const activeUsersCount = staff.filter(u => u.is_online).length;

    // Staff State
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [newUserForm, setNewUserForm] = useState({ name: '', email: '', department: 'ICT / Admin', password: '', password_confirmation: '' });
    const [userErrors, setUserErrors] = useState({});
    const [editingUser, setEditingUser] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', email: '', department: '', password: '' });

    // Department State
    const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
    const [editingDept, setEditingDept] = useState(null);
    const [deptForm, setDeptForm] = useState({ name: '', category: 'Ward' });

    // Patient Edit State
    const [editingPatient, setEditingPatient] = useState(null);
    const [patientEditForm, setPatientEditForm] = useState({
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
    const [isSavingPatient, setIsSavingPatient] = useState(false);

    const filteredStaff = staff.filter(user => {
        const term = (searchTerms.staff || '').toLowerCase();
        const matchesSearch = 
            (user.name || '').toLowerCase().includes(term) || 
            (user.department || '').toLowerCase().includes(term) ||
            (user.email || '').toLowerCase().includes(term) ||
            (user.last_ip_address || '').includes(term);

        if (!matchesSearch) return false;
        if (staffFilter === 'online') return user.is_online;
        if (staffFilter === 'offline') return !user.is_online;
        return true;
    });

    const deptTerm = (searchTerms.departments || '').toLowerCase();
    const filteredDepts = departments.filter(dept => 
        dept.name.toLowerCase().includes(deptTerm) || 
        dept.category.toLowerCase().includes(deptTerm)
    );

    const filteredTransactions = transactions.filter(tx => {
        const term = (searchTerms.patients || '').toLowerCase();
        const matchesSearch = 
            (tx.patient_name || '').toLowerCase().includes(term) || 
            (tx.hospital_number || '').includes(term) ||
            (tx.enccode || '').toLowerCase().includes(term) ||
            (tx.room_ward || '').toLowerCase().includes(term);

        if (!matchesSearch) return false;
        if (patientFilter === 'all') return true;
        return tx.overall_status === patientFilter;
    });

    const activeRoutingCount = transactions.filter(t => t.overall_status === 'Routing in Progress').length;

    const showToast = (message) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 3000);
    };

    // --- PATIENT ROUTING HANDLERS ---
    const handleCancelPatient = (id, name) => {
        setConfirmState({
            title: 'Cancel Clearance Routing',
            message: `Are you sure you want to CANCEL clearance routing for ${name}?\n\nThis will immediately remove the patient from all clinical cost center queues.`,
            confirmLabel: 'Yes, Cancel Routing',
            tone: 'warning',
            onConfirm: () => {
                setIsConfirmRunning(true);
                router.post(`/admin/transactions/${id}/cancel`, {}, {
                    preserveScroll: true,
                    onSuccess: () => {
                        setConfirmState(null);
                        showToast(`Clearance routing for ${name} has been cancelled.`);
                    },
                    onFinish: () => setIsConfirmRunning(false),
                });
            },
        });
    };

    const handleReactivatePatient = (id, name) => {
        setConfirmState({
            title: 'Re-activate Clearance Routing',
            message: `Re-activate clearance routing for ${name}?`,
            confirmLabel: 'Yes, Re-activate',
            tone: 'teal',
            onConfirm: () => {
                setIsConfirmRunning(true);
                router.post(`/admin/transactions/${id}/reactivate`, {}, {
                    preserveScroll: true,
                    onSuccess: () => {
                        setConfirmState(null);
                        showToast(`Clearance routing for ${name} has been re-activated.`);
                    },
                    onFinish: () => setIsConfirmRunning(false),
                });
            },
        });
    };

    const handleDeletePatient = (id, name) => {
        setConfirmState({
            title: 'Delete Routing Record',
            message: `Permanently DELETE the routing record for ${name}?\n\nThis action cannot be undone.`,
            confirmLabel: 'Delete Permanently',
            tone: 'danger',
            onConfirm: () => {
                setIsConfirmRunning(true);
                router.delete(`/admin/transactions/${id}`, {
                    preserveScroll: true,
                    onSuccess: () => {
                        setConfirmState(null);
                        showToast(`Routing record for ${name} has been permanently deleted.`);
                    },
                    onFinish: () => setIsConfirmRunning(false),
                });
            },
        });
    };

    const openEditPatientModal = (tx) => {
        let formattedArrival = '';
        if (tx.arrival_datetime) {
            const d = new Date(tx.arrival_datetime);
            if (!isNaN(d.getTime())) {
                const pad = (n) => String(n).padStart(2, '0');
                formattedArrival = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            }
        }

        setEditingPatient(tx);
        setPatientEditForm({
            hospital_number: tx.hospital_number || '',
            patient_name: tx.patient_name || '',
            room_ward: tx.room_ward || (departments.find(d => d.category === 'Ward')?.name || 'Emergency Room'),
            arrival_datetime: formattedArrival,
            disposition: tx.disposition || 'Improved',
            overall_status: tx.overall_status || 'Routing in Progress',
            is_oecb: Boolean(tx.is_oecb),
            has_oxygen: Boolean(tx.has_oxygen),
            oxygen_remarks: tx.oxygen_remarks || ''
        });
    };

    const handleUpdatePatient = (e) => {
        e.preventDefault();
        if (!editingPatient) return;
        setIsSavingPatient(true);

        router.put(`/admin/transactions/${editingPatient.id}`, {
            ...patientEditForm,
            is_oecb: Boolean(patientEditForm.is_oecb),
            has_oxygen: Boolean(patientEditForm.has_oxygen),
            oxygen_remarks: patientEditForm.has_oxygen ? patientEditForm.oxygen_remarks : null,
        }, {
            preserveScroll: true,
            onSuccess: () => {
                setIsSavingPatient(false);
                setEditingPatient(null);
                showToast(`Patient record for ${patientEditForm.patient_name} updated successfully.`);
            },
            onError: (errs) => {
                setIsSavingPatient(false);
                console.error(errs);
                showToast('Failed to update patient record. Please check inputs.');
            }
        });
    };

    // --- STAFF HANDLERS ---
    const openAddUserModal = () => {
        setNewUserForm({ name: '', email: '', department: 'ICT / Admin', password: '', password_confirmation: '' });
        setUserErrors({});
        setIsAddUserModalOpen(true);
    };

    const handleCreateUser = (e) => {
        e.preventDefault();
        setUserErrors({});
        router.post('/admin/users', newUserForm, {
            preserveScroll: true,
            onSuccess: () => {
                setIsAddUserModalOpen(false);
                showToast(`Created account for ${newUserForm.name} (${newUserForm.department}).`);
            },
            onError: (errors) => {
                setUserErrors(errors);
            }
        });
    };

    const openEditModal = (user) => {
        setEditingUser(user);
        setUserErrors({});
        setEditForm({ name: user.name, email: user.email, department: user.department, password: '' });
    };

    const handleUpdateUser = (e) => {
        e.preventDefault();
        setUserErrors({});
        router.put(`/admin/users/${editingUser.id}`, editForm, {
            preserveScroll: true,
            onSuccess: () => {
                setEditingUser(null);
                showToast(`Successfully updated ${editForm.name}'s account.`);
            },
            onError: (errors) => {
                setUserErrors(errors);
            }
        });
    };

    const handleDeleteUser = (id, name) => {
        setConfirmState({
            title: 'Delete Staff Account',
            message: `Delete the account for ${name}?`,
            confirmLabel: 'Delete Account',
            tone: 'danger',
            onConfirm: () => {
                setIsConfirmRunning(true);
                router.delete(`/admin/users/${id}`, {
                    preserveScroll: true,
                    onSuccess: () => {
                        setConfirmState(null);
                        showToast(`Account for ${name} has been deleted.`);
                    },
                    onFinish: () => setIsConfirmRunning(false),
                });
            },
        });
    };

    // --- DEPARTMENT HANDLERS ---
    const openDeptModal = (dept = null) => {
        if (dept) {
            setEditingDept(dept);
            setDeptForm({ name: dept.name, category: dept.category });
        } else {
            setEditingDept(null);
            setDeptForm({ name: '', category: 'Ward' });
        }
        setIsDeptModalOpen(true);
    };

    const handleSaveDepartment = (e) => {
        e.preventDefault();
        if (editingDept) {
            router.put(`/admin/departments/${editingDept.id}`, deptForm, {
                preserveScroll: true,
                onSuccess: () => {
                    setIsDeptModalOpen(false);
                    showToast(`Updated department: ${deptForm.name}`);
                }
            });
        } else {
            router.post(`/admin/departments`, deptForm, {
                preserveScroll: true,
                onSuccess: () => {
                    setIsDeptModalOpen(false);
                    showToast(`Added new department: ${deptForm.name}`);
                }
            });
        }
    };

    const handleDeleteDepartment = (id, name) => {
        setConfirmState({
            title: 'Delete Department',
            message: `Delete ${name} from the system? This will remove it from all dropdowns.`,
            confirmLabel: 'Delete Department',
            tone: 'danger',
            onConfirm: () => {
                setIsConfirmRunning(true);
                router.delete(`/admin/departments/${id}`, {
                    preserveScroll: true,
                    onSuccess: () => {
                        setConfirmState(null);
                        showToast(`${name} has been removed.`);
                    },
                    onFinish: () => setIsConfirmRunning(false),
                });
            },
        });
    };

    const availableWards = departments.filter(d => d.category === 'Ward').map(d => d.name);
    const wardOptions = availableWards.length > 0 ? availableWards : ['Emergency Room', 'Surgical Ward', 'Ortho Ward', 'OB Ward', 'Outpatient'];

    return (
        <PortalLayout>
            <Head title="ICT Admin Portal" />
            
            <div className="flex flex-col md:flex-row gap-6 w-full p-6 bg-slate-100 min-h-[calc(100vh-64px)] font-sans">
                
                {/* LEFT SIDEBAR */}
                <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 p-5 flex flex-col shrink-0 w-full md:w-[260px] text-white relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-800 to-transparent opacity-50"></div>
                    <div className="relative z-10 mb-8 px-2 pt-2 border-b border-slate-700 pb-4">
                        <h2 className="text-[11px] font-black text-teal-400 uppercase tracking-widest mb-1">System Administration</h2>
                        <div className="text-xl font-bold text-white">ICT Portal</div>
                    </div>

                    <nav className="relative z-10 space-y-2 flex-1">
                        <button onClick={() => setActiveTab('analytics')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'analytics' ? 'bg-teal-500/20 text-teal-300 border-l-4 border-teal-400' : 'text-slate-400 hover:bg-slate-800 border-l-4 border-transparent'}`}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                            <span>Analytics Overview</span>
                        </button>

                        <button onClick={() => setActiveTab('patients')} className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'patients' ? 'bg-teal-500/20 text-teal-300 border-l-4 border-teal-400' : 'text-slate-400 hover:bg-slate-800 border-l-4 border-transparent'}`}>
                            <div className="flex items-center space-x-3">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                                <span>Routed Patients</span>
                            </div>
                            {activeRoutingCount > 0 && (
                                <span className="bg-amber-500/30 text-amber-300 text-xs px-2 py-0.5 rounded-full font-bold">
                                    {activeRoutingCount}
                                </span>
                            )}
                        </button>

                        <button onClick={() => setActiveTab('staff')} className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'staff' ? 'bg-teal-500/20 text-teal-300 border-l-4 border-teal-400' : 'text-slate-400 hover:bg-slate-800 border-l-4 border-transparent'}`}>
                            <div className="flex items-center space-x-3">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                                <span>Staff Accounts</span>
                            </div>
                            {activeUsersCount > 0 && (
                                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] px-2 py-0.5 rounded-full font-bold flex items-center space-x-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none"></span>
                                    <span>{activeUsersCount} Online</span>
                                </span>
                            )}
                        </button>

                        <button onClick={() => setActiveTab('departments')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'departments' ? 'bg-teal-500/20 text-teal-300 border-l-4 border-teal-400' : 'text-slate-400 hover:bg-slate-800 border-l-4 border-transparent'}`}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                            <span>Departments & Wards</span>
                        </button>
                    </nav>
                </div>

                {/* MAIN CONTENT */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">
                                {activeTab === 'analytics' && 'Hospital Performance'}
                                {activeTab === 'patients' && 'Clearance Routing Management'}
                                {activeTab === 'staff' && 'Staff Accounts & Active Users'}
                                {activeTab === 'departments' && 'Hospital Departments'}
                            </h3>
                            <p className="text-xs text-slate-500 font-medium">
                                {activeTab === 'analytics' && 'Monitor live department clearance speeds.'}
                                {activeTab === 'patients' && 'View, cancel, or re-activate patient clearance transactions.'}
                                {activeTab === 'staff' && `Monitor real-time online staff and manage permissions (${activeUsersCount} currently online).`}
                                {activeTab === 'departments' && 'Manage available wards and cost centers.'}
                            </p>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                            {activeTab === 'patients' && (
                                <div className="flex items-center space-x-1 bg-slate-200/80 p-1 rounded-lg text-xs font-bold">
                                    {[
                                        { id: 'all', label: 'All' },
                                        { id: 'Routing in Progress', label: 'In Progress' },
                                        { id: 'Cleared', label: 'Cleared' },
                                        { id: 'Cancelled', label: 'Cancelled' },
                                        { id: 'Archived', label: 'Archived' },
                                    ].map(pill => (
                                        <button
                                            key={pill.id}
                                            onClick={() => setPatientFilter(pill.id)}
                                            className={`px-2.5 py-1 rounded-md transition-all ${patientFilter === pill.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                                        >
                                            {pill.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {activeTab === 'staff' && (
                                <div className="flex items-center space-x-1 bg-slate-200/80 p-1 rounded-lg text-xs font-bold">
                                    <button
                                        onClick={() => setStaffFilter('all')}
                                        className={`px-2.5 py-1 rounded-md transition-all ${staffFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        All ({staff.length})
                                    </button>
                                    <button
                                        onClick={() => setStaffFilter('online')}
                                        className={`px-2.5 py-1 rounded-md transition-all flex items-center space-x-1.5 ${staffFilter === 'online' ? 'bg-white text-emerald-800 shadow-sm' : 'text-emerald-700 hover:text-emerald-900'}`}
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none"></span>
                                        <span>Online ({activeUsersCount})</span>
                                    </button>
                                    <button
                                        onClick={() => setStaffFilter('offline')}
                                        className={`px-2.5 py-1 rounded-md transition-all ${staffFilter === 'offline' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                                    >
                                        Offline ({staff.length - activeUsersCount})
                                    </button>
                                </div>
                            )}

                            {activeTab !== 'analytics' && (
                                <div className="w-full md:w-64 relative">
                                    <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                    <input 
                                        type="text" 
                                        value={activeSearchTerm}
                                        onChange={e => updateActiveSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 rounded-lg border-slate-300 shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm transition-all" 
                                        placeholder={`Search ${activeTab === 'patients' ? 'patients, hospital #...' : activeTab}...`}
                                    />
                                </div>
                            )}
                            {activeTab === 'staff' && (
                                <button onClick={() => openAddUserModal()} className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors whitespace-nowrap flex items-center space-x-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                    <span>Add User / Admin</span>
                                </button>
                            )}
                            {activeTab === 'departments' && (
                                <button onClick={() => openDeptModal()} className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors whitespace-nowrap flex items-center space-x-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                    <span>Add New</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className={`overflow-y-auto flex-1 ${activeTab === 'analytics' ? 'bg-slate-50/50' : 'bg-white'}`}>
                        {activeTab === 'analytics' ? (
                            <div className="p-6 md:p-8">
                                <div className="max-w-3xl mx-auto">
                                    <TurnaroundChart />
                                </div>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-white shadow-sm z-10">
                                    {activeTab === 'patients' ? (
                                        <tr className="text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 bg-slate-50">
                                            <th className="p-4 pl-6">Patient & Encounter</th>
                                            <th className="p-4">Originating Ward</th>
                                            <th className="p-4">Status & Cleared Stations</th>
                                            <th className="p-4 text-right pr-6">Routing Actions</th>
                                        </tr>
                                    ) : activeTab === 'staff' ? (
                                        <tr className="text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 bg-slate-50">
                                            <th className="p-4 pl-6">Staff Member & Account</th>
                                            <th className="p-4">Assigned Department</th>
                                            <th className="p-4">Live Status & Activity</th>
                                            <th className="p-4 text-right pr-6">Actions</th>
                                        </tr>
                                    ) : (
                                        <tr className="text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 bg-slate-50">
                                            <th className="p-4 pl-6">Department Name</th>
                                            <th className="p-4">Category</th>
                                            <th className="p-4 text-right pr-6">Actions</th>
                                        </tr>
                                    )}
                                </thead>
                                <tbody className="text-sm divide-y divide-slate-100">
                                    {activeTab === 'patients' ? (
                                        filteredTransactions.length === 0 ? (
                                            <tr><td colSpan="4" className="p-8 text-center text-slate-500 italic">No routed patient records found.</td></tr>
                                        ) : (
                                            filteredTransactions.map((tx) => (
                                                <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 pl-6">
                                                        <div className="font-bold text-slate-800 text-sm leading-snug">{tx.patient_name}</div>
                                                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                                                            <span className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                                Hosp #: {tx.hospital_number}
                                                            </span>
                                                            <span className="font-mono text-slate-400 text-[11px]">
                                                                Enc: {tx.enccode}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1.5">
                                                            <span className="text-[11px] text-slate-400">
                                                                Routed: {new Date(tx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            {tx.is_oecb ? (
                                                                <span className="bg-amber-100 text-amber-800 text-[11px] font-black px-1.5 py-0.5 rounded border border-amber-300">
                                                                    OECB
                                                                </span>
                                                            ) : null}
                                                            {tx.has_oxygen ? (
                                                                <span className="bg-sky-100 text-sky-800 text-[11px] font-bold px-1.5 py-0.5 rounded border border-sky-300" title={tx.oxygen_remarks}>
                                                                    Oxygen
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <span className="font-bold text-slate-700 text-sm block">{tx.room_ward || 'Unknown Ward'}</span>
                                                        {tx.encoded_by && (
                                                            <span className="text-xs text-slate-400 block mt-0.5">By: {tx.encoded_by}</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="mb-2">
                                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
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
                                                                                : 'bg-amber-500 animate-pulse motion-reduce:animate-none'))
                                                                }`}></span>
                                                                {tx.overall_status}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1 max-w-xs">
                                                            {tx.cleared_departments && tx.cleared_departments.length > 0 ? (
                                                                tx.cleared_departments.map((dept, i) => (
                                                                    <span key={i} className="bg-slate-100 text-slate-600 text-[11px] font-semibold px-1.5 py-0.5 rounded border border-slate-200">
                                                                        ✓ {dept}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="text-xs text-slate-400 italic">No stations cleared yet</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 pr-6 text-right">
                                                        <div className="flex items-center justify-end gap-2 flex-wrap">
                                                            <button
                                                                onClick={() => openEditPatientModal(tx)}
                                                                className="bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-800 border border-amber-300 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center space-x-1"
                                                                title="Edit patient routing details"
                                                            >
                                                                <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                                                <span>Edit</span>
                                                            </button>
                                                            {tx.overall_status === 'Routing in Progress' && (
                                                                <button
                                                                    onClick={() => handleCancelPatient(tx.id, tx.patient_name)}
                                                                    className="bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border border-rose-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center space-x-1"
                                                                    title="Cancel clearance routing for this patient"
                                                                >
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                                                    <span>Cancel Routing</span>
                                                                </button>
                                                            )}
                                                            {tx.overall_status === 'Cancelled' && (
                                                                <button
                                                                    onClick={() => handleReactivatePatient(tx.id, tx.patient_name)}
                                                                    className="bg-teal-50 hover:bg-teal-100 text-teal-700 hover:text-teal-800 border border-teal-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center space-x-1"
                                                                    title="Re-activate clearance routing"
                                                                >
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                                                    <span>Re-activate</span>
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeletePatient(tx.id, tx.patient_name)}
                                                                className="text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-slate-100 transition-colors"
                                                                title="Permanently delete record"
                                                                aria-label={`Permanently delete ${tx.patient_name}`}
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )
                                    ) : activeTab === 'staff' ? (
                                        filteredStaff.length === 0 ? (
                                            <tr><td colSpan="4" className="p-8 text-center text-slate-500 italic">No staff accounts match your filter criteria.</td></tr>
                                        ) : (
                                            filteredStaff.map((user) => (
                                                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 pl-6">
                                                        <div className="flex items-center space-x-3">
                                                            <div className="relative shrink-0">
                                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                                                                    user.is_online 
                                                                        ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-300' 
                                                                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                                                                }`}>
                                                                    {(user.name || 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                                                </div>
                                                                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                                                                    user.is_online ? 'bg-emerald-500 animate-pulse motion-reduce:animate-none' : 'bg-slate-300'
                                                                }`} title={user.is_online ? 'Online now' : 'Offline'}></span>
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-slate-800 flex items-center space-x-2">
                                                                    <span>{user.name}</span>
                                                                    {user.department === 'ICT / Admin' && (
                                                                        <span className="bg-purple-100 text-purple-700 text-[11px] font-bold px-1.5 py-0.5 rounded">ADMIN</span>
                                                                    )}
                                                                </div>
                                                                <div className="text-xs text-slate-400 font-medium">{user.email}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-1 rounded border border-slate-200">{user.department}</span>
                                                    </td>
                                                    <td className="p-4">
                                                        {user.is_online ? (
                                                            <div>
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse motion-reduce:animate-none mr-1.5"></span>
                                                                    Active Now
                                                                </span>
                                                                <div className="text-[11px] text-slate-400 mt-1 flex items-center space-x-2">
                                                                    <span>{user.last_seen_human}</span>
                                                                    {user.last_ip_address && (
                                                                        <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 border border-slate-200">
                                                                            IP: {user.last_ip_address}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-1.5"></span>
                                                                    Offline
                                                                </span>
                                                                <div className="text-[11px] text-slate-400 mt-1">
                                                                    {user.last_seen_at ? `Last active ${user.last_seen_human}` : 'Never logged in'}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-4 pr-6 text-right">
                                                        <button onClick={() => openEditModal(user)} className="text-teal-600 hover:text-teal-800 font-bold text-xs mr-4 transition-colors">EDIT</button>
                                                        <button onClick={() => handleDeleteUser(user.id, user.name)} className="text-rose-500 hover:text-rose-700 font-bold text-xs transition-colors disabled:opacity-50" disabled={user.department === 'ICT / Admin'}>DELETE</button>
                                                    </td>
                                                </tr>
                                            ))
                                        )
                                    ) : (
                                        filteredDepts.length === 0 ? (
                                            <tr><td colSpan="3" className="p-8 text-center text-slate-500 italic">No departments found. Add one to get started.</td></tr>
                                        ) : (
                                            filteredDepts.map((dept) => (
                                                <tr key={dept.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 pl-6 font-bold text-slate-800">{dept.name}</td>
                                                    <td className="p-4">
                                                        <span className={`text-xs font-bold px-2.5 py-1 rounded border ${dept.category === 'Cost Center' ? 'bg-amber-50 text-amber-700 border-amber-200' : (dept.category === 'Ward' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-700 border-slate-200')}`}>
                                                            {dept.category}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 pr-6 text-right">
                                                        <button onClick={() => openDeptModal(dept)} className="text-teal-600 hover:text-teal-800 font-bold text-xs mr-4 transition-colors">EDIT</button>
                                                        <button onClick={() => handleDeleteDepartment(dept.id, dept.name)} className="text-rose-500 hover:text-rose-700 font-bold text-xs transition-colors">DELETE</button>
                                                    </td>
                                                </tr>
                                            ))
                                        )
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* ADD STAFF / ADMIN MODAL */}
            <Modal
                show={isAddUserModalOpen}
                onClose={() => setIsAddUserModalOpen(false)}
                maxWidth="md"
                zIndexClass="z-[100]"
            >
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Add New User / Admin</h3>
                            <button type="button" aria-label="Close modal" onClick={() => setIsAddUserModalOpen(false)} className="text-slate-400 hover:text-rose-500 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Full Name</label>
                                <input type="text" value={newUserForm.name} onChange={e => setNewUserForm({...newUserForm, name: e.target.value})} placeholder="e.g. Juan Dela Cruz" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500" required />
                                {userErrors.name && <p className="text-xs text-rose-600 mt-1 font-medium">{userErrors.name}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Email Address</label>
                                <input type="email" value={newUserForm.email} onChange={e => setNewUserForm({...newUserForm, email: e.target.value})} placeholder="staff@hospital.com" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500" required />
                                {userErrors.email && <p className="text-xs text-rose-600 mt-1 font-medium">{userErrors.email}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Assigned Role / Department</label>
                                <select value={newUserForm.department} onChange={e => setNewUserForm({...newUserForm, department: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500">
                                    <option value="ICT / Admin">ICT / Admin (Administrator)</option>
                                    <option value="Supervisor">Supervisor (Clinical / Nursing)</option>
                                    <option value="Billing & Claims">Billing & Claims</option>
                                    {departments
                                        .filter(dept => !['billing & claims', 'ict / admin', 'supervisor'].includes(dept.name.trim().toLowerCase()))
                                        .map(dept => (
                                            <option key={dept.id} value={dept.name}>{dept.name} ({dept.category})</option>
                                        ))}
                                </select>
                                {userErrors.department && <p className="text-xs text-rose-600 mt-1 font-medium">{userErrors.department}</p>}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Password</label>
                                    <input type="password" value={newUserForm.password} onChange={e => setNewUserForm({...newUserForm, password: e.target.value})} placeholder="Min. 8 chars" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500" required />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Confirm Password</label>
                                    <input type="password" value={newUserForm.password_confirmation} onChange={e => setNewUserForm({...newUserForm, password_confirmation: e.target.value})} placeholder="Repeat password" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500" required />
                                </div>
                            </div>
                            {userErrors.password && <p className="text-xs text-rose-600 font-medium">{userErrors.password}</p>}
                            <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                                <button type="button" onClick={() => setIsAddUserModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                                <button type="submit" className="px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors">Create Account</button>
                            </div>
                        </form>
            </Modal>

            {/* EDIT STAFF MODAL */}
            <Modal
                show={Boolean(editingUser)}
                onClose={() => setEditingUser(null)}
                maxWidth="md"
                zIndexClass="z-[100]"
            >
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Edit Staff Account</h3>
                            <button type="button" aria-label="Close modal" onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-rose-500 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Full Name</label>
                                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500" required />
                                {userErrors.name && <p className="text-xs text-rose-600 mt-1 font-medium">{userErrors.name}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Email Address</label>
                                <input type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500" required />
                                {userErrors.email && <p className="text-xs text-rose-600 mt-1 font-medium">{userErrors.email}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Assigned Department / Ward</label>
                                <select value={editForm.department} onChange={e => setEditForm({...editForm, department: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500">
                                    <option value="ICT / Admin">ICT / Admin</option>
                                    <option value="Supervisor">Supervisor</option>
                                    <option value="Billing & Claims">Billing & Claims</option>
                                    {departments
                                        .filter(dept => !['billing & claims', 'ict / admin', 'supervisor'].includes(dept.name.trim().toLowerCase()))
                                        .map(dept => (
                                            <option key={dept.id} value={dept.name}>{dept.name}</option>
                                        ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">New Password <span className="text-slate-400 font-normal lowercase">(leave blank to keep current)</span></label>
                                <input type="password" value={editForm.password} onChange={e => setEditForm({...editForm, password: e.target.value})} placeholder="Optional new password" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500" />
                                {userErrors.password && <p className="text-xs text-rose-600 mt-1 font-medium">{userErrors.password}</p>}
                            </div>
                            <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                                <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                                <button type="submit" className="px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors">Save Changes</button>
                            </div>
                        </form>
            </Modal>

            {/* ADD/EDIT DEPARTMENT MODAL */}
            <Modal
                show={isDeptModalOpen}
                onClose={() => setIsDeptModalOpen(false)}
                maxWidth="md"
                zIndexClass="z-[100]"
            >
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">{editingDept ? 'Edit Department' : 'Add New Department'}</h3>
                            <button type="button" aria-label="Close modal" onClick={() => setIsDeptModalOpen(false)} className="text-slate-400 hover:text-rose-500 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <form onSubmit={handleSaveDepartment} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Department / Ward Name</label>
                                <input type="text" value={deptForm.name} onChange={e => setDeptForm({...deptForm, name: e.target.value})} placeholder="e.g. Pediatrics Ward" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500" required />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Category</label>
                                <select value={deptForm.category} onChange={e => setDeptForm({...deptForm, category: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500">
                                    <option value="Ward">Ward / Clinical Station</option>
                                    <option value="Cost Center">Cost Center</option>
                                    <option value="System">System Administration</option>
                                </select>
                            </div>
                            <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                                <button type="button" onClick={() => setIsDeptModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                                <button type="submit" className="px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors">Save Department</button>
                            </div>
                        </form>
            </Modal>

            {/* EDIT ROUTED PATIENT MODAL */}
            <Modal
                show={Boolean(editingPatient)}
                onClose={() => { if (!isSavingPatient) setEditingPatient(null); }}
                closeable={!isSavingPatient}
                maxWidth="2xl"
                zIndexClass="z-[150]"
                panelClassName="rounded-2xl max-h-[90vh] flex flex-col"
            >
                {editingPatient && (
                    <>
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center shrink-0">
                            <div>
                                <div className="flex items-center space-x-2">
                                    <span className="text-[11px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                        Patient Routing Edit
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
                                type="button"
                                aria-label="Close modal"
                                onClick={() => setEditingPatient(null)}
                                disabled={isSavingPatient}
                                className="text-slate-400 hover:text-rose-500 transition-colors p-1 disabled:opacity-50"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleUpdatePatient} className="p-6 space-y-4 overflow-y-auto flex-1">
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Patient Full Name <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={patientEditForm.patient_name}
                                        onChange={e => setPatientEditForm({ ...patientEditForm, patient_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:ring-teal-500 focus:border-teal-500 uppercase"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Hospital Number <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={patientEditForm.hospital_number}
                                        onChange={e => setPatientEditForm({ ...patientEditForm, hospital_number: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono text-slate-800 focus:ring-teal-500 focus:border-teal-500 uppercase"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Originating Room / Ward <span className="text-rose-500">*</span>
                                    </label>
                                    <select
                                        value={patientEditForm.room_ward}
                                        onChange={e => setPatientEditForm({ ...patientEditForm, room_ward: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 focus:ring-teal-500 focus:border-teal-500"
                                        required
                                    >
                                        {wardOptions.map((w, idx) => (
                                            <option key={idx} value={w}>{w}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Arrival Date & Time
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={patientEditForm.arrival_datetime}
                                        onChange={e => setPatientEditForm({ ...patientEditForm, arrival_datetime: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-teal-500 focus:border-teal-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Patient Disposition
                                    </label>
                                    <select
                                        value={patientEditForm.disposition}
                                        onChange={e => setPatientEditForm({ ...patientEditForm, disposition: e.target.value })}
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

                                <div>
                                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                                        Overall Clearance Status
                                    </label>
                                    <select
                                        value={patientEditForm.overall_status}
                                        onChange={e => setPatientEditForm({ ...patientEditForm, overall_status: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold focus:ring-teal-500 focus:border-teal-500"
                                        required
                                    >
                                        <option value="Routing in Progress">Routing in Progress</option>
                                        <option value="Cleared">Cleared (Override)</option>
                                        <option value="Cancelled">Cancelled</option>
                                        <option value="Archived">Archived</option>
                                    </select>
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
                                                name="admin_is_oecb"
                                                checked={patientEditForm.is_oecb === true}
                                                onChange={() => setPatientEditForm({ ...patientEditForm, is_oecb: true })}
                                                className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300"
                                            />
                                            <span className="text-sm font-bold text-slate-700">Yes (OECB)</span>
                                        </label>
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="admin_is_oecb"
                                                checked={patientEditForm.is_oecb === false}
                                                onChange={() => setPatientEditForm({ ...patientEditForm, is_oecb: false })}
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
                                                name="admin_has_oxygen"
                                                checked={patientEditForm.has_oxygen === true}
                                                onChange={() => setPatientEditForm({ ...patientEditForm, has_oxygen: true })}
                                                className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300"
                                            />
                                            <span className="text-sm font-bold text-slate-700">Yes</span>
                                        </label>
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="admin_has_oxygen"
                                                checked={patientEditForm.has_oxygen === false}
                                                onChange={() => setPatientEditForm({ ...patientEditForm, has_oxygen: false, oxygen_remarks: '' })}
                                                className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-slate-300"
                                            />
                                            <span className="text-sm font-bold text-slate-700">No</span>
                                        </label>
                                    </div>

                                    {patientEditForm.has_oxygen && (
                                        <div className="mt-3">
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                                                Oxygen Remarks (Notes for Cardio Pulmo)
                                            </label>
                                            <textarea
                                                rows="2"
                                                value={patientEditForm.oxygen_remarks}
                                                onChange={e => setPatientEditForm({ ...patientEditForm, oxygen_remarks: e.target.value })}
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
                                    className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingPatient}
                                    className="px-5 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 rounded-lg shadow-sm transition-colors flex items-center space-x-2"
                                >
                                    {isSavingPatient ? (
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
                    </>
                )}
            </Modal>

            <ConfirmDialog
                show={Boolean(confirmState)}
                onClose={() => setConfirmState(null)}
                onConfirm={confirmState?.onConfirm}
                title={confirmState?.title || 'Confirm Action'}
                message={confirmState?.message || ''}
                confirmLabel={confirmState?.confirmLabel || 'Confirm'}
                tone={confirmState?.tone || 'danger'}
                loading={isConfirmRunning}
            />

            {/* SLIDING TOAST NOTIFICATION */}
            {toastMessage && (
                <div className="fixed top-6 right-6 z-[200] flex items-center bg-teal-600 text-white px-5 py-3.5 rounded-xl shadow-2xl animate-slide-in-top motion-reduce:animate-none">
                    <div className="bg-teal-500 rounded-full p-1 mr-3">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    </div>
                    <span className="font-bold text-sm tracking-wide">{toastMessage}</span>
                    <button type="button" aria-label="Dismiss notification" onClick={() => setToastMessage(null)} className="ml-4 text-teal-200 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            )}
        </PortalLayout>
    );
}