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

        $staff = User::orderBy('department')->orderBy('name')->get();
        $departments = Department::orderBy('category')->orderBy('name')->get();

        return Inertia::render('Admin/Index', [
            'staff' => $staff,
            'departments' => $departments
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
}