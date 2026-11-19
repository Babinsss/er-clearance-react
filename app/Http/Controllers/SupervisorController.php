<?php

namespace App\Http\Controllers;

use App\Models\ClearanceLog;
use App\Models\ClearanceTransaction;
use App\Models\Department;
use Illuminate\Http\Request;
use Inertia\Inertia;

class SupervisorController extends Controller
{
    /**
     * Check if the authenticated user has Supervisor or Admin privileges.
     */
    private function authorizeSupervisor(Request $request)
    {
        $dept = strtolower(trim($request->user()->department ?? ''));
        $isAuthorized = $dept === 'supervisor' || 
                        str_contains($dept, 'supervisor') || 
                        $dept === 'ict / admin';

        if (!$isAuthorized) {
            abort(403, 'Unauthorized access to the Supervisor portal.');
        }
    }

    /**
     * Display the Supervisor Dashboard with all routed patients.
     */
    public function index(Request $request)
    {
        $this->authorizeSupervisor($request);

        $txQuery = ClearanceTransaction::orderBy('updated_at', 'desc');

        if ($request->filled('search')) {
            $search = trim($request->search);
            $txQuery->where(function ($q) use ($search) {
                $q->where('patient_name', 'like', "%{$search}%")
                  ->orWhere('hospital_number', 'like', "%{$search}%")
                  ->orWhere('enccode', 'like', "%{$search}%")
                  ->orWhere('room_ward', 'like', "%{$search}%")
                  ->orWhere('encoded_by', 'like', "%{$search}%");
            });
            $transactions = $txQuery->take(150)->get();
        } else {
            $transactions = $txQuery->take(300)->get();
        }

        $enccodes = $transactions->pluck('enccode')->toArray();
        $allLogs = ClearanceLog::whereIn('enccode', $enccodes)
            ->orderBy('created_at', 'asc')
            ->get()
            ->groupBy('enccode');

        $transactions->transform(function ($tx) use ($allLogs) {
            $tx->cleared_departments = isset($allLogs[$tx->enccode])
                ? $allLogs[$tx->enccode]->pluck('department')->toArray()
                : [];
            return $tx;
        });

        // Wards available in the hospital for routing & assignment
        $wards = Department::where('category', 'Ward')
            ->orderBy('name')
            ->pluck('name')
            ->toArray();

        if (empty($wards)) {
            $wards = ['Emergency Room', 'Surgical Ward', 'Ortho Ward', 'OB Ward', 'Outpatient'];
        }

        return Inertia::render('Dashboard/Supervisor', [
            'transactions' => $transactions,
            'wards' => $wards,
        ]);
    }

    /**
     * Update details of a specific routed patient.
     */
    public function updateTransaction(Request $request, $id)
    {
        $this->authorizeSupervisor($request);

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

        $tx = ClearanceTransaction::findOrFail($id);

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

        // If cancelled, delete logs matching AdminController behaviour
        if ($newStatus === 'Cancelled') {
            ClearanceLog::where('enccode', $tx->enccode)->delete();
        } elseif ($newStatus !== 'Archived') {
            ClearanceController::recalculateStatus($tx->enccode);
        }

        return back()->with('success', "Patient record for {$tx->patient_name} updated successfully.");
    }

    /**
     * Cancel clearance routing for a patient.
     */
    public function cancelTransaction(Request $request, $id)
    {
        $this->authorizeSupervisor($request);

        $tx = ClearanceTransaction::findOrFail($id);
        $tx->update(['overall_status' => 'Cancelled']);
        ClearanceLog::where('enccode', $tx->enccode)->delete();

        return back()->with('success', "Clearance routing for {$tx->patient_name} has been cancelled.");
    }

    /**
     * Re-activate clearance routing for a previously cancelled patient.
     */
    public function reactivateTransaction(Request $request, $id)
    {
        $this->authorizeSupervisor($request);

        $tx = ClearanceTransaction::findOrFail($id);
        $tx->update(['overall_status' => 'Routing in Progress']);
        ClearanceController::recalculateStatus($tx->enccode);

        return back()->with('success', "Clearance routing for {$tx->patient_name} has been re-activated.");
    }
}
