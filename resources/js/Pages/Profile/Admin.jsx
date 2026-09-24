import React, { useState } from 'react';
import { Head, useForm, router } from '@inertiajs/react';
import PortalLayout from '@/Layouts/PortalLayout';

export default function Admin({ stats = {}, users = [], wards = [], costCenters = [] }) {
    const [showModal, setShowModal] = useState(false);
    
    // Inertia useForm handles our state, submission, and validation errors seamlessly
    const { data, setData, post, delete: destroy, processing, errors, reset, clearErrors } = useForm({
        id: null,
        name: '',
        email: '',
        account_type: '',
        custom_department: '',
        password: ''
    });

    const isEditMode = !!data.id;

    const openAddModal = () => {
        reset();
        clearErrors();
        setShowModal(true);
    };

    const submitUser = (e) => {
        e.preventDefault();
        post('/admin/users', {
            preserveScroll: true,
            onSuccess: () => {
                setShowModal(false);
                reset();
                alert(isEditMode ? "Account updated!" : "Staff account provisioned successfully!");
            }
        });
    };

    const revokeUser = (userId) => {
        if(confirm("Are you absolutely sure you want to revoke access? This cannot be undone.")) {
            destroy(`/admin/users/${userId}`, {
                preserveScroll: true,
                onSuccess: () => alert("Access revoked.")
            });
        }
    };

    return (
        <PortalLayout>
            <Head title="ICT Command Center" />
            
            <div className="w-full max-w-7xl mx-auto space-y-6 p-6 font-sans">
                {/* HEADER */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">ICT Command Center</h1>
                        <p className="text-sm text-slate-500 font-medium mt-1">System Administration & Access Control</p>
                    </div>
                    <div className="mt-4 md:mt-0 flex items-center space-x-3 bg-teal-50 px-4 py-2 rounded-lg border border-teal-100">
                        <div className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse"></div>
                        <span className="text-teal-700 text-xs font-bold uppercase tracking-widest">Network Active</span>
                    </div>
                </div>

                {/* STATS GRID */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        </div>
                        <div>
                            <div className="text-2xl font-black text-slate-800">{stats.total_users || '0'}</div>
                            <div className="text-xs font-bold text-slate-500 uppercase">System Users</div>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        </div>
                        <div>
                            <div className="text-2xl font-black text-slate-800">{stats.total_transactions || '0'}</div>
                            <div className="text-xs font-bold text-slate-500 uppercase">Total Clearances</div>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
                        <div className="p-3 bg-rose-50 text-rose-600 rounded-lg">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <div>
                            <div className="text-2xl font-black text-slate-800">{stats.pending_transactions || '0'}</div>
                            <div className="text-xs font-bold text-slate-500 uppercase">Active / Pending</div>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                        <div>
                            <div className="text-2xl font-black text-slate-800">{stats.cleared_patients || '0'}</div>
                            <div className="text-xs font-bold text-slate-500 uppercase">Fully Cleared</div>
                        </div>
                    </div>
                </div>

                {/* USER MANAGEMENT TABLE */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-slate-800">Hospital Staff Directory</h3>
                        <button onClick={openAddModal} className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm flex items-center space-x-2 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                            <span>Provision Account</span>
                        </button>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-slate-500 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                                    <th className="p-4">Staff Member</th>
                                    <th className="p-4">System Role</th>
                                    <th className="p-4">Assigned Location</th>
                                    <th className="p-4">Date Registered</th>
                                    <th className="p-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-slate-100">
                                {users.map((user, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-4">
                                            <div className="font-bold text-slate-800">{user.name}</div>
                                            <div className="text-xs text-slate-500 mt-0.5">{user.email}</div>
                                        </td>
                                        
                                        <td className="p-4">
                                            {user.role === 'admin' ? (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-slate-800 text-white">Administrator</span>
                                            ) : (user.role === 'ward_station' || user.role === 'er_nurse') ? (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-teal-100 text-teal-800">Clinical Station</span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-100 text-indigo-800">Cost Center</span>
                                            )}
                                        </td>

                                        <td className="p-4 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                                            {user.department || '—'}
                                        </td>

                                        <td className="p-4 text-xs font-medium text-slate-500">
                                            {new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                        </td>

                                        <td className="p-4 text-center">
                                            <button className="text-slate-400 hover:text-rose-600 transition-colors p-1" title="Revoke Access" onClick={() => revokeUser(user.id)}>
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ADD/EDIT STAFF MODAL */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in-up">
                        <div className="bg-slate-50 border-b border-slate-200 p-5 flex justify-between items-center">
                            <h3 className="text-slate-800 font-bold text-lg flex items-center space-x-2">
                                <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
                                <span>{isEditMode ? 'Edit Staff Profile' : 'Provision New Staff'}</span>
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        
                        <form onSubmit={submitUser} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Full Name</label>
                                    <input type="text" value={data.name} onChange={e => setData('name', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500" required />
                                    {errors.name && <span className="text-rose-500 text-xs mt-1 block">{errors.name}</span>}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Email</label>
                                    <input type="email" value={data.email} onChange={e => setData('email', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500" required />
                                    {errors.email && <span className="text-rose-500 text-xs mt-1 block">{errors.email}</span>}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Hospital Location & Role</label>
                                <select value={data.account_type} onChange={e => setData('account_type', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500" required>
                                    <option value="">Select assignment...</option>
                                    <optgroup label="System Admins">
                                        <option value="admin">System Administrator</option>
                                    </optgroup>
                                    <optgroup label="Clinical Wards & Stations">
                                        {wards.map((w, i) => <option key={i} value={`ward:${w}`}>{w}</option>)}
                                        <option value="new_ward" className="font-bold text-teal-600">+ Add New Ward...</option>
                                    </optgroup>
                                    <optgroup label="Ancillary & Cost Centers">
                                        {costCenters.map((cc, i) => <option key={i} value={`cc:${cc}`}>{cc}</option>)}
                                        <option value="new_cost_center" className="font-bold text-teal-600">+ Add New Cost Center...</option>
                                    </optgroup>
                                </select>
                                {errors.account_type && <span className="text-rose-500 text-xs mt-1 block">{errors.account_type}</span>}
                            </div>

                            {(data.account_type === 'new_ward' || data.account_type === 'new_cost_center') && (
                                <div className="mt-3 p-3 bg-teal-50 border border-teal-100 rounded-lg animate-fade-in-up">
                                    <label className="block text-xs font-bold text-teal-700 uppercase tracking-wide mb-1">
                                        {data.account_type === 'new_ward' ? 'New Ward Name' : 'New Cost Center Name'}
                                    </label>
                                    <input type="text" value={data.custom_department} onChange={e => setData('custom_department', e.target.value)} placeholder={data.account_type === 'new_ward' ? 'e.g. Ward 1, ICU...' : 'e.g. Dietary, MSWD...'} className="w-full px-3 py-2 bg-white border border-teal-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 shadow-sm" required />
                                    {errors.custom_department && <span className="text-rose-500 text-xs mt-1 block">{errors.custom_department}</span>}
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Password</label>
                                <input type="password" value={data.password} onChange={e => setData('password', e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500" placeholder={isEditMode ? 'Leave blank to keep current' : 'Enter a secure password'} required={!isEditMode} />
                                {errors.password && <span className="text-rose-500 text-xs mt-1 block">{errors.password}</span>}
                            </div>

                            <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100 mt-6">
                                <button type="button" onClick={() => setShowModal(false)} disabled={processing} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                                <button type="submit" disabled={processing} className="px-6 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-400 text-white text-sm font-bold rounded-lg shadow-sm transition-colors">
                                    {processing ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Create Account')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </PortalLayout>
    );
}