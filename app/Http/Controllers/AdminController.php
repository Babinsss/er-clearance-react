<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules;

class AdminController extends Controller
{
    public function store(Request $request)
    {
        // 1. Validate incoming Inertia Request
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255' . ($request->id ? ",{$request->id}" : '|unique:users'),
            'account_type' => 'required|string',
            'custom_department' => 'required_if:account_type,new_ward,new_cost_center',
            'password' => $request->id ? 'nullable|min:8' : 'required|min:8',
        ]);

        // 2. Parse the Role & Department from the Dropdown Selection
        $role = 'ward_station';
        $department = '';

        if ($request->account_type === 'admin') {
            $role = 'admin';
            $department = 'ICT';
        } elseif (str_starts_with($request->account_type, 'ward:')) {
            $role = 'ward_station';
            $department = str_replace('ward:', '', $request->account_type);
        } elseif (str_starts_with($request->account_type, 'cc:')) {
            $role = 'cost_center';
            $department = str_replace('cc:', '', $request->account_type);
        } elseif ($request->account_type === 'new_ward') {
            $role = 'ward_station';
            $department = $request->custom_department;
        } elseif ($request->account_type === 'new_cost_center') {
            $role = 'cost_center';
            $department = $request->custom_department;
        }

        // 3. Create or Update the User
        $user = User::findOrNew($request->id);
        $user->name = $request->name;
        $user->email = $request->email;
        $user->role = $role;
        $user->department = $department;
        
        if ($request->filled('password')) {
            $user->password = Hash::make($request->password);
        }
        
        $user->save();

        return redirect()->back();
    }

    public function destroy(User $user)
    {
        $user->delete();
        return redirect()->back();
    }
}