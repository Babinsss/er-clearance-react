<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ClearanceController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\SupervisorController;
use App\Http\Controllers\CreditPromissoryController;
use App\Http\Controllers\BillingController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth; 
use Inertia\Inertia;

// --- PUBLIC TV DISPLAY ROUTE (ER ONLY) ---
Route::get('/tv-queue', function () {
    $baseQuery = \App\Models\ClearanceTransaction::where('overall_status', 'Cleared')
        ->where('room_ward', 'Emergency Room'); // STRICTLY locked to ER patients only

    $totalReadyCount = (clone $baseQuery)->count();
    $readyForBilling = $baseQuery
        ->orderBy('updated_at', 'desc')
        ->take(8)
        ->get();

    return Inertia::render('Dashboard/TvDisplay', [
        'patients' => $readyForBilling,
        'totalReadyCount' => $totalReadyCount,
    ]);
})->name('tv.queue');


Route::middleware(['auth', 'verified'])->group(function () {
    
    Route::get('/', function () { 
        $user = Auth::user(); 
        
        // --- 0. ICT / ADMIN LOGIC ---
        if ($user->department === 'ICT / Admin') {
            return redirect()->route('admin.index');
        }

        // --- 0.1 SUPERVISOR LOGIC ---
        if ($user->department === 'Supervisor' || str_contains(strtolower($user->department), 'supervisor')) {
            return redirect()->route('supervisor.index');
        }
        
        // --- 1. BILLING & CLAIMS LOGIC (INCLUDES HEAD OF BILLING & CLAIMS) ---
        $deptLower = strtolower(trim($user->department ?? ''));
        if (in_array($deptLower, ['billing & claims', 'billing', 'claims', 'billing and claims', 'head of billing & claims', 'head of billing and claims', 'billing head'], true)) {
            return app(BillingController::class)->index(request());
        }

        // --- 2. LIVE COST CENTER QUEUE LOGIC ---
        $deptRecord = \App\Models\Department::where('name', $user->department)->first();
        $costCenters = ['Laboratory', 'Radiology', 'Pharmacy', 'Cardiopulmonary', 'CSR', 'Cardio Pulmo', 'OR', 'LR/DR', 'LR / DR', 'HDU', 'Operating Room', 'Delivery Room', 'Dialysis', 'Credit and Collection', 'Credit & Collection'];

        if (($deptRecord && $deptRecord->category === 'Cost Center') || in_array($user->department, $costCenters)) {
            
            $myClearedLogs = \App\Models\ClearanceLog::where('department', $user->department)
                ->with('user:id,name')
                ->orderBy('created_at', 'desc')
                ->get()
                ->keyBy('enccode');
            
            $clearedEnccodes = $myClearedLogs->keys()->toArray();

            $activeQuery = \App\Models\ClearanceTransaction::whereNotIn('overall_status', ['Cleared', 'Cancelled', 'Archived'])
                ->whereNotIn('enccode', $clearedEnccodes);

            $completedQuery = \App\Models\ClearanceTransaction::where('overall_status', '!=', 'Cancelled')
                ->whereIn('enccode', $clearedEnccodes);

            // Filter ward-specific cost centers to their designated originating wards
            $deptUpper = strtoupper(trim($user->department));

            if ($deptUpper === 'OR' || $deptUpper === 'OPERATING ROOM') {
                $orWards = ['Surgical Ward', 'Surgical', 'Surgery', 'Ortho Ward', 'Ortho', 'Orthopedic'];
                $activeQuery->where(function($q) use ($orWards) {
                    $q->where('requires_or', true);
                    foreach ($orWards as $w) {
                        $q->orWhere('room_ward', 'like', "%{$w}%");
                    }
                });
                $completedQuery->where(function($q) use ($orWards) {
                    $q->where('requires_or', true);
                    foreach ($orWards as $w) {
                        $q->orWhere('room_ward', 'like', "%{$w}%");
                    }
                });
            } elseif ($deptUpper === 'NICU' || str_contains($deptUpper, 'NEONATAL')) {
                $activeQuery->where('requires_nicu', true);
                $completedQuery->where('requires_nicu', true);
            } elseif ($deptUpper === 'LR/DR' || $deptUpper === 'LR / DR' || $deptUpper === 'LR' || $deptUpper === 'DR' || $deptUpper === 'DELIVERY ROOM') {
                $lrWards = ['OB Ward', 'OB', 'Obstetrics', 'OB-GYN'];
                $activeQuery->where(function($q) use ($lrWards) {
                    foreach ($lrWards as $w) {
                        $q->orWhere('room_ward', 'like', "%{$w}%");
                    }
                });
                $completedQuery->where(function($q) use ($lrWards) {
                    foreach ($lrWards as $w) {
                        $q->orWhere('room_ward', 'like', "%{$w}%");
                    }
                });
            } elseif ($deptUpper === 'HDU' || $deptUpper === 'CKD' || str_contains($deptUpper, 'DIALYSIS')) {
                $hduWards = ['Outpatient', 'Outpatient Department', 'OPD', 'Hemodialysis Ward', 'Hemodialysis', 'Dialysis Unit', 'Dialysis'];
                $activeQuery->where(function($q) use ($hduWards) {
                    foreach ($hduWards as $w) {
                        $q->orWhere('room_ward', 'like', "%{$w}%");
                    }
                });
                $completedQuery->where(function($q) use ($hduWards) {
                    foreach ($hduWards as $w) {
                        $q->orWhere('room_ward', 'like', "%{$w}%");
                    }
                });
            } elseif (str_contains($deptUpper, 'CREDIT') || str_contains($deptUpper, 'COLLECT')) {
                // Credit and Collection: applicable for admitted patients only and not for ER
                $nonAdmittedWards = ['Emergency Room', 'ER', 'Emergency', 'Outpatient', 'OPD'];
                $activeQuery->where(function($q) use ($nonAdmittedWards) {
                    $q->whereNotNull('room_ward');
                    foreach ($nonAdmittedWards as $w) {
                        $q->where('room_ward', 'not like', "%{$w}%");
                    }
                });
                $completedQuery->where(function($q) use ($nonAdmittedWards) {
                    $q->whereNotNull('room_ward');
                    foreach ($nonAdmittedWards as $w) {
                        $q->where('room_ward', 'not like', "%{$w}%");
                    }
                });
            }

            $activeTransactions = $activeQuery->orderBy('created_at', 'desc')->get();
            $activeEnccodes = $activeTransactions->pluck('enccode')->toArray();
            $pendingRemarksByEnccode = \App\Models\ClearancePendingRemark::whereIn('enccode', $activeEnccodes)
                ->with('user:id,name')
                ->get()
                ->groupBy('enccode');
            $canonicalUserDept = BillingController::resolveCanonicalCostCenter($user->department) ?? $user->department;
            $operatingHours = new \App\Services\DepartmentOperatingHours();
            $now = now();
            $departmentSchedule = $operatingHours->getStatusAt($canonicalUserDept, $now);

            $pendingPatients = $activeTransactions->map(function($txn) use ($pendingRemarksByEnccode, $canonicalUserDept, $operatingHours, $now) {
                $matchedRemark = BillingController::matchDepartmentRemark(
                    $canonicalUserDept,
                    $pendingRemarksByEnccode->get($txn->enccode, collect())
                );
                $effectiveWaitingSec = $operatingHours->calculateEffectiveSeconds($canonicalUserDept, $txn->created_at, $now);
                return [
                    'enccode' => $txn->enccode,
                    'hospital_number' => $txn->hospital_number,
                    'name' => $txn->patient_name,
                    'ward' => $txn->room_ward,
                    'diagnosis' => $txn->diagnosis,
                    'status' => $txn->overall_status,
                    'reroute_count' => (int) ($txn->reroute_count ?? 0),
                    'reroute_reason' => $txn->reroute_reason,
                    'rerouted_by' => $txn->rerouted_by,
                    'date' => $txn->created_at->toIso8601String(),
                    'effective_waiting_seconds' => $effectiveWaitingSec,
                    'effective_waiting_minutes' => (int) floor($effectiveWaitingSec / 60),
                    'pending_remark' => $matchedRemark ? [
                        'remarks' => $matchedRemark->remarks,
                        'updated_by' => $matchedRemark->user->name ?? 'Staff',
                        'updated_at' => $matchedRemark->updated_at?->toIso8601String(),
                    ] : null,
                ];
            });

            $completedTransactions = $completedQuery
                ->orderBy('updated_at', 'desc')
                ->get();

            $historyPatients = $completedTransactions->map(function($txn) use ($myClearedLogs) {
                $log = $myClearedLogs[$txn->enccode];
                return [
                    'enccode' => $txn->enccode,
                    'hospital_number' => $txn->hospital_number,
                    'name' => $txn->patient_name,
                    'ward' => $txn->room_ward,
                    'diagnosis' => $txn->diagnosis,
                    'overall_status' => $txn->overall_status,
                    'cleared_by' => $log->user->name ?? 'Staff',
                    'cleared_day' => $log->created_at->timezone('Asia/Manila')->toDateString(),
                    'cleared_date' => $log->created_at->toIso8601String(),
                ];
            });

            return Inertia::render('Dashboard/CostCenter', [
                'department' => $user->department,
                'departmentSchedule' => $departmentSchedule,
                'todayDate' => now('Asia/Manila')->toDateString(),
                'pendingPatients' => $pendingPatients,
                'historyPatients' => $historyPatients 
            ]);
        }

        // --- 3. LIVE WARD DASHBOARD LOGIC ---
        $search = request('search');
        $patient = null;
        $clearances = [];

        $rawWardTransactions = \App\Models\ClearanceTransaction::where('room_ward', $user->department)
            ->orderBy('updated_at', 'desc')
            ->get();

        foreach ($rawWardTransactions->where('overall_status', 'Routing in Progress') as $tx) {
            \App\Http\Controllers\ClearanceController::recalculateStatus($tx->enccode);
        }

        $wardTransactions = \App\Models\ClearanceTransaction::where('room_ward', $user->department)
            ->orderBy('updated_at', 'desc')
            ->get();

        $enccodes = $wardTransactions->pluck('enccode')->toArray();
        $allLogs = \App\Models\ClearanceLog::whereIn('enccode', $enccodes)->get()->groupBy('enccode');
        $allPendingRemarks = \App\Models\ClearancePendingRemark::whereIn('enccode', $enccodes)
            ->with('user:id,name')
            ->orderBy('updated_at', 'desc')
            ->get()
            ->groupBy('enccode');

        $wardTransactions->transform(function($tx) use ($allLogs, $allPendingRemarks) {
            $tx->cleared_departments = isset($allLogs[$tx->enccode]) 
                ? $allLogs[$tx->enccode]->pluck('department')->toArray() 
                : [];
            $tx->pending_remarks = isset($allPendingRemarks[$tx->enccode])
                ? $allPendingRemarks[$tx->enccode]->map(fn($r) => [
                    'department' => $r->department,
                    'remarks' => $r->remarks,
                    'updated_by' => $r->user->name ?? 'Staff',
                    'updated_at' => $r->updated_at?->toIso8601String(),
                ])->values()->toArray()
                : [];
            return $tx;
        });

        $activeQueue = $wardTransactions->where('overall_status', 'Routing in Progress')->values();
        $clearedQueue = $wardTransactions->where('overall_status', 'Cleared')->values();

        // Incoming NICU Clearances when logged into NICU Ward
        $incomingNicuPending = [];
        $incomingNicuHistory = [];
        $isNicuStation = strtoupper(trim($user->department ?? '')) === 'NICU' || str_contains(strtolower($user->department ?? ''), 'neonatal');
        if ($isNicuStation) {
            $nicuClearedLogs = \App\Models\ClearanceLog::whereRaw("UPPER(TRIM(department)) = 'NICU'")
                ->orderBy('created_at', 'desc')
                ->get()
                ->keyBy('enccode');
            $nicuClearedEnccodes = $nicuClearedLogs->keys()->toArray();

            $nicuPendingTxns = \App\Models\ClearanceTransaction::where('requires_nicu', true)
                ->where('room_ward', '!=', $user->department)
                ->whereNotIn('overall_status', ['Cleared', 'Cancelled', 'Archived'])
                ->whereNotIn('enccode', $nicuClearedEnccodes)
                ->orderBy('created_at', 'desc')
                ->get();

            $nicuRemarksByEnccode = \App\Models\ClearancePendingRemark::whereIn('enccode', $nicuPendingTxns->pluck('enccode'))
                ->with('user:id,name')
                ->get()
                ->groupBy('enccode');

            $incomingNicuPending = $nicuPendingTxns
                ->map(function ($txn) use ($nicuRemarksByEnccode) {
                    $matchedRemark = BillingController::matchDepartmentRemark(
                        'NICU',
                        $nicuRemarksByEnccode->get($txn->enccode, collect())
                    );
                    return [
                        'enccode' => $txn->enccode,
                        'hospital_number' => $txn->hospital_number,
                        'name' => $txn->patient_name,
                        'ward' => $txn->room_ward,
                        'disposition' => $txn->disposition,
                        'diagnosis' => $txn->diagnosis,
                        'status' => $txn->overall_status,
                        'date' => $txn->created_at->toIso8601String(),
                        'pending_remark' => $matchedRemark ? [
                            'remarks' => $matchedRemark->remarks,
                            'updated_by' => $matchedRemark->user->name ?? 'Staff',
                            'updated_at' => $matchedRemark->updated_at?->toIso8601String(),
                        ] : null,
                    ];
                })
                ->values();

            $incomingNicuHistory = \App\Models\ClearanceTransaction::where('requires_nicu', true)
                ->where('room_ward', '!=', $user->department)
                ->where('overall_status', '!=', 'Cancelled')
                ->whereIn('enccode', $nicuClearedEnccodes)
                ->orderBy('updated_at', 'desc')
                ->get()
                ->map(fn($txn) => [
                    'enccode' => $txn->enccode,
                    'hospital_number' => $txn->hospital_number,
                    'name' => $txn->patient_name,
                    'ward' => $txn->room_ward,
                    'disposition' => $txn->disposition,
                    'overall_status' => $txn->overall_status,
                    'cleared_date' => $nicuClearedLogs[$txn->enccode]->created_at->toIso8601String(),
                ])
                ->values();
        }

        if ($search) {
            $encounter = DB::connection('ihomis')->table('henctr')
                ->join('hperson', 'henctr.hpercode', '=', 'hperson.hpercode')
                ->where('henctr.enccode', $search)
                ->orWhere('henctr.hpercode', $search)
                ->orderBy('henctr.encdate', 'desc')
                ->select([
                    'henctr.enccode',
                    'henctr.hpercode',
                    DB::raw("CONCAT(hperson.patlast, ', ', hperson.patfirst) as full_name") 
                ])
                ->first();

            if ($encounter) {
                $transaction = \App\Models\ClearanceTransaction::where('enccode', $encounter->enccode)->first();

                $patient = [
                    'enccode' => $encounter->enccode,
                    'hpercode' => $encounter->hpercode,
                    'name' => $encounter->full_name,
                    'is_routed' => ($transaction && $transaction->overall_status !== 'Cancelled') ? true : false,
                    'overall_status' => $transaction ? $transaction->overall_status : null,
                    'can_reroute' => (bool) (
                        $transaction
                        && in_array($transaction->overall_status, ['Cleared', 'Archived'], true)
                        && strcasecmp(trim((string) $transaction->room_ward), trim((string) $user->department)) === 0
                    ),
                    'reroute_count' => (int) ($transaction->reroute_count ?? 0),
                    'reroute_reason' => $transaction ? $transaction->reroute_reason : null,
                    'is_oecb' => $transaction ? (bool) $transaction->is_oecb : null,
                    'is_for_procedure' => $transaction ? (bool) $transaction->is_for_procedure : false,
                    'procedure_type' => $transaction ? ($transaction->procedure_type ?? '') : '',
                    'arrival_datetime' => $transaction && $transaction->arrival_datetime 
                        ? date('Y-m-d\TH:i', strtotime($transaction->arrival_datetime)) 
                        : '',
                    'disposition' => $transaction ? $transaction->disposition : '',
                    'diagnosis' => $transaction ? ($transaction->diagnosis ?? '') : '',
                    'requires_or' => (bool) ($transaction->requires_or ?? false),
                    'requires_nicu' => (bool) ($transaction->requires_nicu ?? false),
                ];

                $clearances = \App\Models\ClearanceLog::where('enccode', $encounter->enccode)
                    ->pluck('department')
                    ->toArray();
            }
        }

        return Inertia::render('Dashboard/Ward', [
            'searchQuery' => $search ?? '',
            'patient' => $patient,
            'clearances' => $clearances,
            'activeQueue' => $activeQueue,
            'clearedQueue' => $clearedQueue,
            'incomingNicuPending' => $incomingNicuPending,
            'incomingNicuHistory' => $incomingNicuHistory,
        ]);
        
    })->name('dashboard');

    // --- ADMIN ROUTES ---
    Route::get('/admin', [AdminController::class, 'index'])->name('admin.index');
    Route::get('/admin/analytics', [AdminController::class, 'getAnalytics'])->name('admin.analytics');
    Route::post('/admin/users', [AdminController::class, 'storeUser'])->name('admin.users.store');
    Route::put('/admin/users/{id}', [AdminController::class, 'updateUser'])->name('admin.users.update');
    Route::delete('/admin/users/{id}', [AdminController::class, 'deleteUser'])->name('admin.users.destroy');
    
    Route::post('/admin/departments', [AdminController::class, 'storeDepartment'])->name('admin.departments.store');
    Route::put('/admin/departments/{id}', [AdminController::class, 'updateDepartment'])->name('admin.departments.update');
    Route::delete('/admin/departments/{id}', [AdminController::class, 'deleteDepartment'])->name('admin.departments.destroy');

    Route::put('/admin/transactions/{id}', [AdminController::class, 'updateTransaction'])->name('admin.transactions.update');
    Route::post('/admin/transactions/{id}/clear-all', [AdminController::class, 'clearAllCostCenters'])->name('admin.transactions.clear-all');
    Route::post('/admin/transactions/{id}/cancel', [AdminController::class, 'cancelTransaction'])->name('admin.transactions.cancel');
    Route::post('/admin/transactions/{id}/reactivate', [AdminController::class, 'reactivateTransaction'])->name('admin.transactions.reactivate');
    Route::delete('/admin/transactions/{id}', [AdminController::class, 'deleteTransaction'])->name('admin.transactions.destroy');

    // --- SUPERVISOR ROUTES ---
    Route::get('/supervisor', [SupervisorController::class, 'index'])->name('supervisor.index');
    Route::put('/supervisor/transactions/{id}', [SupervisorController::class, 'updateTransaction'])->name('supervisor.transactions.update');
    Route::post('/supervisor/transactions/{id}/cancel', [SupervisorController::class, 'cancelTransaction'])->name('supervisor.transactions.cancel');
    Route::post('/supervisor/transactions/{id}/reactivate', [SupervisorController::class, 'reactivateTransaction'])->name('supervisor.transactions.reactivate');

    // --- BILLING ROUTES ---
    Route::get('/billing', [BillingController::class, 'index'])->name('billing.index');
    Route::get('/billing/analytics', [BillingController::class, 'getCostCenterAnalytics'])->name('billing.analytics');
    Route::get('/billing/reports', [BillingController::class, 'routedReports'])->name('billing.reports');
    Route::get('/billing/reports/print', [BillingController::class, 'printRoutedReports'])->name('billing.reports.print');
    Route::get('/billing/reports/csv', [BillingController::class, 'exportRoutedReportsCsv'])->name('billing.reports.csv');

    // --- CLEARANCE ROUTES ---
    Route::post('/transactions', [ClearanceController::class, 'storeTransaction'])->name('transactions.store');
    Route::post('/clearance', [ClearanceController::class, 'store'])->name('clearance.store');
    Route::post('/clearance/pending-remarks', [ClearanceController::class, 'storePendingRemark'])->name('clearance.pending-remarks.store');
    Route::post('/clearance/reroute', [ClearanceController::class, 'rerouteTransaction'])->name('clearance.reroute');
    Route::get('/cost-center/reports/print', [ClearanceController::class, 'printCostCenterDailyReport'])->name('cost-center.reports.print');
    Route::post('/clearance/archive', function (Request $request) {
        \App\Models\ClearanceTransaction::where('enccode', $request->enccode)->update(['overall_status' => 'Archived']);
        return back();
    })->name('clearance.archive');
    
    // SAFE FETCH ROUTE (Bypasses Apache Slash Blocking)
    Route::get('/clearance-data/fetch', function (Request $request) {
        // 1. Grab the heavily-slashed iHomis code from the safe URL parameter
        $enccode = $request->query('enccode');
        
        // 2. Properly instantiate the controller so PHP doesn't complain about static calls
        $controller = app(\App\Http\Controllers\ClearanceController::class);
        
        // 3. Pass both the Request object and the string exactly as the controller expects
        return $controller->show($request, $enccode);
    })->name('clearance.show.safe');
    
    // --- SAFE PRINT ROUTE ---
    Route::get('/print-clearance/document', function (Request $request) {
        $enccode = $request->query('enccode');
        $transaction = \App\Models\ClearanceTransaction::where('enccode', $enccode)->firstOrFail();
        
        $logs = \App\Models\ClearanceLog::where('enccode', $enccode)
            ->join('users', 'clearance_logs.user_id', '=', 'users.id')
            ->select('clearance_logs.department', 'users.name', 'clearance_logs.created_at') 
            ->get();

        return Inertia::render('Clearance/PrintF07', [
            'transaction' => $transaction,
            'logs' => $logs
        ]);
    })->name('clearance.print');

    // --- CREDIT & COLLECTION PROMISSORY NOTES & REPORTS API ROUTES ---
    Route::get('/credit-promissory/notes', [CreditPromissoryController::class, 'index'])->name('credit.notes.index');
    Route::get('/credit-promissory/grantors', [CreditPromissoryController::class, 'grantors'])->name('credit.grantors.index');
    Route::get('/credit-promissory/grantor-patients', [CreditPromissoryController::class, 'grantorPatients'])->name('credit.grantor.patients');
    Route::get('/credit-promissory/nbb-patients', [CreditPromissoryController::class, 'nbbPatients'])->name('credit.nbb.patients');
    Route::post('/credit-promissory/grantors', [CreditPromissoryController::class, 'storeGrantor'])->name('credit.grantors.store');
    Route::put('/credit-promissory/grantors/{id}', [CreditPromissoryController::class, 'updateGrantor'])->name('credit.grantors.update');
    Route::delete('/credit-promissory/grantors/{id}', [CreditPromissoryController::class, 'destroyGrantor'])->name('credit.grantors.destroy');
    Route::get('/credit-promissory/reports', [CreditPromissoryController::class, 'reports'])->name('credit.reports.index');
    Route::get('/credit-promissory/check-patient', [CreditPromissoryController::class, 'checkPatient'])->name('credit.notes.check');
    Route::post('/credit-promissory/notes', [CreditPromissoryController::class, 'store'])->name('credit.notes.store');
    Route::put('/credit-promissory/notes/{id}', [CreditPromissoryController::class, 'update'])->name('credit.notes.update');
    Route::delete('/credit-promissory/notes/{id}', [CreditPromissoryController::class, 'destroy'])->name('credit.notes.destroy');

}); 

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

require __DIR__.'/auth.php';
