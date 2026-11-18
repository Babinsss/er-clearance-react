import React from 'react';
import Modal from '@/Components/Modal';

const TONE_STYLES = {
    danger: {
        iconWrap: 'bg-rose-100 text-rose-700',
        button: 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500 text-white',
    },
    warning: {
        iconWrap: 'bg-amber-100 text-amber-700',
        button: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500 text-white',
    },
    teal: {
        iconWrap: 'bg-teal-100 text-teal-700',
        button: 'bg-teal-600 hover:bg-teal-700 focus-visible:ring-teal-500 text-white',
    },
};

/**
 * Shared accessible confirmation / notice dialog built on Components/Modal.jsx.
 */
export default function ConfirmDialog({
    show = false,
    onClose = () => {},
    onConfirm = null,
    title = 'Confirm Action',
    message = '',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'danger',
    loading = false,
    alertOnly = false,
    zIndexClass = 'z-[350]',
}) {
    const styles = TONE_STYLES[tone] || TONE_STYLES.danger;
    const isNotice = alertOnly || !onConfirm;

    return (
        <Modal
            show={show}
            onClose={() => { if (!loading) onClose(); }}
            closeable={!loading}
            maxWidth="md"
            zIndexClass={zIndexClass}
            panelClassName="border border-slate-200"
        >
            <div className="p-6">
                <div className="flex items-start gap-4">
                    <div className={`shrink-0 rounded-full p-2.5 ${styles.iconWrap}`} aria-hidden="true">
                        {tone === 'teal' ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-base font-extrabold text-slate-900">
                            {title}
                        </h3>
                        {message && (
                            <p className="mt-2 text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                                {message}
                            </p>
                        )}
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-2.5 border-t border-slate-100 pt-4">
                    {!isNotice && (
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                            {cancelLabel}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            if (isNotice) {
                                onClose();
                            } else {
                                onConfirm();
                            }
                        }}
                        disabled={loading}
                        className={`px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${styles.button}`}
                    >
                        {loading ? 'Processing...' : (isNotice ? 'OK' : confirmLabel)}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
