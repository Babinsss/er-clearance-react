<?php

namespace App\Http\Controllers;

use App\Models\ClearanceTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use App\Models\ClearanceLog;

class ClearanceController extends Controller
{
    public function show(\Illuminate\Http\Request $request, $enccode)
    {
        $db = \Illuminate\Support\Facades\DB::connection('ihomis');

        // 1. Resolve Patient ID
        $transaction = \App\Models\ClearanceTransaction::where('enccode', $enccode)->first();
        $hpercode = $transaction ? $transaction->hospital_number : null;

        if (!$hpercode) {
            $hpercode = $db->table('henctr')->where('enccode', $enccode)->value('hpercode');
        }

        if (!$hpercode && preg_match('/(000000\d{9})/', str_replace('/', '', $enccode), $matches)) {
            $hpercode = $matches[1];
        }

        // 2. Fetch All Encounters
        $encounterCodes = [];
        if ($hpercode) {
            $encounterCodes = $db->table('henctr')
                ->where('hpercode', $hpercode)
                ->pluck('enccode')
                ->toArray();
        } else {
            $encounterCodes = [$enccode];
        }

        // 3. SOURCE A: Doctor's Orders (Safely joining hclass2 for CSR supplies)
        $docOrders = $db->table('hdocord as d')
            ->leftJoin('hprocm as p', function($join) {
                $join->whereRaw('TRIM(d.proccode) = TRIM(p.proccode)');
            })
            ->leftJoin('hcharge as c', function($join) {
                $join->whereRaw('TRIM(d.pcchrgcod) = TRIM(c.chrgcode)');
            })
            ->leftJoin('hdmhdr as m', function($join) {
                $join->whereRaw('TRIM(d.orcode) = TRIM(m.dmdcomb)');
            })
            ->leftJoin('hclass2 as cl2', function($join) {
                $join->whereRaw('TRIM(d.orcode) = TRIM(cl2.cl2comb)');
            })
            ->whereIn('d.enccode', $encounterCodes)
            ->select([
                'd.dodate as datelog',
                'd.orcode as order_code',
                'd.doctype as doc_type',
                \Illuminate\Support\Facades\DB::raw("COALESCE(m.brandname, cl2.cl2desc, p.procdesc, c.chrgdesc, TRIM(d.orcode), TRIM(d.pcchrgcod), 'Unknown') as item_description"),
                'd.estatus as status',
                'd.ordcon',
                'd.orderupd'
            ])
            ->get()->toArray();

        // 4. SOURCE B: Pharmacy Orders (Includes hclass2 for CSR/Medical Supplies)
        $rxOrders = $db->table('hrxo as r')
            ->leftJoin('hdmhdr as m', function($join) {
                $join->whereRaw('TRIM(r.dmdcomb) = TRIM(m.dmdcomb)');
            })
            ->leftJoin('hclass2 as cl2', function($join) {
                $join->whereRaw('TRIM(r.dmdcomb) = TRIM(cl2.cl2comb)');
            })
            ->whereIn('r.enccode', $encounterCodes)
            ->select([
                'r.dodate as datelog',
                'r.dmdcomb as order_code',
                \Illuminate\Support\Facades\DB::raw("COALESCE(m.brandname, cl2.cl2desc, TRIM(r.dmdcomb)) as item_description"),
                'r.estatus as status',
                'r.qtybal as balance',
                'r.qtyissued',
                'r.ordcon',
                'r.orderupd'
            ])
            ->get()->toArray();

        // 5. SOURCE C: Patient Charges
        $chargeOrders = $db->table('hpatchrg as pc')
            ->leftJoin('hcharge as c', function($join) {
                $join->whereRaw('TRIM(pc.chargcode) = TRIM(c.chrgcode)');
            })
            ->leftJoin('hdmhdr as m', function($join) {
                $join->whereRaw('TRIM(pc.itemcode) = TRIM(m.dmdcomb)');
            })
            ->leftJoin('hprocm as p', function($join) {
                $join->whereRaw('TRIM(pc.itemcode) = TRIM(p.proccode)');
            })
            ->leftJoin('hclass2 as cl2', function($join) {
                $join->whereRaw('TRIM(pc.itemcode) = TRIM(cl2.cl2comb)');
            })
            // 👇 THE HPROC BRIDGE FOR LABORATORY/PROCEDURE CODES 👇
            ->leftJoin('hproc as pr', function($join) {
                $join->whereRaw('TRIM(pc.itemcode) = TRIM(pr.prikey)');
            })
            ->leftJoin('hprocm as p_trans', function($join) {
                $join->whereRaw('TRIM(pr.proccode) = TRIM(p_trans.proccode)');
            })
            ->whereIn('pc.enccode', $encounterCodes)
            ->select([
                'pc.pcchrgdte as datelog',
                'c.chrgdesc as category',
                \Illuminate\Support\Facades\DB::raw("TRIM(pc.itemcode) as itemcode"),
                // Checks master tables first, then falls back to the bridged hproc description
                \Illuminate\Support\Facades\DB::raw("COALESCE(
                    NULLIF(TRIM(m.brandname), ''), 
                    NULLIF(TRIM(cl2.cl2desc), ''), 
                    NULLIF(TRIM(p.procdesc), ''), 
                    NULLIF(TRIM(p_trans.procdesc), ''), 
                    NULLIF(TRIM(pc.itemcode), ''), 
                    TRIM(pc.chargcode), 
                    'Unknown Charge'
                ) as item_description"),
                \Illuminate\Support\Facades\DB::raw("'S' as status")
            ])
            ->get()->toArray();

        // 6. THE SORTER
        $labOrders = [];
        $radioOrders = [];
        $cardioOrders = [];
        $csrOrders = [];
        $pharmacyOrders = [];

        // 6A. Sort Doctor's Orders (No more dumping random instructions into CSR)
        foreach ($docOrders as $item) {
            $computedStatus = trim(strtoupper($item->status ?? 'U'));
            $ordcon = trim(strtoupper($item->ordcon ?? ''));
            $orderupd = trim(strtoupper($item->orderupd ?? ''));
            
            if ($computedStatus === 'C' || $ordcon === 'CANOR' || $orderupd === 'INACT') {
                continue;
            }

            $code = strtoupper($item->order_code ?? '');
            $cleanItem = [
                'datelog' => $item->datelog, 
                'item_description' => $item->item_description, 
                'status' => $computedStatus
            ];

            if (str_starts_with($code, 'LAB') && $code !== 'ECG') {
                $labOrders[] = $cleanItem;
            } elseif (str_starts_with($code, 'RAD')) {
                $radioOrders[] = $cleanItem;
            } elseif (str_starts_with($code, 'CAR') || $code === 'ECG') {
                $cardioOrders[] = $cleanItem;
            }
            // We removed the "else" block here! Generic doctor notes no longer clog up the clearance tabs.
        }

        // 6B. Sort Pharmacy Orders (Separates true medications from medical supplies)
        foreach ($rxOrders as $item) {
            $computedStatus = trim(strtoupper($item->status ?? 'U'));
            $ordcon = trim(strtoupper($item->ordcon ?? ''));
            $orderupd = trim(strtoupper($item->orderupd ?? ''));
            
            if ($computedStatus === 'C' || $ordcon === 'CANOR' || $orderupd === 'INACT') {
                continue;
            }

            $balance = isset($item->balance) ? (float)$item->balance : 0;
            $issued = isset($item->qtyissued) ? (float)$item->qtyissued : 0;
            $desc = strtoupper($item->item_description ?? '');

            if ($balance <= 0 || $issued > 0 || $computedStatus === 'P') {
                $computedStatus = 'S'; 
                if ($balance > 0 && $issued > 0) {
                    $desc .= ' (PARTIAL)';
                }
            }
            
            $cleanItem = [
                'datelog' => $item->datelog, 
                'item_description' => $desc, 
                'status' => $computedStatus,
                'balance' => $balance
            ];

            // If it's a physical supply, send to CSR. Otherwise, it's a Pharmacy Medication.
            if (str_contains($desc, 'CSR') || str_contains($desc, 'FACEMASK') || str_contains($desc, 'GLOVE') || str_contains($desc, 'SYRINGE') || str_contains($desc, 'CANNULA') || str_contains($desc, 'PACK') || str_contains($desc, 'MACROSET') || str_contains($desc, 'MICROSET') || str_contains($desc, 'TUBE') || str_contains($desc, 'GAUZE')) {
                $csrOrders[] = $cleanItem;
            } else {
                $pharmacyOrders[] = $cleanItem;
            }
        }

        // 6C. Sort Patient Charges (Strictly routed by billing category & overrides)
        foreach ($chargeOrders as $item) {
            $category = trim($item->category ?? '');
            $upperCategory = strtoupper($category);
            
            $cleanItem = [
                'datelog' => $item->datelog,
                'item_description' => $category !== '' ? $item->item_description . ' (' . $category . ')' : $item->item_description,
                'status' => 'S'
            ];

            // Extract the raw item name/code by removing the category in parentheses
            $baseName = trim(preg_replace('/\s*\([^)]*\)$/', '', $item->item_description));

            // THE OVERRIDE: Is it a 13-digit barcode or a known CSR supply?
            $isBarcode = preg_match('/^\d{13}$/', $baseName);
            $hasCsrKeyword = preg_match('/\b(SYRINGE|MACROSET|MICROSET|CANNULA|VENFLON|GAUZE|GLOVE|TUBE|PACK|NEEDLE|CATHETER)\b/', strtoupper($baseName));

            // Route items
            if ($isBarcode || $hasCsrKeyword || preg_match('/\bCSR\b/', $upperCategory) || preg_match('/\bSUPPLIES CSR\b/', $upperCategory)) {
                $csrOrders[] = $cleanItem;
            }
            elseif (preg_match('/\bLAB(ORATORY|S)?\b/', $upperCategory))   { $labOrders[] = $cleanItem; }
            elseif (preg_match('/\bRAD|X-?RAY/', $upperCategory))          { $radioOrders[] = $cleanItem; }
            elseif (preg_match('/\bCARD|\bECG\b/', $upperCategory))        { $cardioOrders[] = $cleanItem; }
            elseif (preg_match('/PHARM|DRUG|MEDICINE/', $upperCategory))   { $pharmacyOrders[] = $cleanItem; }
        }

        // 7. Clean up arrays
        $csrOrders = collect($csrOrders)->unique()->values()->all();
        $labOrders = collect($labOrders)->unique()->values()->all();
        $radioOrders = collect($radioOrders)->unique()->values()->all();
        $cardioOrders = collect($cardioOrders)->unique()->values()->all();
        $pharmacyOrders = collect($pharmacyOrders)->unique()->values()->all();

        $clearedDepartments = \App\Models\ClearanceLog::where('enccode', $enccode)
            ->pluck('department')
            ->toArray();

        // JSON Return for the Axios Modal
        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'enccode' => $enccode,
                'labOrders' => $labOrders,
                'radioOrders' => $radioOrders,
                'cardioOrders' => $cardioOrders,
                'pharmacyOrders' => $pharmacyOrders,
                'csrOrders' => $csrOrders,
                'clearedDepartments' => $clearedDepartments
            ]);
        }

        // Standard page load fallback
        return inertia('Clearance/Index', [
            'enccode' => $enccode,
            'labOrders' => $labOrders,
            'radioOrders' => $radioOrders,
            'cardioOrders' => $cardioOrders,
            'pharmacyOrders' => $pharmacyOrders,
            'csrOrders' => $csrOrders,
            'clearedDepartments' => $clearedDepartments
        ]);
    }


    public function store(Request $request)
    {
        $request->validate([
            'enccode' => 'required|string',
            'department' => 'required|string',
        ]);

        // 1. Log the clearance for this specific department
        ClearanceLog::firstOrCreate([
            'enccode' => $request->enccode,
            'department' => $request->department,
        ], [
            'user_id' => $request->user()->id, // FIXED HERE
        ]);

        // 2. Count how many unique departments have cleared this patient
        $clearedCount = ClearanceLog::where('enccode', $request->enccode)
            ->distinct('department')
            ->count('department');

        // 3. The Automated Trigger: If all 5 are cleared, finalize the transaction
        if ($clearedCount >= 5) {
            ClearanceTransaction::where('enccode', $request->enccode)
                ->update(['overall_status' => 'Cleared']);
        }

        return back();
    }
    
    public function storeTransaction(Request $request)
    {
        $request->validate([
            'enccode' => 'required|string',
            'hospital_number' => 'required|string',
            'patient_name' => 'required|string',
            'arrival_datetime' => 'nullable|date',
            'disposition' => 'nullable|string',
        ]);

        ClearanceTransaction::updateOrCreate(
            ['enccode' => $request->enccode],
            [
                'hospital_number' => $request->hospital_number,
                'patient_name' => $request->patient_name,
                'arrival_datetime' => $request->arrival_datetime,
                'disposition' => $request->disposition,
                'room_ward' => $request->user()->department, // FIXED HERE
                'overall_status' => 'Routing in Progress',
            ]
        );

        return back();
    }
}