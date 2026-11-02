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
        Schema::create('credit_grantors', function (Blueprint $table) {
            $table->id();
            $table->string('code', 50)->index();
            $table->string('proponent', 255)->index();
            $table->string('saa_number', 100)->nullable()->index();
            $table->decimal('allocated_budget', 14, 2)->default(0);
            $table->decimal('utilized_budget', 14, 2)->default(0);
            $table->decimal('remaining_balance', 14, 2)->default(0);
            $table->string('category', 50)->default('Government');
            $table->text('remarks')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('credit_grantors');
    }
};
