<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('credit_promissory_notes', function (Blueprint $table) {
            $table->id();
            $table->string('sheet_category', 50)->default('daily trans 2026');
            $table->date('entry_date')->nullable();
            $table->string('patient_name');
            $table->text('address')->nullable();
            $table->decimal('hospital_bill_balance', 14, 2)->default(0);
            $table->boolean('is_absconded')->default(false);
            $table->boolean('is_pn')->default(false);
            $table->decimal('pn_amount', 14, 2)->default(0);
            $table->boolean('is_nbb')->default(false);
            $table->boolean('is_vawc_er')->default(false);
            $table->boolean('is_non_nbb')->default(false);
            $table->string('age', 20)->nullable();
            $table->string('sex', 10)->nullable();
            $table->decimal('fa_amount', 14, 2)->default(0);
            $table->string('fa_grantor')->nullable();
            $table->date('fa_date')->nullable();
            $table->decimal('cash_paid', 14, 2)->default(0);
            $table->string('or_number', 100)->nullable();
            $table->date('or_date')->nullable();
            $table->decimal('discount', 14, 2)->default(0);
            $table->decimal('dialysis_fee', 14, 2)->default(0);
            $table->decimal('remaining_balance', 14, 2)->default(0);
            $table->string('guarantor_name')->nullable();
            $table->text('remarks')->nullable();
            $table->string('status', 30)->default('Active');
            $table->string('created_by')->nullable();
            $table->timestamps();

            $table->index('patient_name');
            $table->index('sheet_category');
            $table->index('entry_date');
            $table->index('remaining_balance');
            $table->index('is_pn');
            $table->index('is_absconded');
            $table->index('guarantor_name');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('credit_promissory_notes');
    }
};
