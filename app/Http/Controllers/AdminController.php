<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Department;
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

    // --- STAFF MANAGEMENT ---
    public function updateUser(Request $request, $id)
    {
        if ($request->user()->department !== 'ICT / Admin') abort(403);

        $request->validate([
            'department' => 'required|string',
            'name' => 'required|string|max:255',
            'email' => 'required|email'
        ]);

        User::findOrFail($id)->update($request->only('name', 'email', 'department'));
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