<?php

namespace App\Http\Controllers;

use App\Models\CreditPromissoryNote;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CreditPromissoryController extends Controller
{
    /**
     * Display a listing of promissory notes with search and filters.
     */
    public function index(Request $request)
    {
        $search = trim($request->input('search', ''));
        $category = $request->input('category', 'All');
        $hasBalance = $request->boolean('has_balance', false);
        $isPn = $request->boolean('is_pn', false);
        $isAbsconded = $request->boolean('is_absconded', false);
        $status = $request->input('status', 'All');

        $query = CreditPromissoryNote::query();

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('patient_name', 'like', "%{$search}%")
                  ->orWhere('guarantor_name', 'like', "%{$search}%")
                  ->orWhere('address', 'like', "%{$search}%")
                  ->orWhere('or_number', 'like', "%{$search}%")
                  ->orWhere('remarks', 'like', "%{$search}%")
                  ->orWhere('fa_grantor', 'like', "%{$search}%");
            });
        }

        if ($category && $category !== 'All') {
            $query->where('sheet_category', $category);
        }

        if ($hasBalance) {
            $query->where('remaining_balance', '>', 0);
        }

        if ($isPn) {
            $query->where('is_pn', true);
        }

        if ($isAbsconded) {
            $query->where('is_absconded', true);
        }

        if ($status && $status !== 'All') {
            $query->where('status', $status);
        }

        // Summary Statistics (calculated efficiently on the filtered base or overall)
        $stats = [
            'total_count' => CreditPromissoryNote::count(),
            'with_balance_count' => CreditPromissoryNote::where('remaining_balance', '>', 0)->count(),
            'total_balance_amount' => (float) CreditPromissoryNote::where('remaining_balance', '>', 0)->sum('remaining_balance'),
            'total_pn_count' => CreditPromissoryNote::where('is_pn', true)->count(),
            'total_absconded_count' => CreditPromissoryNote::where('is_absconded', true)->count(),
        ];

        // Categories available
        $categories = [
            'daily trans  2026',
            'daily trans  2025',
            'daily trans  2024',
            'daily trans  BUCAS CENTER',
            'daily transac  CT SCAN',
            'daily transaction  DIALYSIS',
            'PN GAURANTOR RMPH EMPLOYEE',
        ];

        $notes = $query->orderBy('entry_date', 'desc')
            ->orderBy('id', 'desc')
            ->paginate($request->input('per_page', 25));

        return response()->json([
            'notes' => $notes,
            'stats' => $stats,
            'categories' => $categories,
        ]);
    }

    /**
     * Check if a specific patient has active PN or balance.
     */
    public function checkPatient(Request $request)
    {
        $name = trim($request->input('name', ''));
        if (empty($name)) {
            return response()->json([
                'has_records' => false,
                'has_balance' => false,
                'total_balance' => 0,
                'records' => [],
            ]);
        }

        // Clean name e.g. "LASTNAME, FIRSTNAME" or split parts
        $parts = array_filter(preg_split('/[\s,]+/', $name));
        
        $query = CreditPromissoryNote::query();
        if (count($parts) >= 2) {
            $lastName = $parts[0];
            $firstName = $parts[1];
            $query->where(function ($q) use ($name, $lastName, $firstName) {
                $q->where('patient_name', 'like', "%{$name}%")
                  ->orWhere(function ($sub) use ($lastName, $firstName) {
                      $sub->where('patient_name', 'like', "%{$lastName}%")
                          ->where('patient_name', 'like', "%{$firstName}%");
                  });
            });
        } else {
            $query->where('patient_name', 'like', "%{$name}%");
        }

        $records = $query->orderBy('remaining_balance', 'desc')
            ->orderBy('entry_date', 'desc')
            ->take(10)
            ->get();

        $totalBalance = (float) $records->where('remaining_balance', '>', 0)->sum('remaining_balance');
        $hasBalance = $totalBalance > 0;
        $hasActivePn = $records->contains(fn($r) => $r->is_pn && $r->remaining_balance > 0);

        return response()->json([
            'has_records' => $records->isNotEmpty(),
            'has_balance' => $hasBalance,
            'has_active_pn' => $hasActivePn,
            'total_balance' => $totalBalance,
            'records' => $records,
        ]);
    }

    /**
     * Store a newly created promissory note / daily transaction.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'patient_name' => 'required|string|max:255',
            'sheet_category' => 'required|string|max:50',
            'entry_date' => 'nullable|date',
            'address' => 'nullable|string',
            'hospital_bill_balance' => 'nullable|numeric|min:0',
            'is_absconded' => 'nullable|boolean',
            'is_pn' => 'nullable|boolean',
            'pn_amount' => 'nullable|numeric|min:0',
            'is_nbb' => 'nullable|boolean',
            'is_vawc_er' => 'nullable|boolean',
            'is_non_nbb' => 'nullable|boolean',
            'age' => 'nullable|string|max:20',
            'sex' => 'nullable|string|max:10',
            'fa_amount' => 'nullable|numeric|min:0',
            'fa_grantor' => 'nullable|string|max:255',
            'fa_date' => 'nullable|date',
            'cash_paid' => 'nullable|numeric|min:0',
            'or_number' => 'nullable|string|max:100',
            'or_date' => 'nullable|date',
            'discount' => 'nullable|numeric|min:0',
            'dialysis_fee' => 'nullable|numeric|min:0',
            'remaining_balance' => 'nullable|numeric|min:0',
            'guarantor_name' => 'nullable|string|max:255',
            'remarks' => 'nullable|string',
        ]);

        $pnAmount = (float) ($validated['pn_amount'] ?? 0);
        $billBal = (float) ($validated['hospital_bill_balance'] ?? 0);
        $faAmount = (float) ($validated['fa_amount'] ?? 0);
        $cashPaid = (float) ($validated['cash_paid'] ?? 0);
        $discount = (float) ($validated['discount'] ?? 0);

        // Calculate remaining balance if not provided
        if (!isset($validated['remaining_balance']) || $validated['remaining_balance'] === null) {
            $base = $pnAmount > 0 ? $pnAmount : $billBal;
            $rem = max(0, $base - $faAmount - $cashPaid - $discount);
            $validated['remaining_balance'] = $rem;
        }

        $remBal = (float) $validated['remaining_balance'];
        $validated['status'] = $remBal <= 0 ? 'Settled' : 'Active';
        $validated['created_by'] = $request->user() ? $request->user()->name : 'System';

        if ($pnAmount > 0) {
            $validated['is_pn'] = true;
        }

        $note = CreditPromissoryNote::create($validated);

        return response()->json([
            'message' => 'Promissory record saved successfully!',
            'note' => $note,
        ], 201);
    }

    /**
     * Update an existing promissory note.
     */
    public function update(Request $request, $id)
    {
        $note = CreditPromissoryNote::findOrFail($id);

        $validated = $request->validate([
            'patient_name' => 'required|string|max:255',
            'sheet_category' => 'required|string|max:50',
            'entry_date' => 'nullable|date',
            'address' => 'nullable|string',
            'hospital_bill_balance' => 'nullable|numeric|min:0',
            'is_absconded' => 'nullable|boolean',
            'is_pn' => 'nullable|boolean',
            'pn_amount' => 'nullable|numeric|min:0',
            'is_nbb' => 'nullable|boolean',
            'is_vawc_er' => 'nullable|boolean',
            'is_non_nbb' => 'nullable|boolean',
            'age' => 'nullable|string|max:20',
            'sex' => 'nullable|string|max:10',
            'fa_amount' => 'nullable|numeric|min:0',
            'fa_grantor' => 'nullable|string|max:255',
            'fa_date' => 'nullable|date',
            'cash_paid' => 'nullable|numeric|min:0',
            'or_number' => 'nullable|string|max:100',
            'or_date' => 'nullable|date',
            'discount' => 'nullable|numeric|min:0',
            'dialysis_fee' => 'nullable|numeric|min:0',
            'remaining_balance' => 'nullable|numeric|min:0',
            'guarantor_name' => 'nullable|string|max:255',
            'remarks' => 'nullable|string',
            'status' => 'nullable|string|max:30',
        ]);

        $remBal = (float) ($validated['remaining_balance'] ?? $note->remaining_balance);
        if (!isset($validated['status'])) {
            $validated['status'] = $remBal <= 0 ? 'Settled' : 'Active';
        }

        $note->update($validated);

        return response()->json([
            'message' => 'Promissory record updated successfully!',
            'note' => $note,
        ]);
    }

    /**
     * Delete a promissory note.
     */
    public function destroy(Request $request, $id)
    {
        $note = CreditPromissoryNote::findOrFail($id);
        $note->delete();

        return response()->json([
            'message' => 'Promissory record deleted successfully!',
        ]);
    }
}
