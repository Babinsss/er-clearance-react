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
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('last_seen_at')->nullable()->after('department');
            $table->timestamp('last_login_at')->nullable()->after('last_seen_at');
            $table->boolean('is_online')->default(false)->after('last_login_at');
            $table->string('last_ip_address', 45)->nullable()->after('is_online');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['last_seen_at', 'last_login_at', 'is_online', 'last_ip_address']);
        });
    }
};

