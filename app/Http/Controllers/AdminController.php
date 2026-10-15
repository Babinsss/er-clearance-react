<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Department;
use App\Models\ClearanceLog;
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

        $transactions = \App\Models\ClearanceTransaction::orderBy('created_at', 'desc')
            ->take(200)
            ->get();

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

        $departmentStats = [];

        foreach ($logs as $log) {
            if (!$log->transaction) continue;

            $wardTime = $log->transaction->created_at;
            $clearTime = $log->created_at;
            
            // Calculate turnaround time in minutes
            $minutes = $wardTime->diffInMinutes($clearTime);
            $dept = $log->department;

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