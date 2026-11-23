<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ClearanceTransaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'enccode',
        'hospital_number',
        'patient_name',
        'room_ward',
        'arrival_datetime',
        'disposition',
        'diagnosis',
        'overall_status',
        'reroute_count',
        'reroute_reason',
        'rerouted_by',
        'rerouted_at',
        'is_oecb',
        'is_for_procedure',
        'procedure_type',
        'has_oxygen',
        'oxygen_remarks',
        'requires_or',
        'requires_nicu',
        'encoded_by',
    ];

    protected $casts = [
        'reroute_count' => 'integer',
        'rerouted_at' => 'datetime',
        'is_oecb' => 'boolean',
        'is_for_procedure' => 'boolean',
        'has_oxygen' => 'boolean',
        'requires_or' => 'boolean',
        'requires_nicu' => 'boolean',
    ];
}