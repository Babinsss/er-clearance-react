<?php

use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ClearanceController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

Route::middleware(['auth', 'verified'])->group(function () {
    
    Route::get('/', function (Request $request) {
        $user = auth()->user();
        
        // --- 1. BILLING & CLAIMS LOGIC ---
        if ($user->department === 'Billing & Claims') {
            $clearedPatients = \App\Models\ClearanceTransaction::where('overall_status', 'Cleared')
                ->orderBy('updated_at', 'desc')
                ->get();

            return Inertia::render('Dashboard/Billing', [
                'clearedPatients' => $clearedPatients
            ]);
        }

        // --- 2. LIVE COST CENTER QUEUE LOGIC (UPDATED WITH HISTORY) ---
        $costCenters = ['Laboratory', 'Radiology', 'Pharmacy', 'Cardiopulmonary', 'CSR'];

        if (in_array($user->department, $costCenters)) {
            // Get all clearance logs made by THIS specific department
            $myClearedLogs = \App\Models\ClearanceLog::where('department', $user->department)
                ->orderBy('created_at', 'desc')
                ->get()
                ->keyBy('enccode');
            
            $clearedEnccodes = $myClearedLogs->keys()->toArray();

            // PENDING: Patients in progress that THIS department has NOT cleared yet
            $activeTransactions = \App\Models\ClearanceTransaction::where('overall_status', '!=', 'Cleared')
                ->whereNotIn('enccode', $clearedEnccodes)
                ->orderBy('created_at', 'desc')
                ->get();
            
            $pendingPatients = $activeTransactions->map(function($txn) {
                return [
                    'enccode' => $txn->enccode,
                    'name' => $txn->patient_name,
                    'status' => $txn->overall_status,
                    'date' => $txn->created_at->toIso8601String() // Safer for JS parsing
                ];
            });

            // HISTORY: Patients that THIS department HAS cleared
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
                'historyPatients' => $historyPatients // Pass history to React
            ]);
        }

        // --- 3. LIVE WARD DASHBOARD LOGIC ---
        $search = $request->input('search');
        $patient = null;
        $clearances = [];

        $wardTransactions = \App\Models\ClearanceTransaction::where('room_ward', $user->department)
            ->orderBy('updated_at', 'desc')
            ->get();

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

    Route::post('/transactions', [ClearanceController::class, 'storeTransaction'])->name('transactions.store');
    Route::get('/clearance/{enccode}', [ClearanceController::class, 'show'])->name('clearance.show')->where('enccode', '.*');
    Route::post('/clearance', [ClearanceController::class, 'store'])->name('clearance.store');
    
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