import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function TurnaroundChart() {
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        axios.get('/admin/analytics')
            .then(response => {
                setStats(response.data);
                setLoading(false);
            })
            .catch(error => {
                console.error("Error fetching analytics:", error);
                setError(true);
                setLoading(false);
            });
    }, []);

    // Find the highest minute value to correctly scale the 100% width of the bars
    const maxMinutes = Math.max(...Object.values(stats), 1);

    if (loading) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-pulse">
                <div className="h-5 w-48 bg-slate-200 rounded mb-2"></div>
                <div className="h-3 w-64 bg-slate-100 rounded mb-8"></div>
                <div className="space-y-5">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i}>
                            <div className="flex justify-between mb-1">
                                <div className="h-3 w-24 bg-slate-200 rounded"></div>
                                <div className="h-3 w-8 bg-slate-200 rounded"></div>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-3"></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-rose-50 p-6 rounded-xl border border-rose-200 text-center">
                <p className="text-rose-600 font-bold text-sm">Failed to load analytics data.</p>
            </div>
        );
    }

    // Sort departments from slowest (top) to fastest (bottom)
    const sortedData = Object.entries(stats).sort((a, b) => b[1] - a[1]);

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 mb-1">Department Turnaround Time</h3>
                    <p className="text-xs text-slate-500">Average time to clear a patient (Last 30 Days)</p>
                </div>
                <div className="p-2 bg-teal-50 rounded-lg">
                    <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                </div>
            </div>
            
            <div className="space-y-5">
                {sortedData.length === 0 ? (
                    <p className="text-sm text-slate-400 font-medium italic text-center py-4">No clearance data available yet.</p>
                ) : (
                    sortedData.map(([dept, minutes]) => {
                        // Calculate width percentage relative to the slowest department
                        const widthPercent = (minutes / maxMinutes) * 100;
                        
                        // Dynamic color coding based on threshold limits
                        let barColor = 'from-teal-400 to-teal-500'; // Under 15 mins (Fast)
                        let textColor = 'text-teal-700';
                        
                        if (minutes > 30) {
                            barColor = 'from-rose-400 to-rose-500'; // Over 30 mins (Bottleneck)
                            textColor = 'text-rose-700';
                        } else if (minutes > 15) {
                            barColor = 'from-amber-400 to-amber-500'; // 15-30 mins (Warning)
                            textColor = 'text-amber-700';
                        }

                        return (
                            <div key={dept} className="relative group">
                                <div className="flex justify-between text-xs font-bold mb-1.5">
                                    <span className="text-slate-700 uppercase tracking-wide">{dept}</span>
                                    <span className={textColor}>{minutes} mins</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                    <div 
                                        className={`bg-gradient-to-r ${barColor} h-full rounded-full transition-all duration-1000 ease-out`}
                                        style={{ width: `${widthPercent}%` }}
                                    ></div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    );
}