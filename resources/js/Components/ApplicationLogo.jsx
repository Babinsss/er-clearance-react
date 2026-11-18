export default function ApplicationLogo({ className = '' }) {
    return (
        <div className={`inline-flex items-center space-x-2.5 ${className}`}>
            <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center overflow-hidden border border-slate-700 shrink-0">
                <img
                    src="/images/capiz.jpg"
                    alt="Province of Capiz Seal"
                    className="w-full h-full object-contain p-0.5"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.nextElementSibling) {
                            e.currentTarget.nextElementSibling.style.display = 'flex';
                        }
                    }}
                />
                <span className="hidden text-slate-900 text-[11px] font-bold text-center leading-none">
                    CAPIZ
                </span>
            </div>
            <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center overflow-hidden border border-slate-700 shrink-0">
                <img
                    src="/images/rmph.jpg"
                    alt="RMPH Logo"
                    className="w-full h-full object-contain p-0.5"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.nextElementSibling) {
                            e.currentTarget.nextElementSibling.style.display = 'flex';
                        }
                    }}
                />
                <span className="hidden text-rose-700 text-[11px] font-bold text-center leading-none">
                    RMPH
                </span>
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
                RMPH <span className="text-teal-400">Clearance</span>
            </span>
        </div>
    );
}
