<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clearance_transactions', function (Blueprint $table) {
            $table->boolean('requires_or')->default(false)->after('oxygen_remarks');
            $table->boolean('requires_nicu')->default(false)->after('requires_or');
        });
    }

    public function down(): void
    {
        Schema::table('clearance_transactions', function (Blueprint $table) {
            $table->dropColumn(['requires_or', 'requires_nicu']);
        });
    }
};
