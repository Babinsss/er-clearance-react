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
        Schema::table('credit_promissory_notes', function (Blueprint $table) {
            $table->json('fa_grantors')->nullable()->after('fa_grantor');
            $table->text('fa_grantor')->nullable()->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('credit_promissory_notes', function (Blueprint $table) {
            $table->dropColumn('fa_grantors');
            $table->string('fa_grantor', 255)->nullable()->change();
        });
    }
};
