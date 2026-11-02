<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use App\Models\Department;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Ensure 'Supervisor' exists in departments table
        $exists = DB::table('departments')->where('name', 'Supervisor')->exists();
        if (!$exists) {
            DB::table('departments')->insert([
                'name' => 'Supervisor',
                'category' => 'Management',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('departments')->where('name', 'Supervisor')->delete();
    }
};
