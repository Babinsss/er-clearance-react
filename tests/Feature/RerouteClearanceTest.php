<?php

namespace Tests\Feature;

use App\Models\ClearanceLog;
use App\Models\ClearanceRerouteHistory;
use App\Models\ClearanceTransaction;
use App\Models\Department;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class RerouteClearanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_admitted_ward_can_reroute_cleared_and_archived_patients_back_to_pending(): void
    {
        Department::create(['name' => 'Pharmacy', 'category' => 'Cost Center']);
        $wardUser = User::factory()->create(['department' => 'Medical Ward', 'name' => 'Nurse Joy']);
        $pharmaUser = User::factory()->create(['department' => 'Pharmacy', 'name' => 'Pharma Ben']);

        $tx = ClearanceTransaction::create([
            'enccode' => 'ENC-REROUTE-01',
            'hospital_number' => '000000900001',
            'patient_name' => 'BAUTISTA, CARLOS',
            'room_ward' => 'Medical Ward',
            'disposition' => 'Improved',
            'diagnosis' => 'Dengue Fever',
            'overall_status' => 'Cleared',
        ]);

        foreach (['Pharmacy', 'Laboratory', 'Radiology', 'Cardio Pulmo', 'CSR', 'Credit and Collection'] as $dept) {
            ClearanceLog::create([
                'enccode' => 'ENC-REROUTE-01',
                'department' => $dept,
                'user_id' => $pharmaUser->id,
            ]);
        }

        // Before re-route, Pharmacy has the patient in historyPatients, not pendingPatients
        $this->actingAs($pharmaUser)
            ->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/CostCenter')
                ->has('pendingPatients', 0)
                ->has('historyPatients', 1)
            );

        // Medical Ward re-routes the cleared patient
        $this->actingAs($wardUser)
            ->post('/clearance/reroute', [
                'enccode' => 'ENC-REROUTE-01',
                'reason' => 'Additional charges incurred',
            ])
            ->assertRedirect();

        $updated = $tx->fresh();
        $this->assertSame('Routing in Progress', $updated->overall_status);
        $this->assertSame(1, $updated->reroute_count);
        $this->assertSame('Additional charges incurred', $updated->reroute_reason);
        $this->assertSame('Nurse Joy', $updated->rerouted_by);

        // Previous clearance logs were cleared so every cost center is pending again
        $this->assertSame(0, ClearanceLog::where('enccode', 'ENC-REROUTE-01')->count());

        // Previous cleared snapshot was preserved in clearance_reroute_histories
        $history = ClearanceRerouteHistory::where('enccode', 'ENC-REROUTE-01')->firstOrFail();
        $this->assertSame(1, $history->cycle_number);
        $this->assertSame('Cleared', $history->previous_status);
        $this->assertSame('Additional charges incurred', $history->reroute_reason);
        $this->assertCount(6, $history->previous_logs);

        // Pharmacy now sees the patient back in pendingPatients
        $this->actingAs($pharmaUser)
            ->get('/')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/CostCenter')
                ->has('pendingPatients', 1)
                ->where('pendingPatients.0.enccode', 'ENC-REROUTE-01')
                ->where('pendingPatients.0.reroute_count', 1)
                ->where('pendingPatients.0.reroute_reason', 'Additional charges incurred')
                ->has('historyPatients', 0)
            );

        // Also works when Billing had already Archived the transaction
        $updated->update(['overall_status' => 'Archived']);
        $this->actingAs($wardUser)
            ->post('/clearance/reroute', [
                'enccode' => 'ENC-REROUTE-01',
                'reason' => 'Discharge deferred / stayed overnight',
            ])
            ->assertRedirect();

        $this->assertSame('Routing in Progress', $tx->fresh()->overall_status);
        $this->assertSame(2, $tx->fresh()->reroute_count);
    }

    public function test_er_outpatient_billing_supervisor_and_other_wards_cannot_reroute(): void
    {
        Department::create(['name' => 'Pharmacy', 'category' => 'Cost Center']);

        $tx = ClearanceTransaction::create([
            'enccode' => 'ENC-REROUTE-LOCK',
            'hospital_number' => '000000900002',
            'patient_name' => 'GARCIA, LIZA',
            'room_ward' => 'OB Ward',
            'disposition' => 'Improved',
            'overall_status' => 'Cleared',
        ]);

        ClearanceTransaction::create([
            'enccode' => 'ENC-ER-LOCK',
            'hospital_number' => '000000900003',
            'patient_name' => 'ER, PATIENT',
            'room_ward' => 'Emergency Room',
            'disposition' => 'Improved',
            'overall_status' => 'Cleared',
        ]);

        ClearanceTransaction::create([
            'enccode' => 'ENC-OPD-LOCK',
            'hospital_number' => '000000900004',
            'patient_name' => 'OPD, PATIENT',
            'room_ward' => 'Outpatient',
            'disposition' => 'Improved',
            'overall_status' => 'Cleared',
        ]);

        $erUser = User::factory()->create(['department' => 'Emergency Room']);
        $opdUser = User::factory()->create(['department' => 'Outpatient']);
        $billingUser = User::factory()->create(['department' => 'Billing & Claims']);
        $billingHead = User::factory()->create(['department' => 'Head of Billing & Claims']);
        $supervisorUser = User::factory()->create(['department' => 'Supervisor']);
        $pharmaUser = User::factory()->create(['department' => 'Pharmacy']);
        $adminUser = User::factory()->create(['department' => 'ICT / Admin']);
        $otherWardUser = User::factory()->create(['department' => 'Medical Ward']);

        $this->actingAs($erUser)
            ->post('/clearance/reroute', ['enccode' => 'ENC-ER-LOCK', 'reason' => 'Test'])
            ->assertForbidden();

        $this->actingAs($opdUser)
            ->post('/clearance/reroute', ['enccode' => 'ENC-OPD-LOCK', 'reason' => 'Test'])
            ->assertForbidden();

        foreach ([$billingUser, $billingHead, $supervisorUser, $pharmaUser, $adminUser, $otherWardUser] as $actor) {
            $this->actingAs($actor)
                ->post('/clearance/reroute', ['enccode' => $tx->enccode, 'reason' => 'Test'])
                ->assertForbidden();
        }

        $this->assertSame('Cleared', $tx->fresh()->overall_status);
    }
}
