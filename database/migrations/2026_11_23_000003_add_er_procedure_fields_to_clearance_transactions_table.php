<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clearance_transactions', function (Blueprint $table) {
            $table->boolean('is_for_procedure')->default(false)->after('is_oecb');
            $table->string('procedure_type')->nullable()->after('is_for_procedure');
        });
    }

    public function down(): void
    {
        Schema::table('clearance_transactions', function (Blueprint $table) {
            $table->dropColumn(['is_for_procedure', 'procedure_type']);
        });
    }
};
