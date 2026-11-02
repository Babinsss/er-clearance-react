<?php

namespace App\Http\Controllers;

use App\Models\CreditPromissoryNote;
use App\Models\CreditGrantor;
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
            'fa_grantor' => 'nullable|string',
            'fa_grantors' => 'nullable|array',
            'fa_grantors.*.grantor' => 'nullable|string',
            'fa_grantors.*.amount' => 'nullable|numeric|min:0',
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

        // Process multiple grantors if provided
        if ($request->has('fa_grantors') && is_array($request->input('fa_grantors'))) {
            $grantors = array_values(array_filter($request->input('fa_grantors'), function($g) {
                return !empty(trim($g['grantor'] ?? '')) || (isset($g['amount']) && (float)$g['amount'] > 0);
            }));

            if (!empty($grantors)) {
                $validated['fa_grantors'] = $grantors;
                $totalFromGrantors = array_reduce($grantors, function($carry, $g) {
                    return $carry + (float) ($g['amount'] ?? 0);
                }, 0.0);

                if ($totalFromGrantors > 0 || empty($validated['fa_amount'])) {
                    $validated['fa_amount'] = $totalFromGrantors;
                }

                $summaryParts = [];
                foreach ($grantors as $g) {
                    $name = trim($g['grantor'] ?? '');
                    $amt = (float) ($g['amount'] ?? 0);
                    if ($name !== '' && $amt > 0) {
                        $summaryParts[] = "{$name} (₱" . number_format($amt, 2) . ")";
                    } elseif ($name !== '') {
                        $summaryParts[] = $name;
                    } elseif ($amt > 0) {
                        $summaryParts[] = "₱" . number_format($amt, 2);
                    }
                }
                if (!empty($summaryParts)) {
                    $validated['fa_grantor'] = implode(' / ', $summaryParts);
                }
            }
        }

        $pnAmount = (float) ($validated['pn_amount'] ?? 0);
        $billBal = (float) ($validated['hospital_bill_balance'] ?? 0);
        $faAmount = (float) ($validated['fa_amount'] ?? 0);
        $cashPaid = (float) ($validated['cash_paid'] ?? 0);
        $discount = (float) ($validated['discount'] ?? 0);

        // Explicitly sanitize numeric and boolean columns so they are never null
        $validated['hospital_bill_balance'] = $billBal;
        $validated['pn_amount'] = $pnAmount;
        $validated['fa_amount'] = $faAmount;
        $validated['cash_paid'] = $cashPaid;
        $validated['discount'] = $discount;
        $validated['dialysis_fee'] = (float) ($validated['dialysis_fee'] ?? 0);
        $validated['is_absconded'] = !empty($validated['is_absconded']);
        $validated['is_pn'] = !empty($validated['is_pn']) || $pnAmount > 0;
        $validated['is_nbb'] = !empty($validated['is_nbb']);
        $validated['is_vawc_er'] = !empty($validated['is_vawc_er']);
        $validated['is_non_nbb'] = !empty($validated['is_non_nbb']);

        if (empty($validated['entry_date'])) $validated['entry_date'] = null;
        if (empty($validated['fa_date'])) $validated['fa_date'] = null;
        if (empty($validated['or_date'])) $validated['or_date'] = null;

        // Calculate remaining balance if not provided
        if (!isset($validated['remaining_balance']) || $validated['remaining_balance'] === null || $validated['remaining_balance'] === '') {
            if ($billBal > 0) {
                $rem = max(0, round($billBal - $faAmount - $pnAmount - $cashPaid - $discount, 2));
            } elseif ($pnAmount > 0) {
                $rem = max(0, round($pnAmount - $faAmount - $cashPaid - $discount, 2));
            } else {
                $rem = 0.0;
            }
            $validated['remaining_balance'] = $rem;
        } else {
            $validated['remaining_balance'] = (float) $validated['remaining_balance'];
        }

        $remBal = (float) $validated['remaining_balance'];
        $validated['status'] = $remBal <= 0 ? 'Settled' : 'Active';
        $validated['created_by'] = $request->user() ? $request->user()->name : 'System';

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
            'fa_grantor' => 'nullable|string',
            'fa_grantors' => 'nullable|array',
            'fa_grantors.*.grantor' => 'nullable|string',
            'fa_grantors.*.amount' => 'nullable|numeric|min:0',
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

        // Process multiple grantors if provided
        if ($request->has('fa_grantors') && is_array($request->input('fa_grantors'))) {
            $grantors = array_values(array_filter($request->input('fa_grantors'), function($g) {
                return !empty(trim($g['grantor'] ?? '')) || (isset($g['amount']) && (float)$g['amount'] > 0);
            }));

            $validated['fa_grantors'] = $grantors;
            if (!empty($grantors)) {
                $totalFromGrantors = array_reduce($grantors, function($carry, $g) {
                    return $carry + (float) ($g['amount'] ?? 0);
                }, 0.0);

                if ($totalFromGrantors > 0 || empty($validated['fa_amount'])) {
                    $validated['fa_amount'] = $totalFromGrantors;
                }

                $summaryParts = [];
                foreach ($grantors as $g) {
                    $name = trim($g['grantor'] ?? '');
                    $amt = (float) ($g['amount'] ?? 0);
                    if ($name !== '' && $amt > 0) {
                        $summaryParts[] = "{$name} (₱" . number_format($amt, 2) . ")";
                    } elseif ($name !== '') {
                        $summaryParts[] = $name;
                    } elseif ($amt > 0) {
                        $summaryParts[] = "₱" . number_format($amt, 2);
                    }
                }
                if (!empty($summaryParts)) {
                    $validated['fa_grantor'] = implode(' / ', $summaryParts);
                }
            }
        }

        $pnAmount = (float) ($validated['pn_amount'] ?? $note->pn_amount);
        $billBal = (float) ($validated['hospital_bill_balance'] ?? $note->hospital_bill_balance);
        $faAmount = (float) ($validated['fa_amount'] ?? $note->fa_amount);
        $cashPaid = (float) ($validated['cash_paid'] ?? $note->cash_paid);
        $discount = (float) ($validated['discount'] ?? $note->discount);

        $validated['hospital_bill_balance'] = $billBal;
        $validated['pn_amount'] = $pnAmount;
        $validated['fa_amount'] = $faAmount;
        $validated['cash_paid'] = $cashPaid;
        $validated['discount'] = $discount;
        if (array_key_exists('dialysis_fee', $validated)) {
            $validated['dialysis_fee'] = (float) ($validated['dialysis_fee'] ?? 0);
        }
        if (array_key_exists('is_absconded', $validated)) {
            $validated['is_absconded'] = !empty($validated['is_absconded']);
        }
        if (array_key_exists('is_pn', $validated)) {
            $validated['is_pn'] = !empty($validated['is_pn']) || $pnAmount > 0;
        }
        if (array_key_exists('is_nbb', $validated)) {
            $validated['is_nbb'] = !empty($validated['is_nbb']);
        }
        if (array_key_exists('is_vawc_er', $validated)) {
            $validated['is_vawc_er'] = !empty($validated['is_vawc_er']);
        }
        if (array_key_exists('is_non_nbb', $validated)) {
            $validated['is_non_nbb'] = !empty($validated['is_non_nbb']);
        }

        if (array_key_exists('entry_date', $validated) && empty($validated['entry_date'])) {
            $validated['entry_date'] = null;
        }
        if (array_key_exists('fa_date', $validated) && empty($validated['fa_date'])) {
            $validated['fa_date'] = null;
        }
        if (array_key_exists('or_date', $validated) && empty($validated['or_date'])) {
            $validated['or_date'] = null;
        }

        if (!isset($validated['remaining_balance']) || $validated['remaining_balance'] === null || $validated['remaining_balance'] === '') {
            if ($billBal > 0) {
                $rem = max(0, round($billBal - $faAmount - $pnAmount - $cashPaid - $discount, 2));
            } elseif ($pnAmount > 0) {
                $rem = max(0, round($pnAmount - $faAmount - $cashPaid - $discount, 2));
            } else {
                $rem = 0.0;
            }
            $validated['remaining_balance'] = $rem;
        } else {
            $validated['remaining_balance'] = (float) $validated['remaining_balance'];
        }

        $remBal = (float) $validated['remaining_balance'];
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

    /**
     * Get list of credit grantors/sponsors for dropdowns and reference.
     */
    public function grantors(Request $request)
    {
        $search = trim($request->input('search', ''));
        $category = $request->input('category', 'All');

        $query = CreditGrantor::where('is_active', true);

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                  ->orWhere('proponent', 'like', "%{$search}%")
                  ->orWhere('saa_number', 'like', "%{$search}%");
            });
        }

        if ($category && $category !== 'All') {
            $query->where('category', $category);
        }

        $grantors = $query->orderBy('category')
            ->orderBy('code')
            ->orderBy('proponent')
            ->get();

        // Distinct categories for filters
        $categories = CreditGrantor::where('is_active', true)
            ->distinct()
            ->pluck('category')
            ->filter()
            ->values();

        return response()->json([
            'grantors' => $grantors,
            'categories' => $categories,
            'total_count' => $grantors->count(),
        ]);
    }

    /**
     * Store a newly encoded SAA budget fund / grantor allotment.
     */
    public function storeGrantor(Request $request)
    {
        $validated = $request->validate([
            'code' => 'nullable|string|max:50',
            'proponent' => 'required|string|max:255',
            'saa_number' => 'nullable|string|max:100',
            'allocated_budget' => 'required|numeric|min:0',
            'category' => 'nullable|string|max:100',
            'remarks' => 'nullable|string',
        ]);

        $code = trim($validated['code'] ?? '');
        $proponent = strtoupper(trim($validated['proponent']));
        $saaNumber = !empty($validated['saa_number']) ? strtoupper(trim($validated['saa_number'])) : null;
        $budget = (float) $validated['allocated_budget'];
        $category = !empty($validated['category']) ? trim($validated['category']) : 'Congressional';

        // Auto-generate code if left blank
        if (empty($code)) {
            $code = 'DOH (SAA)';
        } else {
            $code = strtoupper($code);
        }

        $grantor = CreditGrantor::create([
            'code' => $code,
            'proponent' => $proponent,
            'saa_number' => $saaNumber,
            'allocated_budget' => $budget,
            'utilized_budget' => 0.0,
            'remaining_balance' => $budget,
            'category' => $category,
            'remarks' => $validated['remarks'] ?? null,
            'is_active' => true,
        ]);

        return response()->json([
            'message' => "New SAA budget for {$proponent} encoded successfully!",
            'grantor' => $grantor,
        ], 201);
    }

    /**
     * Update an existing SAA budget fund.
     */
    public function updateGrantor(Request $request, $id)
    {
        $grantor = CreditGrantor::findOrFail($id);

        $validated = $request->validate([
            'code' => 'nullable|string|max:50',
            'proponent' => 'required|string|max:255',
            'saa_number' => 'nullable|string|max:100',
            'allocated_budget' => 'required|numeric|min:0',
            'category' => 'nullable|string|max:100',
            'remarks' => 'nullable|string',
            'is_active' => 'nullable|boolean',
        ]);

        $code = !empty($validated['code']) ? strtoupper(trim($validated['code'])) : $grantor->code;
        $proponent = strtoupper(trim($validated['proponent']));
        $saaNumber = isset($validated['saa_number']) ? (!empty($validated['saa_number']) ? strtoupper(trim($validated['saa_number'])) : null) : $grantor->saa_number;
        $newBudget = (float) $validated['allocated_budget'];
        $category = !empty($validated['category']) ? trim($validated['category']) : $grantor->category;

        // Recalculate remaining balance
        $utilized = (float) $grantor->utilized_budget;
        $rem = max(0, $newBudget - $utilized);

        $grantor->update([
            'code' => $code,
            'proponent' => $proponent,
            'saa_number' => $saaNumber,
            'allocated_budget' => $newBudget,
            'remaining_balance' => $rem,
            'category' => $category,
            'remarks' => $validated['remarks'] ?? $grantor->remarks,
            'is_active' => $request->has('is_active') ? $request->boolean('is_active') : $grantor->is_active,
        ]);

        return response()->json([
            'message' => "SAA budget for {$proponent} updated successfully!",
            'grantor' => $grantor,
        ]);
    }

    /**
     * Delete an SAA grantor fund.
     */
    public function destroyGrantor(Request $request, $id)
    {
        $grantor = CreditGrantor::findOrFail($id);
        $proponent = $grantor->proponent;
        $grantor->delete();

        return response()->json([
            'message' => "SAA budget fund for {$proponent} deleted successfully!",
        ]);
    }

    /**
     * Get patient list and monthly breakdown for an individual grantor / sponsor.
     */
    public function grantorPatients(Request $request)
    {
        $grantorId = $request->input('grantor_id');
        $code = trim($request->input('code', ''));
        $proponent = trim($request->input('proponent', ''));
        $year = $request->input('year', 'All');
        $month = $request->input('month', 'All');
        $search = trim($request->input('search', ''));
        $perPage = $request->input('per_page', 50);

        // Find grantor
        $grantor = null;
        if (!empty($grantorId)) {
            $grantor = CreditGrantor::find($grantorId);
        } elseif (!empty($code)) {
            $grantor = CreditGrantor::where('code', $code)->first();
        } elseif (!empty($proponent)) {
            $grantor = CreditGrantor::where('proponent', $proponent)->first();
        }

        if (!$grantor) {
            // Default to top grantor e.g. DOH (BG) or first available
            $grantor = CreditGrantor::where('code', 'DOH (BG)')->first() ?? CreditGrantor::first();
        }

        if (!$grantor) {
            return response()->json([
                'grantor' => null,
                'patients' => [],
                'monthly_summary' => [],
                'totals' => null,
            ]);
        }

        $codeUpper = strtoupper(trim($grantor->code));
        $propUpper = strtoupper(trim($grantor->proponent));
        $saaUpper = strtoupper(trim($grantor->saa_number ?? ''));

        $genericTerms = [
            'PARTY LIST', 'PL', 'CONG', 'CONGRESSIONAL', 'SEN', 'SENATE',
            'BM', 'M', 'MAYOR', 'GOV', 'GOVERNOR', 'LGU', 'DOH', 'MAIP',
            'PCSO', 'FA', 'FINANCIAL ASSISTANCE', 'SAA', 'DOH (SAA)',
            'DOH (CONG)', 'DOH (PL)', 'DOH (SEN)', 'DOH (BM)', 'DOH (M)',
            'DOH (MAIP)', 'DOH (FA)', 'OTHER GRANTOR', 'GOVERNMENT'
        ];

        // Base query matching this specific grantor
        $baseQuery = CreditPromissoryNote::query();
        $baseQuery->where(function ($q) use ($codeUpper, $propUpper, $saaUpper, $genericTerms) {
            $hasCondition = false;

            // 1. Match by exact SAA Number if present
            if (!empty($saaUpper) && strlen($saaUpper) >= 4) {
                $q->where('fa_grantor', 'like', "%{$saaUpper}%");
                $hasCondition = true;
            }

            // 2. Match by Proponent Name if non-generic
            if (!empty($propUpper) && !in_array($propUpper, $genericTerms)) {
                if ($hasCondition) {
                    $q->orWhere('fa_grantor', 'like', "%{$propUpper}%");
                } else {
                    $q->where('fa_grantor', 'like', "%{$propUpper}%");
                    $hasCondition = true;
                }
            }

            // 3. Match bracketed code [CODE] or exact code (non-generic)
            if (!empty($codeUpper) && !in_array($codeUpper, $genericTerms)) {
                if ($hasCondition) {
                    $q->orWhere('fa_grantor', 'like', "%[{$codeUpper}]%")
                      ->orWhere('fa_grantor', '=', $codeUpper);
                } else {
                    $q->where(function($sq) use ($codeUpper) {
                        $sq->where('fa_grantor', 'like', "%[{$codeUpper}]%")
                           ->orWhere('fa_grantor', '=', $codeUpper);
                    });
                    $hasCondition = true;
                }
            }

            if (!$hasCondition) {
                $q->whereRaw('1 = 0');
            }
        });

        // 1. Calculate Monthly Breakdown for the selected Year
        $monthCalcQuery = (clone $baseQuery);
        if ($year !== 'All') {
            $monthCalcQuery->where(function ($q) use ($year) {
                $q->whereYear('entry_date', $year)
                  ->orWhere('sheet_category', 'like', "%{$year}%");
            });
        }
        $monthStats = $monthCalcQuery->whereNotNull('entry_date')
            ->selectRaw('MONTH(entry_date) as month_num, count(*) as count, sum(fa_amount) as total_fa')
            ->groupBy(DB::raw('MONTH(entry_date)'))
            ->get()
            ->keyBy('month_num');

        $monthlySummary = [];
        for ($m = 1; $m <= 12; $m++) {
            $dateObj = \DateTime::createFromFormat('!m', $m);
            $monthName = $dateObj->format('F');
            $stat = $monthStats->get($m);
            $monthlySummary[] = [
                'month_num' => $m,
                'month_name' => $monthName,
                'short_name' => $dateObj->format('M'),
                'count' => $stat ? (int) $stat->count : 0,
                'total_fa' => $stat ? (float) $stat->total_fa : 0.0,
            ];
        }

        // 2. Filter query by Year & Month & Search
        $filteredQuery = (clone $baseQuery);

        if ($year !== 'All') {
            $filteredQuery->where(function ($q) use ($year) {
                $q->whereYear('entry_date', $year)
                  ->orWhere('sheet_category', 'like', "%{$year}%");
            });
        }

        if ($month !== 'All') {
            $mInt = (int) $month;
            $filteredQuery->where(function ($q) use ($mInt) {
                $q->whereMonth('entry_date', $mInt)
                  ->orWhereMonth('fa_date', $mInt);
            });
        }

        if ($search !== '') {
            $filteredQuery->where(function ($q) use ($search) {
                $q->where('patient_name', 'like', "%{$search}%")
                  ->orWhere('address', 'like', "%{$search}%")
                  ->orWhere('or_number', 'like', "%{$search}%")
                  ->orWhere('remarks', 'like', "%{$search}%");
            });
        }

        // 3. Totals for current filtered selection
        $totalsRow = (clone $filteredQuery)->selectRaw('
            count(*) as total_patients,
            coalesce(sum(hospital_bill_balance), 0) as total_bill,
            coalesce(sum(pn_amount), 0) as total_pn,
            coalesce(sum(fa_amount), 0) as total_fa,
            coalesce(sum(cash_paid), 0) as total_cash,
            coalesce(sum(discount), 0) as total_discount,
            coalesce(sum(remaining_balance), 0) as total_balance
        ')->first();

        // 4. Patients List
        if ($perPage === 'all' || (int)$perPage > 500) {
            $patients = $filteredQuery->orderBy('entry_date', 'desc')
                ->orderBy('patient_name', 'asc')
                ->take(1000)
                ->get();
        } else {
            $patients = $filteredQuery->orderBy('entry_date', 'desc')
                ->orderBy('id', 'desc')
                ->paginate((int) $perPage);
        }

        // Compute overall grantor utilization
        $overallFa = (clone $baseQuery)->sum('fa_amount');
        $overallPatients = (clone $baseQuery)->count();
        $budget = (float) $grantor->allocated_budget;
        $rem = $budget > 0 ? max(0, $budget - $overallFa) : 0;
        $utilRate = $budget > 0 ? min(100.0, round(($overallFa / $budget) * 100, 1)) : ($overallFa > 0 ? 100.0 : 0.0);

        $grantorData = [
            'id' => $grantor->id,
            'code' => $grantor->code,
            'proponent' => $grantor->proponent,
            'saa_number' => $grantor->saa_number,
            'category' => $grantor->category,
            'allocated_budget' => $budget,
            'utilized_budget' => (float) $overallFa,
            'remaining_balance' => $rem,
            'utilization_rate' => $utilRate,
            'total_patients' => $overallPatients,
            'remarks' => $grantor->remarks,
        ];

        return response()->json([
            'grantor' => $grantorData,
            'monthly_summary' => $monthlySummary,
            'totals' => [
                'total_patients' => (int) $totalsRow->total_patients,
                'total_bill' => (float) $totalsRow->total_bill,
                'total_pn' => (float) $totalsRow->total_pn,
                'total_fa' => (float) $totalsRow->total_fa,
                'total_cash' => (float) $totalsRow->total_cash,
                'total_discount' => (float) $totalsRow->total_discount,
                'total_balance' => (float) $totalsRow->total_balance,
            ],
            'patients' => $patients,
            'signatories' => [
                'prepared_by' => 'CLYNT MARK S. ALIS',
                'prepared_title' => 'Credit & Collection Staff / Financial Assistance In-Charge',
                'noted_by' => 'MEMIA R. BUGTONG, CPA, MBA',
                'noted_title' => 'Accountant IV / Chief Accountant',
            ]
        ]);
    }

    /**
     * Get patient list and monthly breakdown for NBB vs Non-NBB vs VAWC/ER programs.
     */
    public function nbbPatients(Request $request)
    {
        $program = $request->input('program', 'all'); // 'all', 'nbb', 'non_nbb', 'vawc'
        $year = $request->input('year', 'All');
        $month = $request->input('month', 'All');
        $search = trim($request->input('search', ''));
        $perPage = $request->input('per_page', 50);

        // Base query with program classification
        $baseQuery = CreditPromissoryNote::query();

        if ($program === 'nbb') {
            $baseQuery->where('is_nbb', 1);
        } elseif ($program === 'non_nbb') {
            $baseQuery->where('is_non_nbb', 1);
        } elseif ($program === 'vawc') {
            $baseQuery->where('is_vawc_er', 1);
        }

        // Program Stats Query (dynamically filtered by year & month so cards reflect filter)
        $statsQuery = CreditPromissoryNote::query();
        if ($year !== 'All') {
            $statsQuery->where(function ($q) use ($year) {
                $q->whereYear('entry_date', $year)
                  ->orWhere('sheet_category', 'like', "%{$year}%");
            });
        }
        if ($month !== 'All') {
            $mInt = (int) $month;
            $statsQuery->where(function ($q) use ($mInt) {
                $q->whereMonth('entry_date', $mInt)
                  ->orWhereMonth('fa_date', $mInt);
            });
        }

        $programStats = $statsQuery->selectRaw('
            count(case when is_nbb = 1 then 1 end) as nbb_count,
            coalesce(sum(case when is_nbb = 1 then hospital_bill_balance else 0 end), 0) as nbb_bill,
            coalesce(sum(case when is_nbb = 1 then fa_amount else 0 end), 0) as nbb_fa,
            coalesce(sum(case when is_nbb = 1 then remaining_balance else 0 end), 0) as nbb_balance,

            count(case when is_non_nbb = 1 then 1 end) as non_nbb_count,
            coalesce(sum(case when is_non_nbb = 1 then hospital_bill_balance else 0 end), 0) as non_nbb_bill,
            coalesce(sum(case when is_non_nbb = 1 then fa_amount else 0 end), 0) as non_nbb_fa,
            coalesce(sum(case when is_non_nbb = 1 then remaining_balance else 0 end), 0) as non_nbb_balance,

            count(case when is_vawc_er = 1 then 1 end) as vawc_count,
            coalesce(sum(case when is_vawc_er = 1 then hospital_bill_balance else 0 end), 0) as vawc_bill,
            coalesce(sum(case when is_vawc_er = 1 then fa_amount else 0 end), 0) as vawc_fa,
            coalesce(sum(case when is_vawc_er = 1 then remaining_balance else 0 end), 0) as vawc_balance,

            count(*) as total_count,
            coalesce(sum(hospital_bill_balance), 0) as total_bill,
            coalesce(sum(fa_amount), 0) as total_fa,
            coalesce(sum(remaining_balance), 0) as total_balance
        ')->first();

        // 1. Calculate Monthly Breakdown for the selected Program & Year
        $monthCalcQuery = (clone $baseQuery);
        if ($year !== 'All') {
            $monthCalcQuery->where(function ($q) use ($year) {
                $q->whereYear('entry_date', $year)
                  ->orWhere('sheet_category', 'like', "%{$year}%");
            });
        }

        $monthStats = $monthCalcQuery->whereNotNull('entry_date')
            ->selectRaw('
                MONTH(entry_date) as month_num,
                count(*) as count,
                coalesce(sum(fa_amount), 0) as total_fa,
                coalesce(sum(hospital_bill_balance), 0) as total_bill,
                count(case when is_nbb = 1 then 1 end) as nbb_count,
                count(case when is_non_nbb = 1 then 1 end) as non_nbb_count
            ')
            ->groupBy(DB::raw('MONTH(entry_date)'))
            ->get()
            ->keyBy('month_num');

        $monthlySummary = [];
        for ($m = 1; $m <= 12; $m++) {
            $dateObj = \DateTime::createFromFormat('!m', $m);
            $monthName = $dateObj->format('F');
            $stat = $monthStats->get($m);
            $monthlySummary[] = [
                'month_num' => $m,
                'month_name' => $monthName,
                'short_name' => $dateObj->format('M'),
                'count' => $stat ? (int) $stat->count : 0,
                'total_fa' => $stat ? (float) $stat->total_fa : 0.0,
                'total_bill' => $stat ? (float) $stat->total_bill : 0.0,
                'nbb_count' => $stat ? (int) $stat->nbb_count : 0,
                'non_nbb_count' => $stat ? (int) $stat->non_nbb_count : 0,
            ];
        }

        // 2. Filter main query by Year & Month & Search
        $filteredQuery = (clone $baseQuery);

        if ($year !== 'All') {
            $filteredQuery->where(function ($q) use ($year) {
                $q->whereYear('entry_date', $year)
                  ->orWhere('sheet_category', 'like', "%{$year}%");
            });
        }

        if ($month !== 'All') {
            $mInt = (int) $month;
            $filteredQuery->where(function ($q) use ($mInt) {
                $q->whereMonth('entry_date', $mInt)
                  ->orWhereMonth('fa_date', $mInt);
            });
        }

        if ($search !== '') {
            $filteredQuery->where(function ($q) use ($search) {
                $q->where('patient_name', 'like', "%{$search}%")
                  ->orWhere('address', 'like', "%{$search}%")
                  ->orWhere('case_number', 'like', "%{$search}%")
                  ->orWhere('or_number', 'like', "%{$search}%")
                  ->orWhere('fa_grantor', 'like', "%{$search}%")
                  ->orWhere('remarks', 'like', "%{$search}%");
            });
        }

        // 3. Totals for current filtered selection
        $totalsRow = (clone $filteredQuery)->selectRaw('
            count(*) as total_patients,
            coalesce(sum(hospital_bill_balance), 0) as total_bill,
            coalesce(sum(pn_amount), 0) as total_pn,
            coalesce(sum(fa_amount), 0) as total_fa,
            coalesce(sum(cash_paid), 0) as total_cash,
            coalesce(sum(discount), 0) as total_discount,
            coalesce(sum(remaining_balance), 0) as total_balance
        ')->first();

        // 4. Patients List
        if ($perPage === 'all' || (int)$perPage > 500) {
            $patients = $filteredQuery->orderBy('entry_date', 'desc')
                ->orderBy('id', 'desc')
                ->take(1000)
                ->get();
        } else {
            $patients = $filteredQuery->orderBy('entry_date', 'desc')
                ->orderBy('id', 'desc')
                ->paginate((int) $perPage);
        }

        return response()->json([
            'success' => true,
            'program' => $program,
            'year' => $year,
            'month' => $month,
            'program_stats' => [
                'nbb_count' => (int) $programStats->nbb_count,
                'nbb_bill' => (float) $programStats->nbb_bill,
                'nbb_fa' => (float) $programStats->nbb_fa,
                'nbb_balance' => (float) $programStats->nbb_balance,
                'non_nbb_count' => (int) $programStats->non_nbb_count,
                'non_nbb_bill' => (float) $programStats->non_nbb_bill,
                'non_nbb_fa' => (float) $programStats->non_nbb_fa,
                'non_nbb_balance' => (float) $programStats->non_nbb_balance,
                'vawc_count' => (int) $programStats->vawc_count,
                'vawc_bill' => (float) $programStats->vawc_bill,
                'vawc_fa' => (float) $programStats->vawc_fa,
                'vawc_balance' => (float) $programStats->vawc_balance,
                'total_count' => (int) $programStats->total_count,
                'total_bill' => (float) $programStats->total_bill,
                'total_fa' => (float) $programStats->total_fa,
                'total_balance' => (float) $programStats->total_balance,
            ],
            'monthly_summary' => $monthlySummary,
            'totals' => [
                'total_patients' => (int) $totalsRow->total_patients,
                'total_bill' => (float) $totalsRow->total_bill,
                'total_pn' => (float) $totalsRow->total_pn,
                'total_fa' => (float) $totalsRow->total_fa,
                'total_cash' => (float) $totalsRow->total_cash,
                'total_discount' => (float) $totalsRow->total_discount,
                'total_balance' => (float) $totalsRow->total_balance,
            ],
            'patients' => $patients,
            'signatories' => [
                'prepared_by' => 'CLYNT MARK S. ALIS',
                'prepared_title' => 'Credit & Collection Staff / Financial Assistance In-Charge',
                'noted_by' => 'MEMIA R. BUGTONG, CPA, MBA',
                'noted_title' => 'Accountant IV / Chief Accountant',
            ]
        ]);
    }

    /**
     * Generate comprehensive reports module for Credit and Collection.
     */
    public function reports(Request $request)
    {
        $year = $request->input('year', 'All');
        $category = $request->input('category', 'All');
        $grantorCategory = $request->input('grantor_category', 'All');
        $search = trim($request->input('search', ''));

        // 1. Base query for patient promissory transactions
        $notesQuery = CreditPromissoryNote::query();
        if ($year !== 'All') {
            $notesQuery->where(function ($q) use ($year) {
                $q->whereYear('entry_date', $year)
                  ->orWhere('sheet_category', 'like', "%{$year}%");
            });
        }
        if ($category !== 'All') {
            $notesQuery->where('sheet_category', $category);
        }

        // 2. High-level KPIs
        $kpiRow = (clone $notesQuery)->selectRaw('
            count(*) as total_count,
            coalesce(sum(hospital_bill_balance), 0) as total_bill,
            coalesce(sum(pn_amount), 0) as total_pn,
            coalesce(sum(fa_amount), 0) as total_fa,
            coalesce(sum(cash_paid), 0) as total_cash,
            coalesce(sum(discount), 0) as total_discount,
            coalesce(sum(case when remaining_balance > 0 then remaining_balance else 0 end), 0) as total_receivable,
            count(case when is_absconded = 1 then 1 end) as absconded_count,
            coalesce(sum(case when is_absconded = 1 then remaining_balance else 0 end), 0) as absconded_balance,
            count(case when remaining_balance <= 0 then 1 end) as settled_count
        ')->first();

        // 3. Category / Sheet Breakdown
        $catBreakdown = (clone $notesQuery)->selectRaw('
            sheet_category,
            count(*) as count,
            coalesce(sum(hospital_bill_balance), 0) as total_bill,
            coalesce(sum(pn_amount), 0) as total_pn,
            coalesce(sum(fa_amount), 0) as total_fa,
            coalesce(sum(cash_paid), 0) as total_cash,
            coalesce(sum(discount), 0) as total_discount,
            coalesce(sum(case when remaining_balance > 0 then remaining_balance else 0 end), 0) as total_balance
        ')->groupBy('sheet_category')->get();

        // 4. NBB Breakdown
        $nbbStats = (clone $notesQuery)->selectRaw('
            count(case when is_nbb = 1 then 1 end) as nbb_count,
            coalesce(sum(case when is_nbb = 1 then hospital_bill_balance else 0 end), 0) as nbb_bill,
            coalesce(sum(case when is_nbb = 1 then fa_amount else 0 end), 0) as nbb_fa,
            coalesce(sum(case when is_nbb = 1 then remaining_balance else 0 end), 0) as nbb_balance,
            
            count(case when is_non_nbb = 1 then 1 end) as non_nbb_count,
            coalesce(sum(case when is_non_nbb = 1 then hospital_bill_balance else 0 end), 0) as non_nbb_bill,
            coalesce(sum(case when is_non_nbb = 1 then fa_amount else 0 end), 0) as non_nbb_fa,
            coalesce(sum(case when is_non_nbb = 1 then remaining_balance else 0 end), 0) as non_nbb_balance,

            count(case when is_vawc_er = 1 then 1 end) as vawc_count,
            coalesce(sum(case when is_vawc_er = 1 then hospital_bill_balance else 0 end), 0) as vawc_bill,
            coalesce(sum(case when is_vawc_er = 1 then fa_amount else 0 end), 0) as vawc_fa,
            coalesce(sum(case when is_vawc_er = 1 then remaining_balance else 0 end), 0) as vawc_balance
        ')->first();

        // 5. Grantor Stats Grouping from Notes
        $grantorGrouped = (clone $notesQuery)->whereNotNull('fa_grantor')
            ->where('fa_grantor', '!=', '')
            ->selectRaw('fa_grantor, count(*) as count, sum(fa_amount) as total_fa')
            ->groupBy('fa_grantor')
            ->get();

        // 6. Grantors matching
        $grantorQ = CreditGrantor::where('is_active', true);
        if ($grantorCategory !== 'All') {
            $grantorQ->where('category', $grantorCategory);
        }
        if ($search !== '') {
            $grantorQ->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                  ->orWhere('proponent', 'like', "%{$search}%")
                  ->orWhere('saa_number', 'like', "%{$search}%");
            });
        }
        $allGrantors = $grantorQ->orderBy('category')->orderBy('code')->get();

        $saaList = [];
        $totalGrantorBudget = 0.0;
        $totalGrantorUtilized = 0.0;

        $genericTerms = [
            'PARTY LIST', 'PL', 'CONG', 'CONGRESSIONAL', 'SEN', 'SENATE',
            'BM', 'M', 'MAYOR', 'GOV', 'GOVERNOR', 'LGU', 'DOH', 'MAIP',
            'PCSO', 'FA', 'FINANCIAL ASSISTANCE', 'SAA', 'DOH (SAA)',
            'DOH (CONG)', 'DOH (PL)', 'DOH (SEN)', 'DOH (BM)', 'DOH (M)',
            'DOH (MAIP)', 'DOH (FA)', 'OTHER GRANTOR', 'GOVERNMENT'
        ];

        foreach ($allGrantors as $g) {
            $matchedCount = 0;
            $matchedFa = 0.0;
            $codeUpper = strtoupper(trim($g->code));
            $propUpper = strtoupper(trim($g->proponent));
            $saaUpper = strtoupper(trim($g->saa_number ?? ''));

            foreach ($grantorGrouped as $s) {
                $name = strtoupper(trim($s->fa_grantor));
                $isMatch = false;

                // 1. SAA Number match
                if ($saaUpper !== '' && strlen($saaUpper) >= 4 && str_contains($name, $saaUpper)) {
                    $isMatch = true;
                }

                // 2. Proponent Name match
                if (!$isMatch && $propUpper !== '' && !in_array($propUpper, $genericTerms)) {
                    if ($name === $propUpper || str_contains($name, $propUpper)) {
                        $isMatch = true;
                    }
                }

                // 3. Bracketed or exact code match (non-generic)
                if (!$isMatch && $codeUpper !== '' && !in_array($codeUpper, $genericTerms)) {
                    if ($name === $codeUpper || str_contains($name, "[{$codeUpper}]")) {
                        $isMatch = true;
                    }
                }

                if ($isMatch) {
                    $matchedCount += (int) $s->count;
                    $matchedFa += (float) $s->total_fa;
                }
            }

            $allocated = (float) $g->allocated_budget;
            $rem = $allocated > 0 ? max(0, $allocated - $matchedFa) : 0;
            $utilRate = $allocated > 0 ? min(100.0, round(($matchedFa / $allocated) * 100, 1)) : ($matchedFa > 0 ? 100.0 : 0.0);

            $totalGrantorBudget += $allocated;
            $totalGrantorUtilized += $matchedFa;

            $saaList[] = [
                'id' => $g->id,
                'code' => $g->code,
                'proponent' => $g->proponent,
                'category' => $g->category,
                'saa_number' => $g->saa_number,
                'allocated_budget' => $allocated,
                'utilized_budget' => $matchedFa,
                'remaining_balance' => $rem,
                'utilization_rate' => $utilRate,
                'patients_assisted' => $matchedCount,
            ];
        }

        // Sort SAA list by utilized or budget desc
        usort($saaList, fn($a, $b) => ($b['utilized_budget'] <=> $a['utilized_budget']) ?: ($b['allocated_budget'] <=> $a['allocated_budget']));

        // 7. Delinquents / High Uncollected Promissory Notes
        $delinquents = (clone $notesQuery)->where('remaining_balance', '>', 0)
            ->orderBy('remaining_balance', 'desc')
            ->take(50)
            ->get(['id', 'patient_name', 'sheet_category', 'entry_date', 'pn_amount', 'remaining_balance', 'guarantor_name', 'remarks', 'is_absconded']);

        // Available Filter Options
        $years = ['All', '2026', '2025', '2024'];
        $categories = [
            'All',
            'daily trans  2026',
            'daily trans  2025',
            'daily trans  2024',
            'daily trans  BUCAS CENTER',
            'daily transac  CT SCAN',
            'daily transaction  DIALYSIS',
            'PN GAURANTOR RMPH EMPLOYEE',
        ];
        $grantorCategories = array_merge(['All'], CreditGrantor::where('is_active', true)->distinct()->pluck('category')->filter()->values()->toArray());

        return response()->json([
            'kpis' => [
                'total_grantor_budget' => $totalGrantorBudget,
                'total_grantor_utilized' => $totalGrantorUtilized,
                'total_grantor_remaining' => max(0, $totalGrantorBudget - $totalGrantorUtilized),
                'total_count' => (int) $kpiRow->total_count,
                'total_bill' => (float) $kpiRow->total_bill,
                'total_pn' => (float) $kpiRow->total_pn,
                'total_fa' => (float) $kpiRow->total_fa,
                'total_cash' => (float) $kpiRow->total_cash,
                'total_discount' => (float) $kpiRow->total_discount,
                'total_receivable' => (float) $kpiRow->total_receivable,
                'absconded_count' => (int) $kpiRow->absconded_count,
                'absconded_balance' => (float) $kpiRow->absconded_balance,
                'settled_count' => (int) $kpiRow->settled_count,
            ],
            'categories' => $catBreakdown,
            'nbb_stats' => $nbbStats,
            'saa_grantors' => $saaList,
            'delinquents' => $delinquents,
            'filter_options' => [
                'years' => $years,
                'categories' => $categories,
                'grantor_categories' => $grantorCategories,
            ],
            'signatories' => [
                'prepared_by' => 'CLYNT MARK S. ALIS',
                'prepared_title' => 'Credit & Collection Staff / Financial Assistance In-Charge',
                'noted_by' => 'MEMIA R. BUGTONG, CPA, MBA',
                'noted_title' => 'Accountant IV / Chief Accountant',
            ]
        ]);
    }
}
