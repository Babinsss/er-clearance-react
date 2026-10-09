<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('clearance_transactions', function (Blueprint $table) {
            $table->string('encoded_by')->nullable()->after('oxygen_remarks');
        });
    }

    public function down()
    {
        Schema::table('clearance_transactions', function (Blueprint $table) {
            $table->dropColumn('encoded_by');
        });
    }
};