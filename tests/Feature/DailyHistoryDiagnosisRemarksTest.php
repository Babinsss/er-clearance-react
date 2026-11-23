<?php

namespace Tests\Feature;

use App\Models\ClearanceLog;
use App\Models\ClearancePendingRemark;
use App\Models\ClearanceTransaction;
use App\Models\Department;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class DailyHistoryDiagnosisRemarksTest extends TestCase
{
    use RefreshDatabase;

    public function test_admitted_wards_save_diagnosis_while_er_and_outpatient_do_not(): void
    {
        $obUser = User::factory()->create(['department' => 'OB Ward']);
        $this->actingAs($obUser)
            ->post('/transactions', [
                'enccode' => 'ENC-DX-OB-01',
                'hospital_number' => '000000500001',
                'patient_name' => 'DELA CRUZ, ANA',
                'disposition' => 'Improved',
                'diagnosis' => 'G1P1 Postpartum Normal Spontaneous Delivery',
            ])
            ->assertRedirect();

        $obTx = ClearanceTransaction::where('enccode', 'ENC-DX-OB-01')->firstOrFail();
        $this->assertSame('G1P1 Postpartum Normal Spontaneous Delivery', $obTx->diagnosis);

        $erUser = User::factory()->create(['department' => 'Emergency Room']);
        $this->actingAs($erUser)
            ->post('/transactions', [
                'enccode' => 'ENC-DX-ER-01',
                'hospital_number' => '000000500002',
                'patient_name' => 'REYES, MARIO',
                'disposition' => 'Improved',
                'diagnosis' => 'Should be ignored for ER',
            ])
            ->assertRedirect();

        $erTx = ClearanceTransaction::where('enccode', 'ENC-DX-ER-01')->firstOrFail();
        $this->assertNull($erTx->diagnosis);

        $opdUser = User::factory()->create(['department' => 'Outpatient']);
        $this->actingAs($opdUser)
            ->post('/transactions', [
                'enccode' => 'ENC-DX-OPD-01',
                'hospital_number' => '000000500003',
                'patient_name' => 'SANTOS, ELENA',
                'disposition' => 'Improved',
                'diagnosis' => 'Should be ignored for OPD',
            ])
            ->assertRedirect();

        $opdTx = ClearanceTransaction::where('enccode', 'ENC-DX-OPD-01')->firstOrFail();
        $this->assertNull($opdTx->diagnosis);

        // Billing routing monitor receives diagnosis on admitted patient
        $billingUser = User::factory()->create(['department' => 'Billing & Claims']);
        $this->actingAs($billingUser)
            ->get('/billing')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/Billing')
                ->where('routedPatients.0.enccode', 'ENC-DX-OB-01')
                ->where('routedPatients.0.diagnosis', 'G1P1 Postpartum Normal Spontaneous Delivery')
            );
    }

    public function test_cost_center_can_save_update_and_clear_pending_remarks_and_ward_sees_them(): void
    {
        Department::create(['name' => 'Pharmacy', 'category' => 'Cost Center']);
        $wardUser = User::factory()->create(['department' => 'Medical Ward']);
        $pharmaUser = User::factory()->create(['department' => 'Pharmacy', 'name' => 'Pharma Staff']);
        $billingUser = User::factory()->create(['department' => 'Billing & Claims']);

        ClearanceTransaction::create([
            'enccode' => 'ENC-REM-01',
            'hospital_number' => '000000600001',
            'patient_name' => 'CRUZ, JUAN',
            'room_ward' => 'Medical Ward',
            'disposition' => 'Improved',
            'diagnosis' => 'Community-Acquired Pneumonia',
            'overall_status' => 'Routing in Progress',
        ]);

        // Ward cannot post a cost center pending remark
        $this->actingAs($wardUser)
            ->post('/clearance/pending-remarks', [
                'enccode' => 'ENC-REM-01',
                'department' => 'Pharmacy',
                'remarks' => 'Unauthorized',
            ])
            ->assertForbidden();

        // Cost center posts a pending remark
        $this->actingAs($pharmaUser)
            ->post('/clearance/pending-remarks', [
                'enccode' => 'ENC-REM-01',
                'department' => 'Pharmacy',
                'remarks' => 'Unreturned 2 vials of antibiotic',
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('clearance_pending_remarks', [
            'enccode' => 'ENC-REM-01',
            'department' => 'Pharmacy',
            'remarks' => 'Unreturned 2 vials of antibiotic',
            'user_id' => $pharmaUser->id,
        ]);

        // Cost center sees its own remark on pendingPatients
        $this->actingAs($pharmaUser)
            ->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/CostCenter')
                ->where('pendingPatients.0.enccode', 'ENC-REM-01')
                ->where('pendingPatients.0.pending_remark.remarks', 'Unreturned 2 vials of antibiotic')
                ->where('pendingPatients.0.pending_remark.updated_by', 'Pharma Staff')
            );

        // Originating ward sees the remark on activeQueue
        $this->actingAs($wardUser)
            ->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/Ward')
                ->where('activeQueue.0.enccode', 'ENC-REM-01')
                ->where('activeQueue.0.diagnosis', 'Community-Acquired Pneumonia')
                ->where('activeQueue.0.pending_remarks.0.department', 'Pharmacy')
                ->where('activeQueue.0.pending_remarks.0.remarks', 'Unreturned 2 vials of antibiotic')
            );

        // Billing sees the remark on the pending Pharmacy station
        $this->actingAs($billingUser)
            ->get('/billing')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/Billing')
                ->where('routedPatients.0.stations.0.department', 'Pharmacy')
                ->where('routedPatients.0.stations.0.pending_remark.remarks', 'Unreturned 2 vials of antibiotic')
            );

        // Clearing the department removes the active pending remark
        $this->actingAs($pharmaUser)
            ->post('/clearance', [
                'enccode' => 'ENC-REM-01',
                'department' => 'Pharmacy',
            ])
            ->assertRedirect();

        $this->assertSame(0, ClearancePendingRemark::where('enccode', 'ENC-REM-01')->count());
    }

    public function test_cost_center_daily_completed_history_printable_report_filters_by_day_and_department(): void
    {
        Department::create(['name' => 'Laboratory', 'category' => 'Cost Center']);
        $labUser = User::factory()->create(['department' => 'Laboratory', 'name' => 'Lab Tech 1']);
        $radUser = User::factory()->create(['department' => 'Radiology', 'name' => 'Rad Tech 1']);
        $wardUser = User::factory()->create(['department' => 'Medical Ward']);

        $today = Carbon::now('Asia/Manila')->toDateString();
        $yesterday = Carbon::now('Asia/Manila')->subDay()->toDateString();

        ClearanceTransaction::create([
            'enccode' => 'ENC-TODAY-01',
            'hospital_number' => '000000700001',
            'patient_name' => 'TODAY, PATIENT',
            'room_ward' => 'Medical Ward',
            'disposition' => 'Improved',
            'overall_status' => 'Routing in Progress',
        ]);

        ClearanceTransaction::create([
            'enccode' => 'ENC-YEST-01',
            'hospital_number' => '000000700002',
            'patient_name' => 'YESTERDAY, PATIENT',
            'room_ward' => 'Medical Ward',
            'disposition' => 'Improved',
            'overall_status' => 'Cleared',
        ]);

        ClearanceTransaction::create([
            'enccode' => 'ENC-CANCEL-01',
            'hospital_number' => '000000700003',
            'patient_name' => 'CANCELLED, PATIENT',
            'room_ward' => 'Medical Ward',
            'disposition' => 'Improved',
            'overall_status' => 'Cancelled',
        ]);

        $logToday = ClearanceLog::create([
            'enccode' => 'ENC-TODAY-01',
            'department' => 'Laboratory',
            'user_id' => $labUser->id,
        ]);
        $logToday->created_at = Carbon::createFromFormat('Y-m-d H:i:s', "{$today} 09:30:00", 'Asia/Manila');
        $logToday->save();

        $logYesterday = ClearanceLog::create([
            'enccode' => 'ENC-YEST-01',
            'department' => 'Laboratory',
            'user_id' => $labUser->id,
        ]);
        $logYesterday->created_at = Carbon::createFromFormat('Y-m-d H:i:s', "{$yesterday} 14:15:00", 'Asia/Manila');
        $logYesterday->save();

        // Different department today
        $logOtherDept = ClearanceLog::create([
            'enccode' => 'ENC-TODAY-01',
            'department' => 'Radiology',
            'user_id' => $radUser->id,
        ]);
        $logOtherDept->created_at = Carbon::createFromFormat('Y-m-d H:i:s', "{$today} 10:00:00", 'Asia/Manila');
        $logOtherDept->save();

        // Cancelled transaction today
        $logCancelled = ClearanceLog::create([
            'enccode' => 'ENC-CANCEL-01',
            'department' => 'Laboratory',
            'user_id' => $labUser->id,
        ]);
        $logCancelled->created_at = Carbon::createFromFormat('Y-m-d H:i:s', "{$today} 11:00:00", 'Asia/Manila');
        $logCancelled->save();

        // Ward cannot access cost center print report
        $this->actingAs($wardUser)
            ->get('/cost-center/reports/print')
            ->assertForbidden();

        // Laboratory prints today's completed report -> sees only ENC-TODAY-01
        $this->actingAs($labUser)
            ->get("/cost-center/reports/print?date={$today}")
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/PrintCostCenterReport')
                ->where('department', 'Laboratory')
                ->where('reportDate', $today)
                ->where('total', 1)
                ->has('records', 1)
                ->where('records.0.enccode', 'ENC-TODAY-01')
                ->where('records.0.cleared_by', 'Lab Tech 1')
            );

        // Laboratory prints yesterday's completed report -> sees only ENC-YEST-01
        $this->actingAs($labUser)
            ->get("/cost-center/reports/print?date={$yesterday}")
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/PrintCostCenterReport')
                ->where('total', 1)
                ->where('records.0.enccode', 'ENC-YEST-01')
            );
    }
}
