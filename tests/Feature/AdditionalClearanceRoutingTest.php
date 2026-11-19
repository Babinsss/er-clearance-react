<?php

namespace Tests\Feature;

use App\Http\Controllers\BillingController;
use App\Http\Controllers\ClearanceController;
use App\Models\ClearanceLog;
use App\Models\ClearanceTransaction;
use App\Models\Department;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class AdditionalClearanceRoutingTest extends TestCase
{
    use RefreshDatabase;

    public function test_required_departments_include_optional_or_and_nicu_toggles(): void
    {
        $obDefault = BillingController::getRequiredDepartmentsForWard('OB Ward');
        $this->assertEquals([
            'Pharmacy',
            'Laboratory',
            'Radiology',
            'Cardio Pulmo',
            'CSR',
            'Credit and Collection',
            'LR/DR',
        ], $obDefault);

        $obWithOrAndNicu = BillingController::getRequiredDepartmentsForWard('OB Ward', true, true);
        $this->assertEquals([
            'Pharmacy',
            'Laboratory',
            'Radiology',
            'Cardio Pulmo',
            'CSR',
            'Credit and Collection',
            'LR/DR',
            'OR',
            'NICU',
        ], $obWithOrAndNicu);

        $erWithToggles = BillingController::getRequiredDepartmentsForWard('Emergency Room', true, true);
        $this->assertEquals([
            'Pharmacy',
            'Laboratory',
            'Radiology',
            'Cardio Pulmo',
            'CSR',
        ], $erWithToggles);

        $outpatientWithToggles = BillingController::getRequiredDepartmentsForWard('Outpatient', true, true);
        $this->assertEquals([
            'Pharmacy',
            'Laboratory',
            'Radiology',
            'Cardio Pulmo',
            'CSR',
            'HDU',
        ], $outpatientWithToggles);

        $nicuWard = BillingController::getRequiredDepartmentsForWard('NICU', true, true);
        $this->assertNotContains('NICU', $nicuWard);
        $this->assertContains('OR', $nicuWard);
    }

    public function test_er_and_outpatient_ignore_optional_or_and_nicu_toggles_on_routing(): void
    {
        $erUser = User::factory()->create(['department' => 'Emergency Room']);
        $this->actingAs($erUser)
            ->post('/transactions', [
                'enccode' => 'ENC-ER-001',
                'hospital_number' => '000000888001',
                'patient_name' => 'ER, PATIENT',
                'disposition' => 'Improved',
                'requires_or' => true,
                'requires_nicu' => true,
            ])
            ->assertRedirect();

        $erTx = ClearanceTransaction::where('enccode', 'ENC-ER-001')->firstOrFail();
        $this->assertFalse($erTx->requires_or);
        $this->assertFalse($erTx->requires_nicu);

        $opdUser = User::factory()->create(['department' => 'Outpatient']);
        $this->actingAs($opdUser)
            ->post('/transactions', [
                'enccode' => 'ENC-OPD-001',
                'hospital_number' => '000000888002',
                'patient_name' => 'OPD, PATIENT',
                'disposition' => 'Improved',
                'requires_or' => true,
                'requires_nicu' => true,
            ])
            ->assertRedirect();

        $opdTx = ClearanceTransaction::where('enccode', 'ENC-OPD-001')->firstOrFail();
        $this->assertFalse($opdTx->requires_or);
        $this->assertFalse($opdTx->requires_nicu);
    }

    public function test_ob_ward_can_route_with_or_and_nicu_toggles_and_clearance_waits_for_both(): void
    {
        $obUser = User::factory()->create(['department' => 'OB Ward']);

        $this->actingAs($obUser)
            ->post('/transactions', [
                'enccode' => 'ENC-OB-001',
                'hospital_number' => '000000999001',
                'patient_name' => 'DELA CRUZ, BABY',
                'disposition' => 'Improved',
                'requires_or' => true,
                'requires_nicu' => true,
            ])
            ->assertRedirect();

        $tx = ClearanceTransaction::where('enccode', 'ENC-OB-001')->firstOrFail();
        $this->assertTrue($tx->requires_or);
        $this->assertTrue($tx->requires_nicu);
        $this->assertSame('Routing in Progress', $tx->overall_status);

        // Clear base + Credit and Collection + LR/DR (still missing OR and NICU)
        foreach (['Pharmacy', 'Laboratory', 'Radiology', 'Cardio Pulmo', 'CSR', 'Credit and Collection', 'LR/DR'] as $dept) {
            ClearanceLog::create([
                'enccode' => 'ENC-OB-001',
                'department' => $dept,
                'user_id' => $obUser->id,
            ]);
        }

        ClearanceController::recalculateStatus('ENC-OB-001');
        $this->assertSame('Routing in Progress', $tx->fresh()->overall_status);

        // Clear OR (still missing NICU)
        $orUser = User::factory()->create(['department' => 'OR']);
        $this->actingAs($orUser)
            ->post('/clearance', ['enccode' => 'ENC-OB-001', 'department' => 'OR'])
            ->assertRedirect();
        $this->assertSame('Routing in Progress', $tx->fresh()->overall_status);

        // Clear NICU -> overall_status becomes Cleared
        $nicuUser = User::factory()->create(['department' => 'NICU']);
        $this->actingAs($nicuUser)
            ->post('/clearance', ['enccode' => 'ENC-OB-001', 'department' => 'NICU'])
            ->assertRedirect();
        $this->assertSame('Cleared', $tx->fresh()->overall_status);
    }

    public function test_or_queue_includes_patients_with_requires_or_from_any_ward(): void
    {
        Department::create(['name' => 'OR', 'category' => 'Cost Center']);
        $orUser = User::factory()->create(['department' => 'OR']);

        ClearanceTransaction::create([
            'enccode' => 'ENC-OB-OR',
            'hospital_number' => '000000100001',
            'patient_name' => 'MOTHER, WITH OR',
            'room_ward' => 'OB Ward',
            'overall_status' => 'Routing in Progress',
            'requires_or' => true,
            'requires_nicu' => false,
        ]);

        ClearanceTransaction::create([
            'enccode' => 'ENC-OB-NO-OR',
            'hospital_number' => '000000100002',
            'patient_name' => 'MOTHER, WITHOUT OR',
            'room_ward' => 'OB Ward',
            'overall_status' => 'Routing in Progress',
            'requires_or' => false,
            'requires_nicu' => false,
        ]);

        $this->actingAs($orUser)
            ->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/CostCenter')
                ->has('pendingPatients', 1)
                ->where('pendingPatients.0.enccode', 'ENC-OB-OR')
            );
    }

    public function test_nicu_ward_receives_and_clears_incoming_baby_clearances(): void
    {
        Department::create(['name' => 'NICU', 'category' => 'Ward']);
        $nicuUser = User::factory()->create(['department' => 'NICU']);

        ClearanceTransaction::create([
            'enccode' => 'ENC-BABY-01',
            'hospital_number' => '000000200001',
            'patient_name' => 'REYES, BABY',
            'room_ward' => 'OB Ward',
            'disposition' => 'Improved',
            'overall_status' => 'Routing in Progress',
            'requires_or' => false,
            'requires_nicu' => true,
        ]);

        $this->actingAs($nicuUser)
            ->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/Ward')
                ->has('incomingNicuPending', 1)
                ->where('incomingNicuPending.0.enccode', 'ENC-BABY-01')
                ->has('incomingNicuHistory', 0)
            );

        $this->actingAs($nicuUser)
            ->post('/clearance', ['enccode' => 'ENC-BABY-01', 'department' => 'NICU'])
            ->assertRedirect();

        $this->actingAs($nicuUser)
            ->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/Ward')
                ->has('incomingNicuPending', 0)
                ->has('incomingNicuHistory', 1)
                ->where('incomingNicuHistory.0.enccode', 'ENC-BABY-01')
            );
    }

    public function test_supervisor_can_toggle_requires_or_and_requires_nicu_on_existing_transaction(): void
    {
        $supervisor = User::factory()->create(['department' => 'Supervisor']);

        $tx = ClearanceTransaction::create([
            'enccode' => 'ENC-SUP-01',
            'hospital_number' => '000000300001',
            'patient_name' => 'SANTOS, MARIA',
            'room_ward' => 'OB Ward',
            'disposition' => 'Improved',
            'overall_status' => 'Cleared',
            'requires_or' => false,
            'requires_nicu' => false,
        ]);

        foreach (['Pharmacy', 'Laboratory', 'Radiology', 'Cardio Pulmo', 'CSR', 'Credit and Collection', 'LR/DR'] as $dept) {
            ClearanceLog::create([
                'enccode' => 'ENC-SUP-01',
                'department' => $dept,
                'user_id' => $supervisor->id,
            ]);
        }

        $this->actingAs($supervisor)
            ->put("/supervisor/transactions/{$tx->id}", [
                'hospital_number' => $tx->hospital_number,
                'patient_name' => $tx->patient_name,
                'room_ward' => $tx->room_ward,
                'disposition' => $tx->disposition,
                'overall_status' => 'Routing in Progress',
                'requires_or' => true,
                'requires_nicu' => true,
            ])
            ->assertRedirect();

        $updated = $tx->fresh();
        $this->assertTrue($updated->requires_or);
        $this->assertTrue($updated->requires_nicu);
        $this->assertSame('Routing in Progress', $updated->overall_status);
    }

    public function test_admin_can_auto_clear_all_required_cost_centers_for_a_routed_patient(): void
    {
        $admin = User::factory()->create(['department' => 'ICT / Admin']);
        $pharmaStaff = User::factory()->create(['department' => 'Pharmacy']);
        $wardStaff = User::factory()->create(['department' => 'OB Ward']);

        $tx = ClearanceTransaction::create([
            'enccode' => 'ENC-ADMIN-CLEAR-01',
            'hospital_number' => '000000400001',
            'patient_name' => 'ADMIN, TEST PATIENT',
            'room_ward' => 'OB Ward',
            'disposition' => 'Improved',
            'overall_status' => 'Routing in Progress',
            'requires_or' => true,
            'requires_nicu' => true,
        ]);

        // Pharmacy already cleared beforehand
        ClearanceLog::create([
            'enccode' => 'ENC-ADMIN-CLEAR-01',
            'department' => 'Pharmacy',
            'user_id' => $pharmaStaff->id,
        ]);

        // Non-admin is forbidden
        $this->actingAs($wardStaff)
            ->post("/admin/transactions/{$tx->id}/clear-all")
            ->assertForbidden();

        // Admin auto-clears all remaining stations
        $this->actingAs($admin)
            ->post("/admin/transactions/{$tx->id}/clear-all")
            ->assertRedirect();

        $this->assertSame('Cleared', $tx->fresh()->overall_status);

        $logs = ClearanceLog::where('enccode', 'ENC-ADMIN-CLEAR-01')->get()->keyBy('department');
        $expected = ['Pharmacy', 'Laboratory', 'Radiology', 'Cardio Pulmo', 'CSR', 'Credit and Collection', 'LR/DR', 'OR', 'NICU'];
        foreach ($expected as $dept) {
            $this->assertTrue($logs->has($dept), "Missing clearance log for {$dept}");
        }
        // Existing Pharmacy log preserves original staff user_id
        $this->assertSame($pharmaStaff->id, $logs->get('Pharmacy')->user_id);
        // Newly auto-cleared stations use admin user_id
        $this->assertSame($admin->id, $logs->get('NICU')->user_id);
    }
}
