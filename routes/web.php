<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ClearanceController;
use App\Http\Controllers\AdminController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth; // <-- ADDED AUTH FACADE
use Inertia\Inertia;

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

            return Inertia::render('Dashboard/Billing', [
                'clearedPatients' => $clearedPatients
            ]);
        }

        // --- 2. LIVE COST CENTER QUEUE LOGIC ---
        // Dynamically check if the user's department is categorized as a 'Cost Center' in the database
        $deptRecord = \App\Models\Department::where('name', $user->department)->first();
        
        // Safety fallback array (now includes 'Cardio Pulmo')
        $costCenters = ['Laboratory', 'Radiology', 'Pharmacy', 'Cardiopulmonary', 'CSR', 'Cardio Pulmo'];

        // Trigger if the database category is 'Cost Center' OR if the name is in the fallback array
        if (($deptRecord && $deptRecord->category === 'Cost Center') || in_array($user->department, $costCenters)) {
            
            $myClearedLogs = \App\Models\ClearanceLog::where('department', $user->department)
                ->orderBy('created_at', 'desc')
                ->get()
                ->keyBy('enccode');
            
            $clearedEnccodes = $myClearedLogs->keys()->toArray();

            $activeTransactions = \App\Models\ClearanceTransaction::where('overall_status', '!=', 'Cleared')
                ->whereNotIn('enccode', $clearedEnccodes)
                ->orderBy('created_at', 'desc')
                ->get();
            
            $pendingPatients = $activeTransactions->map(function($txn) {
                return [
                    'enccode' => $txn->enccode,
                    'name' => $txn->patient_name,
                    'status' => $txn->overall_status,
                    'date' => $txn->created_at->toIso8601String() 
                ];
            });

            $completedTransactions = \App\Models\ClearanceTransaction::whereIn('enccode', $clearedEnccodes)
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

        // Fetch all clearance logs for the active queue
        $enccodes = $wardTransactions->pluck('enccode')->toArray();
        $allLogs = \App\Models\ClearanceLog::whereIn('enccode', $enccodes)->get()->groupBy('enccode');

        // Attach the cleared departments to each transaction
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
    Route::put('/admin/users/{id}', [AdminController::class, 'updateUser'])->name('admin.users.update');
    Route::delete('/admin/users/{id}', [AdminController::class, 'deleteUser'])->name('admin.users.destroy');
    
    Route::post('/admin/departments', [AdminController::class, 'storeDepartment'])->name('admin.departments.store');
    Route::put('/admin/departments/{id}', [AdminController::class, 'updateDepartment'])->name('admin.departments.update');
    Route::delete('/admin/departments/{id}', [AdminController::class, 'deleteDepartment'])->name('admin.departments.destroy');

    // --- CLEARANCE ROUTES ---
    Route::post('/transactions', [ClearanceController::class, 'storeTransaction'])->name('transactions.store');
    Route::get('/clearance/{enccode}', [ClearanceController::class, 'show'])->name('clearance.show')->where('enccode', '.*');
    Route::post('/clearance', [ClearanceController::class, 'store'])->name('clearance.store');
    
    // --- PRINT ROUTE ---
    Route::get('/print-clearance/{enccode}', function ($enccode) {
        $transaction = \App\Models\ClearanceTransaction::where('enccode', $enccode)->firstOrFail();
        
        $logs = \App\Models\ClearanceLog::where('enccode', $enccode)
            ->join('users', 'clearance_logs.user_id', '=', 'users.id')
            ->select('clearance_logs.department', 'users.name', 'clearance_logs.created_at') 
            ->get();

        return Inertia::render('Clearance/PrintF07', [
            'transaction' => $transaction,
            'logs' => $logs
        ]);
    })->name('clearance.print')->where('enccode', '.*');

}); 

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

require __DIR__.'/auth.php';