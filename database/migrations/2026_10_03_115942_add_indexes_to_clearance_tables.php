<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('clearance_transactions', function (Blueprint $table) {
            $table->index('enccode');
            $table->index('overall_status');
            $table->index('created_at');
        });

        Schema::table('clearance_logs', function (Blueprint $table) {
            $table->index('enccode');
            $table->index('department');
            $table->index('created_at');
        });
    }

    public function down()
    {
        Schema::table('clearance_transactions', function (Blueprint $table) {
            $table->dropIndex(['enccode', 'overall_status', 'created_at']);
        });

        Schema::table('clearance_logs', function (Blueprint $table) {
            $table->dropIndex(['enccode', 'department', 'created_at']);
        });
    }
};