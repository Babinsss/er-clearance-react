import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import PortalLayout from '@/Layouts/PortalLayout';
import TurnaroundChart from '@/Components/TurnaroundChart'; // <-- IMPORTED CHART

export default function AdminDashboard({ staff, departments = [] }) {
    // Default to analytics tab so the chart is the first thing the Admin sees
    const [activeTab, setActiveTab] = useState('analytics'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [toastMessage, setToastMessage] = useState(null);
    
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

    const filteredStaff = staff.filter(user => 
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        user.department.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredDepts = departments.filter(dept => 
        dept.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        dept.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const showToast = (message) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 3000);
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
        if (confirm(`Delete the account for ${name}?`)) {
            router.delete(`/admin/users/${id}`, {
                preserveScroll: true,
                onSuccess: () => showToast(`Account for ${name} has been deleted.`)
            });
        }
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
        if (confirm(`Delete ${name} from the system? This will remove it from all dropdowns.`)) {
            router.delete(`/admin/departments/${id}`, {
                preserveScroll: true,
                onSuccess: () => showToast(`${name} has been removed.`)
            });
        }
    };

    return (
        <PortalLayout>
            <Head title="ICT Admin Portal" />
            
            <div className="flex flex-col md:flex-row gap-6 w-full p-6 bg-slate-100 min-h-[calc(100vh-64px)] font-sans">
                
                {/* LEFT SIDEBAR */}
                <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 p-5 flex flex-col shrink-0 w-full md:w-[260px] text-white relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-800 to-transparent opacity-50"></div>
                    <div className="relative z-10 mb-8 px-2 pt-2 border-b border-slate-700 pb-4">
                        <h2 className="text-[10px] font-black text-teal-400 uppercase tracking-widest mb-1">System Administration</h2>
                        <div className="text-xl font-bold text-white">ICT Portal</div>
                    </div>

                    <nav className="relative z-10 space-y-2 flex-1">
                        <button onClick={() => setActiveTab('analytics')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'analytics' ? 'bg-teal-500/20 text-teal-300 border-l-4 border-teal-400' : 'text-slate-400 hover:bg-slate-800 border-l-4 border-transparent'}`}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                            <span>Analytics Overview</span>
                        </button>

                        <button onClick={() => setActiveTab('staff')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'staff' ? 'bg-teal-500/20 text-teal-300 border-l-4 border-teal-400' : 'text-slate-400 hover:bg-slate-800 border-l-4 border-transparent'}`}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                            <span>Staff Accounts</span>
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
                                {activeTab === 'analytics' ? 'Hospital Performance' : (activeTab === 'staff' ? 'Staff Access Management' : 'Hospital Departments')}
                            </h3>
                            <p className="text-xs text-slate-500 font-medium">
                                {activeTab === 'analytics' ? 'Monitor live department clearance speeds.' : (activeTab === 'staff' ? 'View and modify hospital staff roles.' : 'Manage available wards and cost centers.')}
                            </p>
                        </div>
                        
                        <div className="flex items-center space-x-4 w-full md:w-auto">
                            {activeTab !== 'analytics' && (
                                <div className="w-full md:w-64 relative">
                                    <svg className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                    <input 
                                        type="text" 
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 rounded-lg border-slate-300 shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm transition-all" 
                                        placeholder={`Search ${activeTab}...`}
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
                                    {activeTab === 'staff' ? (
                                        <tr className="text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200 bg-slate-50">
                                            <th className="p-4 pl-6">Staff Name</th>
                                            <th className="p-4">Email Address</th>
                                            <th className="p-4">Assigned Department</th>
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
                                    {activeTab === 'staff' ? (
                                        filteredStaff.map((user) => (
                                            <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-4 pl-6 font-bold text-slate-800">{user.name}</td>
                                                <td className="p-4 text-slate-500">{user.email}</td>
                                                <td className="p-4">
                                                    <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-1 rounded border border-slate-200">{user.department}</span>
                                                </td>
                                                <td className="p-4 pr-6 text-right">
                                                    <button onClick={() => openEditModal(user)} className="text-teal-600 hover:text-teal-800 font-bold text-xs mr-4 transition-colors">EDIT</button>
                                                    <button onClick={() => handleDeleteUser(user.id, user.name)} className="text-rose-500 hover:text-rose-700 font-bold text-xs transition-colors disabled:opacity-50" disabled={user.department === 'ICT / Admin'}>DELETE</button>
                                                </td>
                                            </tr>
                                        ))
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
            {isAddUserModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Add New User / Admin</h3>
                            <button onClick={() => setIsAddUserModalOpen(false)} className="text-slate-400 hover:text-rose-500 transition-colors">
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
                                    <option value="Billing & Claims">Billing & Claims</option>
                                    {departments
                                        .filter(dept => !['billing & claims', 'ict / admin'].includes(dept.name.trim().toLowerCase()))
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
                    </div>
                </div>
            )}

            {/* EDIT STAFF MODAL */}
            {editingUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Edit Staff Account</h3>
                            <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-rose-500 transition-colors">
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
                                    <option value="Billing & Claims">Billing & Claims</option>
                                    {departments
                                        .filter(dept => !['billing & claims', 'ict / admin'].includes(dept.name.trim().toLowerCase()))
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
                    </div>
                </div>
            )}

            {/* ADD/EDIT DEPARTMENT MODAL */}
            {isDeptModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">{editingDept ? 'Edit Department' : 'Add New Department'}</h3>
                            <button onClick={() => setIsDeptModalOpen(false)} className="text-slate-400 hover:text-rose-500 transition-colors">
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
                    </div>
                </div>
            )}

            {/* SLIDING TOAST NOTIFICATION */}
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