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

        // 1. Resolve Patient ID & Current Encounter Details
        $currentEncounter = $db->table('henctr')->where('enccode', $enccode)->first();
        
        $transaction = \App\Models\ClearanceTransaction::where('enccode', $enccode)->first();
        $hpercode = $transaction ? $transaction->hospital_number : ($currentEncounter->hpercode ?? null);

        if (!$hpercode && preg_match('/(000000\d{9})/', str_replace('/', '', $enccode), $matches)) {
            $hpercode = $matches[1];
        }

        // 2. Determine Date Range & Active Encounters (ER vs Ward)
        $encounterCodes = [$enccode];
        $wardName = strtolower(trim($transaction->room_ward ?? ''));
        $toecode = strtoupper(trim($currentEncounter->toecode ?? ''));

        $isErPatient = $wardName !== ''
            ? ($wardName === 'emergency room' || $wardName === 'er')
            : ($toecode === 'ER');

        $startDate = null;
        $endDate = null;

        if ($isErPatient) {
            // ER PATIENTS: Only refer to the encounter date with a limit of 2 days
            $baseEncDate = $currentEncounter->encdate ?? ($transaction->arrival_datetime ?? now());
            $startDate = date('Y-m-d 00:00:00', strtotime($baseEncDate));
            $endDate = date('Y-m-d 23:59:59', strtotime($baseEncDate . ' +2 days'));
        } else {
            // WARD PATIENTS: Pull all charges from the date admitted up until the day of discharge
            $admLog = $db->table('hadmlog')->where('enccode', $enccode)->first();

            if (!$admLog && $hpercode) {
                $admQuery = $db->table('hadmlog')->where('hpercode', $hpercode);
                if ($currentEncounter && isset($currentEncounter->encdate)) {
                    $admQuery->where('admdate', '>=', date('Y-m-d 00:00:00', strtotime($currentEncounter->encdate . ' -2 days')));
                }
                $admLog = $admQuery->orderBy('admdate', 'desc')->first();
            }

            $admDate = $admLog->admdate
                ?? ($currentEncounter->encdate ?? ($transaction->arrival_datetime ?? now()));

            // If ERADM encounter timestamp was slightly earlier than admdate, use the earlier date as admission start
            if ($currentEncounter && isset($currentEncounter->encdate) && strtotime($currentEncounter->encdate) < strtotime($admDate)) {
                $admDate = $currentEncounter->encdate;
            }

            $disDate = (!empty($admLog->disdate)) ? $admLog->disdate : now();

            $startDate = date('Y-m-d 00:00:00', strtotime($admDate));
            $endDate = date('Y-m-d 23:59:59', strtotime($disDate));

            if (strtotime($endDate) < strtotime($startDate)) {
                $endDate = date('Y-m-d 23:59:59');
            }

            if ($hpercode) {
                $wardEncounters = $db->table('henctr')
                    ->where('hpercode', $hpercode)
                    ->whereBetween('encdate', [$startDate, $endDate])
                    ->pluck('enccode')
                    ->toArray();

                $encounterCodes = array_unique(array_merge($encounterCodes, $wardEncounters));
            }
        }

        // 3. SOURCE A: Doctor's Orders
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
            ->leftJoin('hdruggrp as dg', function($join) {
                $join->whereRaw('TRIM(m.grpcode) = TRIM(dg.grpcode)');
            })
            ->leftJoin('hgen as gen', function($join) {
                $join->whereRaw('TRIM(dg.gencode) = TRIM(gen.gencode)');
            })
            ->leftJoin('hclass2 as cl2', function($join) {
                $join->whereRaw("TRIM(d.orcode) = REPLACE(cl2.cl2comb, ' ', '')");
            })
            ->whereIn('d.enccode', $encounterCodes)
            ->whereBetween('d.dodate', [$startDate, $endDate])
            ->select([
                'd.dodate as datelog',
                'd.orcode as order_code',
                'd.doctype as doc_type',
                \Illuminate\Support\Facades\DB::raw("TRIM(cl2.cl1comb) as major_category"),
                \Illuminate\Support\Facades\DB::raw("cl2.pharmaceutical as is_pharma"),
                \Illuminate\Support\Facades\DB::raw("COALESCE(
                    NULLIF(TRIM(m.brandname), ''), 
                    NULLIF(TRIM(gen.gendesc), ''), 
                    NULLIF(TRIM(cl2.cl2desc), ''), 
                    NULLIF(TRIM(p.procdesc), ''), 
                    NULLIF(TRIM(c.chrgdesc), ''), 
                    TRIM(d.orcode), 
                    TRIM(d.pcchrgcod), 
                    'Unknown'
                ) as item_description"),
                'd.estatus as status',
                'd.ordcon',
                'd.orderupd'
            ])
            ->get()->toArray();

        // 4. SOURCE B: Pharmacy Orders
        $rxOrders = $db->table('hrxo as r')
            ->leftJoin('hdmhdr as m', function($join) {
                $join->whereRaw('TRIM(r.dmdcomb) = TRIM(m.dmdcomb)');
            })
            ->leftJoin('hdruggrp as dg', function($join) {
                $join->whereRaw('TRIM(m.grpcode) = TRIM(dg.grpcode)');
            })
            ->leftJoin('hgen as gen', function($join) {
                $join->whereRaw('TRIM(dg.gencode) = TRIM(gen.gencode)');
            })
            ->leftJoin('hclass2 as cl2', function($join) {
                $join->whereRaw("TRIM(r.dmdcomb) = REPLACE(cl2.cl2comb, ' ', '')");
            })
            ->whereIn('r.enccode', $encounterCodes)
            ->whereBetween('r.dodate', [$startDate, $endDate])
            ->select([
                'r.dodate as datelog',
                'r.dmdcomb as order_code',
                \Illuminate\Support\Facades\DB::raw("TRIM(cl2.cl1comb) as major_category"),
                \Illuminate\Support\Facades\DB::raw("cl2.pharmaceutical as is_pharma"),
                \Illuminate\Support\Facades\DB::raw("COALESCE(
                    NULLIF(TRIM(m.brandname), ''), 
                    NULLIF(TRIM(gen.gendesc), ''), 
                    NULLIF(TRIM(cl2.cl2desc), ''), 
                    TRIM(r.dmdcomb)
                ) as item_description"),
                'r.estatus as status',
                'r.rxostatus', 
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
                $join->whereRaw('TRIM(pc.itemcode) = TRIM(m.dmdcomb)')
                     ->orWhereRaw('TRIM(pc.itemcode) = CONCAT(TRIM(m.dmdcomb), m.dmdctr)');
            })
            ->leftJoin('hdruggrp as dg', function($join) {
                $join->whereRaw('TRIM(m.grpcode) = TRIM(dg.grpcode)');
            })
            ->leftJoin('hgen as gen', function($join) {
                $join->whereRaw('TRIM(dg.gencode) = TRIM(gen.gencode)');
            })
            ->leftJoin('hprocm as p', function($join) {
                $join->whereRaw('TRIM(pc.itemcode) = TRIM(p.proccode)');
            })
            ->leftJoin('hclass2 as cl2', function($join) {
                $join->whereRaw("TRIM(pc.itemcode) = REPLACE(cl2.cl2comb, ' ', '')");
            })
            ->leftJoin('hproc as pr', function($join) {
                $join->whereRaw('TRIM(pc.itemcode) = TRIM(pr.prikey)');
            })
            ->leftJoin('hprocm as p_trans', function($join) {
                $join->whereRaw('TRIM(pr.proccode) = TRIM(p_trans.proccode)');
            })
            ->whereIn('pc.enccode', $encounterCodes)
            ->whereBetween('pc.pcchrgdte', [$startDate, $endDate])
            ->whereNull('pc.deleted_at')
            ->where(function($query) {
                $query->whereNotIn('pc.pcstat', ['V', 'C', 'D'])->orWhereNull('pc.pcstat');
            })
            ->select([
                'pc.pcchrgdte as datelog',
                'c.chrgdesc as category',
                \Illuminate\Support\Facades\DB::raw("TRIM(pc.itemcode) as itemcode"),
                \Illuminate\Support\Facades\DB::raw("TRIM(cl2.cl1comb) as major_category"), 
                \Illuminate\Support\Facades\DB::raw("cl2.pharmaceutical as is_pharma"),
                \Illuminate\Support\Facades\DB::raw("COALESCE(
                    NULLIF(TRIM(m.brandname), ''), 
                    NULLIF(TRIM(gen.gendesc), ''),
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
        $orOrders = [];
        $lrDrOrders = [];
        $hduOrders = [];
        $nicuOrders = [];

        $csrRegex = '/(SYRINGE|MACROSET|MICROSET|CANNULA|VENFLON|GAUZE|GLOVE|TUBE|PACK|NEEDLE|CATH|PLASTER|COTTON|TAPE|CHERRY|BALL|BANDAGE|DRAPE|LANCET|BLADE|SUTURE|DIAPER|UNDERPAD|MASK|GOWN|WATER|STERILE|POVIDONE|ALCOHOL|DRESSING|NSS|SALINE|D5|LR|RINGER|SET|KIT|SWAB|GEL|PUMP|CAP|LINEN|EUROMED)/';

        foreach ($docOrders as $item) {
            $computedStatus = trim(strtoupper($item->status ?? 'U'));
            $ordcon = trim(strtoupper($item->ordcon ?? ''));
            $orderupd = trim(strtoupper($item->orderupd ?? ''));
            
            if ($computedStatus === 'C' || $computedStatus === 'D' || str_contains($ordcon, 'CAN') || str_contains($orderupd, 'CAN') || $orderupd === 'INACT' || str_contains(strtoupper($item->item_description), 'CANCEL')) {
                continue;
            }

            $code = strtoupper($item->order_code ?? '');
            $desc = strtoupper($item->item_description ?? '');
            $majorCategory = trim($item->major_category ?? '');
            $isPharma = strtoupper(trim($item->is_pharma ?? ''));
            
            $cleanItem = [
                'datelog' => $item->datelog, 
                'item_description' => $desc, 
                'status' => $computedStatus
            ];

            $baseName = trim(preg_replace('/\s*\([^)]*\)$/', '', $desc));
            $forcePharma = str_contains($desc, 'PHILRX') || str_contains($desc, 'SODIUM CHLORIDE');
            
            $isRadio = str_starts_with($code, 'RAD') || preg_match('/(X-?RAY|UTZ|ULTRASOUND|CT|MRI|SCAN|SONOGRAM|RADIOGRAPH|MAMMO|ABDOMEN, WHOLE)/', $desc);
            $isCardio = str_starts_with($code, 'CAR') || $code === 'ECG' || str_contains($desc, 'ECG');
            $isOR = preg_match('/\b(OR|OPERATING ROOM|SURG|SURGERY)\b/', $desc) || preg_match('/\b(OR FEE|SURGERY|MAJOR OP|MINOR OP|ANESTHESIA)\b/', $desc);
            $isLRDR = preg_match('/\b(DR|LR|DELIVERY ROOM|LABOR ROOM|OB-GYN)\b/', $desc) || preg_match('/\b(DELIVERY|NSD|CESAREAN|EPISIOTOMY|NEWBORN)\b/', $desc);
            $isHDU = preg_match('/\b(HDU|CKD|DIALYSIS|HEMODIALYSIS)\b/', $desc);
            $isNICU = preg_match('/\b(NICU|NEONATAL)\b/', $desc);

            if ($forcePharma) {
                $pharmacyOrders[] = $cleanItem;
            } elseif ($isCardio) { 
                $cardioOrders[] = $cleanItem;
            } elseif ($isRadio) {
                $radioOrders[] = $cleanItem;
            } elseif (str_starts_with($code, 'LAB')) {
                $labOrders[] = $cleanItem;
            } elseif ($isOR) {
                $orOrders[] = $cleanItem;
            } elseif ($isLRDR) {
                $lrDrOrders[] = $cleanItem;
            } elseif ($isHDU) {
                $hduOrders[] = $cleanItem;
            } elseif ($isNICU) {
                $nicuOrders[] = $cleanItem;
            } elseif ($isPharma === 'N' || str_starts_with($majorCategory, '018') || preg_match($csrRegex, $baseName) || str_contains($desc, 'CSR')) {
                $csrOrders[] = $cleanItem;
            } 
        }

        foreach ($rxOrders as $item) {
            $computedStatus = trim(strtoupper($item->status ?? 'U'));
            $rxostatus = trim(strtoupper($item->rxostatus ?? '')); 
            $ordcon = trim(strtoupper($item->ordcon ?? ''));
            $orderupd = trim(strtoupper($item->orderupd ?? ''));
            $desc = strtoupper($item->item_description ?? '');
            $code = strtoupper(trim($item->order_code ?? ''));
            
            if (str_starts_with($code, 'CBROS') || str_contains($desc, 'CBROS')) {
                continue;
            }

            if ($computedStatus === 'C' || $rxostatus === 'C' || $rxostatus === 'I' || $computedStatus === 'D' || str_contains($ordcon, 'CAN') || str_contains($orderupd, 'CAN') || $orderupd === 'INACT' || str_contains($desc, 'CANCEL')) {
                continue;
            }

            $balance = isset($item->balance) ? (float)$item->balance : 0;
            $issued = isset($item->qtyissued) ? (float)$item->qtyissued : 0;
            $majorCategory = trim($item->major_category ?? '');
            $isPharma = strtoupper(trim($item->is_pharma ?? ''));

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

            $baseName = trim(preg_replace('/\s*\([^)]*\)$/', '', $desc));
            $isBarcode = preg_match('/^\d{13}$/', $baseName); 

            $forcePharma = str_contains($desc, 'PHILRX') || str_contains($desc, 'SODIUM CHLORIDE');

            if ($forcePharma) {
                $pharmacyOrders[] = $cleanItem;
            } elseif ($isBarcode || $isPharma === 'N' || str_starts_with($majorCategory, '018') || preg_match($csrRegex, $baseName) || str_contains($desc, 'CSR')) {
                $csrOrders[] = $cleanItem;
            } else {
                $pharmacyOrders[] = $cleanItem;
            }
        }

        foreach ($chargeOrders as $item) {
            $category = trim($item->category ?? '');
            $upperCategory = strtoupper($category);
            $majorCategory = trim($item->major_category ?? '');
            $isPharma = strtoupper(trim($item->is_pharma ?? ''));
            $code = strtoupper(trim($item->itemcode ?? ''));
            $desc = strtoupper($category !== '' ? $item->item_description . ' (' . $category . ')' : $item->item_description);
            
            if (str_starts_with($code, 'CBROS') || str_contains($desc, 'CBROS') || str_contains($desc, 'CANCEL')) {
                continue;
            }

            $cleanItem = [
                'datelog' => $item->datelog,
                'item_description' => $desc,
                'status' => 'S'
            ];

            $baseName = trim(preg_replace('/\s*\([^)]*\)$/', '', $desc));
            $isBarcode = preg_match('/^\d{13}$/', $baseName); 
            
            $forcePharma = str_contains($desc, 'PHILRX') || str_contains($desc, 'SODIUM CHLORIDE');
            $isRadio = preg_match('/\bRAD|X-?RAY/', $upperCategory) || preg_match('/(X-?RAY|UTZ|ULTRASOUND|CT|MRI|SCAN|SONOGRAM|RADIOGRAPH|MAMMO|ABDOMEN, WHOLE)/', $desc);
            $isCardio = preg_match('/\bCARD|\bECG\b/', $upperCategory) || str_contains($desc, 'ECG');
            $isOR = preg_match('/\b(OR|OPERATING ROOM|SURG|SURGERY)\b/', $upperCategory) || preg_match('/\b(OR FEE|SURGERY|MAJOR OP|MINOR OP|ANESTHESIA)\b/', $desc);
            $isLRDR = preg_match('/\b(DR|LR|DELIVERY ROOM|LABOR ROOM|OB-GYN)\b/', $upperCategory) || preg_match('/\b(DELIVERY|NSD|CESAREAN|EPISIOTOMY|NEWBORN)\b/', $desc);
            $isHDU = preg_match('/\b(HDU|CKD|DIALYSIS|HEMODIALYSIS)\b/', $upperCategory) || preg_match('/\b(HEMODIALYSIS|DIALYSIS)\b/', $desc);
            $isNICU = preg_match('/\b(NICU|NEONATAL)\b/', $upperCategory) || preg_match('/\b(NICU|NEONATAL)\b/', $desc);

            if ($forcePharma) {
                $pharmacyOrders[] = $cleanItem;
            } elseif ($isCardio) { 
                $cardioOrders[] = $cleanItem;
            } elseif ($isRadio) {
                $radioOrders[] = $cleanItem;
            } elseif ($isOR) {
                $orOrders[] = $cleanItem;
            } elseif ($isLRDR) {
                $lrDrOrders[] = $cleanItem;
            } elseif ($isHDU) {
                $hduOrders[] = $cleanItem;
            } elseif ($isNICU) {
                $nicuOrders[] = $cleanItem;
            } elseif ($isBarcode || $isPharma === 'N' || str_starts_with($majorCategory, '018') || preg_match($csrRegex, strtoupper($baseName)) || preg_match('/\bCSR\b/', $upperCategory) || preg_match('/\bSUPPLIES CSR\b/', $upperCategory)) {
                $csrOrders[] = $cleanItem;
            } elseif (preg_match('/\bLAB(ORATORY|S)?\b/', $upperCategory)) { 
                $labOrders[] = $cleanItem; 
            } elseif (preg_match('/PHARM|DRUG|MEDICINE/', $upperCategory)) { 
                $pharmacyOrders[] = $cleanItem; 
            } else {
                $pharmacyOrders[] = $cleanItem;
            }
        }

        $csrOrders = collect($csrOrders)->values()->all();
        $pharmacyOrders = collect($pharmacyOrders)->values()->all(); 
        
        $labOrders = collect($labOrders)->unique('item_description')->values()->all();
        $radioOrders = collect($radioOrders)->unique('item_description')->values()->all();
        $cardioOrders = collect($cardioOrders)->unique('item_description')->values()->all();
        $orOrders = collect($orOrders)->unique('item_description')->values()->all();
        $lrDrOrders = collect($lrDrOrders)->unique('item_description')->values()->all();
        $hduOrders = collect($hduOrders)->unique('item_description')->values()->all();
        $nicuOrders = collect($nicuOrders)->unique('item_description')->values()->all();

        $clearedDepartments = \App\Models\ClearanceLog::where('enccode', $enccode)
            ->pluck('department')
            ->toArray();

        if ($request->wantsJson() || $request->ajax()) {
            return response()->json([
                'enccode' => $enccode,
                'transaction' => $transaction,
                'labOrders' => $labOrders,
                'radioOrders' => $radioOrders,
                'cardioOrders' => $cardioOrders,
                'pharmacyOrders' => $pharmacyOrders,
                'csrOrders' => $csrOrders,
                'creditOrders' => [],
                'orOrders' => $orOrders,
                'lrDrOrders' => $lrDrOrders,
                'hduOrders' => $hduOrders,
                'nicuOrders' => $nicuOrders,
                'clearedDepartments' => $clearedDepartments
            ]);
        }

        return inertia('Clearance/Index', [
            'enccode' => $enccode,
            'transaction' => $transaction,
            'labOrders' => $labOrders,
            'radioOrders' => $radioOrders,
            'cardioOrders' => $cardioOrders,
            'pharmacyOrders' => $pharmacyOrders,
            'csrOrders' => $csrOrders,
            'creditOrders' => [],
            'orOrders' => $orOrders,
            'lrDrOrders' => $lrDrOrders,
            'hduOrders' => $hduOrders,
            'nicuOrders' => $nicuOrders,
            'clearedDepartments' => $clearedDepartments
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'enccode' => 'required|string',
            'department' => 'required|string',
        ]);

        ClearanceLog::firstOrCreate([
            'enccode' => $request->enccode,
            'department' => $request->department,
        ], [
            'user_id' => $request->user()->id, 
        ]);

        self::recalculateStatus($request->enccode);

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
            'is_oecb' => 'nullable|boolean',
            'has_oxygen' => 'nullable|boolean',
            'oxygen_remarks' => 'nullable|string',
            'requires_or' => 'nullable|boolean',
            'requires_nicu' => 'nullable|boolean',
        ]);

        $existing = ClearanceTransaction::where('enccode', $request->enccode)->first();
        $initialStatus = ($existing && $existing->overall_status !== 'Cancelled') ? $existing->overall_status : 'Routing in Progress';

        $wardDept = strtolower(trim($request->user()->department ?? ''));
        $isErWard = $wardDept === 'emergency room' || $wardDept === 'er' || str_contains($wardDept, 'emergency');
        $isOutpatientWard = str_contains($wardDept, 'outpatient') || str_contains($wardDept, 'opd') || str_contains($wardDept, 'hemodialysis') || str_contains($wardDept, 'dialysis') || str_contains($wardDept, 'hdu');
        $allowsAdditionalClearance = !$isErWard && !$isOutpatientWard;

        ClearanceTransaction::updateOrCreate(
            ['enccode' => $request->enccode],
            [
                'hospital_number' => $request->hospital_number,
                'patient_name' => $request->patient_name,
                'arrival_datetime' => $request->arrival_datetime,
                'disposition' => $request->disposition,
                'room_ward' => $request->user()->department, 
                'overall_status' => $initialStatus,
                'is_oecb' => $request->is_oecb ?? false,
                'has_oxygen' => $request->has_oxygen ?? false,
                'oxygen_remarks' => $request->oxygen_remarks,
                'requires_or' => $allowsAdditionalClearance && (bool) ($request->requires_or ?? false),
                'requires_nicu' => $allowsAdditionalClearance && (bool) ($request->requires_nicu ?? false),
                'encoded_by' => $request->user()->name,
            ]
        );

        // When routing from Outpatient, automatically clear all cost centers except HDU
        if ($isOutpatientWard) {
            $autoDepts = ['Pharmacy', 'Laboratory', 'Radiology', 'Cardio Pulmo', 'CSR'];
            foreach ($autoDepts as $d) {
                ClearanceLog::firstOrCreate(
                    ['enccode' => $request->enccode, 'department' => $d],
                    ['user_id' => $request->user()->id]
                );
            }
        }

        self::recalculateStatus($request->enccode);

        return back();
    }

    public static function recalculateStatus($enccode)
    {
        $transaction = ClearanceTransaction::where('enccode', $enccode)->first();
        if (!$transaction) {
            return;
        }

        // Do not revert archived or cancelled transactions
        if (in_array($transaction->overall_status, ['Archived', 'Cancelled'])) {
            return;
        }

        $wardStr = strtolower(trim($transaction->room_ward ?? ''));
        $isOutpatient = str_contains($wardStr, 'outpatient') || str_contains($wardStr, 'opd') || str_contains($wardStr, 'hemodialysis') || str_contains($wardStr, 'dialysis') || str_contains($wardStr, 'hdu');

        if ($isOutpatient) {
            // Outpatient encounters automatically clear from standard cost centers except HDU (and any toggled OR/NICU)
            $autoDepts = ['Pharmacy', 'Laboratory', 'Radiology', 'Cardio Pulmo', 'CSR'];
            $encoderUser = \App\Models\User::where('name', $transaction->encoded_by)->first() ?? \App\Models\User::first();
            $autoUserId = $encoderUser ? $encoderUser->id : 1;
            foreach ($autoDepts as $d) {
                ClearanceLog::firstOrCreate(
                    ['enccode' => $enccode, 'department' => $d],
                    ['user_id' => $autoUserId]
                );
            }
        }

        $requiredDepartments = BillingController::getRequiredDepartmentsForWard(
            $transaction->room_ward,
            (bool) $transaction->requires_or,
            (bool) $transaction->requires_nicu
        );

        $patientLogs = ClearanceLog::where('enccode', $enccode)->get();

        $missing = [];
        foreach ($requiredDepartments as $req) {
            if (!BillingController::matchDepartmentLog($req, $patientLogs)) {
                $missing[] = $req;
            }
        }

        $newStatus = empty($missing) ? 'Cleared' : 'Routing in Progress';
        if ($transaction->overall_status !== $newStatus) {
            $transaction->update(['overall_status' => $newStatus]);
        }
    }
}