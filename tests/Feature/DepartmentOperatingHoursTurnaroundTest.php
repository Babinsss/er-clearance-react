<?php

namespace Tests\Feature;

use App\Models\ClearanceLog;
use App\Models\ClearanceTransaction;
use App\Models\Department;
use App\Models\User;
use App\Services\DepartmentOperatingHours;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class DepartmentOperatingHoursTurnaroundTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_cac_overnight_routing_records_only_office_hours_in_effective_turnaround(): void
    {
        $cacDept = Department::where('name', 'Credit and Collection')->firstOrFail();
        $this->assertFalse($cacDept->is_24_7);
        $this->assertSame('07:00', $cacDept->open_time);
        $this->assertSame('18:30', $cacDept->close_time);

        Department::updateOrCreate(
            ['name' => 'Pharmacy'],
            ['category' => 'Cost Center', 'is_24_7' => true]
        );

        $service = new DepartmentOperatingHours();

        // OB Ward routes at 11:00 PM; CAC opens at 7:00 AM and clears at 7:12 AM
        $routedAt = Carbon::create(2026, 11, 23, 23, 0, 0, 'Asia/Manila');
        $clearedAt = Carbon::create(2026, 11, 24, 7, 12, 0, 'Asia/Manila');

        $cacMetrics = $service->calculateMetrics('Credit and Collection', $routedAt, $clearedAt);
        $this->assertSame(12 * 60, $cacMetrics['effective_seconds']);
        $this->assertSame((8 * 3600) + (12 * 60), $cacMetrics['wall_seconds']);
        $this->assertFalse($cacMetrics['is_24_7']);
        $this->assertFalse($cacMetrics['off_hours_cleared']);

        // 24/7 Pharmacy still records full elapsed time
        $pharmaMetrics = $service->calculateMetrics('Pharmacy', $routedAt, $clearedAt);
        $this->assertSame((8 * 3600) + (12 * 60), $pharmaMetrics['effective_seconds']);
        $this->assertTrue($pharmaMetrics['is_24_7']);

        // Late afternoon routing (6:20 PM -> 7:10 AM next day) = 10m + 10m = 20m
        $lateRouted = Carbon::create(2026, 11, 23, 18, 20, 0, 'Asia/Manila');
        $morningCleared = Carbon::create(2026, 11, 24, 7, 10, 0, 'Asia/Manila');
        $this->assertSame(
            20 * 60,
            $service->calculateEffectiveSeconds('Credit and Collection', $lateRouted, $morningCleared)
        );
    }

    public function test_billing_dashboard_and_analytics_use_effective_cac_turnaround_and_pause_night_pending_timer(): void
    {
        Department::updateOrCreate(
            ['name' => 'Credit and Collection'],
            ['category' => 'Cost Center', 'is_24_7' => false, 'open_time' => '07:00', 'close_time' => '18:30']
        );
        Department::updateOrCreate(
            ['name' => 'Pharmacy'],
            ['category' => 'Cost Center', 'is_24_7' => true]
        );

        $billingUser = User::factory()->create(['department' => 'Billing & Claims']);
        $cacUser = User::factory()->create(['department' => 'Credit and Collection', 'name' => 'CAC Staff']);

        // 1) Completed clearance: OB Ward routed at 11:00 PM, CAC cleared at 7:12 AM (12m active, 8h 12m wall)
        $routedNight = Carbon::create(2026, 11, 23, 23, 0, 0, 'Asia/Manila');
        $clearedMorning = Carbon::create(2026, 11, 24, 7, 12, 0, 'Asia/Manila');

        $txCompleted = ClearanceTransaction::create([
            'enccode' => 'ENC-CAC-HIST-01',
            'hospital_number' => '000000700001',
            'patient_name' => 'SANTOS, MARIA',
            'room_ward' => 'OB Ward',
            'disposition' => 'Improved',
            'overall_status' => 'Cleared',
        ]);
        ClearanceTransaction::where('id', $txCompleted->id)->update([
            'created_at' => $routedNight,
            'updated_at' => $clearedMorning,
        ]);

        $logMorning = ClearanceLog::create([
            'enccode' => 'ENC-CAC-HIST-01',
            'department' => 'Credit and Collection',
            'user_id' => $cacUser->id,
        ]);
        ClearanceLog::where('id', $logMorning->id)->update([
            'created_at' => $clearedMorning,
            'updated_at' => $clearedMorning,
        ]);

        // 2) Off-hours override clearance: routed 11:00 PM, cleared 2:00 AM (should NOT pull daytime avg/min down to 0)
        $clearedOffHours = Carbon::create(2026, 11, 24, 2, 0, 0, 'Asia/Manila');
        $txOffHours = ClearanceTransaction::create([
            'enccode' => 'ENC-CAC-OFF-01',
            'hospital_number' => '000000700002',
            'patient_name' => 'REYES, ANA',
            'room_ward' => 'OB Ward',
            'disposition' => 'Improved',
            'overall_status' => 'Cleared',
        ]);
        ClearanceTransaction::where('id', $txOffHours->id)->update([
            'created_at' => $routedNight,
            'updated_at' => $clearedOffHours,
        ]);

        $logOffHours = ClearanceLog::create([
            'enccode' => 'ENC-CAC-OFF-01',
            'department' => 'Credit and Collection',
            'user_id' => $cacUser->id,
        ]);
        ClearanceLog::where('id', $logOffHours->id)->update([
            'created_at' => $clearedOffHours,
            'updated_at' => $clearedOffHours,
        ]);

        // 3) Currently pending overnight patient checked at 2:00 AM on Nov 25
        $pendingRouted = Carbon::create(2026, 11, 24, 23, 0, 0, 'Asia/Manila');
        $txPending = ClearanceTransaction::create([
            'enccode' => 'ENC-CAC-PEND-01',
            'hospital_number' => '000000700003',
            'patient_name' => 'CRUZ, ELENA',
            'room_ward' => 'OB Ward',
            'disposition' => 'Improved',
            'overall_status' => 'Routing in Progress',
        ]);
        ClearanceTransaction::where('id', $txPending->id)->update([
            'created_at' => $pendingRouted,
            'updated_at' => $pendingRouted,
        ]);

        Carbon::setTestNow(Carbon::create(2026, 11, 25, 2, 0, 0, 'Asia/Manila'));

        $this->actingAs($billingUser)
            ->get('/billing')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/Billing')
                ->where('costCenterStats.Credit and Collection.is_24_7', false)
                ->where('costCenterStats.Credit and Collection.is_open_now', false)
                ->where('costCenterStats.Credit and Collection.avg_minutes', 12)
                ->where('costCenterStats.Credit and Collection.speed_rating', 'Fast')
                ->where('costCenterStats.Credit and Collection.total_cleared', 2)
                ->where('costCenterStats.Credit and Collection.off_hours_cleared_count', 1)
                ->where('routedPatients.0.enccode', 'ENC-CAC-PEND-01')
                ->has('routedPatients.0.stations', fn (Assert $stations) => $stations
                    ->each(fn (Assert $st) => $st->etc())
                )
            );

        // Verify exact station fields for Credit and Collection vs Pharmacy on the pending patient
        $response = $this->actingAs($billingUser)->get('/billing');
        $props = $response->viewData('page')['props'];
        $stations = collect($props['routedPatients'][0]['stations']);

        $cacStation = $stations->firstWhere('department', 'Credit and Collection');
        $this->assertSame('Pending', $cacStation['status']);
        $this->assertSame(0, $cacStation['waiting_seconds']);
        $this->assertSame(0, $cacStation['waiting_minutes']);
        $this->assertSame(3 * 3600, $cacStation['wall_waiting_seconds']);
        $this->assertFalse($cacStation['is_department_open']);
        $this->assertSame('Opens 7:00 AM', $cacStation['next_open_label']);

        $pharmaStation = $stations->firstWhere('department', 'Pharmacy');
        $this->assertSame(3 * 3600, $pharmaStation['waiting_seconds']);
        $this->assertTrue($pharmaStation['is_department_open']);

        // Verify JSON analytics endpoint matches
        $this->actingAs($billingUser)
            ->getJson('/billing/analytics?days=30')
            ->assertOk()
            ->assertJsonPath('Credit and Collection.avg_minutes', 12)
            ->assertJsonPath('Credit and Collection.total_cleared', 2)
            ->assertJsonPath('Credit and Collection.off_hours_cleared_count', 1);
    }

    public function test_cost_center_dashboard_daily_report_and_admin_analytics_respect_operating_hours(): void
    {
        Department::updateOrCreate(
            ['name' => 'Credit and Collection'],
            ['category' => 'Cost Center', 'is_24_7' => false, 'open_time' => '07:00', 'close_time' => '18:30']
        );

        $cacUser = User::factory()->create(['department' => 'Credit and Collection', 'name' => 'CAC Officer']);
        $adminUser = User::factory()->create(['department' => 'ICT / Admin']);

        $routedAt = Carbon::create(2026, 11, 23, 23, 0, 0, 'Asia/Manila');
        $clearedAt = Carbon::create(2026, 11, 24, 7, 15, 0, 'Asia/Manila');

        $txDone = ClearanceTransaction::create([
            'enccode' => 'ENC-CAC-RPT-01',
            'hospital_number' => '000000700010',
            'patient_name' => 'LOPEZ, CLARA',
            'room_ward' => 'OB Ward',
            'disposition' => 'Improved',
            'overall_status' => 'Cleared',
        ]);
        ClearanceTransaction::where('id', $txDone->id)->update([
            'created_at' => $routedAt,
            'updated_at' => $clearedAt,
        ]);

        $logDone = ClearanceLog::create([
            'enccode' => 'ENC-CAC-RPT-01',
            'department' => 'Credit and Collection',
            'user_id' => $cacUser->id,
        ]);
        ClearanceLog::where('id', $logDone->id)->update([
            'created_at' => $clearedAt,
            'updated_at' => $clearedAt,
        ]);

        // Pending overnight patient at 1:30 AM
        $pendingRoutedAt = Carbon::create(2026, 11, 24, 23, 0, 0, 'Asia/Manila');
        $txPending = ClearanceTransaction::create([
            'enccode' => 'ENC-CAC-LIVE-01',
            'hospital_number' => '000000700011',
            'patient_name' => 'GARCIA, LISA',
            'room_ward' => 'OB Ward',
            'disposition' => 'Improved',
            'overall_status' => 'Routing in Progress',
        ]);
        ClearanceTransaction::where('id', $txPending->id)->update([
            'created_at' => $pendingRoutedAt,
            'updated_at' => $pendingRoutedAt,
        ]);

        Carbon::setTestNow(Carbon::create(2026, 11, 25, 1, 30, 0, 'Asia/Manila'));

        // Cost center dashboard receives paused effective_waiting_seconds & closed schedule
        $this->actingAs($cacUser)
            ->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/CostCenter')
                ->where('departmentSchedule.is_24_7', false)
                ->where('departmentSchedule.is_open_now', false)
                ->where('departmentSchedule.next_open_label', 'Opens 7:00 AM')
                ->where('pendingPatients.0.effective_waiting_seconds', 0)
                ->where('pendingPatients.0.effective_waiting_minutes', 0)
            );

        // Printable daily report shows 15m effective turnaround and 8h 15m wall turnaround
        $this->actingAs($cacUser)
            ->get('/cost-center/reports/print?date=2026-11-24')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/PrintCostCenterReport')
                ->where('departmentSchedule.is_24_7', false)
                ->where('records.0.turnaround_formatted', '15m')
                ->where('records.0.wall_turnaround_formatted', '8h 15m')
                ->where('records.0.off_hours_cleared', false)
            );

        // Admin analytics endpoint reports 15 minutes instead of 495 minutes
        $this->actingAs($adminUser)
            ->getJson('/admin/analytics')
            ->assertOk()
            ->assertJsonPath('Credit and Collection', 15);
    }
}
