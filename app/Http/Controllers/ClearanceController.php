<?php

namespace App\Http\Controllers;

use App\Models\ClearanceTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use App\Models\ClearanceLog;


class ClearanceController extends Controller
{
    public function show($search)
    {
        // 1. SMART ENCOUNTER LOOKUP
        $encounter = DB::connection('ihomis')->table('henctr')
            ->where('enccode', $search)
            ->orWhere('hpercode', $search)
            ->orderBy('encdate', 'desc')
            ->first();

        $enccode = $encounter ? $encounter->enccode : $search;

        // 2. Laboratory (Removed strict doctype filter to catch all LAB and CSG)
        $labOrders = DB::connection('ihomis')->table('hdocord as d')
            ->leftJoin('hprocm as p', 'd.proccode', '=', 'p.proccode') 
            ->leftJoin('hcharge as c', 'd.pcchrgcod', '=', 'c.chrgcode')
            ->where('d.enccode', $enccode)
            ->where(function($q) {
                $q->where('d.orcode', 'LIKE', '%LAB%')
                  ->orWhere('d.orcode', 'LIKE', '%CSG%'); // Catches Consignment
            })
            ->where('d.orcode', '!=', 'ECG')
            ->select([
                'd.dodate as datelog',
                DB::raw("COALESCE(p.procdesc, c.chrgdesc, 'Unknown Lab Test') as item_description"),
                'd.estatus as status', 
            ])
            ->get();

        // 3. Cardiopulmonary
        $cardioOrders = DB::connection('ihomis')->table('hdocord as d')
            ->leftJoin('hprocm as p', 'd.proccode', '=', 'p.proccode') 
            ->leftJoin('hcharge as c', 'd.pcchrgcod', '=', 'c.chrgcode')
            ->where('d.enccode', $enccode)
            ->where(function($q) {
                $q->where('d.orcode', 'LIKE', 'CAR%')
                  ->orWhere('d.orcode', 'ECG');
            })
            ->select([
                'd.dodate as datelog',
                DB::raw("COALESCE(p.procdesc, c.chrgdesc, 'Unknown Cardio Test') as item_description"),
                'd.estatus as status', 
            ])
            ->get();

        // 4. Radiology
        $radioOrders = DB::connection('ihomis')->table('hdocord as d')
            ->leftJoin('hprocm as p', 'd.proccode', '=', 'p.proccode') 
            ->leftJoin('hcharge as c', 'd.pcchrgcod', '=', 'c.chrgcode')
            ->where('d.enccode', $enccode)
            ->where(function($q) {
                $q->where('d.orcode', 'LIKE', '%RAD%')
                  ->orWhere('d.orcode', 'LIKE', '%XRAY%');
            })
            ->select([
                'd.dodate as datelog',
                DB::raw("COALESCE(p.procdesc, c.chrgdesc, 'Unknown Radiology Test') as item_description"),
                'd.estatus as status', 
            ])
            ->get();

        // 5. Pharmacy (Unchanged)
        $pharmacyOrders = DB::connection('ihomis')->table('hrxo as r')
            ->leftJoin('hdmhdr as m', function($join) {
                $join->on('r.dmdcomb', '=', 'm.dmdcomb')
                     ->on('r.dmdctr', '=', 'm.dmdctr');
            })
            ->leftJoin('hgen as g', function($join) {
                $join->whereRaw('SUBSTRING(r.dmdcomb, 1, 5) = g.gencode');
            })
            ->where('r.enccode', $enccode)
            ->where('r.estatus', '!=', 'C')
            ->select([
                'r.dodate as datelog',
                DB::raw("COALESCE(NULLIF(TRIM(CONCAT_WS(' ', g.gendesc, m.brandname)), ''), CONCAT('Med Code: ', r.dmdcomb)) as item_description"),
                'r.estatus as status',
            ])
            ->get();

        // 6. Fetch existing clearances
        $clearedDepartments = ClearanceLog::where('enccode', $enccode)
            ->pluck('department')
            ->toArray();

        return Inertia::render('Clearance/Index', [
            'enccode' => $enccode,
            'labOrders' => $labOrders,
            'cardioOrders' => $cardioOrders,
            'radioOrders' => $radioOrders,
            'pharmacyOrders' => $pharmacyOrders,
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
            'user_id' => auth()->id(),
        ]);

        // 2. Count how many unique departments have cleared this patient
        $clearedCount = ClearanceLog::where('enccode', $request->enccode)
            ->distinct('department')
            ->count('department');

        // 3. The Automated Trigger: If all 5 are cleared, finalize the transaction!
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

        // updateOrCreate ensures we don't create duplicate routes if they click it twice
        ClearanceTransaction::updateOrCreate(
            ['enccode' => $request->enccode],
            [
                'hospital_number' => $request->hospital_number,
                'patient_name' => $request->patient_name,
                'arrival_datetime' => $request->arrival_datetime,
                'disposition' => $request->disposition,
                'room_ward' => auth()->user()->department, 
                'overall_status' => 'Routing in Progress',
            ]
        );

        return back();
    }
}