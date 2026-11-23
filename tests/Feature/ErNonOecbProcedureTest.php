<?php

namespace Tests\Feature;

use App\Models\ClearanceTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ErNonOecbProcedureTest extends TestCase
{
    use RefreshDatabase;

    public function test_er_non_oecb_for_procedure_requires_and_saves_procedure_type(): void
    {
        $erUser = User::factory()->create(['department' => 'Emergency Room']);
        $billingUser = User::factory()->create(['department' => 'Billing & Claims']);

        // Missing procedure_type when is_oecb=false and is_for_procedure=true fails validation
        $this->actingAs($erUser)
            ->post('/transactions', [
                'enccode' => 'ENC-ER-PROC-ERR',
                'hospital_number' => '000000950001',
                'patient_name' => 'ER, MISSING PROC',
                'disposition' => 'Improved',
                'is_oecb' => false,
                'is_for_procedure' => true,
                'procedure_type' => '',
            ])
            ->assertSessionHasErrors('procedure_type');

        // Valid non-OECB procedure submission saves both fields
        $this->actingAs($erUser)
            ->post('/transactions', [
                'enccode' => 'ENC-ER-PROC-OK',
                'hospital_number' => '000000950002',
                'patient_name' => 'ER, WITH PROC',
                'disposition' => 'Improved',
                'is_oecb' => false,
                'is_for_procedure' => true,
                'procedure_type' => 'Suturing of lacerated wound',
            ])
            ->assertRedirect();

        $tx = ClearanceTransaction::where('enccode', 'ENC-ER-PROC-OK')->firstOrFail();
        $this->assertFalse($tx->is_oecb);
        $this->assertTrue($tx->is_for_procedure);
        $this->assertSame('Suturing of lacerated wound', $tx->procedure_type);

        // Billing receives is_for_procedure and procedure_type
        $this->actingAs($billingUser)
            ->get('/billing')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Dashboard/Billing')
                ->where('routedPatients.0.enccode', 'ENC-ER-PROC-OK')
                ->where('routedPatients.0.is_for_procedure', true)
                ->where('routedPatients.0.procedure_type', 'Suturing of lacerated wound')
            );
    }

    public function test_er_oecb_and_non_er_wards_clear_procedure_fields(): void
    {
        $erUser = User::factory()->create(['department' => 'Emergency Room']);
        $wardUser = User::factory()->create(['department' => 'Medical Ward']);

        // ER OECB=true ignores procedure flags
        $this->actingAs($erUser)
            ->post('/transactions', [
                'enccode' => 'ENC-ER-OECB-1',
                'hospital_number' => '000000950003',
                'patient_name' => 'ER, OECB',
                'disposition' => 'Improved',
                'is_oecb' => true,
                'is_for_procedure' => true,
                'procedure_type' => 'Should be cleared',
            ])
            ->assertRedirect();

        $erOecb = ClearanceTransaction::where('enccode', 'ENC-ER-OECB-1')->firstOrFail();
        $this->assertTrue($erOecb->is_oecb);
        $this->assertFalse($erOecb->is_for_procedure);
        $this->assertNull($erOecb->procedure_type);

        // ER non-OECB with is_for_procedure=false clears procedure_type
        $this->actingAs($erUser)
            ->post('/transactions', [
                'enccode' => 'ENC-ER-NOPROC-1',
                'hospital_number' => '000000950004',
                'patient_name' => 'ER, NO PROC',
                'disposition' => 'Improved',
                'is_oecb' => false,
                'is_for_procedure' => false,
                'procedure_type' => 'Should be cleared',
            ])
            ->assertRedirect();

        $erNoProc = ClearanceTransaction::where('enccode', 'ENC-ER-NOPROC-1')->firstOrFail();
        $this->assertFalse($erNoProc->is_for_procedure);
        $this->assertNull($erNoProc->procedure_type);

        // Admitted ward ignores ER procedure flags
        $this->actingAs($wardUser)
            ->post('/transactions', [
                'enccode' => 'ENC-WARD-1',
                'hospital_number' => '000000950005',
                'patient_name' => 'WARD, PATIENT',
                'disposition' => 'Improved',
                'is_oecb' => false,
                'is_for_procedure' => true,
                'procedure_type' => 'Should be ignored on ward',
            ])
            ->assertRedirect();

        $wardTx = ClearanceTransaction::where('enccode', 'ENC-WARD-1')->firstOrFail();
        $this->assertFalse($wardTx->is_for_procedure);
        $this->assertNull($wardTx->procedure_type);
    }
}
