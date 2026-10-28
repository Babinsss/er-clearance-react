<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use App\Models\ClearanceLog;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $user = auth()->user();
        $costCenters = ['Laboratory', 'Radiology', 'Pharmacy', 'Cardiopulmonary', 'CSR', 'Cardio Pulmo', 'OR', 'LR/DR', 'HDU', 'Credit and Collection', 'Credit & Collection'];

        // Automatically route to the correct engine based on the user's role
        if (in_array($user->department, $costCenters)) {
            return $this->getCostCenterQueue($user->department);
        }

        return $this->getWardDashboard($request);
    }

    private function getCostCenterQueue($department)
    {
        // ENGINE 1: Cost Center Live Queue (Finds unserved patients for a specific department)
        $queue = [];
        
        if ($department === 'Pharmacy') {
            $queue = DB::connection('ihomis')->table('hrxo as r')
                ->join('henctr as e', 'r.enccode', '=', 'e.enccode')
                ->join('hperson as p', 'e.hpercode', '=', 'p.hpercode')
                ->whereNotIn('r.estatus', ['S', 'C']) // Ignore Served or Cancelled
                ->select('e.enccode', 'e.hpercode', 'p.patfirst', 'p.patlast', DB::raw("COUNT(r.enccode) as pending_items"))
                ->groupBy('e.enccode', 'e.hpercode', 'p.patfirst', 'p.patlast')
                ->orderBy('e.encdate', 'desc')
                ->take(20)->get();
        } else {
            // Map the department to the correct iHomis orcode
            $orcode = match($department) {
                'Laboratory' => '%LAB%',
                'Radiology' => '%RAD%',
                'Cardiopulmonary' => 'CAR%',
                'CSR' => '%SUP%', 
                default => '%'
            };

            $queue = DB::connection('ihomis')->table('hdocord as d')
                ->join('henctr as e', 'd.enccode', '=', 'e.enccode')
                ->join('hperson as p', 'e.hpercode', '=', 'p.hpercode')
                ->where(function($q) use ($orcode) {
                    $q->where('d.orcode', 'LIKE', $orcode)
                      ->orWhere('d.orcode', 'LIKE', '%CSG%');
                })
                ->whereNotIn('d.estatus', ['S', 'C'])
                ->select('e.enccode', 'e.hpercode', 'p.patfirst', 'p.patlast', DB::raw("COUNT(d.enccode) as pending_items"))
                ->groupBy('e.enccode', 'e.hpercode', 'p.patfirst', 'p.patlast')
                ->orderBy('e.encdate', 'desc')
                ->take(20)->get();
        }

        return Inertia::render('Dashboard/CostCenter', [
            'department' => $department,
            'queue' => $queue
        ]);
    }

    private function getWardDashboard(Request $request)
    {
        // ENGINE 2: Ward Dashboard Live Search
        $search = $request->input('search');
        $patient = null;

        if ($search) {
            $encounter = DB::connection('ihomis')->table('henctr as e')
                ->join('hperson as p', 'e.hpercode', '=', 'p.hpercode')
                ->where('e.enccode', $search)
                ->orWhere('e.hpercode', $search)
                ->orderBy('e.encdate', 'desc')
                ->select('e.enccode', 'e.hpercode', 'p.patfirst', 'p.patlast')
                ->first();

            if ($encounter) {
                // Check local database for what has already been cleared
                $clearedDepartments = ClearanceLog::where('enccode', $encounter->enccode)
                    ->pluck('department')->toArray();

                $patient = [
                    'enccode' => $encounter->enccode,
                    'hpercode' => $encounter->hpercode,
                    'name' => $encounter->patlast . ', ' . $encounter->patfirst,
                    'cleared' => $clearedDepartments,
                ];
            }
        }

        return Inertia::render('Dashboard/Ward', [
            'patient' => $patient,
            'searchQuery' => $search
        ]);
    }
}