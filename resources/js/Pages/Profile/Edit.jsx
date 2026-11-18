import PortalLayout from '@/Layouts/PortalLayout';
import { Head } from '@inertiajs/react';
import DeleteUserForm from './Partials/DeleteUserForm';
import UpdatePasswordForm from './Partials/UpdatePasswordForm';
import UpdateProfileInformationForm from './Partials/UpdateProfileInformationForm';

export default function Edit({ mustVerifyEmail, status }) {
    return (
        <PortalLayout>
            <Head title="Profile" />

            <div className="w-full bg-slate-100 py-8 px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl space-y-6">
                    <div className="border-b border-slate-200 pb-4">
                        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            Account &amp; Profile Settings
                        </h1>
                        <p className="mt-1 text-sm text-slate-600">
                            Manage your display name, email address, and password for RMPH Clearance.
                        </p>
                    </div>

                    <div className="bg-white p-6 shadow-sm border border-slate-200 rounded-xl sm:p-8">
                        <UpdateProfileInformationForm
                            mustVerifyEmail={mustVerifyEmail}
                            status={status}
                            className="max-w-xl"
                        />
                    </div>

                    <div className="bg-white p-6 shadow-sm border border-slate-200 rounded-xl sm:p-8">
                        <UpdatePasswordForm className="max-w-xl" />
                    </div>

                    <div className="bg-white p-6 shadow-sm border border-slate-200 rounded-xl sm:p-8">
                        <DeleteUserForm className="max-w-xl" />
                    </div>
                </div>
            </div>
        </PortalLayout>
    );
}
