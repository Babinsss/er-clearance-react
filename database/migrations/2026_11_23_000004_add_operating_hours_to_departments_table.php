<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->boolean('is_24_7')->default(true)->after('category');
            $table->string('open_time', 5)->nullable()->after('is_24_7');
            $table->string('close_time', 5)->nullable()->after('open_time');
        });

        DB::table('departments')
            ->whereIn('name', ['Credit and Collection', 'Credit & Collection'])
            ->update([
                'is_24_7' => false,
                'open_time' => '07:00',
                'close_time' => '18:30',
                'updated_at' => now(),
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->dropColumn(['is_24_7', 'open_time', 'close_time']);
        });
    }
};
