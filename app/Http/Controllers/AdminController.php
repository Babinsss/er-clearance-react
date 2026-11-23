<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Department;
use App\Models\ClearanceLog;
use App\Services\DepartmentOperatingHours;
use Illuminate\Http\Request;
use Inertia\Inertia;

class AdminController extends Controller
{
    public function index(Request $request)
    {
        if ($request->user()->department !== 'ICT / Admin') {
            abort(403, 'Unauthorized action.');
        }

        $staff = User::orderBy('department')->orderBy('name')->get()->map(function ($u) {
            $isOnline = (bool) ($u->is_online && $u->last_seen_at && $u->last_seen_at->gt(now()->subMinutes(5)));
            return [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'department' => $u->department,
                'is_online' => $isOnline,
                'last_seen_at' => $u->last_seen_at ? $u->last_seen_at->toIso8601String() : null,
                'last_seen_human' => $u->last_seen_at ? $u->last_seen_at->diffForHumans() : 'Never logged in',
                'last_login_at' => $u->last_login_at ? $u->last_login_at->toIso8601String() : null,
                'last_ip_address' => $u->last_ip_address,
            ];
        });
        $departments = Department::orderBy('category')->orderBy('name')->get();

        $txQuery = \App\Models\ClearanceTransaction::orderBy('created_at', 'desc');

        if ($request->filled('search')) {
            $search = trim($request->search);
            $txQuery->where(function ($q) use ($search) {
                $q->where('patient_name', 'like', "%{$search}%")
                  ->orWhere('hospital_number', 'like', "%{$search}%")
                  ->orWhere('enccode', 'like', "%{$search}%")
                  ->orWhere('room_ward', 'like', "%{$search}%");
            });
            $transactions = $txQuery->take(150)->get();
        } else {
            $transactions = $txQuery->take(200)->get();
        }

        $enccodes = $transactions->pluck('enccode')->toArray();
        $allLogs = ClearanceLog::whereIn('enccode', $enccodes)->get()->groupBy('enccode');

        $transactions->transform(function ($tx) use ($allLogs) {
            $tx->cleared_departments = isset($allLogs[$tx->enccode])
                ? $allLogs[$tx->enccode]->pluck('department')->toArray()
                : [];
            return $tx;
        });

        return Inertia::render('Admin/Index', [
            'staff' => $staff,
            'departments' => $departments,
            'transactions' => $transactions,
        ]);
    }

    // --- NEW: ANALYTICS ENGINE ---
    public function getAnalytics(Request $request)
    {
        if ($request->user()->department !== 'ICT / Admin') abort(403);

        // Fetch logs from the last 30 days
        $logs = ClearanceLog::where('created_at', '>=', now()->subDays(30))
            ->with('transaction') 
            ->get();

        $operatingHours = new DepartmentOperatingHours();
        $departmentStats = [];

        foreach ($logs as $log) {
            if (!$log->transaction) continue;

            $wardTime = $log->transaction->created_at;
            $clearTime = $log->created_at;
            $dept = $log->department;

            $metrics = $operatingHours->calculateMetrics($dept, $wardTime, $clearTime);
            if ($metrics['off_hours_cleared'] && $metrics['effective_seconds'] === 0) {
                continue;
            }

            // Calculate effective turnaround time in minutes
            $minutes = (int) round($metrics['effective_seconds'] / 60);

            if (!isset($departmentStats[$dept])) {
                $departmentStats[$dept] = ['total_minutes' => 0, 'count' => 0];
            }

            $departmentStats[$dept]['total_minutes'] += $minutes;
            $departmentStats[$dept]['count']++;
        }

        $averages = [];
        foreach ($departmentStats as $dept => $data) {
            $averages[$dept] = round($data['total_minutes'] / $data['count']);
        }

        return response()->json($averages);
    }

    // --- STAFF MANAGEMENT ---
    public function storeUser(Request $request)
    {
        if ($request->user()->department !== 'ICT / Admin') abort(403);

        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
            'department' => 'required|string',
        ]);

        User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => \Illuminate\Support\Facades\Hash::make($request->password),
            'department' => $request->department,
        ]);

        return back();
    }

    public function updateUser(Request $request, $id)
    {
        if ($request->user()->department !== 'ICT / Admin') abort(403);

        $request->validate([
            'department' => 'required|string',
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email,'.$id,
            'password' => 'nullable|string|min:8',
        ]);

        $user = User::findOrFail($id);
        $data = $request->only('name', 'email', 'department');

        if ($request->filled('password')) {
            $data['password'] = \Illuminate\Support\Facades\Hash::make($request->password);
        }

        $user->update($data);
        return back();
    }

    public function deleteUser(Request $request, $id)
    {
        if ($request->user()->department !== 'ICT / Admin') abort(403);
        User::findOrFail($id)->delete();
        return back();
    }

    // --- DEPARTMENT MANAGEMENT ---
    public function storeDepartment(Request $request)
    {
        if ($request->user()->department !== 'ICT / Admin') abort(403);

        $request->validate([
            'name' => 'required|string|unique:departments,name',
            'category' => 'required|string'
        ]);

        Department::create($request->only('name', 'category'));
        return back();
    }

    public function updateDepartment(Request $request, $id)
    {
        if ($request->user()->department !== 'ICT / Admin') abort(403);

        $request->validate([
            'name' => 'required|string|unique:departments,name,'.$id,
            'category' => 'required|string'
        ]);

        Department::findOrFail($id)->update($request->only('name', 'category'));
        return back();
    }

    public function deleteDepartment(Request $request, $id)
    {
        if ($request->user()->department !== 'ICT / Admin') abort(403);
        Department::findOrFail($id)->delete();
        return back();
    }

    // --- ROUTED PATIENT MANAGEMENT ---
    public function updateTransaction(Request $request, $id)
    {
        if ($request->user()->department !== 'ICT / Admin') abort(403);

        $validated = $request->validate([
            'hospital_number' => 'required|string|max:255',
            'patient_name' => 'required|string|max:255',
            'room_ward' => 'required|string|max:255',
            'arrival_datetime' => 'nullable|string',
            'disposition' => 'nullable|string|max:255',
            'overall_status' => 'required|string|in:Routing in Progress,Cleared,Cancelled,Archived',
            'is_oecb' => 'nullable|boolean',
            'has_oxygen' => 'nullable|boolean',
            'oxygen_remarks' => 'nullable|string',
            'requires_or' => 'nullable|boolean',
            'requires_nicu' => 'nullable|boolean',
        ]);

        $tx = \App\Models\ClearanceTransaction::findOrFail($id);

        $arrival = !empty($validated['arrival_datetime'])
            ? date('Y-m-d H:i:s', strtotime($validated['arrival_datetime']))
            : null;

        $newStatus = $validated['overall_status'];

        $wardDept = strtolower(trim($validated['room_ward']));
        $isErWard = $wardDept === 'emergency room' || $wardDept === 'er' || str_contains($wardDept, 'emergency');
        $isOutpatientWard = str_contains($wardDept, 'outpatient') || 
                            str_contains($wardDept, 'opd') || 
                            str_contains($wardDept, 'hemodialysis') || 
                            str_contains($wardDept, 'dialysis') || 
                            str_contains($wardDept, 'hdu');
        $allowsAdditionalClearance = !$isErWard && !$isOutpatientWard;

        $tx->update([
            'hospital_number' => $validated['hospital_number'],
            'patient_name' => $validated['patient_name'],
            'room_ward' => $validated['room_ward'],
            'arrival_datetime' => $arrival,
            'disposition' => $validated['disposition'],
            'overall_status' => $newStatus,
            'is_oecb' => (bool) ($validated['is_oecb'] ?? false),
            'has_oxygen' => (bool) ($validated['has_oxygen'] ?? false),
            'oxygen_remarks' => ($validated['has_oxygen'] ?? false) ? $validated['oxygen_remarks'] : null,
            'requires_or' => $allowsAdditionalClearance && (bool) ($validated['requires_or'] ?? false),
            'requires_nicu' => $allowsAdditionalClearance && (bool) ($validated['requires_nicu'] ?? false),
        ]);

        // When room_ward is changed to an Outpatient ward, auto-clear standard departments
        if ($isOutpatientWard) {
            $autoDepts = ['Pharmacy', 'Laboratory', 'Radiology', 'Cardio Pulmo', 'CSR'];
            foreach ($autoDepts as $d) {
                ClearanceLog::firstOrCreate(
                    ['enccode' => $tx->enccode, 'department' => $d],
                    ['user_id' => $request->user()->id]
                );
            }
        }

        if ($newStatus === 'Cancelled') {
            ClearanceLog::where('enccode', $tx->enccode)->delete();
        } elseif ($newStatus !== 'Archived') {
            \App\Http\Controllers\ClearanceController::recalculateStatus($tx->enccode);
        }

        return back();
    }

    public function clearAllCostCenters(Request $request, $id)
    {
        if ($request->user()->department !== 'ICT / Admin') abort(403);

        $tx = \App\Models\ClearanceTransaction::findOrFail($id);

        if ($tx->overall_status === 'Cancelled' || $tx->overall_status === 'Archived') {
            return back();
        }

        $requiredDepartments = BillingController::getRequiredDepartmentsForWard(
            $tx->room_ward,
            (bool) $tx->requires_or,
            (bool) $tx->requires_nicu
        );

        $existingLogs = ClearanceLog::where('enccode', $tx->enccode)->get();

        foreach ($requiredDepartments as $dept) {
            if (!BillingController::matchDepartmentLog($dept, $existingLogs)) {
                ClearanceLog::create([
                    'enccode' => $tx->enccode,
                    'department' => $dept,
                    'user_id' => $request->user()->id,
                ]);
            }
        }

        \App\Http\Controllers\ClearanceController::recalculateStatus($tx->enccode);

        return back();
    }

    public function cancelTransaction(Request $request, $id)
    {
        if ($request->user()->department !== 'ICT / Admin') abort(403);

        $tx = \App\Models\ClearanceTransaction::findOrFail($id);
        $tx->update(['overall_status' => 'Cancelled']);
        ClearanceLog::where('enccode', $tx->enccode)->delete();

        return back();
    }

    public function reactivateTransaction(Request $request, $id)
    {
        if ($request->user()->department !== 'ICT / Admin') abort(403);

        $tx = \App\Models\ClearanceTransaction::findOrFail($id);
        $tx->update(['overall_status' => 'Routing in Progress']);
        \App\Http\Controllers\ClearanceController::recalculateStatus($tx->enccode);

        return back();
    }

    public function deleteTransaction(Request $request, $id)
    {
        if ($request->user()->department !== 'ICT / Admin') abort(403);

        $tx = \App\Models\ClearanceTransaction::findOrFail($id);
        ClearanceLog::where('enccode', $tx->enccode)->delete();
        $tx->delete();

        return back();
    }
}
