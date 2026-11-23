<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clearance_transactions', function (Blueprint $table) {
            $table->unsignedInteger('reroute_count')->default(0)->after('overall_status');
            $table->text('reroute_reason')->nullable()->after('reroute_count');
            $table->string('rerouted_by')->nullable()->after('reroute_reason');
            $table->timestamp('rerouted_at')->nullable()->after('rerouted_by');
        });

        Schema::create('clearance_reroute_histories', function (Blueprint $table) {
            $table->id();
            $table->string('enccode')->index();
            $table->unsignedInteger('cycle_number')->default(1);
            $table->string('previous_status')->nullable();
            $table->timestamp('previous_routed_at')->nullable();
            $table->timestamp('previous_cleared_at')->nullable();
            $table->json('previous_logs')->nullable();
            $table->text('reroute_reason')->nullable();
            $table->string('rerouted_by')->nullable();
            $table->foreignId('rerouted_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clearance_reroute_histories');

        Schema::table('clearance_transactions', function (Blueprint $table) {
            $table->dropColumn(['reroute_count', 'reroute_reason', 'rerouted_by', 'rerouted_at']);
        });
    }
};
