import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import PrimaryButton from '@/Components/PrimaryButton';
import TextInput from '@/Components/TextInput';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';

export default function ForgotPassword({ status }) {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
    });

    const submit = (e) => {
        e.preventDefault();

        post(route('password.email'));
    };

    return (
        <GuestLayout>
            <Head title="Forgot Password" />

            <div className="mb-5">
                <h1 className="text-xl font-extrabold text-slate-900">
                    Reset Your Password
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                    Enter your registered email address and we will send a password reset link.
                </p>
            </div>

            {status && (
                <div role="status" className="mb-4 rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-sm font-medium text-teal-800">
                    {status}
                </div>
            )}

            <form onSubmit={submit} className="space-y-4">
                <div>
                    <InputLabel htmlFor="email" value="Email Address" />

                    <TextInput
                        id="email"
                        type="email"
                        name="email"
                        value={data.email}
                        className="mt-1 block w-full"
                        isFocused={true}
                        placeholder="staff@rmph.gov.ph"
                        onChange={(e) => setData('email', e.target.value)}
                    />

                    <InputError message={errors.email} className="mt-2" />
                </div>

                <div className="flex items-center justify-between pt-2">
                    <Link
                        href={route('login')}
                        className="text-sm font-semibold text-teal-600 hover:text-teal-700 underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                    >
                        Back to Login
                    </Link>
                    <PrimaryButton disabled={processing}>
                        Email Reset Link
                    </PrimaryButton>
                </div>
            </form>
        </GuestLayout>
    );
}
