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

        // 2. Fetch Active Encounters
        $encounterCodes = [$enccode]; 

        if ($hpercode && $currentEncounter && isset($currentEncounter->encdate)) {
            $currentDate = $currentEncounter->encdate;
            $historyEncounters = $db->table('henctr')
                ->where('hpercode', $hpercode)
                ->where('encdate', '>=', date('Y-m-d 00:00:00', strtotime($currentDate . ' -3 days')))
                ->pluck('enccode')
                ->toArray();
                
            $encounterCodes = array_unique(array_merge($encounterCodes, $historyEncounters));
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
                'orOrders' => $orOrders,
                'lrDrOrders' => $lrDrOrders,
                'hduOrders' => $hduOrders,
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
            'orOrders' => $orOrders,
            'lrDrOrders' => $lrDrOrders,
            'hduOrders' => $hduOrders,
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

        $transaction = ClearanceTransaction::where('enccode', $request->enccode)->first();
        
        if ($transaction) {
            $requiredDepartments = ['Pharmacy', 'Laboratory', 'Radiology', 'Cardio Pulmo', 'CSR'];
            
            $wardStr = strtolower(trim($transaction->room_ward ?? ''));
            $isSurgOrtho = str_contains($wardStr, 'ortho') || str_contains($wardStr, 'surg');
            $isOB = str_contains($wardStr, 'ob');
            $isOutpatient = str_contains($wardStr, 'outpatient') || str_contains($wardStr, 'opd') || str_contains($wardStr, 'hemodialysis') || str_contains($wardStr, 'dialysis') || str_contains($wardStr, 'hdu');

            if ($isSurgOrtho) {
                $requiredDepartments[] = 'OR';
            } elseif ($isOB) {
                $requiredDepartments[] = 'LR/DR';
            } elseif ($isOutpatient) {
                $requiredDepartments[] = 'HDU';
            }

            $clearedDepartments = ClearanceLog::where('enccode', $request->enccode)
                ->pluck('department')
                ->map(fn($d) => strtoupper(trim($d)))
                ->toArray();
            
            // Check missing departments with flexible alias support
            $missing = [];
            foreach ($requiredDepartments as $req) {
                $reqUpper = strtoupper(trim($req));
                $isCleared = false;
                foreach ($clearedDepartments as $cleared) {
                    if ($cleared === $reqUpper) {
                        $isCleared = true;
                        break;
                    }
                    if ($reqUpper === 'OR' && ($cleared === 'OR/LR/DR' || $cleared === 'OPERATING ROOM')) {
                        $isCleared = true;
                        break;
                    }
                    if ($reqUpper === 'LR/DR' && ($cleared === 'OR/LR/DR' || $cleared === 'LR / DR' || $cleared === 'LR' || $cleared === 'DR' || $cleared === 'DELIVERY ROOM')) {
                        $isCleared = true;
                        break;
                    }
                    if ($reqUpper === 'HDU' && ($cleared === 'HDU' || $cleared === 'CKD' || $cleared === 'DIALYSIS' || $cleared === 'DIALYSIS UNIT' || $cleared === 'HEMODIALYSIS')) {
                        $isCleared = true;
                        break;
                    }
                    if ($reqUpper === 'CARDIO PULMO' && (str_contains($cleared, 'CARDIO') || str_contains($cleared, 'ECG'))) {
                        $isCleared = true;
                        break;
                    }
                }
                if (!$isCleared) {
                    $missing[] = $req;
                }
            }

            if (empty($missing)) {
                $transaction->update(['overall_status' => 'Cleared']);
            }
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
            'is_oecb' => 'nullable|boolean',
            'has_oxygen' => 'nullable|boolean',
            'oxygen_remarks' => 'nullable|string',
        ]);

        ClearanceTransaction::updateOrCreate(
            ['enccode' => $request->enccode],
            [
                'hospital_number' => $request->hospital_number,
                'patient_name' => $request->patient_name,
                'arrival_datetime' => $request->arrival_datetime,
                'disposition' => $request->disposition,
                'room_ward' => $request->user()->department, 
                'overall_status' => 'Routing in Progress',
                'is_oecb' => $request->is_oecb ?? false,
                'has_oxygen' => $request->has_oxygen ?? false,
                'oxygen_remarks' => $request->oxygen_remarks,
                'encoded_by' => $request->user()->name,
            ]
        );

        return back();
    }
}