<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ClearanceController;
use App\Http\Controllers\AdminController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth; 
use Inertia\Inertia;

// --- PUBLIC TV DISPLAY ROUTE (ER ONLY) ---
Route::get('/tv-queue', function () {
    $readyForBilling = \App\Models\ClearanceTransaction::where('overall_status', 'Cleared')
        ->where('room_ward', 'Emergency Room') // STRICTLY locked to ER patients only
        ->orderBy('updated_at', 'desc')
        ->take(8)
        ->get();

    return Inertia::render('Dashboard/TvDisplay', [
        'patients' => $readyForBilling
    ]);
})->name('tv.queue');


Route::middleware(['auth', 'verified'])->group(function () {
    
    Route::get('/', function () { 
        $user = Auth::user(); 
        
        // --- 0. ICT / ADMIN LOGIC ---
        if ($user->department === 'ICT / Admin') {
            return redirect()->route('admin.index');
        }
        
        // --- 1. BILLING & CLAIMS LOGIC ---
        if ($user->department === 'Billing & Claims') {
            $clearedPatients = \App\Models\ClearanceTransaction::where('overall_status', 'Cleared')
                ->orderBy('updated_at', 'desc')
                ->get();

            $archivedPatients = \App\Models\ClearanceTransaction::where('overall_status', 'Archived')
                ->orderBy('updated_at', 'desc')
                ->take(50) 
                ->get();

            return Inertia::render('Dashboard/Billing', [
                'clearedPatients' => $clearedPatients,
                'archivedPatients' => $archivedPatients
            ]);
        }

        // --- 2. LIVE COST CENTER QUEUE LOGIC ---
        $deptRecord = \App\Models\Department::where('name', $user->department)->first();
        $costCenters = ['Laboratory', 'Radiology', 'Pharmacy', 'Cardiopulmonary', 'CSR', 'Cardio Pulmo', 'OR', 'LR/DR', 'LR / DR', 'HDU', 'Operating Room', 'Delivery Room', 'Dialysis'];

        if (($deptRecord && $deptRecord->category === 'Cost Center') || in_array($user->department, $costCenters)) {
            
            $myClearedLogs = \App\Models\ClearanceLog::where('department', $user->department)
                ->orderBy('created_at', 'desc')
                ->get()
                ->keyBy('enccode');
            
            $clearedEnccodes = $myClearedLogs->keys()->toArray();

            $activeQuery = \App\Models\ClearanceTransaction::where('overall_status', '!=', 'Cleared')
                ->whereNotIn('enccode', $clearedEnccodes);

            $completedQuery = \App\Models\ClearanceTransaction::whereIn('enccode', $clearedEnccodes);

            // Filter ward-specific cost centers to their designated originating wards
            $deptUpper = strtoupper(trim($user->department));

            if ($deptUpper === 'OR' || $deptUpper === 'OPERATING ROOM') {
                $orWards = ['Surgical Ward', 'Surgical', 'Surgery', 'Ortho Ward', 'Ortho', 'Orthopedic'];
                $activeQuery->where(function($q) use ($orWards) {
                    foreach ($orWards as $w) {
                        $q->orWhere('room_ward', 'like', "%{$w}%");
                    }
                });
                $completedQuery->where(function($q) use ($orWards) {
                    foreach ($orWards as $w) {
                        $q->orWhere('room_ward', 'like', "%{$w}%");
                    }
                });
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
            }

            $activeTransactions = $activeQuery->orderBy('created_at', 'desc')->get();
            
            $pendingPatients = $activeTransactions->map(function($txn) {
                return [
                    'enccode' => $txn->enccode,
                    'name' => $txn->patient_name,
                    'status' => $txn->overall_status,
                    'date' => $txn->created_at->toIso8601String() 
                ];
            });

            $completedTransactions = $completedQuery
                ->orderBy('updated_at', 'desc')
                ->get();

            $historyPatients = $completedTransactions->map(function($txn) use ($myClearedLogs) {
                return [
                    'enccode' => $txn->enccode,
                    'name' => $txn->patient_name,
                    'overall_status' => $txn->overall_status,
                    'cleared_date' => $myClearedLogs[$txn->enccode]->created_at->toIso8601String()
                ];
            });

            return Inertia::render('Dashboard/CostCenter', [
                'department' => $user->department,
                'pendingPatients' => $pendingPatients,
                'historyPatients' => $historyPatients 
            ]);
        }

        // --- 3. LIVE WARD DASHBOARD LOGIC ---
        $search = request('search');
        $patient = null;
        $clearances = [];

        $wardTransactions = \App\Models\ClearanceTransaction::where('room_ward', $user->department)
            ->orderBy('updated_at', 'desc')
            ->get();

        $enccodes = $wardTransactions->pluck('enccode')->toArray();
        $allLogs = \App\Models\ClearanceLog::whereIn('enccode', $enccodes)->get()->groupBy('enccode');

        $wardTransactions->transform(function($tx) use ($allLogs) {
            $tx->cleared_departments = isset($allLogs[$tx->enccode]) 
                ? $allLogs[$tx->enccode]->pluck('department')->toArray() 
                : [];
            return $tx;
        });

        $activeQueue = $wardTransactions->where('overall_status', 'Routing in Progress')->values();
        $clearedQueue = $wardTransactions->where('overall_status', 'Cleared')->values();

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
                    'is_routed' => $transaction ? true : false,
                    'arrival_datetime' => $transaction && $transaction->arrival_datetime 
                        ? date('Y-m-d\TH:i', strtotime($transaction->arrival_datetime)) 
                        : '',
                    'disposition' => $transaction ? $transaction->disposition : '',
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

    // --- CLEARANCE ROUTES ---
    Route::post('/transactions', [ClearanceController::class, 'storeTransaction'])->name('transactions.store');
    Route::post('/clearance', [ClearanceController::class, 'store'])->name('clearance.store');
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

}); 

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

require __DIR__.'/auth.php';