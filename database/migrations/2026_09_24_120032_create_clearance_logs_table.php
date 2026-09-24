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
        Schema::create('clearance_logs', function (Blueprint $table) {
            $table->id();
            $table->string('enccode');
            $table->string('department'); // e.g., 'Laboratory', 'Radiology'
            $table->unsignedBigInteger('user_id')->nullable(); // To track which nurse clicked it later
            $table->timestamps(); // Automatically records when the button was clicked
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('clearance_logs');
    }
};
