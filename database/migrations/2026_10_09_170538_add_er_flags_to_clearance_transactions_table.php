<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('clearance_transactions', function (Blueprint $table) {
            $table->boolean('is_oecb')->default(false)->after('room_ward');
            $table->boolean('has_oxygen')->default(false)->after('is_oecb');
            $table->text('oxygen_remarks')->nullable()->after('has_oxygen');
        });
    }

    public function down()
    {
        Schema::table('clearance_transactions', function (Blueprint $table) {
            $table->dropColumn(['is_oecb', 'has_oxygen', 'oxygen_remarks']);
        });
    }
};