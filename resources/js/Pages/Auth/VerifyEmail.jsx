import PrimaryButton from '@/Components/PrimaryButton';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';

export default function VerifyEmail({ status }) {
    const { post, processing } = useForm({});

    const submit = (e) => {
        e.preventDefault();

        post(route('verification.send'));
    };

    return (
        <GuestLayout>
            <Head title="Email Verification" />

            <h1 className="text-xl font-extrabold text-slate-900 mb-2">
                Verify Your Email
            </h1>
            <div className="mb-4 text-sm text-slate-600">
                Before getting started, please verify your email address by
                clicking the link sent to your inbox.
            </div>

            {status === 'verification-link-sent' && (
                <div role="status" className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-sm font-medium text-teal-800">
                    A new verification link has been sent to the email address
                    you provided during registration.
                </div>
            )}

            <form onSubmit={submit}>
                <div className="mt-4 flex items-center justify-between">
                    <PrimaryButton disabled={processing}>
                        Resend Verification Email
                    </PrimaryButton>

                    <Link
                        href={route('logout')}
                        method="post"
                        as="button"
                        className="rounded-md text-sm font-semibold text-slate-600 underline hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                    >
                        Log Out
                    </Link>
                </div>
            </form>
        </GuestLayout>
    );
}
