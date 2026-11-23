<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clearance_pending_remarks', function (Blueprint $table) {
            $table->id();
            $table->string('enccode')->index();
            $table->string('department');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('remarks');
            $table->timestamps();

            $table->unique(['enccode', 'department']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clearance_pending_remarks');
    }
};
