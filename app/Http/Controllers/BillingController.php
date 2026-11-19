<?php

namespace App\Http\Controllers;

use App\Models\ClearanceLog;
use App\Models\ClearanceTransaction;
use App\Models\Department;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\Auth;

class BillingController extends Controller
{
    public static array $costCenters = [
        'Laboratory',
        'Radiology',
        'Pharmacy',
        'Cardio Pulmo',
        'CSR',
        'Credit and Collection',
        'HDU',
        'OR',
        'LR/DR',
        'NICU'
    ];

    /**
     * Determine required cost centers for a given originating ward and optional routing toggles.
     */
    public static function getRequiredDepartmentsForWard(?string $wardName, bool $requiresOr = false, bool $requiresNicu = false): array
    {
        $wardStr = strtolower(trim($wardName ?? ''));
        $isEr = $wardStr === 'emergency room' || $wardStr === 'er' || str_contains($wardStr, 'emergency');
        $isSurgOrtho = str_contains($wardStr, 'ortho') || str_contains($wardStr, 'surg');
        $isOB = str_contains($wardStr, 'ob');
        $isNicuWard = $wardStr === 'nicu' || str_contains($wardStr, 'neonatal');
        $isOutpatient = str_contains($wardStr, 'outpatient') || str_contains($wardStr, 'opd') || str_contains($wardStr, 'hemodialysis') || str_contains($wardStr, 'dialysis') || str_contains($wardStr, 'hdu');

        if ($isOutpatient) {
            return ['Pharmacy', 'Laboratory', 'Radiology', 'Cardio Pulmo', 'CSR', 'HDU'];
        }

        $required = ['Pharmacy', 'Laboratory', 'Radiology', 'Cardio Pulmo', 'CSR'];
        if (!$isEr) {
            $required[] = 'Credit and Collection';
        }
        if ($isSurgOrtho) {
            $required[] = 'OR';
        } elseif ($isOB) {
            $required[] = 'LR/DR';
        }

        // Additional optional clearances apply to admitted wards only (not ER or Outpatient)
        if (!$isEr) {
            if ($requiresOr && !in_array('OR', $required, true)) {
                $required[] = 'OR';
            }

            if ($requiresNicu && !$isNicuWard && !in_array('NICU', $required, true)) {
                $required[] = 'NICU';
            }
        }

        return $required;
    }

    /**
     * Match a canonical cost center name to a patient's clearance log.
     */
    public static function matchDepartmentLog(string $requiredDept, $patientLogs): ?ClearanceLog
    {
        $reqUpper = strtoupper(trim($requiredDept));
        foreach ($patientLogs as $log) {
            $cleared = strtoupper(trim($log->department));
            if ($cleared === $reqUpper) {
                return $log;
            }
            if ($reqUpper === 'CREDIT AND COLLECTION' && (str_contains($cleared, 'CREDIT') || str_contains($cleared, 'COLLECTION') || str_contains($cleared, 'COLLECT'))) {
                return $log;
            }
            if ($reqUpper === 'OR' && ($cleared === 'OR/LR/DR' || $cleared === 'OPERATING ROOM')) {
                return $log;
            }
            if ($reqUpper === 'LR/DR' && ($cleared === 'OR/LR/DR' || $cleared === 'LR / DR' || $cleared === 'LR' || $cleared === 'DR' || $cleared === 'DELIVERY ROOM')) {
                return $log;
            }
            if ($reqUpper === 'HDU' && ($cleared === 'HDU' || $cleared === 'CKD' || $cleared === 'DIALYSIS' || $cleared === 'DIALYSIS UNIT' || $cleared === 'HEMODIALYSIS')) {
                return $log;
            }
            if ($reqUpper === 'CARDIO PULMO' && (str_contains($cleared, 'CARDIO') || str_contains($cleared, 'ECG'))) {
                return $log;
            }
            if ($reqUpper === 'NICU' && ($cleared === 'NICU' || $cleared === 'NICU WARD' || str_contains($cleared, 'NEONATAL'))) {
                return $log;
            }
        }
        return null;
    }

    /**
     * Map any logged department alias back to canonical cost center name.
     */
    public static function resolveCanonicalCostCenter(string $deptName): ?string
    {
        $cleanD = strtoupper(trim($deptName));
        foreach (self::$costCenters as $cc) {
            $cleanTarget = strtoupper(trim($cc));
            if ($cleanD === $cleanTarget) return $cc;
            if ($cleanTarget === 'CREDIT AND COLLECTION' && (str_contains($cleanD, 'CREDIT') || str_contains($cleanD, 'COLLECT'))) return $cc;
            if ($cleanTarget === 'OR' && ($cleanD === 'OR/LR/DR' || $cleanD === 'OPERATING ROOM')) return $cc;
            if ($cleanTarget === 'LR/DR' && ($cleanD === 'OR/LR/DR' || $cleanD === 'LR / DR' || $cleanD === 'LR' || $cleanD === 'DR' || $cleanD === 'DELIVERY ROOM')) return $cc;
            if ($cleanTarget === 'HDU' && ($cleanD === 'HDU' || $cleanD === 'CKD' || $cleanD === 'DIALYSIS' || $cleanD === 'DIALYSIS UNIT' || $cleanD === 'HEMODIALYSIS')) return $cc;
            if ($cleanTarget === 'CARDIO PULMO' && (str_contains($cleanD, 'CARDIO') || str_contains($cleanD, 'ECG'))) return $cc;
            if ($cleanTarget === 'NICU' && ($cleanD === 'NICU' || $cleanD === 'NICU WARD' || str_contains($cleanD, 'NEONATAL'))) return $cc;
        }
        return null;
    }

    /**
     * Format a duration in seconds into a human-friendly string.
     */
    public static function formatDuration(int $seconds): string
    {
        if ($seconds < 60) {
            return $seconds . 's';
        }
        $minutes = (int) round($seconds / 60);
        if ($minutes < 60) {
            return $minutes . 'm';
        }
        $hours = intdiv($minutes, 60);
        $remMinutes = $minutes % 60;
        return $hours . 'h' . ($remMinutes > 0 ? ' ' . $remMinutes . 'm' : '');
    }

    /**
     * Render the Billing Dashboard with live routing monitor, turnaround analytics,
     * cleared queue, and archives.
     */
    public function index(Request $request)
    {
        // 1. Recalculate status for any pending routing transactions
        $pendingTx = ClearanceTransaction::where('overall_status', 'Routing in Progress')->get();
        foreach ($pendingTx as $ptx) {
            ClearanceController::recalculateStatus($ptx->enccode);
        }

        // 2. Fetch all actively routed patients (or recently updated)
        $routedTransactions = ClearanceTransaction::where('overall_status', 'Routing in Progress')
            ->orderBy('created_at', 'desc')
            ->get();

        $routedEnccodes = $routedTransactions->pluck('enccode')->toArray();

        $routedLogs = ClearanceLog::whereIn('enccode', $routedEnccodes)
            ->with('user:id,name')
            ->orderBy('created_at', 'asc')
            ->get()
            ->groupBy('enccode');

        $now = now();
        $formattedRouted = $routedTransactions->map(function ($tx) use ($routedLogs, $now) {
            $reqDepts = self::getRequiredDepartmentsForWard(
                $tx->room_ward,
                (bool) $tx->requires_or,
                (bool) $tx->requires_nicu
            );
            $pLogs = $routedLogs->get($tx->enccode, collect());

            $stationDetails = [];
            $clearedCount = 0;

            foreach ($reqDepts as $deptName) {
                $matchedLog = self::matchDepartmentLog($deptName, $pLogs);
                if ($matchedLog) {
                    $clearedCount++;
                    $diffSec = max(0, $tx->created_at->diffInSeconds($matchedLog->created_at));
                    $diffMin = max(0, (int) round($diffSec / 60));

                    $stationDetails[] = [
                        'department' => $deptName,
                        'status' => 'Cleared',
                        'cleared_at' => $matchedLog->created_at->toIso8601String(),
                        'cleared_by' => $matchedLog->user->name ?? 'Staff',
                        'duration_seconds' => $diffSec,
                        'duration_minutes' => $diffMin,
                        'duration_formatted' => self::formatDuration($diffSec),
                        'waiting_seconds' => null,
                        'waiting_minutes' => null,
                        'waiting_formatted' => null,
                    ];
                } else {
                    $waitingSec = max(0, $now->diffInSeconds($tx->created_at));
                    $waitingMin = max(0, (int) round($waitingSec / 60));

                    $stationDetails[] = [
                        'department' => $deptName,
                        'status' => 'Pending',
                        'cleared_at' => null,
                        'cleared_by' => null,
                        'duration_seconds' => null,
                        'duration_minutes' => null,
                        'duration_formatted' => null,
                        'waiting_seconds' => $waitingSec,
                        'waiting_minutes' => $waitingMin,
                        'waiting_formatted' => self::formatDuration($waitingSec),
                    ];
                }
            }

            $elapsedSec = max(0, $now->diffInSeconds($tx->created_at));
            $elapsedMin = max(0, (int) round($elapsedSec / 60));

            return [
                'id' => $tx->id,
                'enccode' => $tx->enccode,
                'hospital_number' => $tx->hospital_number,
                'patient_name' => $tx->patient_name,
                'room_ward' => $tx->room_ward,
                'arrival_datetime' => $tx->arrival_datetime,
                'disposition' => $tx->disposition,
                'overall_status' => $tx->overall_status,
                'is_oecb' => (bool) $tx->is_oecb,
                'has_oxygen' => (bool) $tx->has_oxygen,
                'oxygen_remarks' => $tx->oxygen_remarks,
                'requires_or' => (bool) $tx->requires_or,
                'requires_nicu' => (bool) $tx->requires_nicu,
                'encoded_by' => $tx->encoded_by,
                'routed_at' => $tx->created_at->toIso8601String(),
                'created_at' => $tx->created_at->toIso8601String(),
                'elapsed_seconds' => $elapsedSec,
                'elapsed_minutes' => $elapsedMin,
                'elapsed_formatted' => self::formatDuration($elapsedSec),
                'stations' => $stationDetails,
                'total_stations' => count($reqDepts),
                'cleared_stations' => $clearedCount,
                'pending_stations' => count($reqDepts) - $clearedCount,
                'progress_percent' => count($reqDepts) > 0 ? round(($clearedCount / count($reqDepts)) * 100) : 0,
            ];
        });

        // 3. Compute cost center turnaround stats over last 30 days
        $thirtyDaysAgo = now()->subDays(30);
        $recentLogs = ClearanceLog::where('created_at', '>=', $thirtyDaysAgo)
            ->with(['transaction', 'user:id,name'])
            ->orderBy('created_at', 'desc')
            ->get();

        $rawStats = [];
        foreach (self::$costCenters as $cc) {
            $rawStats[$cc] = [
                'name' => $cc,
                'total_cleared' => 0,
                'total_seconds' => 0,
                'min_seconds' => null,
                'max_seconds' => 0,
                'today_cleared' => 0,
                'today_seconds' => 0,
                'recent_logs' => [],
            ];
        }

        $todayStart = now()->startOfDay();

        foreach ($recentLogs as $log) {
            if (!$log->transaction) continue;

            $canonical = self::resolveCanonicalCostCenter($log->department);
            if (!$canonical || !isset($rawStats[$canonical])) continue;

            $sec = max(0, $log->transaction->created_at->diffInSeconds($log->created_at));
            $rawStats[$canonical]['total_cleared']++;
            $rawStats[$canonical]['total_seconds'] += $sec;

            if ($rawStats[$canonical]['min_seconds'] === null || $sec < $rawStats[$canonical]['min_seconds']) {
                $rawStats[$canonical]['min_seconds'] = $sec;
            }
            if ($sec > $rawStats[$canonical]['max_seconds']) {
                $rawStats[$canonical]['max_seconds'] = $sec;
            }

            if ($log->created_at >= $todayStart) {
                $rawStats[$canonical]['today_cleared']++;
                $rawStats[$canonical]['today_seconds'] += $sec;
            }

            if (count($rawStats[$canonical]['recent_logs']) < 8) {
                $rawStats[$canonical]['recent_logs'][] = [
                    'patient_name' => $log->transaction->patient_name,
                    'hospital_number' => $log->transaction->hospital_number,
                    'enccode' => $log->transaction->enccode,
                    'room_ward' => $log->transaction->room_ward,
                    'cleared_at' => $log->created_at->toIso8601String(),
                    'cleared_by' => $log->user->name ?? 'Staff',
                    'duration_formatted' => self::formatDuration($sec),
                    'duration_minutes' => (int) round($sec / 60),
                ];
            }
        }

        $costCenterStats = [];
        $totalMinutesAll = 0;
        $totalClearedAll = 0;
        $fastestDept = null;
        $slowestDept = null;
        $minAvg = 999999;
        $maxAvg = -1;

        foreach ($rawStats as $name => $d) {
            $avgSec = $d['total_cleared'] > 0 ? (int) round($d['total_seconds'] / $d['total_cleared']) : 0;
            $avgMin = (int) round($avgSec / 60);

            $todayAvgSec = $d['today_cleared'] > 0 ? (int) round($d['today_seconds'] / $d['today_cleared']) : 0;
            $todayAvgMin = (int) round($todayAvgSec / 60);

            $totalMinutesAll += ($d['total_seconds'] / 60);
            $totalClearedAll += $d['total_cleared'];

            if ($d['total_cleared'] > 0) {
                if ($avgMin < $minAvg) {
                    $minAvg = $avgMin;
                    $fastestDept = ['name' => $name, 'avg_minutes' => $avgMin, 'avg_formatted' => self::formatDuration($avgSec)];
                }
                if ($avgMin > $maxAvg) {
                    $maxAvg = $avgMin;
                    $slowestDept = ['name' => $name, 'avg_minutes' => $avgMin, 'avg_formatted' => self::formatDuration($avgSec)];
                }
            }

            // Find pending patients currently in routed queue waiting for this specific cost center
            $pendingPatientsForThisDept = [];
            foreach ($formattedRouted as $p) {
                foreach ($p['stations'] as $st) {
                    if ($st['department'] === $name && $st['status'] === 'Pending') {
                        $pendingPatientsForThisDept[] = [
                            'id' => $p['id'],
                            'patient_name' => $p['patient_name'],
                            'hospital_number' => $p['hospital_number'],
                            'room_ward' => $p['room_ward'],
                            'waiting_formatted' => $st['waiting_formatted'],
                            'waiting_minutes' => $st['waiting_minutes'],
                            'routed_at' => $p['routed_at'],
                        ];
                    }
                }
            }

            $speed = 'Fast';
            if ($avgMin > 30) {
                $speed = 'Delayed';
            } elseif ($avgMin > 15) {
                $speed = 'Moderate';
            }

            $costCenterStats[$name] = [
                'name' => $name,
                'total_cleared' => $d['total_cleared'],
                'avg_minutes' => $avgMin,
                'avg_seconds' => $avgSec,
                'avg_formatted' => self::formatDuration($avgSec),
                'min_formatted' => $d['min_seconds'] !== null ? self::formatDuration($d['min_seconds']) : '0m',
                'max_formatted' => self::formatDuration($d['max_seconds']),
                'today_cleared' => $d['today_cleared'],
                'today_avg_minutes' => $todayAvgMin,
                'today_avg_formatted' => self::formatDuration($todayAvgSec),
                'pending_count' => count($pendingPatientsForThisDept),
                'pending_patients' => $pendingPatientsForThisDept,
                'recent_clearances' => $d['recent_logs'],
                'speed_rating' => $speed,
            ];
        }

        $overallHospitalAvg = $totalClearedAll > 0 ? (int) round($totalMinutesAll / $totalClearedAll) : 0;

        $hospitalStats = [
            'total_routing' => count($formattedRouted),
            'overall_avg_minutes' => $overallHospitalAvg,
            'overall_avg_formatted' => self::formatDuration($overallHospitalAvg * 60),
            'fastest_dept' => $fastestDept,
            'slowest_dept' => $slowestDept,
            'total_cleared_30d' => $totalClearedAll,
        ];

        // 4. Originating wards list for filtering
        $wards = Department::where('category', 'Ward')
            ->orderBy('name')
            ->pluck('name')
            ->toArray();

        if (empty($wards)) {
            $wards = ['Emergency Room', 'Surgical Ward', 'Ortho Ward', 'OB Ward', 'Outpatient', 'Male Medical Ward', 'Female Medical Ward', 'Pedia Ward', 'Pay Ward', 'ICU', 'NICU'];
        }

        // 5. Printed Archives pagination
        $archiveSearch = trim($request->input('archive_search', ''));
        $archivePage = max(1, (int) $request->input('archive_page', 1));
        $perPage = (int) $request->input('archive_per_page', 50);
        if (!in_array($perPage, [25, 50, 100, 200])) {
            $perPage = 50;
        }

        $getArchivePaginator = function() use ($archiveSearch, $archivePage, $perPage) {
            static $paginator = null;
            if ($paginator === null) {
                $query = ClearanceTransaction::where('overall_status', 'Archived')
                    ->orderBy('updated_at', 'desc');

                if ($archiveSearch !== '') {
                    $query->where(function($q) use ($archiveSearch) {
                        $q->where('patient_name', 'like', "%{$archiveSearch}%")
                          ->orWhere('hospital_number', 'like', "%{$archiveSearch}%")
                          ->orWhere('enccode', 'like', "%{$archiveSearch}%");
                    });
                }

                $paginator = $query->paginate($perPage, ['*'], 'archive_page', $archivePage);
            }
            return $paginator;
        };

        return Inertia::render('Dashboard/Billing', [
            'routedPatients' => $formattedRouted->values(),
            'costCenterStats' => $costCenterStats,
            'hospitalStats' => $hospitalStats,
            'wards' => $wards,
            'costCentersList' => self::$costCenters,

            'clearedPatients' => fn() => ClearanceTransaction::where('overall_status', 'Cleared')
                ->orderBy('updated_at', 'desc')
                ->get(),

            'archivedPatients' => fn() => $getArchivePaginator()->items(),

            'archivePagination' => fn() => [
                'current_page' => $getArchivePaginator()->currentPage(),
                'last_page' => $getArchivePaginator()->lastPage(),
                'per_page' => $getArchivePaginator()->perPage(),
                'total' => $getArchivePaginator()->total(),
                'from' => $getArchivePaginator()->firstItem() ?? 0,
                'to' => $getArchivePaginator()->lastItem() ?? 0,
            ],

            'totalArchivedCount' => fn() => ClearanceTransaction::where('overall_status', 'Archived')->count(),
            'archiveSearch' => $archiveSearch,
            'archivePage' => $archivePage,
            'archivePerPage' => $perPage,
        ]);
    }

    /**
     * Dedicated JSON endpoint for live cost center turnaround analytics.
     */
    public function getCostCenterAnalytics(Request $request)
    {
        $days = (int) $request->query('days', 30);
        if ($days <= 0 || $days > 365) $days = 30;

        $startDate = now()->subDays($days);
        $logs = ClearanceLog::where('created_at', '>=', $startDate)
            ->with(['transaction', 'user:id,name'])
            ->get();

        $stats = [];
        foreach (self::$costCenters as $cc) {
            $stats[$cc] = [
                'name' => $cc,
                'count' => 0,
                'total_seconds' => 0,
                'min_seconds' => null,
                'max_seconds' => 0,
            ];
        }

        foreach ($logs as $log) {
            if (!$log->transaction) continue;
            $canonical = self::resolveCanonicalCostCenter($log->department);
            if (!$canonical || !isset($stats[$canonical])) continue;

            $sec = max(0, $log->transaction->created_at->diffInSeconds($log->created_at));
            $stats[$canonical]['count']++;
            $stats[$canonical]['total_seconds'] += $sec;

            if ($stats[$canonical]['min_seconds'] === null || $sec < $stats[$canonical]['min_seconds']) {
                $stats[$canonical]['min_seconds'] = $sec;
            }
            if ($sec > $stats[$canonical]['max_seconds']) {
                $stats[$canonical]['max_seconds'] = $sec;
            }
        }

        $response = [];
        foreach ($stats as $name => $d) {
            $avgSec = $d['count'] > 0 ? (int) round($d['total_seconds'] / $d['count']) : 0;
            $avgMin = (int) round($avgSec / 60);

            $response[$name] = [
                'name' => $name,
                'total_cleared' => $d['count'],
                'avg_minutes' => $avgMin,
                'avg_formatted' => self::formatDuration($avgSec),
                'min_formatted' => $d['min_seconds'] !== null ? self::formatDuration($d['min_seconds']) : '0m',
                'max_formatted' => self::formatDuration($d['max_seconds']),
            ];
        }

        return response()->json($response);
    }
}
