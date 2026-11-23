<?php

namespace App\Http\Controllers;

use App\Models\ClearanceLog;
use App\Models\ClearancePendingRemark;
use App\Models\ClearanceTransaction;
use App\Models\Department;
use App\Models\User;
use App\Services\DepartmentOperatingHours;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

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
     * Check whether a logged/stored department string matches a canonical cost center name.
     */
    public static function departmentsMatch(string $requiredDept, string $candidateDept): bool
    {
        $reqUpper = strtoupper(trim($requiredDept));
        $candidate = strtoupper(trim($candidateDept));

        if ($candidate === $reqUpper) {
            return true;
        }
        if ($reqUpper === 'CREDIT AND COLLECTION' && (str_contains($candidate, 'CREDIT') || str_contains($candidate, 'COLLECT'))) {
            return true;
        }
        if ($reqUpper === 'OR' && ($candidate === 'OR/LR/DR' || $candidate === 'OPERATING ROOM')) {
            return true;
        }
        if ($reqUpper === 'LR/DR' && ($candidate === 'OR/LR/DR' || $candidate === 'LR / DR' || $candidate === 'LR' || $candidate === 'DR' || $candidate === 'DELIVERY ROOM')) {
            return true;
        }
        if ($reqUpper === 'HDU' && ($candidate === 'HDU' || $candidate === 'CKD' || $candidate === 'DIALYSIS' || $candidate === 'DIALYSIS UNIT' || $candidate === 'HEMODIALYSIS')) {
            return true;
        }
        if ($reqUpper === 'CARDIO PULMO' && (str_contains($candidate, 'CARDIO') || str_contains($candidate, 'ECG'))) {
            return true;
        }
        if ($reqUpper === 'NICU' && ($candidate === 'NICU' || $candidate === 'NICU WARD' || str_contains($candidate, 'NEONATAL'))) {
            return true;
        }

        return false;
    }

    /**
     * Match a canonical cost center name to a patient's clearance log.
     */
    public static function matchDepartmentLog(string $requiredDept, $patientLogs): ?ClearanceLog
    {
        foreach ($patientLogs as $log) {
            if (self::departmentsMatch($requiredDept, (string) $log->department)) {
                return $log;
            }
        }
        return null;
    }

    /**
     * Match a canonical cost center name to a patient's pending remark.
     */
    public static function matchDepartmentRemark(string $requiredDept, $patientRemarks): ?ClearancePendingRemark
    {
        foreach ($patientRemarks as $remark) {
            if (self::departmentsMatch($requiredDept, (string) $remark->department)) {
                return $remark;
            }
        }
        return null;
    }

    /**
     * Map any logged department alias back to canonical cost center name.
     */
    public static function resolveCanonicalCostCenter(string $deptName): ?string
    {
        foreach (self::$costCenters as $cc) {
            if (self::departmentsMatch($cc, $deptName)) {
                return $cc;
            }
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

        $routedRemarks = ClearancePendingRemark::whereIn('enccode', $routedEnccodes)
            ->with('user:id,name')
            ->orderBy('updated_at', 'desc')
            ->get()
            ->groupBy('enccode');

        $now = now();
        $operatingHours = new DepartmentOperatingHours();
        $deptSchedules = [];
        foreach (self::$costCenters as $cc) {
            $deptSchedules[$cc] = $operatingHours->getStatusAt($cc, $now);
        }

        $formattedRouted = $routedTransactions->map(function ($tx) use ($routedLogs, $routedRemarks, $now, $operatingHours, $deptSchedules) {
            $reqDepts = self::getRequiredDepartmentsForWard(
                $tx->room_ward,
                (bool) $tx->requires_or,
                (bool) $tx->requires_nicu
            );
            $pLogs = $routedLogs->get($tx->enccode, collect());
            $pRemarks = $routedRemarks->get($tx->enccode, collect());

            $stationDetails = [];
            $clearedCount = 0;

            foreach ($reqDepts as $deptName) {
                $matchedLog = self::matchDepartmentLog($deptName, $pLogs);
                $schedule = $deptSchedules[$deptName] ?? $operatingHours->getStatusAt($deptName, $now);

                if ($matchedLog) {
                    $clearedCount++;
                    $metrics = $operatingHours->calculateMetrics($deptName, $tx->created_at, $matchedLog->created_at);
                    $diffSec = $metrics['effective_seconds'];
                    $diffMin = max(0, (int) round($diffSec / 60));
                    $wallSec = $metrics['wall_seconds'];

                    $stationDetails[] = [
                        'department' => $deptName,
                        'status' => 'Cleared',
                        'cleared_at' => $matchedLog->created_at->toIso8601String(),
                        'cleared_by' => $matchedLog->user->name ?? 'Staff',
                        'duration_seconds' => $diffSec,
                        'duration_minutes' => $diffMin,
                        'duration_formatted' => self::formatDuration($diffSec),
                        'wall_duration_seconds' => $wallSec,
                        'wall_duration_formatted' => self::formatDuration($wallSec),
                        'off_hours_cleared' => $metrics['off_hours_cleared'],
                        'is_24_7' => $schedule['is_24_7'],
                        'is_department_open' => $schedule['is_open_now'],
                        'hours_label' => $schedule['hours_label'],
                        'next_open_label' => $schedule['next_open_label'],
                        'waiting_seconds' => null,
                        'waiting_minutes' => null,
                        'waiting_formatted' => null,
                        'wall_waiting_seconds' => null,
                        'wall_waiting_formatted' => null,
                        'pending_remark' => null,
                    ];
                } else {
                    $waitingSec = $operatingHours->calculateEffectiveSeconds($deptName, $tx->created_at, $now);
                    $waitingMin = max(0, (int) round($waitingSec / 60));
                    $wallWaitingSec = max(0, $now->getTimestamp() - $tx->created_at->getTimestamp());
                    $matchedRemark = self::matchDepartmentRemark($deptName, $pRemarks);

                    $stationDetails[] = [
                        'department' => $deptName,
                        'status' => 'Pending',
                        'cleared_at' => null,
                        'cleared_by' => null,
                        'duration_seconds' => null,
                        'duration_minutes' => null,
                        'duration_formatted' => null,
                        'wall_duration_seconds' => null,
                        'wall_duration_formatted' => null,
                        'off_hours_cleared' => false,
                        'is_24_7' => $schedule['is_24_7'],
                        'is_department_open' => $schedule['is_open_now'],
                        'hours_label' => $schedule['hours_label'],
                        'next_open_label' => $schedule['next_open_label'],
                        'waiting_seconds' => $waitingSec,
                        'waiting_minutes' => $waitingMin,
                        'waiting_formatted' => self::formatDuration($waitingSec),
                        'wall_waiting_seconds' => $wallWaitingSec,
                        'wall_waiting_formatted' => self::formatDuration($wallWaitingSec),
                        'pending_remark' => $matchedRemark ? [
                            'remarks' => $matchedRemark->remarks,
                            'updated_by' => $matchedRemark->user->name ?? 'Staff',
                            'updated_at' => $matchedRemark->updated_at?->toIso8601String(),
                        ] : null,
                    ];
                }
            }

            $elapsedSec = max(0, $now->getTimestamp() - $tx->created_at->getTimestamp());
            $elapsedMin = max(0, (int) round($elapsedSec / 60));

            return [
                'id' => $tx->id,
                'enccode' => $tx->enccode,
                'hospital_number' => $tx->hospital_number,
                'patient_name' => $tx->patient_name,
                'room_ward' => $tx->room_ward,
                'arrival_datetime' => $tx->arrival_datetime,
                'disposition' => $tx->disposition,
                'diagnosis' => $tx->diagnosis,
                'overall_status' => $tx->overall_status,
                'reroute_count' => (int) ($tx->reroute_count ?? 0),
                'reroute_reason' => $tx->reroute_reason,
                'rerouted_by' => $tx->rerouted_by,
                'rerouted_at' => $tx->rerouted_at ? $tx->rerouted_at->toIso8601String() : null,
                'is_oecb' => (bool) $tx->is_oecb,
                'is_for_procedure' => (bool) $tx->is_for_procedure,
                'procedure_type' => $tx->procedure_type,
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
                'measured_cleared' => 0,
                'off_hours_cleared_count' => 0,
                'total_seconds' => 0,
                'min_seconds' => null,
                'max_seconds' => 0,
                'today_cleared' => 0,
                'today_measured_cleared' => 0,
                'today_seconds' => 0,
                'recent_logs' => [],
            ];
        }

        $todayStart = now('Asia/Manila')->startOfDay();

        foreach ($recentLogs as $log) {
            if (!$log->transaction) continue;

            $canonical = self::resolveCanonicalCostCenter($log->department);
            if (!$canonical || !isset($rawStats[$canonical])) continue;

            $metrics = $operatingHours->calculateMetrics($canonical, $log->transaction->created_at, $log->created_at);
            $sec = $metrics['effective_seconds'];
            $wallSec = $metrics['wall_seconds'];
            $isOffHoursZero = $metrics['off_hours_cleared'] && $sec === 0;

            $rawStats[$canonical]['total_cleared']++;
            if ($isOffHoursZero) {
                $rawStats[$canonical]['off_hours_cleared_count']++;
            } else {
                $rawStats[$canonical]['measured_cleared']++;
                $rawStats[$canonical]['total_seconds'] += $sec;

                if ($rawStats[$canonical]['min_seconds'] === null || $sec < $rawStats[$canonical]['min_seconds']) {
                    $rawStats[$canonical]['min_seconds'] = $sec;
                }
                if ($sec > $rawStats[$canonical]['max_seconds']) {
                    $rawStats[$canonical]['max_seconds'] = $sec;
                }
            }

            if ($log->created_at >= $todayStart) {
                $rawStats[$canonical]['today_cleared']++;
                if (!$isOffHoursZero) {
                    $rawStats[$canonical]['today_measured_cleared']++;
                    $rawStats[$canonical]['today_seconds'] += $sec;
                }
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
                    'wall_duration_formatted' => self::formatDuration($wallSec),
                    'off_hours_cleared' => $metrics['off_hours_cleared'],
                ];
            }
        }

        $costCenterStats = [];
        $totalMinutesAll = 0;
        $totalClearedAll = 0;
        $totalMeasuredAll = 0;
        $fastestDept = null;
        $slowestDept = null;
        $minAvg = 999999;
        $maxAvg = -1;

        foreach ($rawStats as $name => $d) {
            $avgSec = $d['measured_cleared'] > 0 ? (int) round($d['total_seconds'] / $d['measured_cleared']) : 0;
            $avgMin = (int) round($avgSec / 60);

            $todayAvgSec = $d['today_measured_cleared'] > 0 ? (int) round($d['today_seconds'] / $d['today_measured_cleared']) : 0;
            $todayAvgMin = (int) round($todayAvgSec / 60);

            $totalMinutesAll += ($d['total_seconds'] / 60);
            $totalClearedAll += $d['total_cleared'];
            $totalMeasuredAll += $d['measured_cleared'];

            if ($d['measured_cleared'] > 0) {
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
                            'wall_waiting_formatted' => $st['wall_waiting_formatted'],
                            'is_department_open' => $st['is_department_open'],
                            'next_open_label' => $st['next_open_label'],
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

            $schedule = $deptSchedules[$name] ?? $operatingHours->getStatusAt($name, $now);

            $costCenterStats[$name] = [
                'name' => $name,
                'is_24_7' => $schedule['is_24_7'],
                'is_open_now' => $schedule['is_open_now'],
                'hours_label' => $schedule['hours_label'],
                'next_open_label' => $schedule['next_open_label'],
                'total_cleared' => $d['total_cleared'],
                'measured_cleared' => $d['measured_cleared'],
                'off_hours_cleared_count' => $d['off_hours_cleared_count'],
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

        $overallHospitalAvg = $totalMeasuredAll > 0 ? (int) round($totalMinutesAll / $totalMeasuredAll) : 0;

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
            'canGenerateReports' => $this->isBillingHead($request->user()),
            'isBillingHead' => $this->isStrictBillingHead($request->user()),
        ]);
    }

    /**
     * Check if the user is Head of Billing & Claims (strictly).
     */
    private function isStrictBillingHead(?User $user): bool
    {
        $dept = strtolower(trim($user->department ?? ''));
        return in_array($dept, [
            'head of billing & claims',
            'head of billing and claims',
            'billing head',
        ], true);
    }

    /**
     * Check if the user can generate Head of Billing & Claims routed patient reports.
     */
    private function isBillingHead(?User $user): bool
    {
        $dept = strtolower(trim($user->department ?? ''));
        return $this->isStrictBillingHead($user) || $dept === 'ict / admin';
    }

    /**
     * Abort unless authenticated user is Head of Billing & Claims or ICT / Admin.
     */
    private function authorizeBillingHead(Request $request): void
    {
        if (!$this->isBillingHead($request->user())) {
            abort(403, 'Unauthorized access to Head of Billing & Claims reports.');
        }
    }

    /**
     * Query, filter, sort, and summarize routed patients for reports, print view, and CSV export.
     */
    private function buildRoutedReportData(Request $request): array
    {
        $dateFrom = trim((string) $request->query('date_from', ''));
        $dateTo = trim((string) $request->query('date_to', ''));
        $disposition = trim((string) $request->query('disposition', 'all'));
        $ward = trim((string) $request->query('ward', 'all'));
        $status = trim((string) $request->query('status', 'all_routed'));
        $category = strtolower(trim((string) $request->query('category', 'all')));
        if (!in_array($category, ['all', 'oecb', 'non_oecb', 'for_procedure'], true)) {
            $category = 'all';
        }
        $search = trim((string) $request->query('search', ''));
        $startsWith = strtoupper(trim((string) $request->query('starts_with', '')));
        if (!preg_match('/^[A-Z]$/', $startsWith)) {
            $startsWith = '';
        }
        $layout = trim((string) $request->query('layout', 'alphabetical'));
        if (!in_array($layout, ['alphabetical', 'by_disposition', 'by_category'], true)) {
            $layout = 'alphabetical';
        }
        $sortDir = strtolower(trim((string) $request->query('sort_dir', 'asc'))) === 'desc' ? 'desc' : 'asc';

        $query = ClearanceTransaction::query();

        if ($dateFrom !== '') {
            $query->whereDate('created_at', '>=', $dateFrom);
        }
        if ($dateTo !== '') {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        if ($status === 'all_routed') {
            $query->where('overall_status', '!=', 'Cancelled');
        } elseif ($status !== 'all' && $status !== '') {
            $query->where('overall_status', $status);
        }

        if ($disposition !== '' && strtolower($disposition) !== 'all') {
            if (strtolower($disposition) === 'unspecified') {
                $query->where(function ($q) {
                    $q->whereNull('disposition')->orWhereRaw("TRIM(disposition) = ''");
                });
            } else {
                $query->whereRaw('LOWER(TRIM(disposition)) = ?', [strtolower($disposition)]);
            }
        }

        if ($ward !== '' && strtolower($ward) !== 'all') {
            $query->whereRaw('LOWER(TRIM(room_ward)) = ?', [strtolower($ward)]);
        }

        if ($category === 'oecb') {
            $query->where('is_oecb', true);
        } elseif ($category === 'for_procedure') {
            $query->where('is_oecb', false)->where('is_for_procedure', true);
        } elseif ($category === 'non_oecb') {
            $query->where('is_oecb', false)->where(function ($q) {
                $q->where('is_for_procedure', false)->orWhereNull('is_for_procedure');
            });
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('patient_name', 'like', "%{$search}%")
                  ->orWhere('hospital_number', 'like', "%{$search}%")
                  ->orWhere('enccode', 'like', "%{$search}%")
                  ->orWhere('encoded_by', 'like', "%{$search}%")
                  ->orWhere('procedure_type', 'like', "%{$search}%");
            });
        }

        if ($startsWith !== '') {
            $query->whereRaw('UPPER(TRIM(patient_name)) LIKE ?', [$startsWith . '%']);
        }

        if ($layout === 'by_disposition') {
            $query->orderByRaw("COALESCE(NULLIF(TRIM(disposition), ''), 'Unspecified') ASC");
        } elseif ($layout === 'by_category') {
            $query->orderByRaw("CASE WHEN is_oecb = 1 THEN 1 WHEN is_for_procedure = 1 THEN 3 ELSE 2 END ASC");
        }
        $query->orderByRaw('LOWER(TRIM(patient_name)) ' . ($sortDir === 'desc' ? 'DESC' : 'ASC'));
        $query->orderBy('created_at', 'desc');

        $rows = $query->get();

        $dispositionCounts = [];
        $categoryCounts = [
            'oecb' => 0,
            'non_oecb' => 0,
            'for_procedure' => 0,
        ];
        $records = $rows->map(function ($tx) use (&$dispositionCounts, &$categoryCounts) {
            $disp = trim((string) ($tx->disposition ?? ''));
            $dispLabel = $disp !== '' ? $disp : 'Unspecified';
            $dispositionCounts[$dispLabel] = ($dispositionCounts[$dispLabel] ?? 0) + 1;

            $isOecb = (bool) $tx->is_oecb;
            $isForProcedure = !$isOecb && (bool) $tx->is_for_procedure;
            if ($isOecb) {
                $categoryKey = 'oecb';
                $categoryLabel = 'OECB';
            } elseif ($isForProcedure) {
                $categoryKey = 'for_procedure';
                $categoryLabel = 'For Procedure';
            } else {
                $categoryKey = 'non_oecb';
                $categoryLabel = 'Non-OECB';
            }
            $categoryCounts[$categoryKey]++;

            return [
                'id' => $tx->id,
                'enccode' => $tx->enccode,
                'hospital_number' => $tx->hospital_number,
                'patient_name' => $tx->patient_name,
                'room_ward' => $tx->room_ward ?: 'Unspecified',
                'disposition' => $dispLabel,
                'overall_status' => $tx->overall_status,
                'is_oecb' => $isOecb,
                'is_for_procedure' => $isForProcedure,
                'procedure_type' => $tx->procedure_type ? trim((string) $tx->procedure_type) : null,
                'classification_key' => $categoryKey,
                'classification' => $categoryLabel,
                'has_oxygen' => (bool) $tx->has_oxygen,
                'encoded_by' => $tx->encoded_by ?: '—',
                'arrival_datetime' => $tx->arrival_datetime
                    ? \Carbon\Carbon::parse($tx->arrival_datetime)->toIso8601String()
                    : null,
                'created_at' => $tx->created_at ? $tx->created_at->toIso8601String() : null,
                'created_at_formatted' => $tx->created_at
                    ? $tx->created_at->timezone('Asia/Manila')->format('M d, Y h:i A')
                    : '—',
            ];
        })->values()->all();

        $total = count($records);
        $dispositionSummary = [];
        arsort($dispositionCounts);
        foreach ($dispositionCounts as $label => $cnt) {
            $dispositionSummary[] = [
                'disposition' => $label,
                'count' => $cnt,
                'percentage' => $total > 0 ? round(($cnt / $total) * 100, 1) : 0,
            ];
        }

        $categoryLabels = [
            'oecb' => 'OECB',
            'non_oecb' => 'Non-OECB',
            'for_procedure' => 'For Procedure',
        ];
        $categorySummary = [];
        foreach ($categoryLabels as $key => $label) {
            $cnt = $categoryCounts[$key];
            $categorySummary[] = [
                'key' => $key,
                'label' => $label,
                'count' => $cnt,
                'percentage' => $total > 0 ? round(($cnt / $total) * 100, 1) : 0,
            ];
        }

        $availableDispositions = ClearanceTransaction::query()
            ->selectRaw("DISTINCT COALESCE(NULLIF(TRIM(disposition), ''), 'Unspecified') as disp")
            ->orderBy('disp')
            ->pluck('disp')
            ->toArray();

        $availableWards = ClearanceTransaction::query()
            ->whereNotNull('room_ward')
            ->whereRaw("TRIM(room_ward) != ''")
            ->selectRaw('DISTINCT TRIM(room_ward) as ward')
            ->orderBy('ward')
            ->pluck('ward')
            ->toArray();

        return [
            'records' => $records,
            'total' => $total,
            'dispositionSummary' => $dispositionSummary,
            'categorySummary' => $categorySummary,
            'availableDispositions' => $availableDispositions,
            'availableWards' => $availableWards,
            'filters' => [
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
                'disposition' => $disposition !== '' ? $disposition : 'all',
                'ward' => $ward !== '' ? $ward : 'all',
                'status' => $status !== '' ? $status : 'all_routed',
                'category' => $category,
                'search' => $search,
                'starts_with' => $startsWith,
                'layout' => $layout,
                'sort_dir' => $sortDir,
            ],
        ];
    }

    /**
     * JSON endpoint for Head of Billing & Claims routed patients report preview.
     */
    public function routedReports(Request $request)
    {
        $this->authorizeBillingHead($request);
        return response()->json($this->buildRoutedReportData($request));
    }

    /**
     * Dedicated printable report view for Head of Billing & Claims.
     */
    public function printRoutedReports(Request $request)
    {
        $this->authorizeBillingHead($request);
        $data = $this->buildRoutedReportData($request);
        $data['generatedAt'] = now('Asia/Manila')->format('F d, Y h:i A');

        return Inertia::render('Billing/PrintRoutedReport', $data);
    }

    /**
     * Stream CSV export of filtered routed patients report.
     */
    public function exportRoutedReportsCsv(Request $request)
    {
        $this->authorizeBillingHead($request);
        $data = $this->buildRoutedReportData($request);

        $filename = 'routed-patients-report-' . now('Asia/Manila')->format('Y-m-d_Hi') . '.csv';

        return response()->streamDownload(function () use ($data) {
            $out = fopen('php://output', 'w');
            // UTF-8 BOM for Excel compatibility
            fwrite($out, "\xEF\xBB\xBF");

            fputcsv($out, [
                '#',
                'Patient Name',
                'Hospital Number',
                'Encounter Code',
                'Originating Ward',
                'Classification',
                'OECB',
                'For Procedure',
                'Procedure Type',
                'Type of Disposition',
                'Routing Status',
                'Oxygen',
                'Routed Date & Time',
                'Encoded By',
            ]);

            foreach ($data['records'] as $idx => $row) {
                fputcsv($out, [
                    $idx + 1,
                    $row['patient_name'],
                    $row['hospital_number'],
                    $row['enccode'],
                    $row['room_ward'],
                    $row['classification'],
                    $row['is_oecb'] ? 'Yes' : 'No',
                    $row['is_for_procedure'] ? 'Yes' : 'No',
                    $row['procedure_type'] ?: '',
                    $row['disposition'],
                    $row['overall_status'],
                    $row['has_oxygen'] ? 'Yes' : 'No',
                    $row['created_at_formatted'],
                    $row['encoded_by'],
                ]);
            }

            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
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

        $operatingHours = new DepartmentOperatingHours();
        $now = now();

        $stats = [];
        foreach (self::$costCenters as $cc) {
            $stats[$cc] = [
                'name' => $cc,
                'count' => 0,
                'measured_count' => 0,
                'off_hours_cleared_count' => 0,
                'total_seconds' => 0,
                'min_seconds' => null,
                'max_seconds' => 0,
            ];
        }

        foreach ($logs as $log) {
            if (!$log->transaction) continue;
            $canonical = self::resolveCanonicalCostCenter($log->department);
            if (!$canonical || !isset($stats[$canonical])) continue;

            $metrics = $operatingHours->calculateMetrics($canonical, $log->transaction->created_at, $log->created_at);
            $sec = $metrics['effective_seconds'];
            $isOffHoursZero = $metrics['off_hours_cleared'] && $sec === 0;

            $stats[$canonical]['count']++;
            if ($isOffHoursZero) {
                $stats[$canonical]['off_hours_cleared_count']++;
            } else {
                $stats[$canonical]['measured_count']++;
                $stats[$canonical]['total_seconds'] += $sec;

                if ($stats[$canonical]['min_seconds'] === null || $sec < $stats[$canonical]['min_seconds']) {
                    $stats[$canonical]['min_seconds'] = $sec;
                }
                if ($sec > $stats[$canonical]['max_seconds']) {
                    $stats[$canonical]['max_seconds'] = $sec;
                }
            }
        }

        $response = [];
        foreach ($stats as $name => $d) {
            $avgSec = $d['measured_count'] > 0 ? (int) round($d['total_seconds'] / $d['measured_count']) : 0;
            $avgMin = (int) round($avgSec / 60);
            $schedule = $operatingHours->getStatusAt($name, $now);

            $response[$name] = [
                'name' => $name,
                'is_24_7' => $schedule['is_24_7'],
                'is_open_now' => $schedule['is_open_now'],
                'hours_label' => $schedule['hours_label'],
                'total_cleared' => $d['count'],
                'measured_cleared' => $d['measured_count'],
                'off_hours_cleared_count' => $d['off_hours_cleared_count'],
                'avg_minutes' => $avgMin,
                'avg_formatted' => self::formatDuration($avgSec),
                'min_formatted' => $d['min_seconds'] !== null ? self::formatDuration($d['min_seconds']) : '0m',
                'max_formatted' => self::formatDuration($d['max_seconds']),
            ];
        }

        return response()->json($response);
    }
}
